const { cmd } = require("../command");
const { getContext } = require("../lib/newsletter");
const { getDB, saveGlobal } = require("../lib/database");
const { downloadMediaMessage, downloadContentFromMessage } = require("@whiskeysockets/baileys");
const {
  startBulkOp,
  cancelBulkOp,
  isBulkCancelled,
  endBulkOp,
  getBulkOp,
  bulkCountdown,
  parseDurationMs,
} = require("../lib/group_ops");
const { scanGroupOnline, labelPresence } = require("../lib/presence");
const {
  parseTimeHHMM,
  getOwnerTimezone,
  getNowInTimezone,
  setGroupLock,
} = require("../lib/gc_schedule");

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
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply }) => {
    if (!isGroup) return reply("❌ Groups only.");
    if (!isAdmin) return reply("❌ Admins only.");
    if (!isBotAdmin) return reply("❌ I need admin rights.");

    const rawNum = (args[0] || "").replace(/\D/g, "");
    if (!rawNum) return reply("❌ Usage: `.add 237680260772`");

    const jid = `${rawNum}@s.whatsapp.net`;
    console.log("[.add] Attempting to add:", jid, "to group:", from);

    // ── Pre-check: verify number exists BEFORE calling groupParticipantsUpdate
    let exists = false;
    try {
      console.log("[.add] Checking if number exists on WhatsApp:", rawNum);
      const [check] = await conn.onWhatsApp(rawNum);
      exists = !!check?.exists;
      console.log("[.add] onWhatsApp result:", JSON.stringify(check));
    } catch (e) {
      console.error("[.add] onWhatsApp check failed:", e.message);
    }

    if (!exists) {
      console.log("[.add] ❌ Number not on WhatsApp, aborting.");
      return reply(`❌ +${rawNum} is not on WhatsApp.`);
    }

    try {
      console.log("[.add] Calling groupParticipantsUpdate → add:", jid);
      const result = await conn.groupParticipantsUpdate(from, [jid], "add");
      console.log("[.add] groupParticipantsUpdate result:", JSON.stringify(result));
      const res = result?.[0];
      const statusMap = {
        200: `✅ +${rawNum} added successfully!`,
        403: `❌ +${rawNum} has privacy settings blocking adds.`,
        408: `❌ Request timed out.`,
        409: `⚠️ +${rawNum} is already in the group.`,
        500: `❌ WhatsApp internal error, try again.`,
      };
      await reply(statusMap[res?.status] || `⚠️ Unknown result: ${res?.status}`);
    } catch (e) {
      // NEVER rethrow — catch everything so the socket doesn't die
      console.error("[.add] ❌ groupParticipantsUpdate threw:", e.message, e.stack);
      await reply(`❌ Add failed: ${e.message}`);
    }
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
    pattern: "gcmode",
    alias: ["groupmode"],
    react: "⚙️",
    desc: "Toggle group open/close mode (admins only). Usage: .gcmode open | .gcmode close",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, args, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const action = String(args?.[0] || "").toLowerCase();
    if (!["open", "close"].includes(action)) {
      await reply("Usage: .gcmode open | .gcmode close");
      return;
    }

    try {
      await conn.groupSettingUpdate(from, action === "close" ? "announcement" : "not_announcement");
      await reply(`✅ Group is now ${action === "close" ? "closed (admins only)" : "open (everyone)"}.`);
    } catch (err) {
      console.error("[gcmode] error:", err);
      await reply("❌ Failed to update group setting.");
    }
  }
);

