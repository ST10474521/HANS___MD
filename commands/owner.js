const { cmd } = require("../command");
const { getDB, saveGlobal } = require("../lib/database");
const { exec } = require("child_process");
const util = require("util");

function requireSudoOrOwner(isOwner, isSudo, reply) {
  if (isOwner || isSudo) return true;
  reply("❌ Permission denied");
  return false;
}

// Helper to resolve LID back to PN (for when owner replies to a message in a LID group)
async function resolveTargetToPn(conn, rawJid) {
  if (!rawJid || typeof rawJid !== "string") return rawJid;
  if (!rawJid.endsWith("@lid")) return rawJid;
  try {
    const store = conn?.signalRepository?.lidMapping;
    if (store && typeof store.getPNForLID === "function") {
      const pn = await store.getPNForLID(rawJid);
      if (typeof pn === "string" && pn.includes("@")) return pn;
    }
  } catch {}
  return rawJid;
}

cmd(
  {
    pattern: "public",
    category: "owner",
    react: "🌍",
    desc: "Set bot to public mode",
    usage: ".public",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, reply }) => {
    if (!requireSudoOrOwner(isOwner, isSudo, reply)) return;
    const db = getDB();
    db.mode = "public";
    saveGlobal(db);
    await reply("✅ Mode set to public");
  }
);

cmd(
  {
    pattern: "private",
    category: "owner",
    react: "🔒",
    desc: "Set bot to private mode",
    usage: ".private",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, reply }) => {
    if (!requireSudoOrOwner(isOwner, isSudo, reply)) return;
    const db = getDB();
    db.mode = "private";
    saveGlobal(db);
    await reply("✅ Mode set to private");
  }
);

cmd(
  {
    pattern: "setmode",
    category: "owner",
    react: "🔄",
    desc: "Set chat mode (dm/group/both)",
    usage: ".setmode dm|group|both",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, args, reply }) => {
    if (!requireSudoOrOwner(isOwner, isSudo, reply)) return;
    const mode = String(args?.[0] || "").toLowerCase();
    if (!["dm", "group", "both"].includes(mode)) {
      await reply("Usage: .setmode dm|group|both");
      return;
    }
    const db = getDB();
    db.chatMode = mode;
    saveGlobal(db);
    await reply(`✅ Chat mode set to ${mode}`);
  }
);

cmd(
  {
    pattern: "setprefix",
    category: "owner",
    react: "🔡",
    desc: "Change bot prefix",
    usage: ".setprefix . or .setprefix .,! or .setprefix . !",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, q, args, reply }) => {
    if (!requireSudoOrOwner(isOwner, isSudo, reply)) return;
    const raw = (q || args?.join(" ") || "").trim();
    if (!raw) {
      await reply("Usage: .setprefix .  |  .setprefix .,!  |  .setprefix . !");
      return;
    }

    const parts = raw.includes(",") ? raw.split(",") : raw.split(/\s+/);
    const prefixes = parts.map((p) => p.trim()).filter(Boolean);
    if (!prefixes.length) {
      await reply("❌ No valid prefixes provided");
      return;
    }

    const db = getDB();
    db.env = db.env && typeof db.env === "object" ? db.env : {};
    db.env.PREFIX = prefixes;
    saveGlobal(db);
    await reply(`✅ Prefix updated: ${prefixes.join(", ")}`);
  }
);

cmd(
  {
    pattern: "settimezone",
    alias: ["timezone", "tz"],
    category: "owner",
    react: "🌍",
    desc: "Set owner timezone for autolock schedules (IANA name)",
    usage: ".settimezone Africa/Lagos",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, q, reply }) => {
    if (!isOwner && !isSudo) return reply("❌ Owner/Sudo only.");
    const tz = (q || "").trim();
    if (!tz) {
      const db = getDB();
      const current = db.env?.TIMEZONE || process.env.TIMEZONE || "UTC";
      return reply(`🌍 Current timezone: *${current}*\n\nUsage: \`.settimezone Africa/Lagos\``);
    }

    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      return reply("❌ Invalid timezone. Use an IANA name like `Africa/Lagos`, `Europe/London`, `America/New_York`.");
    }

    const db = getDB();
    db.env = db.env && typeof db.env === "object" ? db.env : {};
    db.env.TIMEZONE = tz;
    saveGlobal(db);
    await reply(`✅ Timezone set to *${tz}*\n\nAutolock (.autolock) will use this timezone.`);
  }
);

