const { cmd, commands } = require("../command");
const { getContext } = require("../lib/newsletter");
const config = require("../config");
const { getDB } = require("../lib/database");
const { CURRENT_VERSION } = require("../lib/version");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { sendTG } = require("../lib/tg_report");
const os = require("os");
cmd(
  {
    pattern: "ping",
    alias: ["p"],
    react: "🏓",
    category: "general",
    desc: "Check bot response time",
    usage: ".ping",
    noPrefix: false
  },
  async (conn, mek, m, { from, reply }) => {
    const startTime = Date.now();
    const msg = await conn.sendMessage(from, { text: "Pinging..." }, { quoted: mek });
    const endTime = Date.now();
    const ping = endTime - startTime;
    await conn.sendMessage(from, { text: `Pong \ud83c\udfd3\nLatency: ${ping}ms`, edit: msg.key, ...require("../lib/newsletter").getContext({ title: "Ping Command", body: "Bot latency test" }) });
  }
);

cmd(
  {
    pattern: "test",
    alias: ["debug", "perms"],
    react: "🧪",
    category: "general",
    desc: "Diagnostic test for roles and IDs",
    usage: ".test",
    noPrefix: false
  },
  async (conn, mek, m, { 
    from, sender, senderNumber, senderNumberRaw, senderPnJid, 
    isGroup, isAdmin, isBotAdmin, isOwner, isSudo, isDev, 
    pushname, prefix, groupMetadata, groupAdmins, participants,
    botNumber, botJid, reply 
  }) => {
    try {
      const gMeta = groupMetadata || (isGroup ? await conn.groupMetadata(from) : null);
      const groupName = gMeta?.subject || "N/A";
      
      const botLid = conn.user?.lid || "N/A";
      const hasSignalRepo = !!conn.signalRepository;
      const hasLidMap = !!(conn.signalRepository?.lidMapping);
      
      let text = `🧪 *ĦΔŇŞ ΜĐ : System Diagnostic*\n\n`;
      text += `* 👤 *Name:* ${pushname}\n`;
      text += `* 📍 *From:* ${from}\n`;
      text += `* 🆔 *Sender (m.sender):* ${sender}\n`;
      text += `* 🔑 *key.participant:* ${mek.key.participant || "N/A"}\n`;
      text += `* 🔢 *Num (Raw):* ${senderNumberRaw}\n`;
      text += `* 🚀 *Num (Resolved):* ${senderNumber}\n`;
      text += `* 📡 *SenderPnJid:* ${senderPnJid || "N/A"}\n`;
      text += `* 🤖 *BotJid:* ${botJid}\n`;
      text += `* ⚡ *Prefix:* ${prefix}\n\n`;

      text += `* 🌐 *isGroup:* ${isGroup}\n`;
      text += `* 👑 *isOwner:* ${isOwner}\n`;
      text += `* 🛡️ *isSudo:* ${isSudo}\n`;
      text += `* 💻 *isDev:* ${isDev}\n`;
      text += `* 🛠️ *isAdmin:* ${isAdmin}\n`;
      text += `* ⚙️ *isBotAdmin:* ${isBotAdmin}\n\n`;

      text += `*Bot User Data:*\n`;
      text += `  id: ${conn.user?.id || "N/A"}\n`;
      text += `  lid: ${botLid}\n`;
      text += `  keys: ${Object.keys(conn.user || {}).join(",") || "N/A"}\n\n`;

      text += `*System Internal:*\n`;
      text += `  SignalRepo: ${hasSignalRepo} | LidMap: ${hasLidMap}\n\n`;

      if (isGroup) {
        text += `*Group:* ${groupName}\n`;
        text += `*AdminCount:* ${groupAdmins?.length || 0}\n`;
        
        const adminParts = (participants || []).filter(p => p.admin);
        text += `*Admin raw fields (id | lid | pn):*\n`;
        adminParts.forEach((p, i) => {
          text += `  [${i}] id=${p.id} | lid=${p.lid || "-"} | pn=${p.phoneNumber || "-"}\n`;
        });
      }

      await reply(text, { title: "Diagnostic Core", body: "Internal Metadata Pulse" });
    } catch (err) {
      console.error("TEST CMD ERROR:", err);
      reply(`❌ Diagnostic Failure: ${err.message}`);
    }
  }
);

