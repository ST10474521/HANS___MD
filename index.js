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

async function fetchSessionFromCloud() {
  const sessionPath = path.join(__dirname, "sessions");
  const credsPath = path.join(sessionPath, "creds.json");

  if (fs.existsSync(credsPath)) return;
  if (!config.SESSION_ID || !config.SESSION_ID.startsWith("HANS-BYTE~")) return;

  console.log("📡 Connecting to cloud vault (60s)...");
  try {
    // DO NOT strip the prefix, as the server logs show it saves the FULL string to MongoDB
    const fullId = encodeURIComponent(config.SESSION_ID.trim());
    const route = `${config.PAIRING_SERVER_URL.replace(/\/$/, "")}/session/${fullId}`;
    
    console.log(`🔍 Querying: /session/${config.SESSION_ID.substring(0, 18)}...`);
    
    const response = await axios.get(route, { 
      timeout: 60000,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.data) throw new Error("Server returned empty response.");
    
    // Check if we got HTML instead of JSON
    if (typeof response.data === 'string' && (response.data.includes('<!DOCTYPE') || response.data.includes('<html'))) {
       throw new Error("Cloud returned HTML (likely landing page) instead of Session JSON. Ensure your ID is valid.");
    }

    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath, { recursive: true });

    const sessionObj = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
    
    // Validate by checking for a core WhatsApp authentication key
    if (!sessionObj.noiseKey && !sessionObj.creds) {
       throw new Error("Retrieved data is not a valid WhatsApp session (missing noiseKey).");
    }

    // If the server returns the creds directly, use them; if nested, extract them.
    const finalCreds = sessionObj.creds || sessionObj;

    fs.writeFileSync(credsPath, JSON.stringify(finalCreds, null, 2));
    console.log("✅ Cloud synchronization complete!");
  } catch (err) {
    const status = err.response ? `[Status: ${err.response.status}]` : "";
    console.warn(`⚠️ Cloud fetch failed ${status}: ${err.message}`);
    console.log("💡 Tip: If 404, re-pair your bot at: https://session.hanstech.xyz");
  }
}