cmd(
  {
    pattern: "antidelete",
    alias: ["antidel"],
    category: "owner",
    react: "🗑️",
    desc: "Toggle anti-delete logging",
    usage: ".antidel on | off",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, q, reply }) => {
    if (!isOwner && !isSudo) return reply("❌ This command is for owner/sudo users only.");
    const arg = q.toLowerCase().trim();
    const modes = ["on", "off", "dm", "group", "both"];
    if (!modes.includes(arg)) return reply("Usage: .antidel dm | group | both | off");

    let status;
    if (arg === "off") status = false;
    else if (arg === "on") status = "dm"; // Default 'on' to DM for safety
    else status = arg;

    const db = getDB();
    db.env = db.env && typeof db.env === "object" ? db.env : {};
    db.env.ANTI_DELETE = status;
    saveGlobal(db);

    let modeDesc = "";
    if (status === false) modeDesc = "OFF 🔴";
    else if (status === "dm") modeDesc = "Owner DM 🔒";
    else if (status === "group") modeDesc = "Public Group 📢";
    else if (status === "both") modeDesc = "DM + Group 🛡️";

    await reply(`✅ Anti-Delete mode set to: ${modeDesc}`);
  }
);

cmd(
  {
    pattern: "addsudo",
    alias: ["addmod"],
    category: "owner",
    react: "👮‍♂️",
    desc: "Add a sudo user (owner only)",
    usage: ".addsudo @mention | number",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, args, q, mentionedJid, quoted, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");

    // Resolve target number
    let rawJid =
      (Array.isArray(mentionedJid) && mentionedJid[0]) ||
      quoted?.sender ||
      (q || args?.[0] || "").trim();

    rawJid = await resolveTargetToPn(conn, rawJid);
    const number = String(rawJid).replace(/[^0-9]/g, "");
    if (!number) return reply("Usage: .addsudo @mention | .addsudo 2637xxxxxxx");

    const db = getDB();
    db.sudo = Array.isArray(db.sudo) ? db.sudo : [];

    if (db.sudo.includes(number)) {
      return reply(`⚠️ ${number} is already a sudo user.`);
    }

    db.sudo.push(number);
    saveGlobal(db);
    
    // Create user JID for mentioning
    const userJid = `${number}@s.whatsapp.net`;
    await reply(`✅ @${number} added as sudo user.\n\n🔄 *Note:* Please restart the bot using \`.restart\` for changes to take effect.`, { mentions: [userJid] });
  }
);

cmd(
  {
    pattern: "removesudo",
    alias: ["removemod", "delsudo"],
    category: "owner",
    react: "🚫",
    desc: "Remove a sudo user (owner only)",
    usage: ".removesudo @mention | number",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, args, q, mentionedJid, quoted, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");

    let rawJid =
      (Array.isArray(mentionedJid) && mentionedJid[0]) ||
      quoted?.sender ||
      (q || args?.[0] || "").trim();

    rawJid = await resolveTargetToPn(conn, rawJid);
    const number = String(rawJid).replace(/[^0-9]/g, "");
    if (!number) return reply("Usage: .removesudo @mention | .removesudo 2637xxxxxxx");

    const db = getDB();
    db.sudo = Array.isArray(db.sudo) ? db.sudo : [];

    if (!db.sudo.includes(number)) {
      return reply(`⚠️ ${number} is not a sudo user.`);
    }

    db.sudo = db.sudo.filter((n) => n !== number);
    saveGlobal(db);
    
    // Create user JID for mentioning
    const userJid = `${number}@s.whatsapp.net`;
    await reply(`✅ @${number} removed from sudo.\n\n🔄 *Note:* Please restart the bot using \`.restart\` for changes to take effect.`, { mentions: [userJid] });
  }
);

cmd(
  {
    pattern: "sudolist",
    alias: ["mods", "sudos", "listsudo"],
    category: "owner",
    react: "📋",
    desc: "List all sudo users",
    usage: ".sudolist",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, reply }) => {
    if (!requireSudoOrOwner(isOwner, isSudo, reply)) return;
    const db = getDB();
    const list = Array.isArray(db.sudo) ? db.sudo : [];
    if (!list.length) return reply("📋 No sudo users set.");
    await reply(`📋 *Sudo Users:*\n\n${list.map((n, i) => `${i + 1}. +${n}`).join("\n")}`);
  }
);

cmd(
  {
    pattern: "banuser",
    category: "owner",
    react: "🔨",
    desc: "Ban a user from using the bot",
    usage: ".banuser @mention | number",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, q, args, mentionedJid, quoted, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");

    let rawJid =
      (Array.isArray(mentionedJid) && mentionedJid[0]) ||
      quoted?.sender ||
      (q || args?.[0] || "").trim();

    rawJid = await resolveTargetToPn(conn, rawJid);
    const number = String(rawJid).replace(/[^0-9]/g, "");
    if (!number) return reply("Usage: .banuser @mention | .banuser 2637xxxxxxx");

    const db = getDB();
    db.banned = db.banned || {};
    if (db.banned[number]) return reply(`⚠️ +${number} is already banned.`);

    db.banned[number] = true;
    saveGlobal(db);
    const userJid = `${number}@s.whatsapp.net`;
    await reply(`✅ @${number} has been banned from using the bot.`, { mentions: [userJid] });
  }
);

