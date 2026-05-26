const { cmd } = require("../command");
const { getContext } = require("../lib/newsletter");
const { getDB, saveGlobal } = require("../lib/database");
const { downloadMediaMessage, downloadContentFromMessage } = require("@whiskeysockets/baileys");

function jidToNumber(jid) {
  if (!jid) return "";
  return String(jid).split("@")[0].split(":")[0];
}

async function sendText(conn, jid, text, quoted, mentions = []) {
  const contextInfo = getContext({ mentionedJid: mentions.length ? mentions : undefined });
  return conn.sendMessage(
    jid,
    {
      text,
      contextInfo
    },
    { quoted }
  );
}

async function resolveTargetJid(conn, groupMetadata, raw) {
  if (!raw) return null;

  // Already a jid
  if (typeof raw === "string" && raw.includes("@")) return raw;

  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  const pnJid = `${digits}@s.whatsapp.net`;

  // If group uses LIDs, try to map PN -> LID
  const usesLid = groupMetadata?.participants?.some((p) => String(p?.id || "").endsWith("@lid"));
  if (usesLid) {
    try {
      const store = conn?.signalRepository?.lidMapping;
      if (store && typeof store.getLIDForPN === "function") {
        const lid = await store.getLIDForPN(pnJid);
        if (typeof lid === "string" && lid.endsWith("@lid")) return lid;
      }
    } catch { }
  }

  return pnJid;
}

function requireGroup(isGroup, reply) {
  if (isGroup) return true;
  reply("❌ Only works in groups!");
  return false;
}

function requireAdmin(isAdmin, reply) {
  if (isAdmin) return true;
  reply("❌ Admins only.");
  return false;
}

function requireBotAdmin(isBotAdmin, reply) {
  if (isBotAdmin) return true;
  reply("❌ I need admin rights to do that.");
  return false;
}

cmd(
  {
    pattern: "setname",
    alias: ["upname", "groupname", "gn", "name"],
    react: "🏷️",
    desc: "Change group subject (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply, sender, prefix, usage }) => {
    if (!isGroup) return reply("❌ Only works in group chats!");
    if (!isAdmin) return sendText(conn, from, "❌ Only *group admins* can update the group name.", mek, [sender]);
    if (!isBotAdmin) return reply("❌ I need admin rights to do that.");

    const newName = args.join(" ").trim();
    if (!newName) return reply(`❌ Provide the new group name.\nExample: ${usage}`);

    try {
      await conn.groupUpdateSubject(from, newName);
      await sendText(
        conn,
        from,
        `✏ *Group Name Updated*\n\n• New Name: ${newName}\n• By: @${jidToNumber(sender)}`,
        mek,
        [sender]
      );
    } catch (err) {
      console.error("setname error:", err);
      await reply("❌ Failed to update group name.");
    }
  }
);

cmd(
  {
    pattern: "setdesc",
    alias: ["updesc", "groupdesc", "gdesc", "desc"],
    react: "📝",
    desc: "Change group description (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply, sender, prefix, usage }) => {
    if (!isGroup) return reply("❌ Only works in group chats!");
    if (!isAdmin) return sendText(conn, from, "❌ Only *group admins* can update the description.", mek, [sender]);
    if (!isBotAdmin) return reply("❌ I need admin rights to do that.");

    const newDesc = args.join(" ").trim();
    if (!newDesc) return reply(`❌ Provide the new description.\nExample: ${usage}`);

    try {
      await conn.groupUpdateDescription(from, newDesc);
      await sendText(
        conn,
        from,
        `📝 *Group Description Updated*\n\n${newDesc}\n\n• By: @${jidToNumber(sender)}`,
        mek,
        [sender]
      );
    } catch (err) {
      console.error("setdesc error:", err);
      await reply("❌ Failed to update group description.");
    }
  }
);

