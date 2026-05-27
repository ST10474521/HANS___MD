const fs = require("fs");
const path = require("path");

const GLOBAL_DEFAULTS = {
  sudo: [],
  env: {},
  warnings: {},
  antilink: {},
  welcome: {},
  blocked: [],
  banned: {},
  mode: "public",
  chatMode: "both",
  cooldowns: {},
  gcSchedule: {},
  timedLocks: {}
};

const MESSAGE_TTL_MS = 48 * 60 * 60 * 1000;

const DB_PATH = "./database";
const globalPath = path.join(process.cwd(), DB_PATH, "global.json");
const messagesPath = path.join(process.cwd(), DB_PATH, "messages.json");

let _db = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(globalPath), { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function readGlobal() {
  ensureDir();
  const data = readJsonSafe(globalPath, null);
  if (!data || typeof data !== "object") {
    _db = { ...GLOBAL_DEFAULTS };
    writeJson(globalPath, _db);
    return _db;
  }

  _db = { ...GLOBAL_DEFAULTS, ...data };
  if (!_db.cooldowns || typeof _db.cooldowns !== "object") _db.cooldowns = {};
  if (!_db.banned || typeof _db.banned !== "object") _db.banned = {};
  if (!_db.blocked || !Array.isArray(_db.blocked)) _db.blocked = [];
  if (!_db.sudo || !Array.isArray(_db.sudo)) _db.sudo = [];
  if (!_db.gcSchedule || typeof _db.gcSchedule !== "object") _db.gcSchedule = {};
  if (!_db.timedLocks || typeof _db.timedLocks !== "object") _db.timedLocks = {};

  writeJson(globalPath, _db);
  return _db;
}

function getDB() {
  if (_db) return _db;
  return readGlobal();
}

function saveGlobal(data) {
  _db = data;
  writeJson(globalPath, data);
}

function setDB(key, value) {
  const db = getDB();
  db[key] = value;
  saveGlobal(db);
  return db;
}

function readMessages() {
  ensureDir();
  const data = readJsonSafe(messagesPath, []);
  return Array.isArray(data) ? data : [];
}

function saveMessages(arr) {
  writeJson(messagesPath, arr);
}

function extractMessageBodyAndType(mek) {
  const msg = mek?.message || {};
  const type = Object.keys(msg)[0] || "unknown";

  const m = msg[type] || {};
  const body =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId ||
    m?.text ||
    "";

  return { body: typeof body === "string" ? body : "", type };
}

function storeMessage(mek) {
  try {
    const id = mek?.key?.id;
    const from = mek?.key?.remoteJid || "";
    if (!id || !from) return;

    const { body, type } = extractMessageBodyAndType(mek);
    const now = Date.now();
    const sender = mek?.key?.participant || from;

    const entry = {
      id,
      from,
      sender,
      body,
      type,
      message: mek.message, // Preserve raw message for retries
      timestamp: now,
      expiresAt: now + MESSAGE_TTL_MS
    };

    const arr = readMessages();
    arr.push(entry);

    // Keep memory usage sane - limit to last 200 messages for fast lookup
    if (arr.length > 200) arr.shift();

    saveMessages(arr);
  } catch {}
}

function getStoredMessage(id) {
  if (!id) return null;
  const arr = readMessages();
  return arr.find((m) => m?.id === id) || null;
}

function cleanExpired() {
  const now = Date.now();

  const arr = readMessages();
  const cleaned = arr.filter((m) => typeof m?.expiresAt === "number" && m.expiresAt > now);
  if (cleaned.length !== arr.length) saveMessages(cleaned);

  const db = getDB();
  if (db?.cooldowns && typeof db.cooldowns === "object") {
    for (const k of Object.keys(db.cooldowns)) {
      const exp = db.cooldowns[k];
      if (typeof exp === "number" && exp <= now) delete db.cooldowns[k];
    }
    saveGlobal(db);
  }
}

module.exports = {
  readGlobal,
  saveGlobal,
  getDB,
  setDB,
  storeMessage,
  getStoredMessage,
  cleanExpired
};