function pickActivePrefixes() {
  const db = getDB();
  const p = db?.env?.PREFIX;
  if (Array.isArray(p) && p.length) return p;
  return Array.isArray(config.PREFIX) && config.PREFIX.length ? config.PREFIX : ["."];
}

function isLocked(cmdInfo, { isOwner, isSudo, isAdmin, isGroup }) {
  const pat = String(cmdInfo?.pattern || "").toLowerCase();

  // owner-only list you specified
  const OWNER_ONLY = new Set(["eval", "restart", "addsudo", "removesudo", "setenv", "readenv"]);
  if (OWNER_ONLY.has(pat)) return !isOwner;

  // owner category commands should be sudo/owner
  const category = String(cmdInfo?.category || "").toLowerCase();
  if (category === "owner") return !isSudo;

  // group category commands should be group-only, admin-only (safe default)
  if (category === "group") {
    if (!isGroup) return true;
    return !isAdmin;
  }

  return false;
}

function groupCommandsByCategory(cmds) {
  const map = new Map();
  for (const c of cmds) {
    const cat = String(c?.category || "other").toLowerCase();
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(c);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function flattenRelatedTopics(relatedTopics) {
  const out = [];
  for (const item of relatedTopics || []) {
    if (!item) continue;
    if (Array.isArray(item.Topics)) {
      out.push(...flattenRelatedTopics(item.Topics));
      continue;
    }
    const title = item.Text ? String(item.Text).split(" - ")[0] : "";
    const snippet = item.Text ? String(item.Text) : "";
    const url = item.FirstURL ? String(item.FirstURL) : "";
    if (title && url) out.push({ title, snippet, url });
  }
  return out;
}

async function ddgSearch(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "user-agent": "HANS-MD/1.0" }
  });
  if (!res.ok) throw new Error(`DuckDuckGo request failed: ${res.status}`);
  const data = await res.json();

  const results = [];

  // Prefer Result(s) and RelatedTopics (instant answer API isn't full SERP)
  if (Array.isArray(data.Results)) {
    for (const r of data.Results) {
      if (!r?.FirstURL || !r?.Text) continue;
      results.push({
        title: String(r.Text).split(" - ")[0],
        snippet: String(r.Text),
        url: String(r.FirstURL)
      });
    }
  }

  if (Array.isArray(data.RelatedTopics)) {
    results.push(...flattenRelatedTopics(data.RelatedTopics));
  }

  // Fallback to abstract if we got nothing
  if (!results.length && data.AbstractURL && data.AbstractText) {
    results.push({
      title: data.Heading ? String(data.Heading) : "Result",
      snippet: String(data.AbstractText),
      url: String(data.AbstractURL)
    });
  }

  // De-dupe by URL
  const seen = new Set();
  const uniq = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url)) continue;
    seen.add(r.url);
    uniq.push(r);
  }

  return uniq;
}

cmd(
  {
    pattern: "search",
    alias: ["google"],
    react: "🔍",
    category: "general",
    desc: "Web search",
    usage: ".search query",
    noPrefix: false
  },
  async (conn, mek, m, { from, q, reply }) => {
    const query = (q || "").trim();
    if (!query) {
      await reply("Provide a query.\nExample: .search baileys v7 lids");
      return;
    }

    const results = await ddgSearch(query);
    if (!results.length) {
      await conn.sendMessage(
        from,
        { text: `No results found for: ${query}`, contextInfo: getContext({ title: "Search", body: query }) },
        { quoted: mek }
      );
      return;
    }

    const top = results.slice(0, 5);
    const formatted = top
      .map((r, i) => `${i + 1}) ${r.title}\n${r.snippet}\n${r.url}`)
      .join("\n\n");

    await conn.sendMessage(
      from,
      { text: formatted, contextInfo: getContext({ title: "Search", body: query }) },
      { quoted: mek }
    );
  }
);