cmd(
  {
    pattern: "promote",
    alias: [],
    react: "⬆️",
    desc: "Promote a member to admin (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply, sender, mentionedJid, quoted, groupMetadata }) => {
    if (!isGroup) return reply("❌ Only works in groups!");
    if (!isAdmin) return sendText(conn, from, "⚠ Only group admins can promote!", mek, [sender]);
    if (!isBotAdmin) return reply("❌ I need admin rights to do that.");

    const rawTarget =
      (Array.isArray(mentionedJid) && mentionedJid[0]) ||
      quoted?.sender ||
      (args?.[0] ? args[0] : "");

    const targetJid = await resolveTargetJid(conn, groupMetadata, rawTarget);
    if (!targetJid) return reply("🔎 Mention, reply, or provide the number to promote.");

    const isTargetAdmin = groupMetadata?.participants?.some((p) => {
      return String(p?.id || "").toLowerCase() === String(targetJid).toLowerCase() && !!p.admin;
    });
    if (isTargetAdmin) {
      return sendText(conn, from, `⚠ @${jidToNumber(targetJid)} is already an admin!`, mek, [targetJid]);
    }

    try {
      await conn.groupParticipantsUpdate(from, [targetJid], "promote");
      await sendText(
        conn,
        from,
        `🛡 *Promoted*\n\n• User: @${jidToNumber(targetJid)}\n• By: @${jidToNumber(sender)}`,
        mek,
        [targetJid, sender]
      );
    } catch (err) {
      console.error("promote error:", err);
      await reply("❌ Failed to promote. Make sure I have permission.");
    }
  }
);

cmd(
  {
    pattern: "demote",
    alias: [],
    react: "⬇️",
    desc: "Demote an admin to member (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply, sender, mentionedJid, quoted, groupMetadata }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const rawTarget =
      (Array.isArray(mentionedJid) && mentionedJid[0]) ||
      quoted?.sender ||
      (args?.[0] ? args[0] : "");

    const targetJid = await resolveTargetJid(conn, groupMetadata, rawTarget);
    if (!targetJid) return reply("🔎 Mention, reply, or provide the number to demote.");

    const isTargetAdmin = groupMetadata?.participants?.some((p) => {
      return String(p?.id || "").toLowerCase() === String(targetJid).toLowerCase() && !!p.admin;
    });
    if (!isTargetAdmin) {
      return sendText(conn, from, `⚠ @${jidToNumber(targetJid)} is not an admin.`, mek, [targetJid]);
    }

    try {
      await conn.groupParticipantsUpdate(from, [targetJid], "demote");
      await sendText(
        conn,
        from,
        `🛡 *Demoted*\n\n• User: @${jidToNumber(targetJid)}\n• By: @${jidToNumber(sender)}`,
        mek,
        [targetJid, sender]
      );
    } catch (err) {
      console.error("demote error:", err);
      await reply("❌ Failed to demote.");
    }
  }
);

cmd(
  {
    pattern: "kick",
    alias: ["remove"],
    react: "👢",
    desc: "Remove a member from the group (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply, sender, mentionedJid, quoted, groupMetadata }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const rawTarget =
      (Array.isArray(mentionedJid) && mentionedJid[0]) ||
      quoted?.sender ||
      (args?.[0] ? args[0] : "");

    const targetJid = await resolveTargetJid(conn, groupMetadata, rawTarget);
    if (!targetJid) return reply("🔎 Mention, reply, or provide the number to kick.");

    try {
      await conn.groupParticipantsUpdate(from, [targetJid], "remove");
      await sendText(
        conn,
        from,
        `👢 *Kicked*\n\n• User: @${jidToNumber(targetJid)}\n• By: @${jidToNumber(sender)}`,
        mek,
        [targetJid, sender]
      );
    } catch (err) {
      console.error("kick error:", err);
      await reply("❌ Failed to kick.");
    }
  }
);

cmd(
  {
    pattern: "add",
    alias: ["invite"],
    react: "➕",
    desc: "Add a member to the group.",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { reply }) => {
    await reply("❌ *.add* is currently not supported.");
  }
);

