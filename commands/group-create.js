const { cmd } = require("../command");

function normalizeJid(input) {
  if (!input) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  if (raw.endsWith("@s.whatsapp.net")) return raw;
  if (raw.includes("@")) {
    const base = raw.split("@")[0].split(":")[0].replace(/\D/g, "");
    return base ? `${base}@s.whatsapp.net` : "";
  }
  const digits = raw.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

cmd(
  {
    pattern: "creategroup",
    alias: ["cg", "makegroup", "creategrouo"],
    react: "",
    category: "group",
    desc: "Create a new WhatsApp group",
    usage: ".creategroup GroupName @user1 @user2 ...",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, args, mentionedJid, isOwner, isSudo }) => {
    if (!isOwner && !isSudo) return reply("Only owners and sudo can create groups.");

    const raw = (m.body || "").replace(/^[^\s]+\s*/, "").trim();
    if (!raw) {
      return reply("Please provide a group name and at least one member.\nUsage: .creategroup Group Name | @user1 2376xxxxxxx");
    }

    let groupName = "";
    let membersPart = "";
    if (raw.includes("|")) {
      const [namePart, ...rest] = raw.split("|");
      groupName = String(namePart || "").trim();
      membersPart = rest.join("|").trim();
    } else {
      const tokens = raw.split(/\s+/).filter(Boolean);
      const firstMemberIdx = tokens.findIndex((t) => !!normalizeJid(t));
      if (firstMemberIdx === -1 && (!Array.isArray(mentionedJid) || mentionedJid.length === 0)) {
        // No explicit members in text: treat full input as group name.
        groupName = raw;
        membersPart = "";
      } else {
        // Legacy mode without "|" where members are appended after name.
        if (firstMemberIdx === -1) {
          groupName = raw;
          membersPart = "";
        } else {
          groupName = tokens.slice(0, firstMemberIdx).join(" ").trim();
          membersPart = tokens.slice(firstMemberIdx).join(" ").trim();
        }
      }
    }

    if (!groupName) {
      return reply("Invalid group name.\nUsage: .creategroup Group Name | @user1 2376xxxxxxx");
    }

    const participantsSet = new Set();

    // Mentioned users first.
    if (Array.isArray(mentionedJid)) {
      for (const jid of mentionedJid) {
        const normalized = normalizeJid(jid);
        if (normalized) participantsSet.add(normalized);
      }
    }

    // Parse plain numbers/jids from the right side.
    if (membersPart) {
      const tokens = membersPart.split(/\s+/).filter(Boolean);
      for (const token of tokens) {
        const normalized = normalizeJid(token);
        if (normalized) participantsSet.add(normalized);
      }
    }

    // Include command sender so WA has at least one valid participant.
    const senderJid = normalizeJid(m.sender || "");
    if (senderJid) participantsSet.add(senderJid);

    // Include bot account too.
    const botJid = normalizeJid(conn.user?.id || "");
    if (botJid) participantsSet.add(botJid);

    let participants = Array.from(participantsSet);
    if (participants.length === 0) {
      return reply("No valid participants found. Mention users or pass numbers after '|'.");
    }

    // WhatsApp allows up to 1023 participants in group creation
    // But for safety, limit to reasonable number
    if (participants.length > 50) {
      participants = participants.slice(0, 50);
    }
    
    try {
      reply("Creating group...");
      
      const group = await conn.groupCreate(groupName, participants);
      
      const successMessage = `Group Created Successfully\n\n` +
                             `*Group Name:* ${groupName}\n` +
                             `*Group ID:* ${group.id}\n` +
                             `*Participants:* ${participants.length}\n\n` +
                             `You can now use this group ID for other group commands.`;
      
      await reply(successMessage);
      
      // Send invite link
      try {
        const inviteCode = await conn.groupInviteCode(group.id);
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
        await reply(`Invite Link: ${inviteLink}`);
      } catch (err) {
        console.error("Failed to get invite code:", err);
      }
      
    } catch (error) {
      console.error("Group creation error:", error);
      await reply(`Failed to create group: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "copygroup",
    alias: ["cgcopy", "duplicate"],
    react: "",
    category: "group",
    desc: "Create a copy of current group with same members",
    usage: ".copygroup NewGroupName",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, args, isOwner, isSudo, isAdmin, isGroup }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isOwner && !isSudo) return reply("Only owners and sudo can copy groups.");
    
    const groupName = args[0];
    if (!groupName) {
      return reply("Please provide a new group name.\nUsage: .copygroup NewGroupName");
    }
    
    try {
      // Get current group metadata
      const groupMetadata = await conn.groupMetadata(from);
      const participants = groupMetadata.participants;
      
      // Filter for owner, sudo, and admin participants
      const specialParticipants = [];
      
      // Get owner numbers from config
      const config = require("../config");
      const ownerNumbers = config.OWNER_NUMBER || [];
      const db = require("../lib/database").getDB();
      const sudoNumbers = db.sudo || [];
      
      for (const participant of participants) {
        const normalizedParticipantJid = normalizeJid(participant.id || participant.lid || participant.phoneNumber || "");
        if (!normalizedParticipantJid) continue;
        const participantNumber = normalizedParticipantJid.split("@")[0];
        
        // Include if owner, sudo, or admin
        const isOwner = ownerNumbers.includes(participantNumber);
        const isSudo = sudoNumbers.includes(participantNumber);
        const isAdmin = participant.admin === "admin" || participant.admin === "superadmin";
        
        if (isOwner || isSudo || isAdmin) {
          specialParticipants.push(normalizedParticipantJid);
        }
      }
      
      // Always include the bot
      const botJid = normalizeJid(conn.user?.id || "");
      if (botJid && !specialParticipants.includes(botJid)) {
        specialParticipants.push(botJid);
      }
      
      if (specialParticipants.length === 0) {
        return reply("No special participants (owner/sudo/admin) found to include.");
      }
      
      reply(`Creating group copy with ${specialParticipants.length} special members...`);
      
      const newGroup = await conn.groupCreate(groupName, specialParticipants);
      
      const successMessage = `Group Copied Successfully\n\n` +
                             `*New Group Name:* ${groupName}\n` +
                             `*New Group ID:* ${newGroup.id}\n` +
                             `*Members Added:* ${specialParticipants.length}\n` +
                             `*Source Group:* ${groupMetadata.subject}\n\n` +
                             `Only owner, sudo, and admin members were copied.`;
      
      await reply(successMessage);
      
      // Send invite link for new group
      try {
        const inviteCode = await conn.groupInviteCode(newGroup.id);
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
        await reply(`New Group Invite: ${inviteLink}`);
      } catch (err) {
        console.error("Failed to get invite code:", err);
      }
      
    } catch (error) {
      console.error("Group copy error:", error);
      await reply(`Failed to copy group: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "groupinfo",
    alias: ["ginfo", "metadata"],
    react: "",
    category: "group",
    desc: "Get group metadata and settings",
    usage: ".groupinfo",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup }) => {
    if (!isGroup) return reply("This command only works in groups.");
    
    try {
      const metadata = await conn.groupMetadata(from);
      const inviteCode = await conn.groupInviteCode(from);
      
      const info = `Group Information\n\n` +
                  `*Name:* ${metadata.subject}\n` +
                  `*ID:* ${metadata.id}\n` +
                  `*Created:* ${metadata.creation}\n` +
                  `*Owner:* ${metadata.owner}\n` +
                  `*Desc:* ${metadata.desc || "No description"}\n` +
                  `*Participants:* ${metadata.participants.length}\n` +
                  `*Admins:* ${metadata.participants.filter(p => p.admin).length}\n` +
                  `*Invite Link:* https://chat.whatsapp.com/${inviteCode}\n` +
                  `*Announcement:* ${metadata.announce ? "Only admins" : "Everyone"}\n` +
                  `*Locked:* ${metadata.restrict ? "Only admins" : "Everyone"}`;
      
      await reply(info);
    } catch (error) {
      console.error("Group info error:", error);
      await reply(`Failed to get group info: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "setsubject",
    alias: ["setname", "gname"],
    react: "",
    category: "group",
    desc: "Update group name",
    usage: ".setsubject New Group Name",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, args, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can change group name.");
    if (!isBotAdmin) return reply("I need to be admin to change group name.");
    
    const newName = args.join(" ");
    if (!newName) return reply("Please provide a new group name.\nUsage: .setsubject New Group Name");
    
    try {
      await conn.groupUpdateSubject(from, newName);
      await reply(`Group name updated to: ${newName}`);
    } catch (error) {
      console.error("Set subject error:", error);
      await reply(`Failed to update group name: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "setdesc",
    alias: ["setdescription", "gdesc"],
    react: "",
    category: "group",
    desc: "Update group description",
    usage: ".setdesc New group description",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, args, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can change group description.");
    if (!isBotAdmin) return reply("I need to be admin to change group description.");
    
    const newDesc = args.join(" ");
    if (!newDesc) return reply("Please provide a new group description.\nUsage: .setdesc New group description");
    
    try {
      await conn.groupUpdateDescription(from, newDesc);
      await reply(`Group description updated successfully.`);
    } catch (error) {
      console.error("Set desc error:", error);
      await reply(`Failed to update group description: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "grouplink",
    alias: ["link", "invite"],
    react: "",
    category: "group",
    desc: "Get group invite link",
    usage: ".grouplink",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can get group link.");
    if (!isBotAdmin) return reply("I need to be admin to get group link.");
    
    try {
      const code = await conn.groupInviteCode(from);
      const link = `https://chat.whatsapp.com/${code}`;
      await reply(`Group Invite Link: ${link}`);
    } catch (error) {
      console.error("Get invite error:", error);
      await reply(`Failed to get invite link: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "revoke",
    alias: ["revokeinvite"],
    react: "",
    category: "group",
    desc: "Revoke group invite link",
    usage: ".revoke",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can revoke invite link.");
    if (!isBotAdmin) return reply("I need to be admin to revoke invite link.");
    
    try {
      await conn.groupRevokeInvite(from);
      await reply("Group invite link revoked successfully.");
    } catch (error) {
      console.error("Revoke error:", error);
      await reply(`Failed to revoke invite link: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "grouponly",
    alias: ["announce"],
    react: "",
    category: "group",
    desc: "Set group to admins only messaging",
    usage: ".grouponly",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can change group settings.");
    if (!isBotAdmin) return reply("I need to be admin to change group settings.");
    
    try {
      await conn.groupSettingUpdate(from, 'announcement');
      await reply("Group set to admins only messaging.");
    } catch (error) {
      console.error("Group only error:", error);
      await reply(`Failed to update group setting: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "groupeveryone",
    alias: ["notannounce"],
    react: "",
    category: "group",
    desc: "Set group to everyone can message",
    usage: ".groupeveryone",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can change group settings.");
    if (!isBotAdmin) return reply("I need to be admin to change group settings.");
    
    try {
      await conn.groupSettingUpdate(from, 'not_announcement');
      await reply("Group set to everyone can message.");
    } catch (error) {
      console.error("Group everyone error:", error);
      await reply(`Failed to update group setting: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "lockgroup",
    alias: ["locked"],
    react: "",
    category: "group",
    desc: "Set group to admins only can edit info",
    usage: ".lockgroup",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can change group settings.");
    if (!isBotAdmin) return reply("I need to be admin to change group settings.");
    
    try {
      await conn.groupSettingUpdate(from, 'locked');
      await reply("Group set to admins only can edit info.");
    } catch (error) {
      console.error("Lock group error:", error);
      await reply(`Failed to update group setting: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "unlockgroup",
    alias: ["unlocked"],
    react: "",
    category: "group",
    desc: "Set group to everyone can edit info",
    usage: ".unlockgroup",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup, isAdmin, isBotAdmin }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isAdmin) return reply("Only admins can change group settings.");
    if (!isBotAdmin) return reply("I need to be admin to change group settings.");
    
    try {
      await conn.groupSettingUpdate(from, 'unlocked');
      await reply("Group set to everyone can edit info.");
    } catch (error) {
      console.error("Unlock group error:", error);
      await reply(`Failed to update group setting: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "join",
    alias: ["acceptinvite"],
    react: "🔗",
    category: "group",
    desc: "Join group by invite code or link",
    usage: ".join invite-code-or-full-link",
    noPrefix: false,
  },
  async (conn, mek, m, { reply, args, isOwner, isSudo }) => {
    if (!isOwner && !isSudo) return reply("Only owners and sudo can join groups via invite.");

    const raw = args.join("").replace("https://chat.whatsapp.com/", "").trim();
    if (!raw) return reply("Please provide an invite code or link.\nUsage: .join invite-code-here");

    try {
      const info = await conn.groupGetInviteInfo(raw);
      await reply(
        `🔍 *Group Preview*\n` +
        `📛 Name: ${info.subject}\n` +
        `👥 Members: ${info.participants.length}\n` +
        `📝 Desc: ${info.desc || "No description"}\n\n` +
        `⏳ Joining...`
      );

      const groupId = await conn.groupAcceptInvite(raw);
      const meta = await conn.groupMetadata(groupId);
      await reply(`✅ Successfully joined *${meta.subject}*\n👥 ${meta.participants.length} members`);
    } catch (error) {
      console.error("Join group error:", error);
      const msg = error.message?.includes("not-authorized")
        ? "Invalid or expired invite link."
        : error.message?.includes("already-exists")
        ? "Bot is already in this group."
        : `Failed to join group: ${error.message}`;
      await reply(`❌ ${msg}`);
    }
  }
);

cmd(
  {
    pattern: "leave",
    alias: ["leavegroup"],
    react: "",
    category: "group",
    desc: "Leave current group",
    usage: ".leave",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup, isOwner, isSudo }) => {
    if (!isGroup) return reply("This command only works in groups.");
    if (!isOwner && !isSudo) return reply("Only owners and sudo can leave groups.");
    
    try {
      await conn.groupLeave(from);
    } catch (error) {
      console.error("Leave group error:", error);
      await reply(`Failed to leave group: ${error.message}`);
    }
  }
);