async function startBot() {
  const { restoreSession } = require("./lib/session");
  await restoreSession(config.SESSION_ID);

  let pairingCode = false;
  try {
    pairingCode = !fs.existsSync(CREDS_PATH) || fs.statSync(CREDS_PATH).size === 0;
  } catch {
    pairingCode = true;
  }
  
  if (pairingCode) {
    console.log("⚠️ No valid session found. Entering Pairing Mode...");
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
  const { version } = await fetchLatestBaileysVersion();

  console.log("🛠️ Initializing Baileys socket...");
  const conn = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    browser: ["Ubuntu", "Chrome", "20.0.04"],
    markOnlineOnConnect: true,
    generateHighQualityLinkPreview: true,
    syncFullHistory: false,
    connectTimeoutMs: 60000, 
    defaultQueryTimeoutMs: 120000,
    keepAliveIntervalMs: 10000,
    agent: new Agent({ family: 4 }),
    version
  });

  if (pairingCode && !conn.authState.creds.registered) {
     const phoneNumber = config.OWNER_NUMBER[0];
     setTimeout(async () => {
        const code = await conn.requestPairingCode(phoneNumber);
        console.log(`\n\n╭────────────────────────────╮\n│  PAIRING CODE: ${code}  │\n╰────────────────────────────╯\n\nLink using [Linked Devices > Link with Phone Number] on WhatsApp.\n`);
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
              contextInfo: require("./lib/newsletter").getContext({ title: "System Online", body: "Connection established" })
            }).then(() => console.log(`✅ Sent notification to ${ownerJid}`))
              .catch((err) => console.error(`❌ Failed to send notification to ${ownerJid}:`, err.message));
          }
          isFirstConnect = false;
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
      if (mek.key.remoteJid === "status@broadcast" && !mek.key.fromMe && autoStatus) {
        try {
          // Mark status as seen
          await conn.readMessages([mek.key]);
          
          // React to the status (heart emoji)
          await conn.sendMessage('status@broadcast', {
            react: {
              text: '??',
              key: mek.key
            }
          });
        } catch (error) {
          // Ignore errors with status reactions
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
      if (update?.update?.message === null) {
        const stored = getStoredMessage(update?.key?.id);
        if (!stored) continue;

        const mode = typeof antiDel === "string" ? antiDel.toLowerCase() : (antiDel === true ? "dm" : "off");
        if (mode === "off") continue;

        const reportText = `╭━━━═ 『 *ANTI-DELETE* 』 ═━━━╮\n` +
                          `┃ 🗑️ *Status:* Recovered\n` +
                          `┃ 👤 *From:* @${stored.sender.split("@")[0]}\n` +
                          `┃ 📍 *Source:* ${stored.from.endsWith("@g.us") ? "Group Message" : "Private Chat"}\n` +
                          `┃ 📅 *Date:* ${new Date(stored.timestamp).toLocaleDateString()}\n` +
                          `┃ ⏰ *Time:* ${new Date(stored.timestamp).toLocaleTimeString()}\n` +
                          `┃ 📦 *Type:* ${stored.type.toUpperCase()}\n` +
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

      // Try getting group profile picture
      let groupPP = "";
      try {
        groupPP = await conn.profilePictureUrl(id, "image");
      } catch {
        groupPP = "https://i.ibb.co/7Qq7ZQk/group-default.png"; // fallback
      }

      for (const p of participants) {
        const targetJid = typeof p === "object" ? (p.phoneNumber || p.id || "") : String(p);
        if (!targetJid) continue;
        const targetNum = targetJid.split("@")[0];

        // ================= WELCOME =================
        if (action === "add" && isWelcomeEnabled) {
          let msg =
            typeof welcomeData === "object" && welcomeData.message
              ? welcomeData.message
              : `╭━━━━━═ 『 WELCOME 』 ═━━━━━╮
│
│  👤 *User:* @${targetNum}
│  🏠 *Group:* ${groupName}
│  👥 *Members:* ${memberCount}
│  🔗 *Invite:* ${groupLink}
│
│  ✨ *Welcome to our community!*
│  ✨ *Please read the group description.*
│
╰━━━━━━━══━━━━══━━━━━━━╯`;

          msg = msg
            .replace(/@?\{user\}/g, `@${targetNum}`)
            .replace(/\{group\}/g, groupName)
            .replace(/\{members\}/g, memberCount)
            .replace(/\{link\}/g, groupLink);

          await conn.sendMessage(id, {
            image: { url: groupPP },
            caption: msg,
            mentions: [targetJid],
            contextInfo: require("./lib/newsletter").getContext({
              title: groupName,
              body: `Total Members: ${memberCount} 🚀`
            })
          });
        }

        // ================= GOODBYE =================
        else if (action === "remove" && isGoodbyeEnabled) {
          let msg =
            typeof goodbyeData === "object" && goodbyeData.message
              ? goodbyeData.message
              : `╭━━━━━═ 『 GOODBYE 』 ═━━━━━╮
│
│  👤 *User:* @${targetNum}
│  🏠 *Group:* ${groupName}
│  👥 *Remaining:* ${memberCount}
│
│  🥀 *A legend has left the building.*
│  🥀 *We'll miss you, @${targetNum}!*
│
╰━━━━━━━══━━━━══━━━━━━━╯`;

          msg = msg
            .replace(/@?\{user\}/g, `@${targetNum}`)
            .replace(/\{group\}/g, groupName)
            .replace(/\{members\}/g, memberCount);

          await conn.sendMessage(id, {
            image: { url: groupPP },
            caption: msg,
            mentions: [targetJid],
            contextInfo: require("./lib/newsletter").getContext({
              title: groupName,
              body: `Member Count: ${memberCount} ✨`
            })
          });
        }
      }
    } catch (err) {
      console.error("Welcome/Goodbye error:", err);
    }
  });

  return conn;
}

fetchSessionFromCloud().then(() => startBot());

