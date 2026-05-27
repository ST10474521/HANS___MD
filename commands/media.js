const { cmd } = require("../command");
const { getContext } = require("../lib/newsletter");
const { imageToWebp, videoToWebp, webpToPng, toGif } = require("../lib/media");

// --- Helper to get media message from either quoted or current message ---
function getMediaMessage(mek, quoted) {
  if (quoted) {
    const mtype = quoted.mtype || "";
    const isImage = mtype === "imageMessage" || (mtype === "documentMessage" && quoted.msg?.mimetype?.startsWith("image/"));
    const isVideo = mtype === "videoMessage" || (mtype === "documentMessage" && quoted.msg?.mimetype?.startsWith("video/"));
    const isSticker = mtype === "stickerMessage";
    
    if (isImage || isVideo || isSticker) {
      return {
        download: quoted.download,
        isImage,
        isVideo,
        isSticker,
        msg: quoted.msg
      };
    }
  }
  
  // Check current message
  const msg = mek.message || {};
  const isImage = !!msg.imageMessage;
  const isVideo = !!msg.videoMessage;
  
  if (isImage || isVideo) {
    return {
      download: async () => {
        const { downloadMediaMessage } = require("@whiskeysockets/baileys");
        return downloadMediaMessage(mek, "buffer", {});
      },
      isImage,
      isVideo,
      isSticker: false,
      msg: isImage ? msg.imageMessage : msg.videoMessage
    };
  }
  
  return null;
}

cmd(
  {
    pattern: "tosticker",
    alias: ["s", "sticker"],
    react: "🎨",
    desc: "Convert image or video/gif to a sticker",
    category: "media",
    usage: ".tosticker (reply to image/video or send with caption)",
    noPrefix: false,
  },
  async (conn, mek, m, { from, quoted, reply }) => {
    try {
      const media = getMediaMessage(mek, quoted);
      if (!media) {
        return reply("⚠️ Please reply to an image/video/gif, or send one with the command in the caption.");
      }

      await reply("⏳ *Processing sticker...*");

      const buffer = await media.download();
      if (!buffer || !buffer.length) {
        return reply("❌ Failed to download media.");
      }

      let webpBuffer;
      if (media.isImage) {
        webpBuffer = await imageToWebp(buffer);
      } else if (media.isVideo) {
        webpBuffer = await videoToWebp(buffer);
      } else if (media.isSticker) {
        // Already a sticker, just return it
        webpBuffer = buffer;
      } else {
        return reply("❌ Unsupported media type.");
      }

      await conn.sendMessage(
        from,
        { sticker: webpBuffer },
        { quoted: mek, ...getContext({ title: "Sticker Creator", body: "Hans MD Sticker" }) }
      );
    } catch (err) {
      console.error("[TOSTICKER ERROR]", err);
      reply(`❌ Error converting to sticker: ${err.message}`);
    }
  }
);

cmd(
  {
    pattern: "toimage",
    alias: ["toimg", "img"],
    react: "🖼️",
    desc: "Convert sticker to static image",
    category: "media",
    usage: ".toimage (reply to a sticker)",
    noPrefix: false,
  },
  async (conn, mek, m, { from, quoted, reply }) => {
    try {
      const media = getMediaMessage(mek, quoted);
      if (!media || !media.isSticker) {
        return reply("⚠️ Please reply to a sticker.");
      }

      await reply("⏳ *Converting to image...*");

      const buffer = await media.download();
      if (!buffer || !buffer.length) {
        return reply("❌ Failed to download sticker.");
      }

      const pngBuffer = await webpToPng(buffer);
      
      await conn.sendMessage(
        from,
        { 
          image: pngBuffer, 
          caption: "*Converted to image by HANS MD*" 
        },
        { quoted: mek, ...getContext({ title: "Image Converter", body: "Hans MD Converter" }) }
      );
    } catch (err) {
      console.error("[TOIMAGE ERROR]", err);
      reply(`❌ Error converting to image: ${err.message}`);
    }
  }
);

cmd(
  {
    pattern: "togif",
    alias: ["gif"],
    react: "🎞️",
    desc: "Convert sticker or video to GIF",
    category: "media",
    usage: ".togif (reply to sticker or video)",
    noPrefix: false,
  },
  async (conn, mek, m, { from, quoted, reply }) => {
    try {
      const media = getMediaMessage(mek, quoted);
      if (!media || (!media.isSticker && !media.isVideo)) {
        return reply("⚠️ Please reply to a sticker or a video.");
      }

      await reply("⏳ *Converting to GIF...*");

      const buffer = await media.download();
      if (!buffer || !buffer.length) {
        return reply("❌ Failed to download media.");
      }

      const inputExt = media.isSticker ? "webp" : "mp4";
      const gifBuffer = await toGif(buffer, inputExt);

      await conn.sendMessage(
        from,
        { 
          video: gifBuffer, 
          gifPlayback: true,
          caption: "*Converted to GIF by HANS MD*" 
        },
        { quoted: mek, ...getContext({ title: "GIF Converter", body: "Hans MD Converter" }) }
      );
    } catch (err) {
      console.error("[TOGIF ERROR]", err);
      reply(`❌ Error converting to GIF: ${err.message}`);
    }
  }
);
