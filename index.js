const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { Agent } = require("https");
const pino = require("pino");

const config = require("./config");
const serialize = require("./lib/serialize");
const handler = require("./lib/handler");
const { loadCommands } = require("./lib/loader");
const { cleanExpired, storeMessage, getStoredMessage, getDB } = require("./lib/database");
const { CURRENT_VERSION } = require("./lib/version");
const { sendTG } = require("./lib/tg_report");

const logger = pino({ level: "info" });
let presenceInterval = null; // Global to manage single interval
const GROUP_EVENT_DEDUPE = new Map();

function normalizeParticipantId(id) {
  if (!id || typeof id !== "string") return "";
  const left = id.includes("@") ? id.split("@")[0] : id;
  return left.includes(":") ? left.split(":")[0] : left;
}

function shouldSkipGroupEvent(groupId, action, participantId) {
  const key = `${groupId}:${action}:${participantId}`;
  const now = Date.now();
  const lastSeen = GROUP_EVENT_DEDUPE.get(key);
  if (lastSeen && now - lastSeen < 15000) return true;
  GROUP_EVENT_DEDUPE.set(key, now);

  // Keep cache bounded to avoid unbounded growth.
  if (GROUP_EVENT_DEDUPE.size > 1000) {
    for (const [k, ts] of GROUP_EVENT_DEDUPE.entries()) {
      if (now - ts > 60000) GROUP_EVENT_DEDUPE.delete(k);
    }
  }
  return false;
}

