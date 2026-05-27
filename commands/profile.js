const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");

function getCountryFromPhone(phone) {
  const codes = {
    '27': '🇿🇦 South Africa', '1': '🇺🇸 USA/Canada',
    '44': '🇬🇧 UK', '91': '🇮🇳 India', '234': '🇳🇬 Nigeria',
    '254': '🇰🇪 Kenya', '255': '🇹🇿 Tanzania', '256': '🇺🇬 Uganda',
    '233': '🇬🇭 Ghana', '237': '🇨🇲 Cameroon', '55': '🇧🇷 Brazil',
    '62': '🇮🇩 Indonesia', '60': '🇲🇾 Malaysia', '63': '🇵🇭 Philippines',
    '92': '🇵🇰 Pakistan', '880': '🇧🇩 Bangladesh',
  };
  for (const [code, country] of Object.entries(codes)) {
    if (phone.startsWith(code)) return country;
  }
  return '🌍 Unknown';
}

async function fetchUserInfo(conn, jid) {
  const info = { jid };

  // Profile picture (high res, fallback to low res)
  info.pp = await conn.profilePictureUrl(jid, 'image').catch(
    () => conn.profilePictureUrl(jid).catch(() => null)
  );

  // About / status text
  try {
    const s = await conn.fetchStatus(jid);
    info.status = s?.status || '(no status set)';
    info.statusSetAt = s?.setAt ? new Date(s.setAt * 1000).toLocaleString() : null;
  } catch { info.status = '(private or none)'; }

  // Verify number exists on WA
  try {
    const phone = jid.replace('@s.whatsapp.net', '');
    const [res] = await conn.onWhatsApp(phone);
    info.exists   = res?.exists ?? true;
    info.waId     = res?.jid ?? jid;
    info.isBiz    = res?.isBusiness ?? false;
  } catch { info.exists = true; }

  // Business profile (if applicable)
  try {
    const biz = await conn.getBusinessProfile(jid);
    if (biz) {
      info.bizDescription = biz.description || null;
      info.bizCategory    = biz.category || null;
      info.bizEmail       = biz.email || null;
      info.bizWebsite     = biz.website?.[0] || null;
    }
  } catch {}

  // Extract phone number & country
  const phone = jid.replace('@s.whatsapp.net', '').split('@')[0];
  info.phone   = '+' + phone;
  info.country = getCountryFromPhone(phone);

  return info;
}

function formatStalkText(info, label = 'User Info') {
  return `╭─── 🔍 *${label}* ───
│
│ 📱 *Phone:* ${info.phone}
│ 🌍 *Country:* ${info.country}
│ 🆔 *JID:* ${info.jid}
│ ✅ *On WhatsApp:* ${info.exists ? 'Yes' : 'No'}
│ 💼 *Business:* ${info.isBiz ? 'Yes' : 'No'}
│
│ 📝 *About:* ${info.status}
${info.statusSetAt ? `│ 🕐 *Set at:* ${info.statusSetAt}\n` : ''}${info.bizCategory ? `│ 🏷️ *Category:* ${info.bizCategory}\n` : ''}${info.bizDescription ? `│ 📋 *Biz Desc:* ${info.bizDescription}\n` : ''}${info.bizEmail ? `│ 📧 *Email:* ${info.bizEmail}\n` : ''}${info.bizWebsite ? `│ 🌐 *Website:* ${info.bizWebsite}\n` : ''}│
│ 🖼️ *Profile Pic:* ${info.pp ? 'Available' : 'Private/None'}
╰─────────────────────`;
}