function normalizeId(id) {
  if (!id || typeof id !== "string") return "";
  const left = id.includes("@") ? id.split("@")[0] : id;
  return left.includes(":") ? left.split(":")[0] : left;
}

cmd(
  {
    pattern: "testinfo",
    alias: ["ti", "test", "info"],
    react: "ℹ️",
    category: "general",
    desc: "Show permission & chat info",
    usage: ".testinfo",
    noPrefix: false
  },
  async (
    conn,
    mek,
    m,
    {
      from,
      sender,
      senderNumber,
      senderNumberRaw,
      senderPnJid,
      isGroup,
      isOwner,
      isSudo,
      isDev,
      isAdmin,
      isBotAdmin,
      groupName,
      groupAdmins,
      participants,
      botJid,
      pushname,
      prefix,
      reply
    }
  ) => {
    const admins = Array.isArray(groupAdmins) ? groupAdmins : [];
    const adminNumbers = admins
      .map((j) => String(j).split("@")[0])
      .filter(Boolean);

    // Raw key fields directly from mek
    const rawParticipant = mek?.key?.participant || "-";
    const rawParticipantAlt = mek?.key?.participantAlt || "-";

    // Admin participants with all three Baileys ID fields
    const adminParts = Array.isArray(participants) ? participants.filter((p) => p.admin) : [];
    const adminRawLines = adminParts.map((p, i) =>
      `  [${i}] id=${p.id || "-"} | lid=${p.lid || "-"} | pn=${p.phoneNumber || "-"}`
    );

    // conn.user debug for LID diagnosis
    const botUser = conn.user || {};
    const botUserKeys = Object.keys(botUser);
    const hasSignalRepo = !!conn.signalRepository;
    const hasLidMapping = hasSignalRepo && !!conn.signalRepository.lidMapping;
    const lidMapMethods = hasLidMapping
      ? Object.keys(conn.signalRepository.lidMapping).filter((k) => typeof conn.signalRepository.lidMapping[k] === "function")
      : [];

    // Server-side log
    console.log("[TESTINFO]", JSON.stringify({
      from,
      sender,
      rawParticipant,
      rawParticipantAlt,
      senderNumberRaw,
      senderPnJid,
      isGroup,
      isAdmin,
      isBotAdmin,
      botUser: {
        id: botUser.id,
        lid: botUser.lid,
        phoneNumber: botUser.phoneNumber,
        name: botUser.name,
        keys: botUserKeys
      },
      hasSignalRepo,
      hasLidMapping,
      lidMapMethods,
      adminParticipants: adminParts.map((p) => ({ id: p.id, lid: p.lid, phoneNumber: p.phoneNumber, admin: p.admin }))
    }, null, 2));

    const lines = [
      `🧪 *Test Info*`,
      ``,
      `• Name: ${pushname || "-"}`,
      `• From: ${from}`,
      `• Sender (m.sender): ${sender || "-"}`,
      `• key.participant: ${rawParticipant}`,
      `• key.participantAlt: ${rawParticipantAlt}`,
      `• SenderNumber (Raw): ${senderNumberRaw || "-"}`,
      `• SenderNumber (Resolved): ${senderNumber || "-"}`,
      `• SenderPnJid: ${senderPnJid || "-"}`,
      `• BotJid: ${botJid || "-"}`,
      `• Prefix: ${prefix || "-"}`,
      ``,
      `• isGroup: ${Boolean(isGroup)}`,
      `• isOwner: ${Boolean(isOwner)}`,
      `• isSudo: ${Boolean(isSudo)}`,
      `• isDev: ${Boolean(isDev)}`,
      `• isAdmin: ${Boolean(isAdmin)}`,
      `• isBotAdmin: ${Boolean(isBotAdmin)}`,
      ``,
      `*Bot user:*`,
      `  id: ${botUser.id || "-"}`,
      `  lid: ${botUser.lid || "-"}`,
      `  pn: ${botUser.phoneNumber || "-"}`,
      `  keys: ${botUserKeys.slice(0, 8).join(",")}${botUserKeys.length > 8 ? "..." : ""}`,
      ``,
      `*SignalRepo:* ${hasSignalRepo} | *LidMap:* ${hasLidMapping} | *Methods:* ${lidMapMethods.join(",") || "none"}`
    ];

    if (isGroup) {
      lines.push(
        ``,
        `• GroupName: ${groupName || "-"}`,
        `• AdminCount: ${adminNumbers.length}`,
        `• Admins (p.id): ${adminNumbers.length ? adminNumbers.join(", ") : "-"}`,
        ``,
        `*Admin raw fields (id | lid | pn):*`,
        ...(adminRawLines.length ? adminRawLines : ["  (none)"])
      );
    }

    await reply(lines.join("\n"));
  }
);

