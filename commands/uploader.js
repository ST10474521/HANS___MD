const { cmd } = require("../command");
const { getContext } = require("../lib/newsletter");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const os = require("os");
const config = require("../config");

async function apiUpload(buffer, mimetype, provider, extra = {}) {
  const ext = mimetype?.split("/")[1]?.split(";")[0] || "bin";
  const tempPath = path.join(os.tmpdir(), `up_${Date.now()}.${ext}`);
  fs.writeFileSync(tempPath, buffer);

  const form = new FormData();
  form.append("file", fs.createReadStream(tempPath));
  for (const key in extra) {
    form.append(key, extra[key]);
  }

  const { data } = await axios.post(`https://apis.davidcyril.name.ng/uploader/${provider}`, form, {
    headers: form.getHeaders(),
  });

  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  return data;
}

// --- UPLOADER SUITE ---
const uploaders = [
  { pattern: "catbox", provider: "catbox", desc: "Permanent Upload (Catbox)", react: "🖇" },
  { pattern: "litterbox", provider: "litterbox", desc: "Temporary Upload (Litterbox)", react: "🗑" },
  { pattern: "uguu", provider: "uguu", desc: "Temporary Upload (Uguu.se - 24h)", react: "👻" },
  { pattern: "gofile", provider: "gofile", desc: "Permanent Upload (GoFile.io)", react: "📁" },
  { pattern: "tmpfiles", provider: "tmpfiles", desc: "Temporary Upload (Tmpfiles - 1h)", react: "⏳" }
];

uploaders.forEach((u) => {
  cmd({
    pattern: u.pattern,
    alias: [`up${u.pattern}`],
    react: u.react,
    category: "uploader",
    desc: u.desc,
    usage: `.${u.pattern} (reply to media or send with caption)`,
    noPrefix: false,
  }, async (conn, mek, m, { from, quoted, reply }) => {
    try {
      function unwrapMessage(message) {
        if (!message) return null;
        if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
        if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
        if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message);
        if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
        if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
        return message;
      }

      function getMediaMessage(mek, quoted) {
        if (quoted) {
          const mtype = quoted.mtype || "";
          const isImage = mtype === "imageMessage" || (mtype === "documentMessage" && quoted.msg?.mimetype?.startsWith("image/"));
          const isVideo = mtype === "videoMessage" || (mtype === "documentMessage" && quoted.msg?.mimetype?.startsWith("video/"));
          const isAudio = mtype === "audioMessage" || mtype === "pttMessage" || (mtype === "documentMessage" && quoted.msg?.mimetype?.startsWith("audio/"));
          const isSticker = mtype === "stickerMessage";
          
          if (isImage || isVideo || isAudio || isSticker) {
            return {
              download: quoted.download,
              mimetype: quoted.msg?.mimetype || (isImage ? "image/jpeg" : isVideo ? "video/mp4" : isAudio ? "audio/mp4" : "image/webp"),
              isImage,
              isVideo,
              isAudio,
              isSticker
            };
          }
        }
        
        const currentMsg = unwrapMessage(mek.message);
        if (currentMsg) {
          const isImage = !!currentMsg.imageMessage;
          const isVideo = !!currentMsg.videoMessage;
          const isAudio = !!currentMsg.audioMessage;
          
          if (isImage || isVideo || isAudio) {
            return {
              download: async () => {
                const { downloadMediaMessage } = require("@whiskeysockets/baileys");
                return downloadMediaMessage(mek, "buffer", {});
              },
              mimetype: isImage ? currentMsg.imageMessage.mimetype : isVideo ? currentMsg.videoMessage.mimetype : currentMsg.audioMessage.mimetype,
              isImage,
              isVideo,
              isAudio,
              isSticker: false
            };
          }
        }
        
        return null;
      }

      const media = getMediaMessage(mek, quoted);
      if (!media) {
        return reply(`╭━〔 *DENIED* 〕━╮\n┃ 🔎 *Crit:* No physical media.\n┃ 💡 *Help:* Reply to any media or send with the command in the caption.\n╰━━━━━━━━━━━━━━━━╯`);
      }

      await reply(`╭━═『 *UPLOADING* 』━╮\n┃ 📡 *Provider:* ${u.provider.toUpperCase()}\n┃ ⏳ *Status:* Pushing to cloud...\n╰━━━━━━━━━━━━━━━━╯`);

      const buffer = await media.download();
      const data = await apiUpload(buffer, media.mimetype, u.provider);

      if (!data.success) return reply(`❌ *Failed to upload to ${u.provider}.*`);

      const txt = `
╭━═ 『 *LINK READY* 』 ═━╮
┃ 📂 *Provider:* ${data.provider || u.provider}
┃ 🔗 *URL:* ${data.url}
┃ ⏳ *Expires:* ${data.expires || "Permanent"}
╰━━━━━━━━━━━━━━━━━━╯

🚀 *${config.BOT_NAME} — Infinite Storage.*
`.trim();

      await reply(txt, { title: "Cloud Intelligence", body: "Upload session complete" });

    } catch (err) {
      console.error(`${u.pattern.toUpperCase()} ERROR:`, err);
      reply(`❌ Error uploading to ${u.provider}.`);
    }
  });
});