cmd(
  {
    pattern: "tagall",
    alias: ["everyone", "mentionall"],
    react: "📢",
    desc: "Mention everyone in the group (admins only).",
    category: "group",
    usage: ".tagall [message]",
    noPrefix: false,
  },
  async (conn, mek, m, { from, isGroup, isAdmin, participants, groupName, q, reply }) => {
    if (!isGroup) return reply("❌ This command can only be used in groups.");
    if (!isAdmin) return reply("❌ Only admins can use this command.");

    const list = Array.isArray(participants) ? participants : [];
    const mentions = list.map((p) => p.id).filter(Boolean);
    const message = (q || "").trim();

    const text = [
      `╭━━━═ 『 📢 TAG ALL 』 ═━━━╮`,
      `│ 🏷️ *Group:* ${groupName || "Unknown"}`,
      `│ 👥 *Total:* ${list.length}`,
      message ? `│ 💬 *Note:* ${message}` : `│`,
      `╰━━━━━━━┳━┳━━━━━━━╯`,
      ``,
      mentions.map((jid) => `     ┃  ◈ @${jid.split("@")[0]}`).join("\n"),
      `     ┗━━━━━━━━━━━━━︎┛`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    await conn.sendMessage(
      from,
      { text, mentions },
      { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Tag All Command", body: "Mentioning all group members" }) }
    );
  }
);

cmd(
  {
    pattern: "hidetag",
    alias: ["htag"],
    react: "👻",
    desc: "Mention everyone without showing mentions (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, participants, q, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    const list = Array.isArray(participants) ? participants : [];
    const mentions = list.map((p) => p.id).filter(Boolean);
    const text = (q || "").trim() || "‎";

    await conn.sendMessage(
      from,
      { text, contextInfo: getContext({ mentionedJid: mentions }) },
      { quoted: mek }
    );
  }
);

cmd(
  {
    pattern: "link",
    alias: ["gclink", "grouplink"],
    react: "🔗",
    desc: "Get group invite link (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    try {
      const code = await conn.groupInviteCode(from);
      await reply(`https://chat.whatsapp.com/${code}`);
    } catch (err) {
      console.error("link error:", err);
      await reply("❌ Failed to get link.");
    }
  }
);

cmd(
  {
    pattern: "revoke",
    alias: ["resetlink"],
    react: "🔄",
    desc: "Revoke/reset group invite link (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    try {
      await conn.groupRevokeInvite(from);
      await reply("✅ Group link revoked.");
    } catch (err) {
      console.error("revoke error:", err);
      await reply("❌ Failed to revoke link.");
    }
  }
);

cmd(
  {
    pattern: "group",
    alias: ["gc"],
    react: "⚙️",
    desc: "Open/close group (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const action = String(args?.[0] || "").toLowerCase();
    if (!["open", "close"].includes(action)) {
      await reply("Usage: .group open | .group close");
      return;
    }

    try {
      await conn.groupSettingUpdate(from, action === "close" ? "announcement" : "not_announcement");
      await reply(`✅ Group is now ${action === "close" ? "closed (admins only)" : "open (everyone)"}.`);
    } catch (err) {
      console.error("group setting error:", err);
      await reply("❌ Failed to update group setting.");
    }
  }
);

cmd(
  {
    pattern: "antilink",
    alias: [],
    react: "🔗",
    desc: "Set antilink mode (admins only). Modes: warn (limit), delete, kick, off.",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, args, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    const db = getDB();
    db.antilink = db.antilink && typeof db.antilink === "object" ? db.antilink : {};

    const arg = String(args?.[0] || "").toLowerCase();

    if (arg === "off") {
      db.antilink[from] = false;
      saveGlobal(db);
      return reply("✅ Antilink disabled.");
    }

    if (arg === "kick") {
      db.antilink[from] = { mode: "kick" };
      saveGlobal(db);
      return reply("✅ Antilink set to KICK (messages deleted + user kicked).");
    }

    if (arg === "delete") {
      db.antilink[from] = { mode: "delete" };
      saveGlobal(db);
      return reply("✅ Antilink set to DELETE (messages removed only).");
    }

    if (arg === "warn" || arg === "on") {
      const limit = parseInt(args?.[1]) || 3;
      db.antilink[from] = { mode: "warn", limit };
      saveGlobal(db);
      return reply(`✅ Antilink set to WARN (messages deleted + user kicked after ${limit} warnings).`);
    }

    const cur = db.antilink[from];
    let msg = "Usage:\n• .antilink warn <limit>\n• .antilink delete\n• .antilink kick\n• .antilink off\n\n";

    if (cur === true) msg += "Current: ON (legacy)";
    else if (!cur) msg += "Current: OFF";
    else if (cur.mode === "warn") msg += `Current: WARN (kick at ${cur.limit} strikes)`;
    else msg += `Current: ${String(cur.mode).toUpperCase()}`;

    await reply(msg);
  }
);

cmd(
  {
    pattern: "welcome",
    alias: [],
    react: "👋",
    desc: "Toggle welcome messages (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, args, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    const arg = String(args?.[0] || "").toLowerCase();
    if (!["on", "off"].includes(arg)) {
      const db = getDB();
      const cur = !!db?.welcome?.[from]?.enabled;
      await reply(`Usage: .welcome on|off\nCurrent: ${cur ? "on" : "off"}`);
      return;
    }

    const db = getDB();
    db.welcome = db.welcome && typeof db.welcome === "object" ? db.welcome : {};
    const cur = db.welcome[from] && typeof db.welcome[from] === "object" ? db.welcome[from] : { enabled: false };
    cur.enabled = arg === "on";
    if (arg === "on" && cur.message && cur.message.includes("🌟 *Hello")) {
      delete cur.message; // Clear out the ugly old default so the cool new default takes over!
    }
    db.welcome[from] = cur;
    saveGlobal(db);
    await reply(`✅ Welcome ${arg}`);
  }
);