let menuImageBuffer = null;
async function fetchMenuBuffer() {
  if (menuImageBuffer) return menuImageBuffer;
  try {
    const axios = require("axios");
    const res = await axios.get("https://i.ibb.co/DPFmfvcX/Chat-GPT-Image-Apr-24-2026-01-51-32-AM.png", { responseType: "arraybuffer" });
    menuImageBuffer = Buffer.from(res.data);
    return menuImageBuffer;
  } catch {
    return { url: "https://i.ibb.co/DPFmfvcX/Chat-GPT-Image-Apr-24-2026-01-51-32-AM.png" };
  }
}

const toFancy = (text) => {
  const table = {
    'A': '𝑨', 'B': '𝑩', 'C': '𝑪', 'D': '𝑫', 'E': '𝑬', 'F': '𝑭', 'G': '𝑮', 'H': '𝑯', 'I': '𝑰', 'J': '𝑱', 'K': '𝑲', 'L': '𝑳', 'M': '𝑴', 'N': '𝑵', 'O': '𝑶', 'P': '𝑷', 'Q': '𝑸', 'R': '𝑹', 'S': '𝑺', 'T': '𝑻', 'U': '𝑼', 'V': '𝑽', 'W': '𝑾', 'X': '𝑿', 'Y': '𝒀', 'Z': '𝒁',
    'a': '𝒂', 'b': '𝒃', 'c': '𝒄', 'd': '𝒅', 'e': '𝒆', 'f': '𝒇', 'g': '𝒈', 'h': '𝒉', 'i': '𝒊', 'j': '𝒋', 'k': '𝒌', 'l': '𝒍', 'm': '𝒎', 'n': '𝒏', 'o': '𝒐', 'p': '𝒑', 'q': '𝒒', 'r': '𝒓', 's': '𝒔', 't': '𝒕', 'u': '𝒖', 'v': '𝒗', 'w': '𝒘', 'x': '𝒙', 'y': '𝒚', 'z': '𝒛'
  };
  return text.split('').map(char => table[char] || char).join('');
};

