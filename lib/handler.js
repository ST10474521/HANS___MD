const config = require("../config");
const { commands } = require("../command");
const { getDB, saveGlobal } = require("./database");
const { autoReact } = require("./autoreact");
const { getContext } = require("./newsletter");
const { sendTG } = require("./tg_report");
const { CURRENT_VERSION } = require("./version");

function detectPrefix(body, prefixes) {
  if (!body) return null;
  for (const p of prefixes) {
    if (body.startsWith(p)) return p;
  }
  return null;
}

function buildCooldownKey(pattern, senderNumber) {
  return `${pattern}:${senderNumber}`;
}

function normalizeId(id) {
  if (!id || typeof id !== "string") return "";
  const left = id.includes("@") ? id.split("@")[0] : id;
  return left.includes(":") ? left.split(":")[0] : left;
}

function normalizeNumber(value) {
  return String(value || "").replace(/\D/g, "");
}

function isLooseNumberMatch(a, b) {
  const x = normalizeNumber(a);
  const y = normalizeNumber(b);
  if (!x || !y) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
}

function buildLidMap(conn) {
  const map = new Map();
  const contacts = conn.contacts || {};
  
  // Extract LID->PN mappings from contacts
  for (const [jid, contact] of Object.entries(contacts)) {
    if (contact?.lid && jid.endsWith("@s.whatsapp.net")) {
      const lidNum = normalizeId(contact.lid);
      const pnNum = normalizeId(jid);
      if (lidNum && pnNum) map.set(lidNum, pnNum);
    }
  }
  
  // Always include bot's own mapping
  const botLidNum = normalizeId(conn.user?.lid || "");
  const botPnNum = normalizeId(conn.user?.id || "");
  if (botLidNum && botPnNum) map.set(botLidNum, botPnNum);
  
  return map;
}