// ── Lock GC — only admins can send messages ───────────────────────────────────
cmd(
  {
    pattern: "lockgc",
    alias: ["lockgroup", "gclock"],
    react: "🔒",
    desc: "Lock group now, or for a duration (.lockgc 2h). Use .autolock for daily schedule.",
    category: "group",
    usage: ".lockgc | .lockgc 30m | .lockgc 2h",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, reply, args }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const durationMs = parseDurationMs(args[0]);

    try {
      await setGroupLock(conn, from, true);

      if (durationMs) {
        const db = getDB();
        db.timedLocks = db.timedLocks && typeof db.timedLocks === "object" ? db.timedLocks : {};
        const unlockAt = Date.now() + durationMs;
        db.timedLocks[from] = { unlockAt, setBy: "lockgc" };
        saveGlobal(db);
        const until = new Date(unlockAt).toLocaleString();
        return await reply(
          `🔒 *Group locked for ${args[0]}*\n\n` +
            `Auto-unlock scheduled at: *${until}*\n` +
            `Use *.unlockgc* to open immediately.`
        );
      }

      await reply(
        "🔒 *Group Locked!*\n\n" +
          "Only admins can send messages now.\n" +
          "Use *.unlockgc* to open, or *.autolock on* for daily schedule."
      );
    } catch (err) {
      console.error("[lockgc] ❌ Error:", err.message, err.stack);
      await reply(`❌ Failed to lock group: ${err.message}`);
    }
  }
);

// ── Unlock GC — everyone can send messages ────────────────────────────────────
cmd(
  {
    pattern: "unlockgc",
    alias: ["unlockgroup", "gcunlock"],
    react: "🔓",
    desc: "Unlock the group — everyone can send messages.",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    try {
      console.log("[unlockgc] Setting group to open mode (everyone):", from);
      await conn.groupSettingUpdate(from, "not_announcement");
      console.log("[unlockgc] ✅ Group unlocked:", from);
      const db = getDB();
      if (db.timedLocks?.[from]) {
        delete db.timedLocks[from];
        saveGlobal(db);
      }

      await reply(
        "🔓 *Group Unlocked!*\n\n" +
          "Everyone can send messages now.\n" +
          "Use *.lockgc* to restrict, or *.autolock on* for daily auto lock/unlock."
      );
    } catch (err) {
      console.error("[unlockgc] ❌ Error:", err.message, err.stack);
      await reply(`❌ Failed to unlock group: ${err.message}`);
    }
  }
);