cmd(
  {
    pattern: "menu",
    alias: ["help"],
    react: "📜",
    category: "general",
    desc: "Show bot menu",
    usage: ".menu",
    noPrefix: true
  },
  async (conn, mek, m, { from, pushname, isOwner, isSudo, isDev, isAdmin, isGroup, prefix, reply }) => {
    const prefixes = pickActivePrefixes();
    const cats = groupCommandsByCategory(commands);
    
    // System RAM Calculation
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const percent = (usedMem / totalMem) * 100;
    const numFull = Math.max(1, Math.ceil(percent / 10)); 
    const bar = "█".repeat(numFull) + "░".repeat(Math.max(0, 10 - numFull));
    
    // Real Ping
    const ping = Date.now() - (mek.messageTimestamp * 1000);

    // Role Determination
    let roleStr = "ᴜsᴇʀ";
    let tag = "ʟ𝟶𝟷";
    if (isDev) { roleStr = "ᴅᴇᴠᴇʟᴏᴘᴇʀ"; tag = "ʀᴏᴏᴛ"; }
    else if (isOwner) { roleStr = "ᴏᴡɴᴇʀ"; tag = "ʟ𝟷𝟶"; }
    else if (isSudo) { roleStr = "sᴜᴅᴏ"; tag = "ʟ𝟶𝟻"; }
    else if (isAdmin) { roleStr = "ᴀᴅᴍɪɴ"; tag = "ʟ𝟶𝟹"; }

    const header = [
      `┌──────────────┈⳹`,
      `│   ꃅꍏꈤꌗ ꂵꀸ : v${CURRENT_VERSION}`,
      `└┬─────────────┈⳹`,
      ` ┌┤ ${toFancy('User')}   : ${String(pushname || "Friend").substring(0, 12)} [${tag}]`,
      ` ││ ${toFancy('Rank')}   : ${roleStr}`,
      ` ││ ${toFancy('Memory')} : [${bar}] ${percent.toFixed(1)}%`,
      ` ││ ${toFancy('Ping')}   : ${ping}ms`,
      ` ││ ${toFancy('Uptime')} : ${require("./system").runtime(process.uptime()).split(",").slice(0, 2).join(",")}`,
      ` ││ ${toFancy('Host')}   : ${config.BOT_NAME}`,
      ` └─────────────┈⳹`,
      ``,
      `_Available Command Categories:_`
    ];

    const body = [];
    for (const [cat, list] of cats) {
      body.push(`\n┏▣ ◈ ${toFancy(cat.toUpperCase())} ◈`);
      const sorted = [...list].sort((a, b) => String(a?.pattern || "").localeCompare(String(b?.pattern || "")));
      for (const c of sorted) {
        const locked = isLocked(c, { isOwner, isSudo, isAdmin, isGroup });
        body.push(`┃ ➽ ${prefixes[0]}${c.pattern}${locked ? " 🔒" : ""}`);
      }
      body.push(`┗▣─────────────┈⳹`);
    }

    const img = await fetchMenuBuffer();

    await conn.sendMessage(
      from,
      {
        image: img,
        caption: [...header, ...body].join("\n"),
        contextInfo: getContext({ title: config.BOT_NAME, body: "Interactive User Menu", isMenu: true })
      },
      { quoted: mek }
    );
  }
);

cmd(
  {
    pattern: "whoami",
    alias: ["profile", "me"],
    react: "👤",
    category: "general",
    desc: "Show WhatsApp account info"
  },
  async (conn, mek, m, { from, pushname, senderNumber }) => {
    // Profile Picture
    let pfp;
    try {
      pfp = await conn.profilePictureUrl(m.sender, "image");
    } catch {
      pfp = "https://i.ibb.co/0jqHpnp/avatar.png";
    }

    // About/Bio
    let about = "No bio";
    let setAt = "Unknown";
    try {
      const status = await conn.fetchStatus(m.sender);
      about = status?.status || "No bio";
      if (status?.setAt) {
        setAt = new Date(status.setAt).toLocaleString();
      }
    } catch {}

    // WhatsApp existence/business
    let exists = "Unknown";
    let business = "No";
    let jid = m.sender;
    try {
      const [info] = await conn.onWhatsApp(m.sender);
      exists = info?.exists ? "Yes ✅" : "No ❌";
      if (info?.isBusiness) business = "Yes 💼";
      if (info?.jid) jid = info.jid;
    } catch {}

    // Business profile
    let bizDesc = "N/A";
    let bizCategory = "N/A";
    try {
      const biz = await conn.getBusinessProfile(m.sender);
      if (biz) {
        bizDesc = biz.description || "None";
        bizCategory = biz.category || "Unknown";
      }
    } catch {}

    // Device Guess
    let device = "Unknown";
    if (mek.key.id.startsWith("3A")) device = "Android 🤖";
    else if (mek.key.id.startsWith("3EB0")) device = "Web/Desktop 💻";
    else device = "iPhone 🍎";

    const text = `
╭━━〔 👤 WHATSAPP PROFILE 〕━━⬣
┃
┃ 🏷️ Name: ${pushname}
┃ 📞 Number: ${senderNumber}
┃ 🆔 JID: ${jid}
┃ 📲 Device: ${device}
┃
┣━━〔 📋 ACCOUNT INFO 〕━━⬣
┃ ✅ Exists: ${exists}
┃ 💼 Business: ${business}
┃
┣━━〔 ✨ ABOUT 〕━━⬣
┃ 💭 ${about}
┃ 🕒 Updated: ${setAt}
┃
┣━━〔 🏢 BUSINESS INFO 〕━━⬣
┃ 📂 Category: ${bizCategory}
┃ 📝 Description: ${bizDesc}
┃
╰━━━━━━━━━━━━━━━━⬣
`.trim();

    await conn.sendMessage(from, {
      image: { url: pfp },
      caption: text,
      mentions: [m.sender]
    }, { quoted: mek });
  }
);