cmd(
  {
    pattern: "unbanuser",
    category: "owner",
    react: "🛡️",
    desc: "Unban a user",
    usage: ".unbanuser @mention | number",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, q, args, mentionedJid, quoted, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");

    let rawJid =
      (Array.isArray(mentionedJid) && mentionedJid[0]) ||
      quoted?.sender ||
      (q || args?.[0] || "").trim();

    rawJid = await resolveTargetToPn(conn, rawJid);
    const number = String(rawJid).replace(/[^0-9]/g, "");
    if (!number) return reply("Usage: .unbanuser @mention | .unbanuser 2637xxxxxxx");

    const db = getDB();
    db.banned = db.banned || {};
    if (!db.banned[number]) return reply(`⚠️ +${number} is not banned.`);

    delete db.banned[number];
    saveGlobal(db);
    const userJid = `${number}@s.whatsapp.net`;
    await reply(`✅ @${number} has been unbanned.`, { mentions: [userJid] });
  }
);

cmd(
  {
    pattern: "bangroup",
    category: "owner",
    react: "🏗️",
    desc: "Ban a group (bot will ignore it)",
    usage: ".bangroup",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isGroup, from, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");
    if (!isGroup) return reply("❌ Run this in the group you want to ban.");

    const db = getDB();
    db.bannedGroups = db.bannedGroups || {};
    if (db.bannedGroups[from]) return reply(`⚠️ This group is already banned.`);

    db.bannedGroups[from] = true;
    saveGlobal(db);
    await reply(`✅ This group has been banned. I will ignore all messages here.`);
  }
);

cmd(
  {
    pattern: "unbangroup",
    alias: ["unbangc"],
    category: "owner",
    react: "🟢",
    desc: "Unban a group",
    usage: ".unbangroup",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isGroup, from, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");
    if (!isGroup) return reply("❌ Run this in the group you want to unban.");

    const db = getDB();
    db.bannedGroups = db.bannedGroups || {};
    if (!db.bannedGroups[from]) return reply(`⚠️ This group is not banned.`);

    delete db.bannedGroups[from];
    saveGlobal(db);
    await reply(`✅ This group has been unbanned.`);
  }
);

cmd(
  {
    pattern: "leave",
    category: "owner",
    react: "👋",
    desc: "Make the bot leave the group it was used in.",
    usage: ".leave",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isGroup, from, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");
    if (!isGroup) return reply("❌ This can only be used in a group.");

    await reply("👋 Goodbye everyone! The owner requested me to leave.");
    try {
      await conn.groupLeave(from);
    } catch (err) {
      console.error("Leave error:", err);
      await reply("❌ Failed to leave the group.");
    }
  }
);
// 📴 Shutdown/Stop
cmd(
  {
    pattern: "shutdown",
    alias: ["stop"],
    category: "owner",
    react: "🛑",
    desc: "Shutdown the bot (Owner only)",
    usage: ".shutdown",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");
    await reply("🛑 Shutting down...");
    setTimeout(() => {
      console.log("Shutdown command triggered by owner.");
      process.exit(0);
    }, 1000);
  }
);

// 🔄 Restart
cmd(
  {
    pattern: "restart",
    category: "owner",
    react: "🔄",
    desc: "Restart the bot (Owner only)",
    usage: ".restart",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, reply }) => {
    if (!isOwner) return reply("❌ Owner only.");
    await reply("🔄 Restarting bot...");
    setTimeout(() => {
      console.log("Restart command triggered by owner.");
      process.exit(1);
    }, 1000);
  }
);

// ⏸️ Pause Bot
cmd(
  {
    pattern: "pausedebot",
    alias: ["pausebot"],
    category: "owner",
    react: "⏸️",
    desc: "Pause the bot to ignore messages for a specified time (Owner/Sudo only)",
    usage: ".pausedebot 10s | 5m | 2h",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, q, reply }) => {
    if (!isOwner && !isSudo) return reply("❌ Owner/Sudo only.");
    
    let timeStr = q.toLowerCase().trim();
    if (!timeStr) return reply("Usage: .pausedebot 10s | 5m | 2h");
    
    let ms = 0;
    const match = timeStr.match(/^(\d+)(s|m|h|d)?$/);
    if (!match) return reply("❌ Invalid time format. Examples: 30s, 10m, 2h");
    
    const value = parseInt(match[1]);
    const unit = match[2] || 'm';
    
    if (unit === 's') ms = value * 1000;
    else if (unit === 'm') ms = value * 60 * 1000;
    else if (unit === 'h') ms = value * 60 * 60 * 1000;
    else if (unit === 'd') ms = value * 24 * 60 * 60 * 1000;
    
    const db = getDB();
    db.pausedUntil = Date.now() + ms;
    saveGlobal(db);
    
    await reply(`⏸️ *Bot Paused*\nI will ignore all messages for the next ${value}${unit}.`);
  }
);