async function resolveLidToPhone(conn, lidNumber) {
  const db = getDB();
  try {
    // Collect all "important" numbers to check
    const sudoList = Array.isArray(db.sudo) ? db.sudo : [];
    const ownerList = Array.isArray(config.OWNER_NUMBER) ? config.OWNER_NUMBER : [];
    const botPn = normalizeId(conn.user?.id || "");
    
    const checkList = [...new Set([...ownerList, ...sudoList, botPn])].filter(Boolean);
    if (!checkList.length) return null;

    // Check against these known numbers (with a race to prevent hanging)
    const results = await Promise.race([
      conn.onWhatsApp(...checkList),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
    ]).catch(() => []);
    
    for (const result of results) {
      if (result && result.jid && result.exists) {
        const pnNum = normalizeId(result.jid);
        // Many newer versions of Baileys return lid in the result
        if (result.lid) {
            const resultLidNum = normalizeId(result.lid);
            if (resultLidNum === lidNumber) return pnNum;
        }
        
        // Fallback: check contacts for this PN
        const contact = conn.contacts?.[result.jid];
        if (contact?.lid) {
          const lidNum = normalizeId(contact.lid);
          if (lidNum === lidNumber) return pnNum;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function resolvePnFromLid(conn, jid) {
  try {
    if (!jid || typeof jid !== "string") return null;
    if (!jid.endsWith("@lid")) return null;
    
    // 1. Try Baileys internal signal repo mapping if available
    const store = conn?.signalRepository?.lidMapping;
    if (store && typeof store.getPNForLID === "function") {
      const pn = await store.getPNForLID(jid);
      if (typeof pn === "string" && pn.includes("@")) return pn;
    }

    // 2. Try the contacts map which often has LID -> PN
    const contact = conn.contacts?.[jid];
    if (contact?.id && contact.id.endsWith("@s.whatsapp.net")) return contact.id;

    return null;
  } catch {
    return null;
  }
}

const METADATA_CACHE = new Map();
const TRAFFIC_MONITOR = new Map();
const USER_TRAFFIC_MONITOR = new Map();
const NOISE_THRESHOLD = 35; // Messages
const NOISE_WINDOW = 60 * 1000; // 1 Minute

async function getCachedMetadata(conn, from) {
  const now = Date.now();
  const cached = METADATA_CACHE.get(from);
  if (cached && (now - cached.time < 5 * 60 * 1000)) { // 5 min cache
    return cached.data;
  }
  try {
    const data = await conn.groupMetadata(from);
    METADATA_CACHE.set(from, { data, time: now });
    return data;
  } catch (err) {
    if (cached) return cached.data; // fallback to stale if rate limited
    throw err;
  }
}

async function handler(conn, mek, m) {
  try {
    const db = getDB();
    const from = m.from;

    // --- Noise Shield (Self-Protection) ---
    if (m.isGroup && !mek.key.fromMe) {
      const now = Date.now();
      const traffic = TRAFFIC_MONITOR.get(from) || { count: 0, start: now };
      
      if (now - traffic.start > NOISE_WINDOW) {
        traffic.count = 1;
        traffic.start = now;
      } else {
        traffic.count++;
      }
      TRAFFIC_MONITOR.set(from, traffic);

      // Auto-Ban noisy groups to prevent rate-limit crashes
      if (traffic.count > NOISE_THRESHOLD) {
        db.bannedGroups = db.bannedGroups || {};
        if (!db.bannedGroups[from]) {
          db.bannedGroups[from] = true;
          saveGlobal(db);
          await conn.sendMessage(from, { 
            text: `⚠️ *GROUP NOISE ALERT*\n\nThis group has been automatically banned due to excessive message velocity (${traffic.count} msg/min). This protection is required to prevent the bot from crashing.\n\n🔓 *To Unban:* Run \`.unbangroup\`` 
          });
          return;
        }
      }
    }

    if (db.bannedGroups && db.bannedGroups[from]) return;

    // --- Auto Read ---
    if (config.AUTO_READ && !mek.key.fromMe) {
      await conn.readMessages([mek.key]).catch(() => {});
    }

    // --- Status Broadcast Handler (auto-view & auto-like) ---
    if (from === "status@broadcast") {
      const autoStatus = db.env?.AUTO_STATUS !== undefined ? db.env.AUTO_STATUS : config.AUTO_STATUS;
      const autoStatusLike = db.env?.AUTO_STATUS_LIKE !== undefined ? db.env.AUTO_STATUS_LIKE : config.AUTO_STATUS_LIKE;
      if (autoStatus) {
        await conn.readMessages([mek.key]).catch(() => {});
      }
      if (autoStatusLike && !mek.key.fromMe) {
        const statusOwnerJid = mek.key.participant || mek.key.remoteJid;
        await conn.sendMessage(statusOwnerJid, {
          react: {
            text: "❤️",
            key: mek.key
          }
        }).catch(() => {});
      }
      return; // Don't process status as a command
    }

    const body = m.body || "";
    const prefixes = Array.isArray(db?.env?.PREFIX) && db.env.PREFIX.length ? db.env.PREFIX : config.PREFIX;
    const prefix = detectPrefix(body, prefixes);
    const isCmd = !!prefix;


    const command = isCmd
      ? body.slice(prefix.length).trim().split(" ").shift().toLowerCase()
      : "";


    const args = isCmd ? body.slice(prefix.length).trim().split(/\s+/).slice(1) : body.trim().split(/\s+/).slice(1);
    const q = args.join(" ").trim();
    const text = q;

    const sender = m.sender; // This is the canonical sender from serialize
    const senderNumberRaw = m.senderNumber;
    const senderAlt = mek?.key?.participantAlt || "";
    
    // Resolve sender PN JID
    const senderPnJid = (await resolvePnFromLid(conn, sender)) || 
                        (senderAlt && senderAlt.includes("@s.whatsapp.net") ? senderAlt : null);
    
    // Build LID->PN mapping and resolve sender number
    const lidMap = buildLidMap(conn);
    let resolvedSenderNumber = lidMap.get(normalizeId(senderNumberRaw)) || normalizeId(senderPnJid || senderNumberRaw);
    
    // If still LID and not resolved, try dynamic lookup against owners/sudo
    if (resolvedSenderNumber === normalizeId(senderNumberRaw) && sender.endsWith("@lid")) {
      const phoneFromLid = await resolveLidToPhone(conn, normalizeId(senderNumberRaw));
      if (phoneFromLid) resolvedSenderNumber = phoneFromLid;
    }
    
    const pushname = m.pushname || "";
    const quoted = m.quoted || null;

    const botNumber = (conn.user?.id || "").split(":")[0];
    const botJid = conn.user?.id ? (conn.user.id.includes("@") ? conn.user.id : `${botNumber}@s.whatsapp.net`) : "";

    const ownerNumbers = Array.isArray(config.OWNER_NUMBER) ? config.OWNER_NUMBER.map(normalizeNumber).filter(Boolean) : [];
    const sudoNumbers = Array.isArray(db.sudo) ? db.sudo.map(normalizeNumber).filter(Boolean) : [];
    const senderCandidates = [
      resolvedSenderNumber,
      senderNumberRaw,
      normalizeId(sender),
      normalizeId(senderAlt),
      normalizeId(senderPnJid || ""),
      normalizeId(mek?.key?.participant || ""),
      normalizeId(mek?.key?.participantAlt || "")
    ].map(normalizeNumber).filter(Boolean);
    const hasAnyMatch = (list) => senderCandidates.some((cand) => list.some((n) => isLooseNumberMatch(cand, n)));
    const isSudo = hasAnyMatch(sudoNumbers);
    const botLid = (conn.user?.lid || "").split(":")[0].replace("@lid", "");
    const senderLidBase = (sender || "").split(":")[0].replace("@lid", "");
    const isFromMe = !!mek.key.fromMe;
    const isOwner = hasAnyMatch(ownerNumbers)
      || isSudo
      || senderCandidates.some((cand) => isLooseNumberMatch(cand, botNumber))
      || isFromMe
      || (botLid && senderLidBase && senderLidBase === botLid);
    const isDev = isOwner;


    const isGroup = !!m.isGroup;
    let groupMetadata = null;
    let groupName = "";
    let participants = [];
    let groupAdmins = [];
    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup) {
      try {
        groupMetadata = await getCachedMetadata(conn, from);
        groupName = groupMetadata?.subject || "";
        participants = groupMetadata?.participants || [];
        groupAdmins = participants
          .filter((p) => p.admin)
          .map((p) => p.id);

        const adminParts = participants.filter((p) => p.admin);
        isAdmin = adminParts.some((p) =>
          [p.id, p.lid, p.phoneNumber].some(
            (v) => v && (v === sender || v === senderAlt || v === senderPnJid)
          )
        );

        const botPnJid = `${botNumber}@s.whatsapp.net`;
        // Resolve bot LID for LID-only admin lists
        let botLid = conn.user?.lid || null;
        if (!botLid && conn?.signalRepository?.lidMapping) {
          try {
            const store = conn.signalRepository.lidMapping;
            if (typeof store.getLIDForPN === "function") {
              const lid = await store.getLIDForPN(botPnJid);
              if (typeof lid === "string" && lid.endsWith("@lid")) botLid = lid;
            }
          } catch {}
        }
        const botLidBase = botLid ? botLid.replace(/:\d+@lid$/, "@lid") : null;
        isBotAdmin = adminParts.some((p) =>
          [p.id, p.lid, p.phoneNumber].some(
            (v) => v && (v === botJid || v === botPnJid || v === botLid || v === botLidBase)
          )
        );
      } catch {
        groupMetadata = null;
      }
    }

    // GUARD CHECKS (silent)
    if ((db.blocked || []).includes(resolvedSenderNumber)) return;
    if (db.banned && db.banned[resolvedSenderNumber]) return;
    if (db.bannedGroups && db.bannedGroups[from]) return;
    if (db.mode === "private" && !isSudo && !isOwner) return;
    if (db.chatMode === "dm" && isGroup) return;
    if (db.chatMode === "group" && !isGroup) return;

    // --- Per-User Anti-Spam ---
    if (isGroup && !mek.key.fromMe && !isAdmin && !isOwner && !isSudo) {
       const antispam = db.antispam && db.antispam[from];
       if (antispam === true || (antispam && antispam.enabled)) {
          const userKey = `${from}:${resolvedSenderNumber}`;
          const userTraffic = USER_TRAFFIC_MONITOR.get(userKey) || { count: 0, start: Date.now() };
          
          if (Date.now() - userTraffic.start > 10000) {
             userTraffic.count = 1;
             userTraffic.start = Date.now();
          } else {
             userTraffic.count++;
          }
          USER_TRAFFIC_MONITOR.set(userKey, userTraffic);

          if (userTraffic.count > 5) {
             if (isBotAdmin) {
                try {
                  const target = senderPnJid ? `${normalizeId(senderPnJid)}@s.whatsapp.net` : sender;
                  await conn.sendMessage(from, { text: `⚠️ @${resolvedSenderNumber}, stop spamming! You have been removed.`, mentions: [target] });
                  await conn.groupParticipantsUpdate(from, [target], "remove");
                  return;
                } catch {}
             }
          }
       }
    }

    // Anti-Link System
    if (isGroup && !mek.key.fromMe && !isAdmin && !isOwner && !isSudo) {
      const alink = db.antilink && db.antilink[from];
      if (alink && /(https?:\/\/[^\s]+|(www\.)?[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(\/[^\s]*)?)/i.test(body)) {
        if (isBotAdmin) {
          const mode = alink === true ? "warn" : alink.mode || "warn";
          const target = senderPnJid ? `${normalizeId(senderPnJid)}@s.whatsapp.net` : sender;
          const pushNameOrNum = `@${resolvedSenderNumber}`;

          try { await conn.sendMessage(from, { delete: mek.key }); } catch {}

          if (mode !== "delete") {
            db.antilinkWarns = db.antilinkWarns || {};
            const warnKey = `${from}:${resolvedSenderNumber}`;
            let currentWarns = (db.antilinkWarns[warnKey] || 0) + 1;
            const limit = alink.limit || 3;

            if (currentWarns >= limit) {
               delete db.antilinkWarns[warnKey];
               saveGlobal(db);
               try { 
                 await conn.groupParticipantsUpdate(from, [target], "remove");
                 await conn.sendMessage(from, { text: `🚫 ${pushNameOrNum} reached the link warning limit (${limit}/${limit}) and was kicked.`, mentions: [target] });
               } catch {}
            } else {
               db.antilinkWarns[warnKey] = currentWarns;
               saveGlobal(db);
               try { await conn.sendMessage(from, { text: `⚠️ ${pushNameOrNum}, links are prohibited! (Warning ${currentWarns}/${limit})`, mentions: [target] }); } catch {}
            }
          }
        }
        return;
      }
    }

    // Auto Actions
    if (!mek.key.fromMe) {
      try {
        if (config.AUTO_READ) await conn.readMessages([mek.key]);
        if (config.AUTO_RECORDING) await conn.sendPresenceUpdate("recording", from);
        else if (config.AUTO_TYPING) await conn.sendPresenceUpdate("composing", from);
      } catch {}
      await autoReact(conn, mek);
    }

    // COMMAND MATCHING
    let cmd = null;
    if (isCmd) {
      cmd = commands.find((c) => c?.pattern === command) ||
            commands.find((c) => Array.isArray(c?.alias) && c.alias.includes(command));
    }
    if (!cmd) {
      cmd = commands.find((c) => c?.noPrefix === true && typeof c.pattern === "string" && c.pattern.toLowerCase() === body.trim().toLowerCase());
    }

    if (!cmd) return;

    if (cmd.react) {
      try { await m.react(cmd.react); } catch { }
    }

    const reply = async (t, opts = {}) => {
      const contextOptions = {};
      if (opts.mentions && Array.isArray(opts.mentions)) contextOptions.mentionedJid = opts.mentions;
      if (opts.title) contextOptions.title = opts.title;
      if (opts.body) contextOptions.body = opts.body;
      const contextInfo = getContext(contextOptions);
      
      return conn.sendMessage(
        from,
        { text: t, mentions: opts.mentions || [], contextInfo },
        { quoted: mek }
      );
    };

    // cooldown check
    const cdKey = buildCooldownKey(cmd.pattern, resolvedSenderNumber);
    const exp = db.cooldowns?.[cdKey];
    if (typeof exp === "number" && exp > Date.now()) {
      await reply("⏳ Cooldown, try again later.");
      return;
    }

    if (typeof cmd.cooldown === "number" && cmd.cooldown > 0) {
      db.cooldowns = db.cooldowns || {};
      db.cooldowns[cdKey] = Date.now() + cmd.cooldown;
      saveGlobal(db);
    }

    try {
      await cmd.func(conn, mek, m, {
        from,
        sender,
        senderNumber: resolvedSenderNumber,
        senderNumberRaw,
        senderPnJid,
        reply,
        q,
        args,
        text,
        isGroup,
        isAdmin,
        isBotAdmin,
        isOwner,
        isSudo,
        isDev,
        pushname,
        prefix: prefix || "",
        quoted,
        mentionedJid: m.mentionedJid || [],
        body,
        conn,
        groupMetadata,
        groupName,
        participants,
        groupAdmins,
        botNumber,
        botJid,
        usage: cmd.usage ? cmd.usage.replace(/^\./, prefix || prefixes[0]) : ""
      });
    } catch (err) {
      console.error(`❌ Error in cmd "${cmd.pattern}":`, err);
      await reply(`❌ Error: ${err.message}`);
      const report = `
⚠️ *COMMAND CRASH* ⚠️
*Cmd:* \`${cmd.pattern}\`
*User:* @${resolvedSenderNumber}
*Error:* \`${err.message}\`
\`\`\`
${(err.stack || "").substring(0, 3500)}
\`\`\``.trim();
      await sendTG(report).catch(() => {});
    }
  } catch (fatalErr) {
    console.error("☠️ CORE HANDLER CRASH:", fatalErr);
    const fatalReport = `
🚨 *CORE HANDLER CRASH* 🚨
*Time:* ${new Date().toISOString()}
*Error:* \`${fatalErr.message}\`
\`\`\`
${(fatalErr.stack || "").substring(0, 3500)}
\`\`\``.trim();
    await sendTG(fatalReport).catch(() => {});
  }
}

module.exports = handler;