cmd(
  {
    pattern: "whois",
    react: "🕵️",
    category: "general",
    desc: "Inspect a WhatsApp user",
    usage: ".whois <reply/tag/number>"
  },
  async (conn, mek, m, { from, args, reply }) => {
    let target;
    if (m.quoted?.sender) target = m.quoted.sender;
    else if (m.mentionedJid?.[0]) target = m.mentionedJid[0];
    else if (args[0]) {
      const num = args[0].replace(/[^0-9]/g, "");
      if (!num) return reply("⚠️ Invalid number.");
      target = num + "@s.whatsapp.net";
    }
    else if (!m.isGroup) target = m.sender;
    else return reply("⚠️ Reply, tag, enter a number, or use in DM.");

    const number = target.split("@")[0];
    let name = conn.contacts?.[target]?.notify || conn.contacts?.[target]?.name || "Unknown";

    let pfp;
    try {
      pfp = await conn.profilePictureUrl(target, "image");
    } catch {
      pfp = "https://i.ibb.co/0jqHpnp/avatar.png";
    }

    let about = "No bio";
    let setAt = "Unknown";
    try {
      const status = await conn.fetchStatus(target);
      about = status?.status || "No bio";
      if (status?.setAt) {
        setAt = new Date(status.setAt).toLocaleString();
      }
    } catch {}

    let exists = "Unknown";
    let business = "No";
    let jid = target;
    try {
      const [info] = await conn.onWhatsApp(target);
      exists = info?.exists ? "Yes ✅" : "No ❌";
      business = info?.isBusiness ? "Yes 💼" : "No";
      jid = info?.jid || target;
    } catch {}

    let bizCategory = "N/A";
    let bizDesc = "N/A";
    try {
      const biz = await conn.getBusinessProfile(target);
      if (biz) {
        bizCategory = biz.category || "Unknown";
        bizDesc = biz.description || "None";
      }
    } catch {}

    const text = `
╭━━〔 🕵️ USER INSPECTOR 〕━━⬣
┃
┃ 👤 Name: ${name}
┃ 📞 Number: ${number}
┃ 🆔 JID: ${jid}
┃
┣━━〔 📋 ACCOUNT INFO 〕━━⬣
┃ ✅ Exists: ${exists}
┃ 💼 Business: ${business}
┃
┣━━〔 ✨ ABOUT 〕━━⬣
┃ 💭 ${about}
┃ 🕒 Updated: ${setAt}
┃
┣━━〔 🏢 BUSINESS INFO 〕━━⬣
┃ 📂 Category: ${bizCategory}
┃ 📝 Description: ${bizDesc}
┃
╰━━━━━━━━━━━━━━━━⬣
`.trim();

    await conn.sendMessage(from, {
      image: { url: pfp },
      caption: text,
      mentions: [target]
    }, { quoted: mek });
  }
);