// ▶️ Unpause Bot
cmd(
  {
    pattern: "unpausedebot",
    alias: ["unpausebot"],
    category: "owner",
    react: "▶️",
    desc: "Unpause the bot to resume processing messages (Owner/Sudo only)",
    usage: ".unpausedebot",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, reply }) => {
    if (!isOwner && !isSudo) return reply("❌ Owner/Sudo only.");
    
    const db = getDB();
    db.pausedUntil = 0;
    saveGlobal(db);
    
    await reply("▶️ *Bot Resumed*\nBot is now active and responding to commands.");
  }
);

// 📢 Broadcast
cmd(
  {
    pattern: "broadcast",
    alias: ["bc"],
    category: "owner",
    react: "📢",
    desc: "Broadcast a message to all chats",
    usage: ".broadcast <message>",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, args, reply, q }) => {
    if (!isOwner) return reply("❌ Owner only.");
    const text = q || args?.join(" ");
    if (!text) return reply("❌ Provide a message to broadcast.");

    const chats = Object.keys(conn.chats || {});
    if (!chats.length) return reply("❌ No chats found.");

    let sent = 0;
    for (const jid of chats) {
      try {
        await conn.sendMessage(jid, { text: `📢 *Broadcast*\n\n${text}` });
        sent++;
      } catch (e) {
        console.error("Broadcast failed for", jid, e.message);
      }
    }
    await reply(`✅ Broadcast sent to ${sent} chat(s).`);
  }
);

// 💬 Set About/Status
cmd(
  {
    pattern: "setabout",
    alias: ["status"],
    category: "owner",
    react: "💬",
    desc: "Update bot about/status",
    usage: ".setabout <text>",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, args, reply, q }) => {
    if (!isOwner) return reply("❌ Owner only.");
    const statusMsg = q || args?.join(" ");
    if (!statusMsg) return reply("❌ Provide a status message.");
    try {
      await conn.updateProfileStatus(statusMsg);
      await reply("✅ About updated!");
    } catch (err) {
      console.error("Setabout error:", err);
      await reply("❌ Failed to update about.");
    }
  }
);

// 📂 List Groups
cmd(
  {
    pattern: "groups",
    alias: [],
    category: "owner",
    react: "📂",
    desc: "List all groups the bot is in",
    usage: ".groups",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, isSudo, reply }) => {
    if (!isOwner && !isSudo) return reply("❌ Owner only.");
    try {
      console.log("[.groups] Fetching all participating groups...");
      const all = await conn.groupFetchAllParticipating();
      const entries = Object.entries(all);
      console.log("[.groups] Total groups found:", entries.length);

      if (!entries.length) return reply("📭 Bot is not in any groups.");

      let text = `📋 *Groups (${entries.length} total)*\n\n`;
      entries.forEach(([jid, meta], i) => {
        console.log(`[.groups] ${i + 1}. ${meta.subject} | members: ${meta.participants?.length} | jid: ${jid}`);
        text += `${i + 1}. *${meta.subject}*\n   👥 ${meta.participants?.length ?? "?"} members\n   \`${jid}\`\n\n`;
      });
      await reply(text);
    } catch (e) {
      console.error("[.groups] ❌ Error:", e.message, e.stack);
      await reply(`❌ Failed: ${e.message}`);
    }
  }
);

// ⚙️ Exec (Shell Command)
cmd(
  {
    pattern: "exec",
    category: "owner",
    react: "⚙️",
    desc: "Run a shell command",
    usage: ".exec <command>",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, args, reply, q }) => {
    if (!isOwner) return reply("❌ Owner only.");
    const command = q || args?.join(" ");
    if (!command) return reply("❌ Provide a shell command.");
    exec(command, (err, stdout, stderr) => {
      if (err) return reply(`❌ *Error:*\n\n${err.message}`);
      const output = stdout || stderr || "✅ Command executed.";
      reply(util.format(output));
    });
  }
);

// 📜 Eval (JS Code)
cmd(
  {
    pattern: "eval",
    category: "owner",
    react: "📜",
    desc: "Run JavaScript code",
    usage: ".eval <code>",
    noPrefix: false
  },
  async (conn, mek, m, { isOwner, args, reply, q }) => {
    if (!isOwner) return reply("❌ Owner only.");
    const code = q || args?.join(" ");
    if (!code) return reply("❌ Provide JS code to evaluate.");
    try {
      // Create a safe-ish eval context
      const result = await eval(`(async () => { ${code} })()`);
      reply(util.format(result));
    } catch (err) {
      reply(`❌ *Error:*\n\n${err}`);
    }
  }
);

module.exports = {};