async function fetchGroupPictureMedia(conn, groupId) {
  try {
    const url = await conn.profilePictureUrl(groupId, "image");
    if (!url) return null;
    const res = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

// ─── FATAL ERROR TELEGRAM REPORTING ───
function formatCrashReport(type, error) {
  const ts = new Date().toISOString();
  const stack = error.stack || String(error);
  return `
🚨 *HANS-MD FATAL ERROR* 🚨

*Type:* \`${type}\`
*Time:* ${ts}
*Version:* v${CURRENT_VERSION}
*Node:* ${process.version}
*Platform:* ${require("os").platform()} ${require("os").arch()}

*Error:*
\`\`\`
${stack.substring(0, 3800)}
\`\`\`
  `.trim();
}

async function reportCrash(type, error) {
  try {
    const report = formatCrashReport(type, error);
    const sent = await sendTG(report);
    console.error(`[FATAL REPORT] ${type} → Telegram ${sent ? "SENT ✅" : "FAILED ❌"}`);
  } catch (tgErr) {
    console.error("[FATAL REPORT] Telegram send failed:", tgErr.message);
  }
}

process.on("uncaughtException", async (err) => {
  console.error("[FATAL] Uncaught Exception:", err);
  await reportCrash("uncaughtException", err);
  process.exit(1);
});

process.on("unhandledRejection", async (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  console.error("[FATAL] Unhandled Rejection:", err);
  await reportCrash("unhandledRejection", err);
});

const SESSION_PATH = "./sessions";
const CREDS_PATH = path.join(__dirname, "sessions", "creds.json");

let isFirstConnect = true;
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// ─── START BOT ───
async function startBot() {

  let pairingCode = false;
  try {
    pairingCode = !fs.existsSync(CREDS_PATH) || fs.statSync(CREDS_PATH).size === 0;
  } catch {
    pairingCode = true;
  }
  
  if (pairingCode) {
    console.log("⚠️ No valid session found. Entering Pairing Mode...");
    
    // Clear stale session tokens/keys to avoid 401 'Logged Out' errors on fresh pairing
    try { 
      fs.rmSync(SESSION_PATH, { recursive: true, force: true }); 
      console.log("🧹 Stale session cleanup complete.");
    } catch (err) {}

    // Interactive Phone Number Prompt
    if (!process.env.OWNER_NUMBER) {
      const readline = require("readline");
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const question = (text) => new Promise((resolve) => rl.question(text, resolve));

      console.log("\n📲 OWNER_NUMBER is missing in your .env file!");
      let inputNumber = await question("📝 Enter your phone number with country code (e.g., 237680260772): ");
      inputNumber = inputNumber.replace(/\D/g, "");
      
      if (!inputNumber || inputNumber.length < 10) {
        console.error("❌ Invalid phone number provided. Restart the bot and try again.");
        process.exit(1);
      }
      
      // Update config for this session
      config.OWNER_NUMBER = [inputNumber];
      rl.close();
    }
  }
  
  const baileys = await import("@whiskeysockets/baileys");
  const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore
  } = baileys;

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);
  // Hardcode the EXACT version that previously worked for this bot
  const version = [2, 3000, 1035194821]; 

  console.log("🛠️ Initializing Baileys socket...");
  const conn = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    browser: ["Mac OS", "Chrome", "14.4.1"],
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000, 
    defaultQueryTimeoutMs: undefined,
    keepAliveIntervalMs: 10000,
    agent: new Agent({ family: 4 }),
    version,
    getMessage: async (key) => {
      const msg = getStoredMessage(key.id);
      if (msg) return msg.message;
      return undefined; // Return undefined for properly handled retries
    }
  });

  // Store outgoing messages to facilitate retries (decryption fix)
  conn.ev.on("messages.upsert", async ({ messages, type }) => {
    for (const msg of messages) {
       if (msg.key.fromMe) {
          storeMessage(msg);
       }
    }
  });

  if (pairingCode && !conn.authState.creds.registered) {
     const phoneNumber = config.OWNER_NUMBER[0].replace(/\D/g, '');
     
     // 2-3 second delay to ensure socket is fully ready before requesting code
     setTimeout(async () => {
        try {
          console.log(`📡 Requesting Pairing Code for: ${phoneNumber}...`);
          const rawCode = await conn.requestPairingCode(phoneNumber);
          const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
          
          console.log(`
╭──────────────────────────────────────────╮
│           🔢 PAIRING CODE               │
│           ${formattedCode}              │
╰──────────────────────────────────────────╯

🔗 Steps to Link:
1. Open WhatsApp on your phone.
2. Go to Settings > Linked Devices.
3. Tap "Link a Device" -> "Link with phone number instead".
4. Enter the code shown above.
`);
        } catch (err) {
          console.error("❌ Failed to request pairing code:", err.message);
          console.log("💡 Tip: Ensure the number in OWNER_NUMBER is correct and includes country code.");
        }
     }, 3000);
  }

  conn.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    // Modern QR Handler
    if (qr && !pairingCode) {
      const qrcode = require("qrcode-terminal");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.error("[CONNECTION CLOSED] Detail:", lastDisconnect?.error);

      if (statusCode === DisconnectReason.loggedOut) {
        console.error("Logged out (401) - Check Browser Auth signature");
        process.exit(1);
      }

      if (statusCode === DisconnectReason.badSession) {
        console.error("Bad session, clear sessions/ and re-pair");
        process.exit(1);
      }

      startBot();
    }

      if (connection === "open") {
        console.log(`╭─── ${config.BOT_NAME} ───`);
        console.log(`│ Version: ${CURRENT_VERSION}`);
        console.log(`│ Prefix: ${config.PREFIX.join(", ")}`);
        console.log("╰───────────────");
        console.log("✅ HANS MD Connected");

        // Pre-fetch owner & sudo LIDs to populate cache for permission checks
        const db = getDB();
        const sudoList = Array.isArray(db.sudo) ? db.sudo : [];
        const ownerList = Array.isArray(config.OWNER_NUMBER) ? config.OWNER_NUMBER : [];
        const importantNumbers = [...new Set([...ownerList, ...sudoList])].filter(Boolean);
        if (importantNumbers.length) {
          conn.onWhatsApp(...importantNumbers).catch(() => {});
        }

        // Notify owner on first successful connection
        if (isFirstConnect) {
          console.log("📤 Attempting to send 'Online' notification to owner(s)...");
          for (const owner of ownerList) {
            const ownerJid = owner.includes("@") ? owner : `${owner}@s.whatsapp.net`;
            await conn.sendMessage(ownerJid, { 
              text: `✅ *${config.BOT_NAME} is now ONLINE!*\n\nVersion: v${CURRENT_VERSION}\nPrefix: ${config.PREFIX[0]}`,
              contextInfo: require("./lib/newsletter").getContext({ title: "System Online", body: "Connection established", forceNewsletter: true })
            }).then(() => console.log(`✅ Sent notification to ${ownerJid}`))
              .catch((err) => console.error(`❌ Failed to send notification to ${ownerJid}:`, err.message));
          }
          isFirstConnect = false;
        }

        try {
          require("./lib/presence").wirePresence(conn);
          require("./lib/gc_schedule").startGcScheduler(conn);
        } catch (schedErr) {
          console.error("[SCHEDULER] Failed to start:", schedErr.message);
        }

        if (config.ALWAYS_ONLINE) {
          // Force online state immediately with safety guard
          try { await conn.sendPresenceUpdate("available"); } catch {}
          
          // Clear any existing interval to prevent socket leaks
          if (presenceInterval) clearInterval(presenceInterval);
          
          // Maintain online state with an interval (every 3 minutes)
          presenceInterval = setInterval(async () => {
            if (conn.authState.creds.registered) {
              try { 
                await conn.sendPresenceUpdate("available"); 
              } catch (err) {
                 // Silently handle socket closes in interval
              }
            }
          }, 3 * 60 * 1000);
        }
    }
  });

  conn.ev.on("creds.update", saveCreds);

  loadCommands();

  cleanExpired();
  setInterval(() => {
    cleanExpired();
  }, 6 * 60 * 60 * 1000);

  conn.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const mek of messages) {
      if (!mek.message) continue;
      
      // Handle status messages (auto-read and react) if enabled
      const db = getDB();
      const autoStatus = db.env?.AUTO_STATUS !== undefined ? db.env.AUTO_STATUS : config.AUTO_STATUS;
      const autoStatusLike = db.env?.AUTO_STATUS_LIKE !== undefined ? db.env.AUTO_STATUS_LIKE : config.AUTO_STATUS_LIKE;
      if (mek.key.remoteJid === "status@broadcast" && !mek.key.fromMe && (autoStatus || autoStatusLike)) {
        try {
          if (autoStatus) {
            console.log("[STATUS] Auto-reading status from:", mek.key.participant || mek.key.remoteJid);
            await conn.readMessages([mek.key]);
          }
          if (autoStatusLike) {
            const statusOwnerJid = mek.key.participant || mek.key.remoteJid;
            console.log("[STATUS LIKE] Attempting react → status@broadcast | owner:", statusOwnerJid);
            await conn.sendMessage(
              "status@broadcast",
              { react: { text: "❤️", key: mek.key } },
              { statusJidList: [statusOwnerJid, conn.user.id] }
            ).then(() => {
              console.log("[STATUS LIKE] ✅ React sent successfully to status of:", statusOwnerJid);
            }).catch((err) => {
              console.error("[STATUS LIKE] ❌ React failed:", err.message);
            });
          }
        } catch (error) {
          console.error("[STATUS] ❌ Unexpected error in status handler:", error.message);
        }
        continue;
      }
      
      // Skip messages sent before the bot started (avoids re-running old commands on reconnect)
      const m = await serialize(mek, conn);
      await handler(conn, mek, m);

      const antiDel = db.env?.ANTI_DELETE !== undefined ? db.env.ANTI_DELETE : config.ANTI_DELETE;
      if (antiDel) {
        storeMessage(mek);
      }
    }
  });

  conn.ev.on("messages.update", async (updates) => {
    const db = getDB();
    const antiDel = db.env?.ANTI_DELETE !== undefined ? db.env.ANTI_DELETE : config.ANTI_DELETE;
    if (!antiDel) return;
    for (const update of updates) {
      const protocolMessage = update?.update?.message?.protocolMessage;
      const revokedKey = protocolMessage?.key;
      const isDeleted =
        update?.update?.message === null ||
        (!!protocolMessage &&
          (protocolMessage.type === 0 || protocolMessage.type === "REVOKE" || !!revokedKey?.id));
      if (!isDeleted) continue;

      const deletedMessageId = revokedKey?.id || update?.key?.id;
      const stored = getStoredMessage(deletedMessageId);
      if (!stored) continue;

      const mode = typeof antiDel === "string" ? antiDel.toLowerCase() : (antiDel === true ? "dm" : "off");
      if (mode === "off") continue;

      const reportText = `╭━━━═ 『 *ANTI-DELETE* 』 ═━━━╮\n` +
                        `┃ 🗑️ *Status:* Recovered\n` +
                        `┃ 👤 *From:* @${(stored.sender || "").split("@")[0]}\n` +
                        `┃ 📍 *Source:* ${(stored.from || "").endsWith("@g.us") ? "Group Message" : "Private Chat"}\n` +
                        `┃ 📅 *Date:* ${new Date(stored.timestamp).toLocaleDateString()}\n` +
                        `┃ ⏰ *Time:* ${new Date(stored.timestamp).toLocaleTimeString()}\n` +
                        `┃ 📦 *Type:* ${(stored.type || "unknown").toUpperCase()}\n` +
                        `╰━━━━━━━━━━══━━━━━━━━━━╯\n\n` +
                        `*『 ORIGINAL MESSAGE 』*\n` +
                        `━━━━━━━━━━━━━━━━━━\n` +
                        `${stored.body}\n` +
                        `━━━━━━━━━━━━━━━━━━`;

      const contextInfo = {
        ...require("./lib/newsletter").getContext({
          title: "🚨 Message Intercepted 🚨",
          body: `Source: ${stored.from}`
        }),
        mentionedJid: [stored.sender]
      };

      // 1. Send to Owner DM (if mode is 'dm' or 'both')
      if (mode === "dm" || mode === "both") {
        for (const ownerNumber of config.OWNER_NUMBER) {
          const ownerJid = `${ownerNumber}@s.whatsapp.net`;
          await conn.sendMessage(ownerJid, { text: reportText, contextInfo }).catch(() => {});
        }
      }

      // 2. Send to Group/Source (if mode is 'group' or 'both')
      if (mode === "group" || mode === "both") {
        await conn.sendMessage(stored.from, { text: reportText, contextInfo }).catch(() => {});
      }
    }
  });

  conn.ev.on("group-participants.update", async (update) => {
    try {
      const { id, participants, action } = update;

      const db = getDB();
      const welcomeData = db.welcome?.[id];
      const goodbyeData = db.goodbye?.[id];

      const isWelcomeEnabled = typeof welcomeData === "object" ? welcomeData.enabled : !!welcomeData;
      const isGoodbyeEnabled = typeof goodbyeData === "object" ? goodbyeData.enabled : !!goodbyeData;

      // Skip everything if both are disabled
      if (!isWelcomeEnabled && !isGoodbyeEnabled) return;

      // Try fetching metadata with catch to handle rate-overlimit
      let metadata;
      try {
        metadata = await conn.groupMetadata(id);
      } catch (err) {
        console.error("[GROUP METADATA ERROR]", err.message);
        // If we can't get metadata, we can't proceed with group name
        return;
      }

      const groupName = metadata?.subject || "this group";
      const memberCount = metadata?.participants?.length || 0;

      // Try getting group invite link
      let groupLink = "";
      if (action === "add") {
        try {
          const code = await conn.groupInviteCode(id);
          groupLink = `https://chat.whatsapp.com/${code}`;
        } catch {
          groupLink = "Invite link unavailable";
        }
      }

      // Fetch group profile picture as media buffer so WhatsApp uploads it directly.
      const groupPPMedia = await fetchGroupPictureMedia(conn, id);

      for (const p of participants) {
        const targetJid = typeof p === "object" ? (p.phoneNumber || p.id || "") : String(p);
        if (!targetJid) continue;
        const targetNum = normalizeParticipantId(targetJid);
        if (!targetNum) continue;

        if (shouldSkipGroupEvent(id, action, targetNum)) continue;

        // ================= WELCOME =================
        if (action === "add" && isWelcomeEnabled) {
          let msg =
            typeof welcomeData === "object" && welcomeData.message
              ? welcomeData.message
              : `┌──────────────┈⳹
│   ꃅꍏꈤꌗ ꂵꀸ : WELCOME
└┬─────────────┈⳹
 ┌┤ User    : @${targetNum}
 ││ Group   : ${groupName}
 ││ Members : ${memberCount}
 ││ Invite  : ${groupLink}
 └─────────────┈⳹

_Welcome to our community._
_Please read the group description._`;

          msg = msg
            .replace(/@?\{user\}/g, `@${targetNum}`)
            .replace(/\{group\}/g, groupName)
            .replace(/\{members\}/g, memberCount)
            .replace(/\{link\}/g, groupLink);

          await conn.sendMessage(
            id,
            {
              ...(groupPPMedia ? { image: groupPPMedia, caption: msg } : { text: msg }),
              mentions: [targetJid],
              contextInfo: require("./lib/newsletter").getContext({
                title: groupName,
                body: `Total Members: ${memberCount} 🚀`
              })
            }
          );
        }

        // ================= GOODBYE =================
        else if (action === "remove" && isGoodbyeEnabled) {
          let msg =
            typeof goodbyeData === "object" && goodbyeData.message
              ? goodbyeData.message
              : `┌──────────────┈⳹
│   ꃅꍏꈤꌗ ꂵꀸ : GOODBYE
└┬─────────────┈⳹
 ┌┤ User      : @${targetNum}
 ││ Group     : ${groupName}
 ││ Remaining : ${memberCount}
 └─────────────┈⳹

_A legend has left the building._
_We'll miss you, @${targetNum}!_`;

          msg = msg
            .replace(/@?\{user\}/g, `@${targetNum}`)
            .replace(/\{group\}/g, groupName)
            .replace(/\{members\}/g, memberCount);

          await conn.sendMessage(
            id,
            {
              ...(groupPPMedia ? { image: groupPPMedia, caption: msg } : { text: msg }),
              mentions: [targetJid],
              contextInfo: require("./lib/newsletter").getContext({
                title: groupName,
                body: `Member Count: ${memberCount} ✨`
              })
            }
          );
        }
      }
    } catch (err) {
      console.error("Welcome/Goodbye error:", err);
    }
  });

  return conn;
}

// ─── START BOT ───
startBot();