cmd(
  {
    pattern: "setwelcome",
    alias: ["welcomemsg"],
    react: "👋",
    desc: "Set welcome message (admins only). Use {user}, {group}, {link}.",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, q, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    const msg = String(q || "").trim();
    if (!msg) {
      await reply("Usage: .setwelcome Welcome {user} to {group}!\nPlaceholders: {user}, {group}, {link}");
      return;
    }

    const db = getDB();
    db.welcome = db.welcome && typeof db.welcome === "object" ? db.welcome : {};
    const cur = db.welcome[from] && typeof db.welcome[from] === "object" ? db.welcome[from] : { enabled: true };
    cur.message = msg;
    if (typeof cur.enabled !== "boolean") cur.enabled = true;
    db.welcome[from] = cur;
    saveGlobal(db);
    await reply("✅ Welcome message updated.");
  }
);

cmd(
  {
    pattern: "goodbye",
    alias: [],
    react: "👋",
    desc: "Toggle goodbye messages (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, args, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    const arg = String(args?.[0] || "").toLowerCase();
    if (!["on", "off"].includes(arg)) {
      const db = getDB();
      const cur = !!db?.goodbye?.[from]?.enabled;
      await reply(`Usage: .goodbye on|off\nCurrent: ${cur ? "on" : "off"}`);
      return;
    }

    const db = getDB();
    db.goodbye = db.goodbye && typeof db.goodbye === "object" ? db.goodbye : {};
    const cur = db.goodbye[from] && typeof db.goodbye[from] === "object" ? db.goodbye[from] : { enabled: false };
    cur.enabled = arg === "on";
    if (arg === "on" && cur.message && cur.message.includes("👋 *Goodbye")) {
      delete cur.message; // Clear out the ugly old default so the cool new default takes over!
    }
    db.goodbye[from] = cur;
    saveGlobal(db);
    await reply(`✅ Goodbye ${arg}`);
  }
);

cmd(
  {
    pattern: "setgoodbye",
    alias: ["goodbyemsg"],
    react: "👋",
    desc: "Set goodbye message (admins only). Use {user}, {group}, {link}.",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, q, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    const msg = String(q || "").trim();
    if (!msg) {
      await reply("Usage: .setgoodbye Goodbye {user} from {group}!\nPlaceholders: {user}, {group}, {link}");
      return;
    }

    const db = getDB();
    db.goodbye = db.goodbye && typeof db.goodbye === "object" ? db.goodbye : {};
    const cur = db.goodbye[from] && typeof db.goodbye[from] === "object" ? db.goodbye[from] : { enabled: true };
    cur.message = msg;
    if (typeof cur.enabled !== "boolean") cur.enabled = true;
    db.goodbye[from] = cur;
    saveGlobal(db);
    await reply("✅ Goodbye message updated.");
  }
);

cmd(
  {
    pattern: "delete",
    alias: ["del"],
    react: "🗑️",
    desc: "Delete a replied message (admins only).",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, quoted, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;
    if (!quoted) return reply("⚠️ Reply to the message you want me to delete.");

    try {
      await conn.sendMessage(from, { delete: quoted.key });
    } catch (err) {
      console.error("Delete error:", err);
      await reply("❌ Failed to delete the message.");
    }
  }
);

cmd(
  {
    pattern: "groupinfo",
    alias: ["infogroup", "ginfo"],
    react: "📝",
    desc: "Show detailed group information.",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, reply, groupMetadata, groupAdmins, participants }) => {
    if (!requireGroup(isGroup, reply)) return;

    try {
      const gMeta = groupMetadata || await conn.groupMetadata(from);
      const name = gMeta.subject || "Unknown";
      const desc = gMeta.desc || "No description set.";
      const members = participants?.length || gMeta.participants?.length || 0;
      const admins = groupAdmins?.length || gMeta.participants?.filter(p => p.admin)?.length || 0;
      const owner = gMeta.owner || "Unknown";
      const creation = new Date(gMeta.creation * 1000).toLocaleString();

      const text = `*🌐 GROUP INFO: ${name}*\n\n` +
        `👥 *Members:* ${members}\n` +
        `👑 *Admins:* ${admins}\n` +
        `🗣️ *Owner:* @${owner.split('@')[0]}\n` +
        `📅 *Created:* ${creation}\n\n` +
        `📃 *Description:*\n${desc}`;

      await conn.sendMessage(from, { text, mentions: [owner] });
    } catch (err) {
      console.error("Groupinfo error:", err);
      await reply("❌ Failed to fetch group info.");
    }
  }
);