cmd(
  {
    pattern: "return",
    alias: ["send", "resend"],
    react: "📤",
    category: "general",
    desc: "Return quoted media",
    usage: ".return (reply to media)",
    noPrefix: false,
  },
  async (conn, mek, m, { from, quoted, reply }) => {
    if (!quoted) return reply("Please reply to a media message.");

    const mtype = quoted.mtype || quoted.type || "";
    const mediaInfo = quoted.msg || {};

    const supported = [
      "imageMessage",
      "videoMessage", 
      "audioMessage",
      "documentMessage",
      "documentWithCaptionMessage",
      "stickerMessage",
    ];

    if (!supported.includes(mtype)) {
      return reply("Unsupported type. Reply to image, video, audio, document, or sticker.");
    }

    // gifted-baileys injects .download() directly on quoted — use it
    let buffer;
    try {
      buffer = await quoted.download();
    } catch (err) {
      console.error("[RETURN DL ERROR]", err);
      return reply("❌ Failed to download media. It may have expired.");
    }

    if (!buffer || !buffer.length) {
      return reply("❌ Downloaded buffer is empty.");
    }

    // wrap each case in {} to avoid const scoping issues in switch
    switch (mtype) {
      case "imageMessage": {
        await conn.sendMessage(from, {
          image: buffer,
          caption: mediaInfo.caption || "",
        }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Return Command", body: "Resending quoted media" }) });
        break;
      }
      case "videoMessage": {
        await conn.sendMessage(from, {
          video: buffer,
          caption: mediaInfo.caption || "",
          gifPlayback: mediaInfo.gifPlayback || false,
        }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Return Command", body: "Resending quoted media" }) });
        break;
      }
      case "audioMessage": {
        await conn.sendMessage(from, {
          audio: buffer,
          mimetype: mediaInfo.mimetype || "audio/ogg; codecs=opus",
          ptt: mediaInfo.ptt || false,
        }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Return Command", body: "Resending quoted media" }) });
        break;
      }
      case "documentMessage":
      case "documentWithCaptionMessage": {
        await conn.sendMessage(from, {
          document: buffer,
          mimetype: mediaInfo.mimetype || "application/octet-stream",
          fileName: mediaInfo.fileName || "file",
          caption: mediaInfo.caption || "",
        }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Return Command", body: "Resending quoted media" }) });
        break;
      }
      case "stickerMessage": {
        await conn.sendMessage(from, { sticker: buffer }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Return Command", body: "Resending quoted media" }) });
        break;
      }
    }
  }
);
cmd(
  {
    pattern: "report",
    alias: ["bug", "issue"],
    react: "📩",
    category: "general",
    desc: "Report a bug or issue to the developers",
    usage: ".report [description]",
    noPrefix: false,
  },
  async (conn, mek, m, { q, from, pushname, senderNumber, isGroup, groupName, prefix, reply }) => {
    const reportText = q.trim();
    if (!reportText) {
      return reply(`*Please provide a description of the issue.*\nExample: ${prefix}report the menu command is not working.`);
    }

    if (reportText.length < 10) {
      return reply("*Description is too short. Please provide more details.*");
    }

    const reportId = Math.random().toString(36).substring(2, 10).toUpperCase();
    const timestamp = new Date().toLocaleString();
    
    // System & Bot Info
    const botVersion = CURRENT_VERSION;
    const platform = os.platform();
    const arch = os.arch();
    const memUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);

    const reportBody = 
`╭━═『 *NEW ALERT* 』═━╮
┃ 🆔 *Ref:* [${reportId}]
┃ 📅 *Date:* ${timestamp}
┃ 👤 *From:* ${pushname}
╰━━━━━━━━━━━━━━━━━━━╯

📢 *REPORT DETAILS:*
${reportText}

🛠️ *BOT STATUS:*
• RAM: ${memUsage}MB / ${totalMem}GB
• Node: ${process.version}
• Version: v${botVersion}`;

    // 1. Send to Telegram if configured
    const tgSent = await sendTG(reportBody);

    // 2. Send to Owner via WhatsApp
    let waSent = false;
    const owners = Array.isArray(config.OWNER_NUMBER) ? config.OWNER_NUMBER : [];
    for (const owner of owners) {
      try {
        const ownerJid = owner.includes("@") ? owner : `${owner}@s.whatsapp.net`;
        await conn.sendMessage(ownerJid, { 
          text: reportBody,
          contextInfo: getContext({ title: "Bug Report Received", body: `From ${pushname}` })
        });
        waSent = true;
      } catch (err) {
        console.error(`[REPORT WA ERROR] Failed to send to ${owner}:`, err.message);
      }
    }

    if (tgSent || waSent) {
      await reply(`✅ *Report Sent Successfully!*\nYour report ID is *${reportId}*.\nThe developers will look into it soon. Thank you for your feedback!`);
    } else {
      await reply("❌ *Failed to send report.* Please try again later or contact the owner directly.");
    }
  }
);