cmd(
  {
    pattern: "setname",
    alias: ["updatename", "profilename"],
    react: "",
    category: "owner",
    desc: "Update bot profile name",
    usage: ".setname New Name",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, args, isOwner, isSudo }) => {
    if (!isOwner && !isSudo) return reply("Only owners and sudo can update profile name.");
    
    const newName = args.join(" ");
    if (!newName) return reply("Please provide a new name.\nUsage: .setname New Name");
    
    try {
      await conn.updateProfileName(newName);
      await reply(`Profile name updated to: ${newName}`);
    } catch (error) {
      console.error("Set name error:", error);
      await reply(`Failed to update profile name: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "setstatus",
    alias: ["updatestatus", "profilestatus"],
    react: "",
    category: "owner",
    desc: "Update bot profile status",
    usage: ".setstatus My new status",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, args, isOwner, isSudo }) => {
    if (!isOwner && !isSudo) return reply("Only owners and sudo can update profile status.");
    
    const newStatus = args.join(" ");
    if (!newStatus) return reply("Please provide a new status.\nUsage: .setstatus My new status");
    
    try {
      await conn.updateProfileStatus(newStatus);
      await reply(`Profile status updated to: ${newStatus}`);
    } catch (error) {
      console.error("Set status error:", error);
      await reply(`Failed to update profile status: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "setpp",
    alias: ["updatepp", "profilepicture"],
    react: "",
    category: "owner",
    desc: "Update bot profile picture",
    usage: ".setpp (reply to image)",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, quoted, isOwner, isSudo }) => {
    if (!isOwner && !isSudo) return reply("Only owners and sudo can update profile picture.");
    if (!quoted) return reply("Please reply to an image to set as profile picture.");
    
    try {
      const messageType = quoted.type || quoted.mtype;
      if (!messageType.includes("image")) {
        return reply("Please reply to an image file.");
      }
      
      // Download the image
      const imageBuffer = await quoted.download();
      if (!imageBuffer || !imageBuffer.length) {
        return reply("Failed to download image.");
      }
      
      // Update profile picture
      await conn.updateProfilePicture(conn.user.id, imageBuffer);
      await reply("Profile picture updated successfully!");
      
    } catch (error) {
      console.error("Set PP error:", error);
      await reply(`Failed to update profile picture: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "removepp",
    alias: ["deletepp", "removeprofilepicture"],
    react: "",
    category: "owner",
    desc: "Remove bot profile picture",
    usage: ".removepp",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isOwner, isSudo }) => {
    if (!isOwner && !isSudo) return reply("Only owners and sudo can remove profile picture.");
    
    try {
      await conn.removeProfilePicture(conn.user.id);
      await reply("Profile picture removed successfully!");
    } catch (error) {
      console.error("Remove PP error:", error);
      await reply(`Failed to remove profile picture: ${error.message}`);
    }
  }
);

// ── LID → PN resolver ────────────────────────────────────────────────────────
async function resolveToPN(conn, jid) {
  if (!jid) return null;
  if (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@g.us")) return jid;

  if (jid.endsWith("@lid")) {
    console.log("[resolveToPN] LID detected:", jid, "— attempting resolution");

    // Try v7 lidMapping store first
    try {
      const store = conn?.signalRepository?.lidMapping;
      if (store && typeof store.getPNForLID === "function") {
        const pn = await store.getPNForLID(jid);
        console.log("[resolveToPN] lidMapping.getPNForLID result:", pn);
        if (pn && pn.endsWith("@s.whatsapp.net")) return pn;
      } else {
        console.log("[resolveToPN] lidMapping store or getPNForLID not available");
      }
    } catch (e) {
      console.error("[resolveToPN] lidMapping lookup failed:", e.message);
    }

    // Fallback: scan contacts cache
    try {
      const contacts = conn?.store?.contacts || conn?.contacts || {};
      const keys = Object.keys(contacts);
      console.log("[resolveToPN] Scanning contacts cache, total entries:", keys.length);
      for (const [phoneJid, contact] of Object.entries(contacts)) {
        if (contact?.lid === jid || contact?.id === jid) {
          if (phoneJid.endsWith("@s.whatsapp.net")) {
            console.log("[resolveToPN] Found via contacts cache:", phoneJid);
            return phoneJid;
          }
        }
      }
      console.log("[resolveToPN] Not found in contacts cache.");
    } catch (e) {
      console.error("[resolveToPN] Contacts scan failed:", e.message);
    }

    return null; // unresolvable
  }
  return jid;
}

cmd(
  {
    pattern: "getpp",
    alias: ["pp", "profilepic"],
    react: "🖼️",
    category: "general",
    desc: "Get profile picture of a user or group.",
    usage: ".getpp [@mention | reply | number | blank=group/DM partner]",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, args, mentionedJid, quoted, isGroup }) => {
    let targetJid = null;
    let label = "";

    const { getContentType } = require("@whiskeysockets/baileys");
    const rawType = getContentType(mek.message);
    const ctx = rawType ? mek.message?.[rawType]?.contextInfo : null;

    // Inline LID→PN resolver using v7 official lidMapping API
    const resolveToPN = async (jid) => {
      if (!jid) return null;
      if (jid.endsWith("@s.whatsapp.net")) return jid;

      const bare = jid.includes(":") ? jid.split(":")[0] + "@lid" : jid;

      if (bare.endsWith("@lid")) {
        try {
          const pn = await conn.signalRepository?.lidMapping?.getPNForLID?.(bare);
          if (pn) {
            const normalized = pn.includes(":")
              ? pn.split(":")[0] + "@s.whatsapp.net"
              : pn;
            console.log(`[getpp] resolveToPN: ${jid} → ${normalized}`);
            return normalized;
          }
        } catch (e) {
          console.warn("[getpp] getPNForLID failed:", e.message);
        }
        console.warn("[getpp] unresolvable LID:", bare);
        return null;
      }

      return jid;
    };

    if (quoted?.sender) {
      // v7: participantAlt = PN when participant is LID (groups)
      //     remoteJidAlt   = PN when remoteJid is LID (DMs)
      const altPn = ctx?.participantAlt || ctx?.remoteJidAlt;
      const raw = altPn || quoted.sender;
      console.log("[getpp] quoted path — raw:", raw, "| altPn:", altPn);
      targetJid = await resolveToPN(raw);
      label = "Replied User";

    } else if (Array.isArray(mentionedJid) && mentionedJid.length > 0) {
      const raw = mentionedJid[0];
      console.log("[getpp] mention path — raw:", raw);
      targetJid = await resolveToPN(raw);
      label = "Mentioned User";

    } else if (args[0] && /^\d{7,15}$/.test(args[0].trim())) {
      targetJid = `${args[0].trim()}@s.whatsapp.net`;
      label = "User";
      console.log("[getpp] number path — jid:", targetJid);

    } else if (isGroup) {
      targetJid = from;
      label = "Group";
      console.log("[getpp] group path — jid:", targetJid);

    } else {
      targetJid = await resolveToPN(from);
      label = "Chat Partner";
      console.log("[getpp] DM path — jid:", targetJid);
    }

    console.log("[getpp] resolved targetJid:", targetJid, "| label:", label);

    if (!targetJid || targetJid.endsWith("@lid")) {
      return reply(
        "❌ Can't fetch the profile picture — WhatsApp is hiding this user's phone number (LID privacy).\n\n" +
        "💡 Ask them to send a message directly to the bot first, then try again."
      );
    }

    try {
      // Two-attempt fetch: high-res → low-res on transient not-authorized
      let ppUrl = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          ppUrl = await conn.profilePictureUrl(targetJid, attempt === 1 ? "image" : undefined);
          break;
        } catch (e) {
          console.warn(`[getpp] attempt ${attempt} failed:`, e.message);
        }
      }

      if (!ppUrl) {
        return reply(`❌ No profile picture found for *${label}* (private or not set).`);
      }

      await conn.sendMessage(
        from,
        { image: { url: ppUrl }, caption: `🖼️ *Profile Picture — ${label}*` },
        { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Profile Picture", body: label }) }
      );
      console.log("[getpp] ✅ sent for:", targetJid);

    } catch (err) {
      console.error("[getpp] unexpected error:", err.message);
      await reply(`❌ Failed to get profile picture: ${err.message}`);
    }
  }
);

cmd(
  {
    pattern: "gcpp",
    alias: ["grouppp", "groupprofilepic"],
    react: "🖼️",
    category: "general",
    desc: "Get group profile picture",
    usage: ".gcpp",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, isGroup }) => {
    if (!isGroup) return reply("❌ This command only works in groups.");
    
    try {
      const ppUrl = await conn.profilePictureUrl(from, 'image').catch(
        () => conn.profilePictureUrl(from).catch(() => null)
      );

      if (!ppUrl) {
        return reply("❌ No profile picture found for this group.");
      }

      await conn.sendMessage(from, {
        image: { url: ppUrl },
        caption: "🖼️ *Group Profile Picture*"
      }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Group PP", body: "Group profile picture" }) });

    } catch (error) {
      console.error("Group PP error:", error);
      await reply(`❌ Failed to get group profile picture: ${error.message}`);
    }
  }
);

cmd(
  {
    pattern: "stalk",
    alias: ["whois"],
    react: "🔍",
    category: "general",
    desc: "Stalk a user to fetch all public WA info",
    usage: ".stalk @user | .stalk (reply to user)",
    noPrefix: false,
  },
  async (conn, mek, m, { from, args, mentionedJid, quoted, isGroup, reply }) => {
    let targetJid = null;

    if (quoted && quoted.sender) {
      targetJid = quoted.sender;
    } else if (Array.isArray(mentionedJid) && mentionedJid.length > 0) {
      targetJid = mentionedJid[0];
    } else if (args[0] && /^\d+$/.test(args[0].trim())) {
      targetJid = `${args[0].trim()}@s.whatsapp.net`;
    } else if (!isGroup) {
      targetJid = from;
    } else {
      targetJid = m.sender;
    }

    try {
      const info = await fetchUserInfo(conn, targetJid);
      const caption = formatStalkText(info, "User Info");

      if (info.pp) {
        await conn.sendMessage(from, {
          image: { url: info.pp },
          caption
        }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "User Stalk", body: info.phone }) });
      } else {
        await reply(caption);
      }
    } catch (e) {
      console.error("Stalk error:", e);
      await reply("❌ Failed to fetch info: " + e.message);
    }
  }
);

cmd(
  {
    pattern: "whoami",
    react: "🪞",
    category: "general",
    desc: "Stalk yourself to show your public info",
    usage: ".whoami",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply }) => {
    try {
      const targetJid = m.sender;
      const info = await fetchUserInfo(conn, targetJid);
      const caption = formatStalkText(info, "Who Are You?");

      if (info.pp) {
        await conn.sendMessage(from, {
          image: { url: info.pp },
          caption
        }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "Self Stalk", body: info.phone }) });
      } else {
        await reply(caption);
      }
    } catch (e) {
      console.error("Whoami error:", e);
      await reply("❌ Failed to fetch info: " + e.message);
    }
  }
);

cmd(
  {
    pattern: "mypp",
    alias: ["myprofilepic"],
    react: "",
    category: "general",
    desc: "Get your own profile picture",
    usage: ".mypp",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, conn: socket }) => {
    try {
      const ppUrl = await socket.profilePictureUrl(socket.user.id, 'image');
      
      if (ppUrl) {
        // Send the profile picture as image
        await conn.sendMessage(from, {
          image: { url: ppUrl }
        }, { quoted: mek, ...require("../lib/newsletter").getContext({ title: "My Profile Picture", body: "Bot profile picture" }) });
      } else {
        await reply("You don't have a profile picture set.");
      }
    } catch (error) {
      console.error("Get my PP error:", error);
      await reply("You don't have a profile picture set.");
    }
  }
);

cmd(
  {
    pattern: "profile",
    alias: ["myprofile", "about"],
    react: "",
    category: "general",
    desc: "Show your profile information",
    usage: ".profile",
    noPrefix: false,
  },
  async (conn, mek, m, { from, reply, conn: socket, pushname }) => {
    try {
      const botInfo = socket.user;
      const ppUrl = await socket.profilePictureUrl(socket.user.id, 'image').catch(() => null);
      
      const profileInfo = `My Profile\n\n` +
                         `Name: ${botInfo.name || botInfo.verifiedName || "Unknown"}\n` +
                         `Number: ${botInfo.id.split('@')[0]}\n` +
                         `Pushname: ${pushname || "Unknown"}\n` +
                         `Status: ${botInfo.status || "No status"}\n` +
                         `Profile Picture: ${ppUrl ? "Available" : "Not set"}\n` +
                         `Verified: ${botInfo.verified ? "Yes" : "No"}\n` +
                         `Platform: ${botInfo.platform || "Unknown"}`;
      
      await reply(profileInfo);
      
      if (ppUrl) {
        await reply(`Profile Picture URL: ${ppUrl}`);
      }
    } catch (error) {
      console.error("Profile error:", error);
      await reply(`Failed to get profile information: ${error.message}`);
    }
  }
);