cmd(
  {
    pattern: "pin",
    category: "group",
    react: "📌",
    desc: "Pin a replied message with duration",
    usage: ".pin 24h|7d|30d (reply to a message)",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, quoted, reply, args }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    // Must be a reply
    if (!quoted) {
      return reply("❗ Reply to a message to pin it.\nUsage: .pin 24h|7d|30d");
    }

    // Get duration from args
    const duration = (args[0] || "").toLowerCase();

    if (!duration) {
      return reply("⚠️ Specify duration.\nUsage: .pin 24h|7d|30d");
    }

    const durationMap = {
      "24h": 86400,
      "7d": 604800,
      "30d": 2592000
    };

    const timeInSeconds = durationMap[duration];
    if (!timeInSeconds) {
      return reply("⚠️ Invalid duration. Use: 24h, 7d, or 30d");
    }

    // Safely reconstruct key
    const quotedKey = {
      remoteJid: from,
      fromMe: quoted.key?.fromMe ?? false,
      id: quoted.key?.id || quoted.id,
      ...(quoted.key?.participant ? { participant: quoted.key.participant } : {})
    };

    if (!quotedKey.id) {
      return reply("❗ Couldn't read message key. Try again.");
    }

    try {
      await conn.sendMessage(from, {
        pin: {
          type: 1,         // 1 = pin, 2 = unpin
          time: timeInSeconds,
          key: quotedKey
        }
      });

      await reply(`✅ Message pinned for ${duration.toUpperCase()}!`);
    } catch (err) {
      console.error("Pin error:", err);
      await reply("⚠️ Failed to pin message. Make sure I have admin rights and message still exists.");
    }
  }
);

cmd(
  {
    pattern: "unpin",
    category: "group",
    react: "📌",
    desc: "Unpin a replied message",
    usage: ".unpin (reply to pinned message)",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, quoted, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    if (!quoted) {
      return reply("❗ Reply to a pinned message to unpin it.");
    }

    const quotedKey = {
      remoteJid: from,
      fromMe: quoted.key?.fromMe ?? false,
      id: quoted.key?.id || quoted.id,
      ...(quoted.key?.participant ? { participant: quoted.key.participant } : {})
    };

    if (!quotedKey.id) {
      return reply("❗ Couldn't read message key. Try again.");
    }

    try {
      await conn.sendMessage(from, {
        pin: {
          type: 2,   // 2 = unpin
          time: 0,
          key: quotedKey
        }
      });

      await reply("✅ Message unpinned!");
    } catch (err) {
      console.error("Unpin error:", err);
      await reply("⚠️ Failed to unpin message.");
    }
  }
);

cmd(
  {
    pattern: "pinchat",
    category: "group",
    react: "📌",
    desc: "Pin the current chat (at chat list level)",
    usage: ".pinchat 24h|7d|30d",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, quoted, reply, args }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const duration = (args[0] || "").toLowerCase();
    let timeInSeconds;

    switch (duration) {
      case "24h":
        timeInSeconds = 86400; // 24 hours in seconds
        break;
      case "7d":
        timeInSeconds = 604800; // 7 days in seconds
        break;
      case "30d":
        timeInSeconds = 2592000; // 30 days in seconds
        break;
      default:
        return reply("âï¸ Invalid duration. Use: 24h, 7d, or 30d");
    }

    try {
      await conn.chatModify({
        pin: true, // Pin the chat itself
        time: timeInSeconds
      }, from);

      await reply(`â Chat pinned for ${duration.toUpperCase()}!`);
    } catch (err) {
      console.error("Pin chat error:", err);
      await reply("âï¸ Failed to pin chat. Make sure I have admin rights.");
    }
  }
);

// ------------------ admins ------------------
cmd(
  {
    pattern: "admins",
    category: "group",
    react: "👑",
    desc: "Display a list of all group admins",
    usage: ".admins",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, from, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    try {
      const metadata = await conn.groupMetadata(from);
      const admins = metadata.participants.filter((p) => p.admin).map((p) => p.id);
      if (!admins.length) return reply("❌ No admins found.");

      const list = admins.map((a) => `👑 @${jidToNumber(a)}`).join("\n");
      await reply(`👑 *Group Admins:*\n\n${list}`, { mentions: admins });
    } catch (err) {
      console.error("Admins error:", err);
      await reply("❌ Failed to fetch admins.");
    }
  }
);

