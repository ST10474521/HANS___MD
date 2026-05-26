const { getContext } = require("./newsletter");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");

function getMessageType(message = {}) {
  if (!message) return "unknown";
  const keys = Object.keys(message).filter(
    (key) => key !== "messageContextInfo" && key !== "senderKeyDistributionMessage"
  );
  return keys[0] || "unknown";
}

function getBodyFromMessage(message = {}, type) {
  if (!message) return "";

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedId ||
    message.interactiveResponseMessage?.body?.text ||
    message[type]?.text ||
    ""
  );
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

function extractQuoted(mek, conn) {
  const innerMsg = unwrapMessage(mek?.message);
  const type = getMessageType(innerMsg);
  const ctx = innerMsg?.[type]?.contextInfo || null;

  if (!ctx?.quotedMessage) return null;

  const quotedMessage = unwrapMessage(ctx.quotedMessage);
  const quotedType = getMessageType(quotedMessage);
  const quotedBody = getBodyFromMessage(quotedMessage, quotedType);

  const quotedKey = {
    remoteJid: ctx.remoteJid || mek?.key?.remoteJid,
    fromMe: false,
    id: ctx.stanzaId,
    participant: ctx.participant,
  };

  const quotedMek = {
    key: quotedKey,
    message: quotedMessage,
  };

  return {
    key: quotedKey,
    id: ctx.stanzaId,
    body: typeof quotedBody === "string" ? quotedBody : "",
    type: quotedType,
    mtype: quotedType,
    msg: quotedMessage[quotedType] || {},
    sender: ctx.participant || "",
    mentionedJid: ctx.mentionedJid || [],
    download: async () => {
      return downloadMediaMessage(
        quotedMek,
        "buffer",
        {},
        { reuploadRequest: conn.updateMediaMessage }
      );
    },
  };
}

async function serialize(mek, conn) {
  const m = {};
  m.key = mek.key;
  m.message = mek.message;
  m.from = mek.key.remoteJid;
  m.isGroup = m.from?.endsWith("@g.us") || false;
  m.pushname = mek.pushName || "";

  const type = getMessageType(mek.message || {});
  m.type = type;

  const body = getBodyFromMessage(mek.message || {}, type);
  m.body = typeof body === "string" ? body : "";

  // LID-aware canonical sender (prefer PN alt over LID when available)
  const CANONICAL_SENDER = (() => {
    if (m.isGroup) {
      return mek.key.participantAlt || mek.key.participant || "";
    }
    // In a DM, remoteJid is the CHAT PARTNER, not the sender.
    // If fromMe=true, the sender is the bot's own account (owner).
    if (mek.key.fromMe) {
      return conn.user?.id || mek.key.remoteJidAlt || mek.key.remoteJid || "";
    }
    return mek.key.remoteJidAlt || mek.key.remoteJid || "";
  })();

  m.sender = CANONICAL_SENDER;
  m.senderNumber = (m.sender || "").split("@")[0];

  m.mentionedJid =
    mek?.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
    mek?.message?.imageMessage?.contextInfo?.mentionedJid ||
    mek?.message?.videoMessage?.contextInfo?.mentionedJid ||
    [];

  m.quoted = extractQuoted(mek, conn);

  m.reply = async (text) => {
    return conn.sendMessage(
      m.from,
      {
        text: String(text ?? ""),
        contextInfo: getContext(),
      },
      { quoted: mek }
    );
  };

  m.react = async (emoji) => {
    return conn.sendMessage(m.from, {
      react: { text: String(emoji ?? ""), key: mek.key },
      contextInfo: getContext(),
    });
  };

  return m;
}

module.exports = serialize;