// ── Daily auto lock/unlock (owner timezone) ───────────────────────────────────
cmd(
  {
    pattern: "autolock",
    alias: ["lockschedule", "gclockschedule"],
    react: "⏰",
    desc: "Auto unlock/lock group daily using owner timezone",
    usage: ".autolock on [08:00] [20:00] | .autolock off | .autolock status",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, isAdmin, isBotAdmin, reply, args }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const db = getDB();
    db.gcSchedule = db.gcSchedule && typeof db.gcSchedule === "object" ? db.gcSchedule : {};
    const action = (args[0] || "status").toLowerCase();
    const tz = getOwnerTimezone(db);

    if (action === "off") {
      delete db.gcSchedule[from];
      saveGlobal(db);
      return reply("✅ Auto-lock schedule disabled for this group.");
    }

    if (action === "status" || action === "info") {
      const sched = db.gcSchedule[from];
      const timed = db.timedLocks?.[from];
      let msg = `╭━━━═『 *AUTO-LOCK STATUS* 』═━━━╮\n`;
      msg += `┃ 🌍 *Timezone:* ${tz}\n`;
      msg += `┃ 🕒 *Now:* ${getNowInTimezone(tz).hhmm}\n`;
      if (!sched?.enabled) {
        msg += `┃ 📢 *Schedule:* OFF\n`;
      } else {
        msg += `┃ 🔓 *Daily unlock:* ${sched.unlockAt || "08:00"}\n`;
        msg += `┃ 🔒 *Daily lock:* ${sched.lockAt || "20:00"}\n`;
        msg += `┃ 📌 *Last state:* ${sched.lastState || "unknown"}\n`;
      }
      if (timed?.unlockAt) {
        msg += `┃ ⏳ *Timed lock ends:* ${new Date(timed.unlockAt).toLocaleString()}\n`;
      }
      msg += `╰━━━━━━━━━━━━━━━━━━━━━━━╯\n\n`;
      msg += `*Setup:* \`.autolock on 08:00 20:00\`\n`;
      msg += `*Owner TZ:* \`.settimezone Africa/Lagos\``;
      return reply(msg);
    }

    if (action === "on" || action === "enable") {
      const unlockAt = parseTimeHHMM(args[1]) || "08:00";
      const lockAt = parseTimeHHMM(args[2]) || "20:00";

      db.gcSchedule[from] = {
        enabled: true,
        unlockAt,
        lockAt,
        lastUnlockDate: null,
        lastLockDate: null,
        lastState: null,
      };
      saveGlobal(db);

      return reply(
        `✅ *Auto-lock enabled*\n\n` +
          `🔓 Unlocks daily at *${unlockAt}*\n` +
          `🔒 Locks daily at *${lockAt}*\n` +
          `🌍 Timezone: *${tz}*\n\n` +
          `_Example: open 8AM, close 8PM._`
      );
    }

    return reply(
      "Usage:\n" +
        "• `.autolock on 08:00 20:00` — unlock 8AM, lock 8PM\n" +
        "• `.autolock off`\n" +
        "• `.autolock status`"
    );
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
    alias: ["infogroup", "ginfo", "gcinfo", "groupdetails"],
    react: "📝",
    desc: "Show full and precise group metadata.",
    category: "group",
    filename: __filename
  },
  async (conn, mek, m, { from, isGroup, reply, groupMetadata, groupAdmins, participants }) => {
    if (!requireGroup(isGroup, reply)) return;

    try {
      const gMeta = groupMetadata || await conn.groupMetadata(from);
      const list = Array.isArray(participants) && participants.length
        ? participants
        : (Array.isArray(gMeta.participants) ? gMeta.participants : []);

      const adminsList = list.filter((p) => !!p.admin);
      const superAdmins = list.filter((p) => p.admin === "superadmin");
      const ownerJid = gMeta.owner || superAdmins[0]?.id || null;
      const ownerTag = ownerJid ? `@${jidToNumber(ownerJid)}` : "Unknown";
      const ownerMention = ownerJid ? [ownerJid] : [];

      const createdAt = gMeta.creation
        ? new Date(gMeta.creation * 1000).toLocaleString()
        : "Unknown";
      const desc = (gMeta.desc || "No description set.").trim();
      const descId = gMeta.descId || "N/A";
      const descOwner = gMeta.descOwner ? `@${jidToNumber(gMeta.descOwner)}` : "N/A";
      const descTime = gMeta.descTime
        ? new Date(gMeta.descTime * 1000).toLocaleString()
        : "N/A";

      const ephemeralSec = Number(gMeta.ephemeralDuration || 0);
      const ephemeralText = ephemeralSec > 0 ? `${ephemeralSec}s` : "off";

      const settings = {
        announce: gMeta.announce ? "closed (admins only)" : "open (everyone)",
        restrict: gMeta.restrict ? "locked (admins only edit info)" : "open (members can edit info)",
        memberAddMode: gMeta.memberAddMode ? "members can add" : "admins add only",
        joinApprovalMode: gMeta.joinApprovalMode ? "on" : "off",
        ephemeral: ephemeralText,
        isCommunity: gMeta.isCommunity ? "yes" : "no",
        isCommunityAnnounce: gMeta.isCommunityAnnounce ? "yes" : "no",
        linkedParent: gMeta.linkedParent || "none"
      };

      let inviteLink = "Unavailable";
      try {
        const code = await conn.groupInviteCode(from);
        inviteLink = `https://chat.whatsapp.com/${code}`;
      } catch {}

      const adminsPreview = adminsList
        .slice(0, 20)
        .map((p, i) => `${i + 1}. @${jidToNumber(p.id)}${p.admin === "superadmin" ? " (owner)" : ""}`)
        .join("\n") || "No admins found.";

      const adminTail = adminsList.length > 20 ? `\n...and ${adminsList.length - 20} more admin(s).` : "";

      const text = [
        "╭━━━═『 *GROUP INTEL* 』═━━━╮",
        `┃ 🏷️ *Name:* ${gMeta.subject || "Unknown"}`,
        `┃ 🆔 *JID:* ${from}`,
        `┃ 👑 *Owner:* ${ownerTag}`,
        `┃ 📅 *Created:* ${createdAt}`,
        "┣━━━━━━━━━━━━━━━━━━━━━━━",
        `┃ 👥 *Members:* ${list.length}`,
        `┃ 🛡️ *Admins:* ${adminsList.length}`,
        `┃ ⭐ *Super Admins:* ${superAdmins.length}`,
        `┃ 🔗 *Invite:* ${inviteLink}`,
        "┣━━━━━━━━━━━━━━━━━━━━━━━",
        `┃ 🔒 *Chat mode:* ${settings.announce}`,
        `┃ 📝 *Edit info:* ${settings.restrict}`,
        `┃ ➕ *Add mode:* ${settings.memberAddMode}`,
        `┃ ✅ *Join approval:* ${settings.joinApprovalMode}`,
        `┃ ⏳ *Disappearing:* ${settings.ephemeral}`,
        `┃ 🧩 *Community:* ${settings.isCommunity}`,
        `┃ 📣 *Community announce:* ${settings.isCommunityAnnounce}`,
        `┃ 🔗 *Linked parent:* ${settings.linkedParent}`,
        "┣━━━━━━━━━━━━━━━━━━━━━━━",
        `┃ 📄 *Desc ID:* ${descId}`,
        `┃ ✍️ *Desc Owner:* ${descOwner}`,
        `┃ 🕒 *Desc Time:* ${descTime}`,
        "╰━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        "*📃 Description*",
        desc,
        "",
        `*👮 Admin List (${adminsList.length})*`,
        `${adminsPreview}${adminTail}`
      ].join("\n");

      const mentions = [...ownerMention, ...(gMeta.descOwner ? [gMeta.descOwner] : []), ...adminsList.map((p) => p.id)];
      await conn.sendMessage(from, { text, mentions }, { quoted: mek });
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

// ------------------ seeonline ------------------
cmd(
  {
    pattern: "seeonline",
    alias: ["online", "whosonline", "online members"],
    category: "group",
    react: "🟢",
    desc: "Show who appears online in the group (admins only)",
    usage: ".seeonline",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, from, reply, groupMetadata }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    try {
      await reply("⏳ Scanning presence... (4s)");
      const meta = groupMetadata || (await conn.groupMetadata(from));
      const jids = (meta.participants || []).map((p) => p.id).filter(Boolean);
      if (!jids.length) return reply("❌ No participants found.");

      const { online, offline, total } = await scanGroupOnline(conn, jids, 4000);

      const onlineLines = online
        .slice(0, 30)
        .map((r, i) => `${i + 1}. @${jidToNumber(r.jid)} — ${labelPresence(r.presence)}`)
        .join("\n") || "None detected";

      const text = [
        "╭━━━═『 *ONLINE SCAN* 』═━━━╮",
        `┃ 👥 *Members:* ${total}`,
        `┃ 🟢 *Online-ish:* ${online.length}`,
        `┃ ⚫ *Offline/unknown:* ${offline.length}`,
        "╰━━━━━━━━━━━━━━━━━━━━━━━╯",
        "",
        "*🟢 Online / Active*",
        onlineLines,
        online.length > 30 ? `\n...and ${online.length - 30} more.` : "",
        "",
        "_Note: WhatsApp hides presence for many users._"
      ].join("\n");

      await reply(text, { mentions: online.slice(0, 30).map((r) => r.jid) });
    } catch (err) {
      console.error("seeonline error:", err);
      await reply(`❌ Failed to scan online members: ${err.message}`);
    }
  }
);

// ------------------ listadmins ------------------
cmd(
  {
    pattern: "listadmins",
    alias: ["adminslist", "adminlist"],
    category: "group",
    react: "👑",
    desc: "Detailed admin list with roles",
    usage: ".listadmins",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, from, reply, groupMetadata }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    try {
      const meta = groupMetadata || (await conn.groupMetadata(from));
      const admins = (meta.participants || []).filter((p) => p.admin);
      if (!admins.length) return reply("❌ No admins found.");

      const ownerJid = meta.owner || admins.find((p) => p.admin === "superadmin")?.id;
      const lines = admins.map((p, i) => {
        const role = p.admin === "superadmin" ? "👑 owner" : "🛡️ admin";
        const mark = p.id === ownerJid ? " (creator)" : "";
        return `${i + 1}. @${jidToNumber(p.id)} — ${role}${mark}`;
      });

      const text = [
        `╭━━━═『 *ADMIN ROSTER* 』═━━━╮`,
        `┃ 🏷️ *Group:* ${meta.subject || "Unknown"}`,
        `┃ 👑 *Total admins:* ${admins.length}`,
        `╰━━━━━━━━━━━━━━━━━━━━━━━╯`,
        "",
        lines.join("\n")
      ].join("\n");

      await reply(text, { mentions: admins.map((p) => p.id) });
    } catch (err) {
      console.error("listadmins error:", err);
      await reply("❌ Failed to list admins.");
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

async function runBulkKick(conn, from, sender, reply, countdownSec = 10) {
  const metadata = await conn.groupMetadata(from);
  const nonAdmins = metadata.participants.filter((p) => !p.admin).map((p) => p.id);
  if (!nonAdmins.length) {
    endBulkOp(from);
    return reply("ℹ️ No non-admin members to remove.");
  }

  if (getBulkOp(from)) {
    return reply("⚠️ Another bulk operation is already running. Use `.stop` first.");
  }

  startBulkOp(from, "kickall", { total: nonAdmins.length });

  await reply(
    `⚠️ *BULK REMOVE STARTED*\n\n` +
      `👥 Targets: ${nonAdmins.length}\n` +
      `⏱️ Countdown: ${countdownSec}s\n` +
      `🛑 Cancel anytime: \`.stop\``
  );

  const proceed = await bulkCountdown(from, countdownSec);
  if (!proceed) return reply("✅ Bulk remove cancelled before start.");

  await reply("🔥 Executing bulk remove...");

  let kicked = 0;
  let failed = 0;

  for (const jid of nonAdmins) {
    if (isBulkCancelled(from)) break;
    try {
      await conn.groupParticipantsUpdate(from, [jid], "remove");
      kicked++;
      await new Promise((r) => setTimeout(r, 2500));
    } catch (err) {
      failed++;
      console.error(`Failed to kick ${jid}:`, err.message);
    }
  }

  const cancelled = isBulkCancelled(from);
  endBulkOp(from);

  await reply(
    `━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `🛡 *BULK REMOVE RESULT*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `✅ Removed: ${kicked}\n` +
      `❌ Failed: ${failed}\n` +
      `🛑 Stopped early: ${cancelled ? "yes" : "no"}\n` +
      `⚡ By: @${jidToNumber(sender)}`,
    { mentions: [sender] }
  );
}

// ------------------ kickall / purge ------------------
cmd(
  {
    pattern: "kickall",
    alias: ["purge", "cleangc", "masskick"],
    category: "group",
    react: "👢",
    desc: "Remove all non-admin members. Cancel with .stop",
    usage: ".kickall [countdown_seconds] | .purge 15",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, sender, reply, args }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    const countdown = Math.min(60, Math.max(3, parseInt(args[0], 10) || 10));

    try {
      await runBulkKick(conn, from, sender, reply, countdown);
    } catch (err) {
      endBulkOp(from);
      console.error("kickall/purge error:", err);
      await reply("❌ Failed to execute bulk remove.");
    }
  }
);

// ------------------ stop ------------------
cmd(
  {
    pattern: "stop",
    alias: ["cancelop", "abort"],
    category: "group",
    react: "🛑",
    desc: "Cancel active bulk ops (kickall/purge/etc.) in this group",
    usage: ".stop",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, from, reply }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;

    const op = getBulkOp(from);
    if (!op) {
      return reply("ℹ️ No active bulk operation in this group.");
    }

    cancelBulkOp(from);
    await reply(`🛑 Stopping *${op.type}*...`);
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

// ------------------ togstatus (auto-detect group status) ------------------
cmd(
  {
    pattern: "togstatus",
    alias: ["gstatus", "groupstatus", "gstory"],
    category: "group",
    react: "📸",
    desc: "Post any text, photo, video, or audio as a group status (auto-detects type)",
    usage: ".togstatus [caption] | reply to media/text | send media with .togstatus in caption | .togstatus <url>",
    noPrefix: false
  },
  async (conn, mek, m, { isGroup, isAdmin, isBotAdmin, from, reply, q, args, quoted }) => {
    if (!requireGroup(isGroup, reply)) return;
    if (!requireAdmin(isAdmin, reply)) return;
    if (!requireBotAdmin(isBotAdmin, reply)) return;

    function unwrapMessage(message) {
      if (!message) return null;
      if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
      if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
      if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message);
      if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
      if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
      return message;
    }

    function mediaKindFromType(type, msg) {
      if (!type) return null;
      if (type === "imageMessage" || type === "stickerMessage") return "image";
      if (type === "videoMessage") return "video";
      if (type === "audioMessage" || type === "pttMessage") return "audio";
      if (type === "conversation" || type === "extendedTextMessage") return "text";
      if (type === "documentMessage" && msg?.mimetype) {
        if (msg.mimetype.startsWith("image/")) return "image";
        if (msg.mimetype.startsWith("video/")) return "video";
        if (msg.mimetype.startsWith("audio/")) return "audio";
      }
      return null;
    }

    function guessTypeFromUrl(url) {
      const base = String(url || "").toLowerCase().split("?")[0];
      if (/\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(base)) return "image";
      if (/\.(mp4|mov|webm|mkv|avi)$/i.test(base)) return "video";
      if (/\.(mp3|ogg|wav|m4a|opus|aac|flac)$/i.test(base)) return "audio";
      return null;
    }

    function isHttpUrl(value) {
      return /^https?:\/\//i.test(String(value || "").trim());
    }

    async function notifyGroup(statusMsg) {
      const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");
      const groupMsg = await generateWAMessageFromContent(from, {
        groupStatusMessageV2: { message: statusMsg.message }
      }, { quoted: mek });
      await conn.relayMessage(from, groupMsg.message, { messageId: groupMsg.key.id });
    }

    // Strip legacy type keywords if user still uses old syntax
    const legacyTypes = ["image", "video", "audio", "text", "add"];
    let captionOrText = q.trim();
    if (legacyTypes.includes((args[0] || "").toLowerCase())) {
      const keyword = args[0].toLowerCase();
      if (keyword === "add" && args.length > 1 && legacyTypes.includes(args[1].toLowerCase())) {
        captionOrText = args.slice(2).join(" ").trim();
      } else {
        captionOrText = args.slice(1).join(" ").trim();
      }
    }

    const currentMsg = unwrapMessage(mek.message);
    const quotedType = quoted?.type || quoted?.mtype || "";
    const quotedKind = quoted ? mediaKindFromType(quotedType, quoted.msg) : null;
    const currentKind = mediaKindFromType(
      currentMsg?.imageMessage ? "imageMessage" :
      currentMsg?.videoMessage ? "videoMessage" :
      currentMsg?.audioMessage ? "audioMessage" : null,
      currentMsg?.imageMessage || currentMsg?.videoMessage || currentMsg?.audioMessage
    );

    let type = null;
    let buffer = null;
    let text = "";
    let caption = "";

    try {
      // 1) Reply to media
      if (quotedKind && quotedKind !== "text") {
        type = quotedKind;
        caption = captionOrText;
        try {
          buffer = await quoted.download();
        } catch (dlErr) {
          console.error("[togstatus] quoted download failed:", dlErr.message);
          return reply("❌ Failed to download replied media. Forward it again or re-send the file.");
        }
        if (!buffer?.length) return reply("❌ Downloaded media is empty.");
      }
      // 2) Message sent with media + command in caption
      else if (currentKind) {
        type = currentKind;
        caption = captionOrText;
        buffer = await downloadMediaMessage(
          mek,
          "buffer",
          {},
          { reuploadRequest: conn.updateMediaMessage }
        );
        if (!buffer?.length) return reply("❌ Failed to read attached media.");
      }
      // 3) Reply to text
      else if (quotedKind === "text") {
        type = "text";
        text = captionOrText || quoted.body || "";
      }
      // 4) URL in args
      else if (isHttpUrl(captionOrText)) {
        const url = captionOrText.trim();
        type = guessTypeFromUrl(url);
        if (!type) return reply("⚠️ Could not detect media type from URL. Use a direct link ending in .jpg, .mp4, .mp3, etc.");
        buffer = { url };
      }
      // 5) Plain text status
      else if (captionOrText) {
        type = "text";
        text = captionOrText;
      }

      if (!type) {
        return reply(
          "📸 *Group Status*\n\n" +
          "Send any of these — type is detected automatically:\n\n" +
          "• Reply to a *photo, video, voice, or text* → `.togstatus`\n" +
          "• Reply with a caption → `.togstatus your caption`\n" +
          "• Send media with `.togstatus` in the caption\n" +
          "• Text status → `.togstatus Hello everyone!`\n" +
          "• From URL → `.togstatus https://.../photo.jpg`"
        );
      }

      const { generateWAMessageFromContent } = require("@whiskeysockets/baileys");
      const statusJidList = [from, conn.user.id];

      if (type === "text") {
        if (!text) return reply("⚠️ Provide text for the status.\nExample: `.togstatus Hello group!`");

        const statusMsg = await generateWAMessageFromContent("status@broadcast", {
          extendedTextMessage: {
            text,
            backgroundArgb: 0xff5733ff,
            font: 3
          }
        }, { statusJidList: [from] });
        await conn.relayMessage("status@broadcast", statusMsg.message, {
          messageId: statusMsg.key.id,
          statusJidList: [from]
        });
        await notifyGroup(statusMsg);
        return reply("✅ Text group status posted!");
      }

      if (type === "image") {
        const statusMsg = await conn.sendMessage(
          "status@broadcast",
          { image: buffer, caption },
          { statusJidList, broadcast: true }
        );
        await notifyGroup(statusMsg);
        return reply("✅ Image group status posted!");
      }

      if (type === "video") {
        const statusMsg = await conn.sendMessage(
          "status@broadcast",
          { video: buffer, caption },
          { statusJidList, broadcast: true }
        );
        await notifyGroup(statusMsg);
        return reply("✅ Video group status posted!");
      }

      if (type === "audio") {
        const statusMsg = await conn.sendMessage(
          "status@broadcast",
          { audio: buffer, mimetype: "audio/mp4" },
          { statusJidList, broadcast: true }
        );
        await notifyGroup(statusMsg);
        return reply("✅ Audio group status posted!");
      }
    } catch (err) {
      console.error("[togstatus] ❌ Error:", err.message, err.stack);
      await reply(`❌ Failed to post group status.\n\n*Error:* ${err.message || err}`);
    }
  }
);

module.exports = {};