// ------------------ tagadmins ------------------
cmd(
  {
    pattern: "tagadmins",
    category: "group",
    react: "👑",
    desc: "Ping all admins",
    usage: ".tagadmins",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, from, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    try {
      const metadata = await conn.groupMetadata(from);
      const admins = metadata.participants.filter((p) => p.admin).map((p) => p.id);
      if (!admins.length) return reply("❌ No admins found.");

      const text = admins.map((a) => `@${jidToNumber(a)}`).join(" ");
      await reply(text, { mentions: admins });
    } catch (err) {
      console.error("Tagadmins error:", err);
      await reply("❌ Failed to tag admins.");
    }
  }
);

// ------------------ spam ------------------
cmd(
  {
    pattern: "spam",
    category: "group",
    react: "⚠️",
    desc: "Spam a message multiple times (owner/sudo only)",
    usage: ".spam <count> <text>",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isOwner, isSudo, from, reply, args }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!isOwner && !isSudo) return reply("❌ Owner/Sudo only.");

    if (args.length < 2) return reply("⚠️ Usage: .spam <count> <text>");

    let count = parseInt(args[0]);
    if (isNaN(count) || count < 1) return reply("⚠️ Provide a valid number > 0.");
    if (count > 10) return reply("⚠️ Max spam count is 10.");

    let text = args.slice(1).join(" ");
    if (!text) return reply("⚠️ Provide a message to spam.");

    await reply(`⚠️ Spamming *${count}* times...`);
    for (let i = 0; i < count; i++) {
      await conn.sendMessage(from, { text });
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
);

// ------------------ kickall ------------------
cmd(
  {
    pattern: "kickall",
    category: "group",
    react: "👢",
    desc: "Remove all non-admin members (admins only). Type .stop to cancel.",
    usage: ".kickall",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, sender, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    try {
      const metadata = await conn.groupMetadata(from);
      const nonAdmins = metadata.participants
        .filter((p) => !p.admin)
        .map((p) => p.id);

      if (!nonAdmins.length) return reply("ℹ️ No non-admin members to kick!");

      // Warning message
      await reply(
        `⚠️ *KICKALL INITIATED*\n\n` +
        `👥 Target: ${nonAdmins.length} members\n` +
        `⏱️ Countdown: 10 seconds\n` +
        `🛑 Cancel: Type .stop`
      );

      // Set cancellation flag
      global.kickallCancelled = global.kickallCancelled || {};
      global.kickallCancelled[from] = false;

      // Wait 10 seconds
      for (let i = 10; i > 0; i--) {
        if (global.kickallCancelled[from]) {
          delete global.kickallCancelled[from];
          return reply("✅ Kickall cancelled!");
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (global.kickallCancelled[from]) {
        delete global.kickallCancelled[from];
        return reply("✅ Kickall cancelled!");
      }

      // Execute kickall
      delete global.kickallCancelled[from];
      await reply("🔥 Executing kickall...");

      let kicked = 0;
      let failed = 0;

      for (const jid of nonAdmins) {
        try {
          await conn.groupParticipantsUpdate(from, [jid], "remove");
          kicked++;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        } catch (err) {
          failed++;
          console.error(`Failed to kick ${jid}:`, err.message);
        }
      }

      await reply(
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🛡 *KICKALL RESULT*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `✅ Kicked: ${kicked}\n` +
        `❌ Failed: ${failed}\n` +
        `⚡ By: @${jidToNumber(sender)}`,
        { mentions: [sender] }
      );
    } catch (err) {
      console.error("Kickall error:", err);
      await reply("❌ Failed to execute kickall.");
    }
  }
);

// ------------------ stop ------------------
cmd(
  {
    pattern: "stop",
    category: "group",
    react: "🛑",
    desc: "Cancel an ongoing kickall operation",
    usage: ".stop",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, from, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    if (!global.kickallCancelled || !global.kickallCancelled[from]) {
      return reply("ℹ️ No active kickall operation to cancel!");
    }

    global.kickallCancelled[from] = true;
    await reply("🛑 Cancelling kickall...");
  }
);

// ------------------ poll ------------------
cmd(
  {
    pattern: "poll",
    category: "group",
    react: "📊",
    desc: "Create a poll. Usage: .poll <question> | <option1, option2, ...> [selectableCount]",
    usage: '.poll "Favorite color?" "Red, Blue, Green"',
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, reply, q }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    if (!q || !q.includes("|")) {
      return reply(
        "⚠️ *Usage:*\n`.poll <question> | <option1, option2, ...>`\n\n*Example:*\n`.poll Favorite color? | Red, Blue, Green`"
      );
    }

    const parts = q.split("|").map((p) => p.trim());
    const name = parts[0];
    const valuesPart = parts[1] || "";
    const values = valuesPart
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);

    if (!name || values.length < 2) {
      return reply("⚠️ Provide a question and at least 2 options separated by commas.");
    }

    if (values.length > 12) {
      return reply("⚠️ Maximum 12 options allowed.");
    }

    // Optional selectable count (default 1)
    let selectableCount = 1;
    if (parts[2]) {
      const parsed = parseInt(parts[2]);
      if (!isNaN(parsed) && parsed > 0) selectableCount = Math.min(parsed, values.length);
    }

    try {
      await conn.sendMessage(from, {
        poll: {
          name,
          values,
          selectableCount
        }
      });
    } catch (err) {
      console.error("Poll error:", err);
      await reply("❌ Failed to create poll.");
    }
  }
);

