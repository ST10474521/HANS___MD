const { cmd } = require("../command");
const { getContext } = require("../lib/newsletter");
const { uploadToCatbox } = require("../lib/catbox");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const axios = require("axios");
const config = require("../config");

function getMediaMessage(mek, quoted) {
  function unwrapMessage(message) {
    if (!message) return null;
    if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
    if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
    if (message.viewOnceMessageV2Extension?.message) return unwrapMessage(message.viewOnceMessageV2Extension.message);
    if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
    if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
    return message;
  }

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

// --- IMAGE SCANNER ---
cmd({
  pattern: "imgscan",
  alias: ["identify", "searchimg"],
  react: "🔍",
  category: "tools",
  desc: "Identify/Scan an image via AI",
  usage: ".imgscan (reply to image or send with caption)",
  noPrefix: false,
}, async (conn, mek, m, { from, quoted, reply }) => {
  try {
    const media = getMediaMessage(mek, quoted);
    if (!media || !media.isImage) return reply("❌ Please reply to or attach an image.");

    await reply("╭━═ 『 *SCANNING* 』 ═━╮\n┃ 📡 *Mode:* AI Identification\n┃ ⏳ *Status:* Deep Analysis...\n╰━━━━━━━━━━━━━━━━╯");

    const buffer = await media.download();
    const imageUrl = await uploadToCatbox(buffer, media.mimetype);
    const url = `https://apis.davidcyril.name.ng/imgscan?url=${encodeURIComponent(imageUrl)}`;
    const { data } = await axios.get(url);

    if (!data.success) return reply("❌ Image scan failed.");

    const txt = `
╭━═ 『 *SCAN RESULT* 』 ═━╮
┃ 📄 *Data:* AI Insight
╰━━━━━━━━━━━━━━━━━━╯

${data.result}

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Vision Core", body: "Identification Success" });

  } catch (err) {
    console.error("IMGSCAN ERROR:", err);
    reply("❌ Vision Core Error.");
  }
});

// --- REMINI (ENHANCE) ---
cmd({
  pattern: "remini",
  alias: ["enhance", "hd", "upscale"],
  react: "✨",
  category: "tools",
  desc: "Enhance image quality (HD)",
  usage: ".remini (reply to image or send with caption)",
  noPrefix: false,
}, async (conn, mek, m, { from, quoted, reply }) => {
  try {
    const media = getMediaMessage(mek, quoted);
    if (!media || !media.isImage) return reply("❌ Please reply to or attach an image.");

    await reply("╭━═ 『 *ENHANCING* 』 ═━╮\n┃ 📡 *Mode:* HD Restoration\n┃ ⏳ *Status:* Processing...\n╰━━━━━━━━━━━━━━━━━╯");

    const buffer = await media.download();
    const imageUrl = await uploadToCatbox(buffer, media.mimetype);
    const url = `https://apis.davidcyril.name.ng/remini?url=${encodeURIComponent(imageUrl)}`;

    await conn.sendMessage(from, {
      image: { url: url },
      caption: `╭━═『 *ENHANCED HD* 』━╮\n┃ ✨ *Quality:* Masterpiece\n╰━━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
      contextInfo: getContext({ title: "Visual Mastery", body: "HD Restoration Complete" })
    }, { quoted: mek });

  } catch (err) {
    console.error("REMINI ERROR:", err);
    reply("❌ Enhancement Engine Failure.");
  }
});

// --- RM BG ---
cmd({
  pattern: "rmbg",
  alias: ["removebg", "nobg"],
  react: "✂️",
  category: "tools",
  desc: "Remove image background",
  usage: ".rmbg (reply to image or send with caption)",
  noPrefix: false,
}, async (conn, mek, m, { from, quoted, reply }) => {
  try {
    const media = getMediaMessage(mek, quoted);
    if (!media || !media.isImage) return reply("❌ Please reply to or attach an image.");

    await reply("╭━═ 『 *REMOVING* 』 ═━╮\n┃ 📡 *Mode:* Background Cut\n┃ ⏳ *Status:* Cleaning...\n╰━━━━━━━━━━━━━━━━━╯");

    const buffer = await media.download();
    const imageUrl = await uploadToCatbox(buffer, media.mimetype);
    const primaryUrl = `https://apis.davidcyril.name.ng/removebg?url=${encodeURIComponent(imageUrl)}`;

    try {
      await conn.sendMessage(from, {
        image: { url: primaryUrl },
        caption: `╭━═『 *BG REMOVED* 』━╮\n┃ ✂️ *Mode:* Transparent\n╰━━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
        contextInfo: getContext({ title: "Visual Clean", body: "Background Decoupled" })
      }, { quoted: mek });
    } catch (primaryErr) {
      console.error("RMBG PRIMARY FAILED, TRYING FALLBACK:", primaryErr.message);
      const fallbackUrl = `https://api.giftedtech.co.ke/api/tools/removebg?apikey=gifted&url=${encodeURIComponent(imageUrl)}`;
      const { data } = await axios.get(fallbackUrl);
      if (!data.success || !data.result?.image_url) throw new Error("Fallback failed");
      await conn.sendMessage(from, {
        image: { url: data.result.image_url },
        caption: `╭━═『 *BG REMOVED* 』━╮\n┃ ✂️ *Mode:* Transparent\n┃ 📐 *Size:* ${data.result.original_width}x${data.result.original_height}\n╰━━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
        contextInfo: getContext({ title: "Visual Clean", body: "Background Decoupled" })
      }, { quoted: mek });
    }

  } catch (err) {
    console.error("RMBG ERROR:", err);
    reply("❌ Background Removal Core Offline.");
  }
});

// --- SSWEB ---
cmd({
  pattern: "ssweb",
  alias: ["screenshot", "ss"],
  react: "📸",
  category: "tools",
  desc: "Take a screenshot of a website",
  usage: ".ssweb [url]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide a URL. Usage: .ssweb google.com");

    const targetUrl = q.startsWith("http") ? q : `https://${q}`;
    const url = `https://apis.davidcyril.name.ng/ssweb?url=${encodeURIComponent(targetUrl)}`;

    await conn.sendMessage(from, {
      image: { url: url },
      caption: `╭━═ 『 *SS WEB* 』 ═━╮\n┃ 🌐 *URL:* ${targetUrl}\n╰━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
      contextInfo: getContext({ title: "Web Archive", body: "Screenshot Captured" })
    }, { quoted: mek });

  } catch (err) {
    console.error("SSWEB ERROR:", err);
    reply("❌ Screenshot failure.");
  }
});

// --- QR CODE ---
cmd({
  pattern: "qrcode",
  alias: ["qr"],
  react: "🏁",
  category: "tools",
  desc: "Generate a QR Code",
  usage: ".qrcode [text]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! What text/URL for the QR? Usage: .qrcode https://google.com");

    const url = `https://apis.davidcyril.name.ng/tools/qrcode?text=${encodeURIComponent(q)}`;

    await conn.sendMessage(from, {
      image: { url: url },
      caption: `╭━═ 『 *QR CODE* 』 ═━╮\n┃ 📑 *Data:* Link Ready\n╰━━━━━━━━━━━━━━╯\n\n*HANS MD — Infinite Matrix.*`,
      contextInfo: getContext({ title: "Matrix Core", body: "QR Code Generated" })
    }, { quoted: mek });

  } catch (err) {
    console.error("QR ERROR:", err);
    reply("❌ QR Generation failed.");
  }
});

// --- TRANSLATE ---
cmd({
  pattern: "translate",
  alias: ["trt"],
  react: "🌍",
  category: "tools",
  desc: "Translate text using Google Translate",
  usage: ".translate [lang] [text]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Usage: .tr fr Hello world");

    const args = q.split(" ");
    const lang = args[0];
    const text = args.slice(1).join(" ");

    if (!lang || !text) return reply("❌ Usage: .translate [lang_code] [text]");

    const url = `https://apis.davidcyril.name.ng/tools/translate?text=${encodeURIComponent(text)}&to=${lang}`;
    const { data } = await axios.get(url);

    if (!data.success) return reply("❌ Translation failed.");

    const txt = `
╭━═ 『 *TRANSLATED* 』 ═━╮
┃ 🌎 *From:* Detect
┃ 🌍 *To:* ${data.language}
╰━━━━━━━━━━━━━━━━━━╯

📝 *ORIGINAL:*
${data.original_text}

✨ *RESULT:*
${data.translated_text}

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Linguistic Core", body: `Translated to ${data.language}` });

  } catch (err) {
    console.error("TRANSLATE ERROR:", err);
    reply("❌ Linguistic core failure.");
  }
});

// --- CALCULATE ---
cmd({
  pattern: "calc",
  alias: ["calculate", "math"],
  react: "🔢",
  category: "tools",
  desc: "Perform mathematical calculations",
  usage: ".calc [expression]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Give me a math problem. Usage: .calc 2+2*5");

    const url = `https://apis.davidcyril.name.ng/tools/calculate?expr=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.success) return reply("❌ Calculation failed.");

    const txt = `
╭━═ 『 *SOLVED* 』 ═━╮
┃ 🔢 *Expr:* ${data.expression}
┃ ✅ *Result:* ${data.result}
╰━━━━━━━━━━━━━━━╯

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Math Engine", body: "Accuracy Guaranteed" });

  } catch (err) {
    console.error("CALC ERROR:", err);
    reply("❌ Math core failure.");
  }
});

// --- WEATHER ---
cmd({
  pattern: "weather",
  react: "☁️",
  category: "tools",
  desc: "Get weather information for a city",
  usage: ".weather [city]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Which city? Usage: .weather Douala");

    const url = `https://apis.davidcyril.name.ng/weather?city=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.success) return reply("❌ Weather data unavailable for this city.");

    const w = data.data;
    const txt = `
╭━═ 『 *WEATHER* 』 ═━╮
┃ 📍 *City:* ${w.location}, ${w.country}
┃ 🌡️ *Temp:* ${w.temperature}
┃ 🌦️ *Desc:* ${w.description}
┃ 💧 *Humidity:* ${w.humidity}
┃ 💨 *Wind:* ${w.wind_speed}
╰━━━━━━━━━━━━━━━━━━╯

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: `${w.location} Weather`, body: w.description });

  } catch (err) {
    console.error("WEATHER ERROR:", err);
    reply("❌ Meteorological core failure.");
  }
});

// --- IMDB ---
cmd({
  pattern: "imdb",
  react: "🎬",
  category: "tools",
  desc: "Search movie details on IMDB",
  usage: ".imdb [movie name]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! What movie? Usage: .imdb iron man");

    const url = `https://apis.davidcyril.name.ng/imdb?query=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.status) return reply("❌ Movie not found on IMDB.");

    const mv = data.movie;
    const txt = `
╭━═ 『 *IMDB DATA* 』 ═━╮
┃ 🎬 *Title:* ${mv.title} (${mv.year})
┃ ⭐ *Rating:* ${mv.imdbRating}
┃ 🎭 *Genre:* ${mv.genres}
┃ ⏳ *Run:* ${mv.runtime}
┃ 🌍 *Lang:* ${mv.languages}
╰━━━━━━━━━━━━━━━━━━╯

📝 *PLOT:*
${mv.plot.substring(0, 300)}...

🌟 *ACTORS:*
${mv.actors}

🚀 *${config.BOT_NAME}*
`.trim();

    await conn.sendMessage(from, {
      image: { url: mv.poster },
      caption: txt,
      contextInfo: getContext({ title: mv.title, body: "IMDB Intelligence Profile", thumb: mv.poster })
    }, { quoted: mek });

  } catch (err) {
    console.error("IMDB ERROR:", err);
    reply("❌ IMDB search aborted.");
  }
});

// --- OBFUSCATE ---
cmd({
  pattern: "obfuscate",
  alias: ["obf", "crypt"],
  react: "🔐",
  category: "tools",
  desc: "Obfuscate JavaScript code",
  usage: ".obfuscate [code]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide JS code to lock. Usage: .obf console.log('hi');");

    const url = `https://apis.davidcyril.name.ng/obfuscate?code=${encodeURIComponent(q)}&level=medium`;
    const { data } = await axios.get(url);

    if (!data.success) return reply("❌ Obfuscation failed.");

    const txt = `
╭━═『 *CODE LOCKED* 』━╮
┃ 📡 *Method:* High Cipher
╰━━━━━━━━━━━━━━━━━━╯

\`\`\`javascript
${data.result.obfuscated_code.code}
\`\`\`

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Cipher Core", body: "JavaScript Protected" });

  } catch (err) {
    console.error("OBF ERROR:", err);
    reply("❌ Encryption failure.");
  }
});

// --- AI TEXT DETECTOR ---
cmd({
  pattern: "aidetect",
  alias: ["isai", "scanai"],
  react: "🤖",
  category: "tools",
  desc: "Detect if a text is AI generated",
  usage: ".aidetect [text]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Paste text to scan.");

    const url = `https://apis.davidcyril.name.ng/api/detect?text=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (data.error) return reply("❌ Detection failed.");

    const r = data.result;
    const txt = `
╭━═ 『 *AI DETECTOR* 』 ═━╮
┃ 🤖 *AI Score:* ${r.ai_percent}
┃ 👤 *Human:* ${r.human_percent}
╰━━━━━━━━━━━━━━━━━━╯

*STATUS:* ${parseFloat(r.ai_percent) > 50 ? "AI GENERATED 🤖" : "HUMAN WRITTEN 👤"}

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Turing Test", body: "Text Analysis Complete" });

  } catch (err) {
    console.error("AIDETECT ERROR:", err);
    reply("❌ Detection Core Offline.");
  }
});

// --- RELIGION (QURAN & BIBLE) ---
cmd({
  pattern: "quran",
  react: "📖",
  category: "religion",
  desc: "Fetch Quran surah data",
  usage: ".quran [surah number]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Surah number? Usage: .quran 1");

    const url = `https://apis.davidcyril.name.ng/quran?surah=${q}`;
    const { data } = await axios.get(url);

    if (!data.success) return reply("❌ Surah not found.");

    const s = data.surah;
    const txt = `
╭━═ 『 *QURAN* 』 ═━╮
┃ 🕋 *Surah:* ${s.name.arabic}
┃ 📖 *English:* ${s.name.english}
┃ 📜 *Type:* ${s.type}
┃ ✍️ *Ayahs:* ${s.ayahCount}
╰━━━━━━━━━━━━━━━╯

📝 *TAFSIR:*
${s.tafsir.id.substring(0, 500)}...

🚀 *${config.BOT_NAME}*
`.trim();

    await conn.sendMessage(from, {
      audio: { url: s.recitation },
      mimetype: "audio/mpeg",
      caption: txt,
      contextInfo: getContext({ title: s.name.english, body: "Al-Quran Recitation Active" })
    }, { quoted: mek });

    await reply(txt);

  } catch (err) {
    console.error("QURAN ERROR:", err);
    reply("❌ Quran core retrieval failed.");
  }
});

cmd({
  pattern: "bible",
  react: "✝️",
  category: "religion",
  desc: "Fetch Bible verses",
  usage: ".bible [reference]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Which verse? Usage: .bible john 3:16");

    const url = `https://apis.davidcyril.name.ng/bible?reference=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.success) return reply("❌ Verse not found.");

    const txt = `
╭━═ 『 *BIBLE* 』 ═━╮
┃ 📖 *Ref:* ${data.reference}
┃ 🌍 *Trans:* ${data.translation}
╰━━━━━━━━━━━━━━━╯

"${data.text.trim()}"

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: data.reference, body: "Holy Scripture Retrieval" });

  } catch (err) {
    console.error("BIBLE ERROR:", err);
    reply("❌ Bible core retrieval failed.");
  }
});

// --- GIFTEDTECH TOOLS ---

cmd({
  pattern: "encryptv3",
  alias: ["jsencrypt", "obfv3"],
  react: "🔒",
  category: "tools",
  desc: "Encrypt JavaScript code v3",
  usage: ".encryptv3 [code]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide JS code to encrypt. Usage: .encryptv3 console.log('hello');");

    const url = `https://api.giftedtech.co.ke/api/tools/encryptv3?apikey=gifted&code=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.success || !data.result) return reply("❌ Encryption failed.");

    const txt = `
╭━═『 *JS ENCRYPTED V3* 』━╮
┃ 🔒 *Method:* High Cipher
╰━━━━━━━━━━━━━━━━━━╯

\`\`\`javascript
${data.result.encrypted_code || data.result}
\`\`\`

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Cipher Core V3", body: "JavaScript Protected" });
  } catch (err) {
    console.error("ENCRYPTV3 ERROR:", err);
    reply("❌ Encryption V3 failure.");
  }
});

cmd({
  pattern: "htmlobfuscate",
  alias: ["htmlenc", "htmlobf"],
  react: "🛡️",
  category: "tools",
  desc: "Obfuscate HTML code",
  usage: ".htmlobfuscate [html]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide HTML to obfuscate. Usage: .htmlobfuscate <h1>Hello</h1>");

    const url = `https://api.giftedtech.co.ke/api/tools/htmlobfuscate?apikey=gifted&html=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.success || !data.result?.obfuscated) return reply("❌ HTML obfuscation failed.");

    let obfuscated = data.result.obfuscated;
    // Remove gifted tech prefix comment if present
    obfuscated = obfuscated.replace(/<!--\s*GIFTED-TECH@?\d{4}(-\d{4})?\s*-->/gi, "").trim();

    const txt = `
╭━═『 *HTML OBFUSCATED* 』━╮
┃ 📏 *Original:* ${data.result.originalLength} chars
┃ 🔐 *Obfuscated:* ${data.result.length} chars
╰━━━━━━━━━━━━━━━━━━╯

\`\`\`html
${obfuscated.substring(0, 3000)}
\`\`\`
${obfuscated.length > 3000 ? "\n... (truncated)" : ""}

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "HTML Shield", body: "Code obfuscated successfully" });
  } catch (err) {
    console.error("HTMLOBF ERROR:", err);
    reply("❌ HTML obfuscation failure.");
  }
});

cmd({
  pattern: "base64",
  alias: ["b64"],
  react: "🔡",
  category: "tools",
  desc: "Base64 encode or decode text",
  usage: ".base64 encode [text] or .base64 decode [text]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Usage: .base64 encode hello world\nOr: .base64 decode aGVsbG8=");

    const args = q.trim().split(" ");
    const mode = args[0].toLowerCase();
    const text = args.slice(1).join(" ");

    if (!["encode", "decode"].includes(mode)) {
      return reply("❌ Usage: .base64 encode [text] or .base64 decode [text]");
    }
    if (!text) return reply("❌ Please provide text to encode/decode.");

    let result;
    if (mode === "encode") {
      result = Buffer.from(text).toString("base64");
    } else {
      result = Buffer.from(text, "base64").toString("utf8");
    }

    const txt = `
╭━═『 *BASE64 ${mode.toUpperCase()}* 』━╮
┃ 📄 *Input:* ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}
╰━━━━━━━━━━━━━━━━━━╯

\`\`\`
${result}
\`\`\`

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: `Base64 ${mode}`, body: "Operation successful" });
  } catch (err) {
    console.error("BASE64 ERROR:", err);
    reply("❌ Base64 operation failed. Make sure decode input is valid base64.");
  }
});

cmd({
  pattern: "readqr",
  alias: ["qrread", "qrdetect"],
  react: "📷",
  category: "tools",
  desc: "Read QR code from image URL",
  usage: ".readqr [image_url] (or reply to image)",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    let imageUrl = q;
    if (!imageUrl) {
      const isQuoted = !!(mek.message?.extendedTextMessage?.contextInfo?.quotedMessage);
      const mediaMsg = isQuoted ? mek.message.extendedTextMessage.contextInfo.quotedMessage : mek.message;
      const hasImage = mediaMsg?.imageMessage;
      if (!hasImage) return reply("❌ Please provide an image URL or reply to an image.");
      const buffer = await downloadMediaMessage(
        isQuoted ? { key: mek.message.extendedTextMessage.contextInfo, message: mediaMsg } : mek,
        "buffer", {}, { reuploadRequest: conn.updateMediaMessage }
      );
      imageUrl = await uploadToCatbox(buffer, hasImage.mimetype);
    }

    const url = `https://api.giftedtech.co.ke/api/tools/readqr?apikey=gifted&url=${encodeURIComponent(imageUrl)}`;
    const { data } = await axios.get(url);

    if (!data.success || !data.result?.qrcode_data) return reply("❌ No QR code detected.");

    const txt = `
╭━═『 *QR CODE DATA* 』━╮
┃ 📷 *Detected:* Success
╰━━━━━━━━━━━━━━━━━━╯

${data.result.qrcode_data}

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "QR Scanner", body: "Data extracted successfully" });
  } catch (err) {
    console.error("READQR ERROR:", err);
    reply("❌ QR reading failed.");
  }
});

cmd({
  pattern: "ttp",
  alias: ["texttopicture", "txtpic"],
  react: "🖼️",
  category: "tools",
  desc: "Convert text to picture",
  usage: ".ttp [text]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide text to convert. Usage: .tp Gifted Tech");

    const url = `https://api.giftedtech.co.ke/api/tools/ttp?apikey=gifted&query=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.success || !data.image_url) return reply("❌ Text-to-picture failed.");

    await conn.sendMessage(from, {
      image: { url: data.image_url },
      caption: `╭━═ 『 *TEXT TO PICTURE* 』 ═━╮\n┃ 📝 *Text:* ${q}\n╰━━━━━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
      contextInfo: getContext({ title: "TTP Engine", body: "Text rendered to image" })
    }, { quoted: mek });
  } catch (err) {
    console.error("TTP ERROR:", err);
    reply("❌ Text-to-picture generation failed.");
  }
});

cmd({
  pattern: "fancy",
  alias: ["fancyv2", "fancytext"],
  react: "✨",
  category: "tools",
  desc: "Convert text to fancy fonts (list all or pick by index)",
  usage: ".fancy [text] or .fancy [index] [text]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Usage: .fancy Hello World (lists all styles)\nOr: .fancy 10 Hello World (picks style #10)");

    const args = q.trim().split(" ");
    const maybeIndex = parseInt(args[0], 10);
    let index = null;
    let text = q;

    if (!isNaN(maybeIndex) && args.length > 1) {
      index = maybeIndex;
      text = args.slice(1).join(" ");
    }

    const url = `https://api.giftedtech.co.ke/api/tools/fancyv2?apikey=gifted&text=${encodeURIComponent(text)}`;
    const { data } = await axios.get(url);

    if (!data.success || !Array.isArray(data.results)) return reply("❌ Fancy text generation failed.");

    if (index !== null && data.results[index - 1]) {
      const selected = data.results[index - 1];
      const txt = `
╭━═『 *${selected.name}* 』━╮
┃ ✨ *Style:* ${index}
╰━━━━━━━━━━━━━━━━━━╯

${selected.result}

🚀 *${config.BOT_NAME}*
`.trim();
      await reply(txt, { title: `Fancy Style ${index}`, body: selected.name });
    } else {
      let list = data.results.map((r, i) => `${i + 1}. ${r.name}\n${r.result}`).join("\n\n");
      if (list.length > 3500) {
        list = data.results.slice(0, 20).map((r, i) => `${i + 1}. ${r.name}\n${r.result}`).join("\n\n") + "\n\n... (truncated)";
      }
      const txt = `
╭━═『 *FANCY TEXT STYLES* 』━╮
┃ 📝 *Text:* ${text}
┃ 📋 *Styles:* ${data.results.length}
╰━━━━━━━━━━━━━━━━━━╯

${list}

_Use \`.fancy [index] ${text}\` to pick a specific style._

🚀 *${config.BOT_NAME}*
`.trim();
      await reply(txt, { title: "Fancy Text List", body: "Choose your style" });
    }
  } catch (err) {
    console.error("FANCY ERROR:", err);
    reply("❌ Fancy text generation failed.");
  }
});

cmd({
  pattern: "proxy",
  alias: ["proxies", "proxieslist"],
  react: "🌐",
  category: "tools",
  desc: "Get a list of working proxies",
  usage: ".proxy",
  noPrefix: false,
}, async (conn, mek, m, { from, reply }) => {
  try {
    const url = "https://api.giftedtech.co.ke/api/tools/proxy?apikey=gifted";
    const { data } = await axios.get(url);

    if (!data.success || !Array.isArray(data.results)) return reply("❌ Failed to fetch proxies.");

    const proxies = data.results.slice(0, 15);
    const list = proxies.map((p, i) =>
      `${i + 1}. ${p.ip}:${p.port} (${p.code}) - ${p.anonymity} | HTTPS: ${p.https}`
    ).join("\n");

    const txt = `
╭━═『 *PROXY LIST* 』━╮
┃ 🌐 *Total:* ${data.results.length} proxies
┃ 📋 *Showing:* First ${proxies.length}
╰━━━━━━━━━━━━━━━━━━╯

${list}

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Proxy Hub", body: "Fresh proxies delivered" });
  } catch (err) {
    console.error("PROXY ERROR:", err);
    reply("❌ Proxy fetch failed.");
  }
});

cmd({
  pattern: "web2zip",
  alias: ["zipweb", "saveweb"],
  react: "📦",
  category: "tools",
  desc: "Download a website as ZIP archive",
  usage: ".web2zip [url]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide a website URL. Usage: .web2zip https://google.com");

    const targetUrl = q.startsWith("http") ? q : `https://${q}`;
    const url = `https://api.giftedtech.co.ke/api/tools/web2zip?apikey=gifted&url=${encodeURIComponent(targetUrl)}`;
    const { data } = await axios.get(url);

    if (!data.success || !data.result?.download_url) return reply("❌ Failed to archive website.");

    const r = data.result;
    const txt = `
╭━═『 *WEB ARCHIVE READY* 』━╮
┃ 🌐 *Site:* ${r.siteUrl}
┃ 📁 *Files:* ${r.copiedFilesAmount}
┃ 📦 *Type:* ${r.mimetype}
╰━━━━━━━━━━━━━━━━━━╯

🔗 *Download:* ${r.download_url}

🚀 *${config.BOT_NAME}*
`.trim();

    await reply(txt, { title: "Web2Zip", body: "Website archived successfully" });
  } catch (err) {
    console.error("WEB2ZIP ERROR:", err);
    reply("❌ Web2Zip failed.");
  }
});

cmd({
  pattern: "emojimix",
  alias: ["mixemoji", "emojiblend"],
  react: "🎭",
  category: "tools",
  desc: "Mix two emojis into one image",
  usage: ".emojimix [emoji1] [emoji2]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide two emojis. Usage: .emojimix 😂 🙄");

    const args = q.trim().split(/\s+/);
    if (args.length < 2) return reply("❌ Please provide two emojis separated by space.");

    const [emoji1, emoji2] = [args[0], args[1]];
    const url = `https://api.giftedtech.co.ke/api/tools/emojimix?apikey=gifted&emoji1=${encodeURIComponent(emoji1)}&emoji2=${encodeURIComponent(emoji2)}`;

    await conn.sendMessage(from, {
      image: { url: url },
      caption: `╭━═ 『 *EMOJI MIX* 』 ═━╮\n┃ 😂 *Emoji 1:* ${emoji1}\n┃ 🙄 *Emoji 2:* ${emoji2}\n╰━━━━━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
      contextInfo: getContext({ title: "Emoji Mixer", body: "Blend complete" })
    }, { quoted: mek });
  } catch (err) {
    console.error("EMOJIMIX ERROR:", err);
    reply("❌ Emoji mix failed. Try different emojis.");
  }
});

cmd({
  pattern: "carbon",
  alias: ["codeimage", "codeshot"],
  react: "💻",
  category: "tools",
  desc: "Generate beautiful code screenshot",
  usage: ".carbon [code]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide code to screenshot. Usage: .carbon console.log('hello world')");

    const url = `https://api.giftedtech.co.ke/api/tools/carbon?apikey=gifted&code=${encodeURIComponent(q)}`;
    const { data } = await axios.get(url);

    if (!data.success || !data.result?.image) return reply("❌ Carbon screenshot failed.");

    const r = data.result;
    await conn.sendMessage(from, {
      image: { url: r.image },
      caption: `╭━═ 『 *CARBON SHOT* 』 ═━╮\n┃ 🖋️ *Font:* ${r.font}\n┃ 🎨 *Theme:* ${r.theme}\n╰━━━━━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
      contextInfo: getContext({ title: "Carbon Code", body: "Screenshot generated" })
    }, { quoted: mek });
  } catch (err) {
    console.error("CARBON ERROR:", err);
    reply("❌ Carbon screenshot failed.");
  }
});

cmd({
  pattern: "createqr",
  alias: ["genqr", "makeqr"],
  react: "📱",
  category: "tools",
  desc: "Generate a QR code from text",
  usage: ".createqr [text]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide text for QR code. Usage: .createqr Hello World");

    const url = `https://api.giftedtech.co.ke/api/tools/createqr?apikey=gifted&query=${encodeURIComponent(q)}`;
    await conn.sendMessage(from, {
      image: { url: url },
      caption: `╭━═ 『 *QR CREATED* 』 ═━╮\n┃ 📱 *Data:* ${q}\n╰━━━━━━━━━━━━━━━━━━╯\n\n🚀 *${config.BOT_NAME}*`,
      contextInfo: getContext({ title: "QR Generator", body: "Code generated successfully" })
    }, { quoted: mek });
  } catch (err) {
    console.error("CREATEQR ERROR:", err);
    reply("❌ QR code generation failed.");
  }
});