// ------------------ gstatus (group status/story) ------------------
cmd(
  {
    pattern: "gstatus",
    alias: ["groupstatus", "gstory"],
    category: "group",
    react: "📸",
    desc: "Send a status/story to the group. Reply to media or use URL. Types: image, video, text, audio",
    usage: ".gstatus image <url> [caption] | .gstatus text <message> | reply to media + .gstatus <type>",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, reply, q, args, quoted }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    let type = (args[0] || "").toLowerCase();

    // Support for ".gstatus add text ..." pattern
    if (type === "add" && args.length > 1) {
      args.shift();
      type = (args[0] || "").toLowerCase();
    }

    function unwrapMessage(message) {
      if (!message) return null;
      if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
      if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
      if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message);
      if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
      if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
      return message;
    }

    const currentMsg = unwrapMessage(mek.message);
    const hasQuotedImage = quoted && (quoted.type === "imageMessage" || (quoted.type === "documentMessage" && quoted.msg?.mimetype?.startsWith("image/")));
    const hasQuotedVideo = quoted && (quoted.type === "videoMessage" || (quoted.type === "documentMessage" && quoted.msg?.mimetype?.startsWith("video/")));
    const hasQuotedAudio = quoted && (quoted.type === "audioMessage" || quoted.type === "pttMessage" || (quoted.type === "documentMessage" && quoted.msg?.mimetype?.startsWith("audio/")));
    const hasQuotedText = quoted && (quoted.type === "conversation" || quoted.type === "extendedTextMessage");

    const hasCurrentImage = !!currentMsg?.imageMessage;
    const hasCurrentVideo = !!currentMsg?.videoMessage;
    const hasCurrentAudio = !!currentMsg?.audioMessage;

    let buffer = null;
    let caption = "";
    let detectedType = null;

    try {
      if (hasQuotedImage || hasQuotedVideo || hasQuotedAudio) {
        buffer = await quoted.download();
        detectedType = hasQuotedImage ? "image" : hasQuotedVideo ? "video" : "audio";
        caption = q.trim();
        if (args[0] && ["image", "video", "audio", "text"].includes(args[0].toLowerCase())) {
          caption = args.slice(1).join(" ").trim();
        }
      } else if (hasCurrentImage || hasCurrentVideo || hasCurrentAudio) {
        buffer = await downloadMediaMessage(mek, "buffer", {});
        detectedType = hasCurrentImage ? "image" : hasCurrentVideo ? "video" : "audio";
        caption = q.trim();
        if (args[0] && ["image", "video", "audio", "text"].includes(args[0].toLowerCase())) {
          caption = args.slice(1).join(" ").trim();
        }
      }

      if (detectedType) {
        type = detectedType;
      }

      if (!type && hasQuotedText) {
        type = "text";
      }

      const validTypes = ["image", "video", "text", "audio"];

      if (!validTypes.includes(type)) {
        return reply(
          "📸 *Group Status Sender*\n\n" +
          "*Usage:*\n" +
          "`.gstatus image <url> [caption]`\n" +
          "`.gstatus video <url> [caption]`\n" +
          "`.gstatus text <message>`\n" +
          "`.gstatus audio <url>`\n\n" +
          "*Or reply to media:*\n" +
          "`.gstatus image` (reply to image)\n" +
          "`.gstatus video` (reply to video)\n" +
          "`.gstatus audio` (reply to audio/voice)\n\n" +
          "*Or send directly with caption:*\n" +
          "Send image/video/audio with command `.gstatus [caption]`"
        );
      }

      if (type === "text") {
        let text = "";
        if (hasQuotedText) {
          text = quoted.body || quoted.msg || "";
        } else {
          text = args[0]?.toLowerCase() === "text" ? args.slice(1).join(" ").trim() : q.trim();
        }
        if (!text) return reply("⚠️ Provide text content.\nUsage: `.gstatus text Hello world!`");
        
        const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");
        
        // 1. Post to Status Tab (Privacy: Group members)
        const statusMsg = await generateWAMessageFromContent("status@broadcast", {
          extendedTextMessage: {
            text: text,
            backgroundArgb: 0xff5733ff,
            font: 3
          }
        }, { statusJidList: [from] });
        await conn.relayMessage("status@broadcast", statusMsg.message, { messageId: statusMsg.key.id, statusJidList: [from] });

        // 2. Notify Group (Trigger)
        const groupMsg = await generateWAMessageFromContent(from, {
          groupStatusMessageV2: {
            message: statusMsg.message
          }
        }, { quoted: mek });
        await conn.relayMessage(from, groupMsg.message, { messageId: groupMsg.key.id });

        return reply("✅ Full Hybrid Group Status posted!");
      }

      else if (type === "image") {
        if (!buffer) {
          const imageUrl = args[1];
          if (!imageUrl) return reply("⚠️ Provide image URL or reply to/attach an image.");
          buffer = { url: imageUrl };
          caption = args.slice(2).join(" ").trim();
        }

        const { prepareWAMessageMedia, generateWAMessageFromContent } = require("@whiskeysockets/baileys");
        const media = await prepareWAMessageMedia({ image: buffer }, { upload: conn.waUploadToServer });
        
        // 1. Post to Status Tab
        const statusMsg = await generateWAMessageFromContent("status@broadcast", {
          imageMessage: {
            ...media.imageMessage,
            caption: caption
          }
        }, { statusJidList: [from] });
        await conn.relayMessage("status@broadcast", statusMsg.message, { messageId: statusMsg.key.id, statusJidList: [from] });

        // 2. Notify Group
        const groupMsg = await generateWAMessageFromContent(from, {
          groupStatusMessageV2: {
            message: statusMsg.message
          }
        }, { quoted: mek });
        await conn.relayMessage(from, groupMsg.message, { messageId: groupMsg.key.id });

        return reply("✅ Full Hybrid Image Status posted!");
      }

      else if (type === "video") {
        if (!buffer) {
          const videoUrl = args[1];
          if (!videoUrl) return reply("⚠️ Provide video URL or reply to/attach a video.");
          buffer = { url: videoUrl };
          caption = args.slice(2).join(" ").trim();
        }

        const { prepareWAMessageMedia, generateWAMessageFromContent } = require("@whiskeysockets/baileys");
        const media = await prepareWAMessageMedia({ video: buffer }, { upload: conn.waUploadToServer });
        
        // 1. Post to Status Tab
        const statusMsg = await generateWAMessageFromContent("status@broadcast", {
          videoMessage: {
            ...media.videoMessage,
            caption: caption
          }
        }, { statusJidList: [from] });
        await conn.relayMessage("status@broadcast", statusMsg.message, { messageId: statusMsg.key.id, statusJidList: [from] });

        // 2. Notify Group
        const groupMsg = await generateWAMessageFromContent(from, {
          groupStatusMessageV2: {
            message: statusMsg.message
          }
        }, { quoted: mek });
        await conn.relayMessage(from, groupMsg.message, { messageId: groupMsg.key.id });

        return reply("✅ Full Hybrid Video Status posted!");
      }

      else if (type === "audio") {
        if (!buffer) {
          const audioUrl = args[1];
          if (!audioUrl) return reply("⚠️ Provide audio URL or reply to/attach an audio message.");
          buffer = { url: audioUrl };
        }

        const { prepareWAMessageMedia, generateWAMessageFromContent } = require("@whiskeysockets/baileys");
        const media = await prepareWAMessageMedia({ audio: buffer }, { upload: conn.waUploadToServer });
        
        // 1. Post to Status Tab
        const statusMsg = await generateWAMessageFromContent("status@broadcast", {
          audioMessage: {
            ...media.audioMessage
          }
        }, { statusJidList: [from] });
        await conn.relayMessage("status@broadcast", statusMsg.message, { messageId: statusMsg.key.id, statusJidList: [from] });

        // 2. Notify Group
        const groupMsg = await generateWAMessageFromContent(from, {
          groupStatusMessageV2: {
            message: statusMsg.message
          }
        }, { quoted: mek });
        await conn.relayMessage(from, groupMsg.message, { messageId: groupMsg.key.id });

        return reply("✅ Full Hybrid Audio Status posted!");
      }
    } catch (err) {
      console.error("Gstatus error:", err);
      await reply(`❌ Failed to send ${type} group status.\n\n*Error:* ${err.message || err}`);
    }
  }
);

module.exports = {};

