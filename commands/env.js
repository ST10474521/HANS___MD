const { cmd } = require("../command");
const fs = require("fs");
const path = require("path");

function readEnv() {
  const envPath = path.join(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, "utf8");
  const env = {};
  content.split("\n").forEach(line => {
    const [key, ...val] = line.split("=");
    if (key && val) env[key.trim()] = val.join("=").trim();
  });
  return env;
}

function writeEnv(env) {
  const envPath = path.join(__dirname, "../.env");
  const content = Object.entries(env)
    .map(([key, val]) => `${key}=${val}`)
    .join("\n");
  fs.writeFileSync(envPath, content);
}

cmd({
  pattern: "readenv",
  desc: "View current environment variables",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { reply, isOwner }) => {
  if (!isOwner) return reply("❌ Owner only.");
  
  const env = readEnv();
  let text = "╭━═『 ENV VARS 』━╮\n\n";
  for (const [key, val] of Object.entries(env)) {
    // Mask sensitive keys
    const displayVal = ["TG_BOT_TOKEN", "TG_CHAT_ID"].includes(key) 
      ? "********" 
      : val;
    text += `│ ◈ *${key}*: ${displayVal}\n`;
  }
  text += "\n╰━━━━━━━━━━━━━━━╯";
  
  reply(text);
});

cmd({
  pattern: "setenv",
  desc: "Set or update an environment variable",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { reply, isOwner, q }) => {
  if (!isOwner) return reply("❌ Owner only.");
  if (!q.includes("=")) return reply("📝 Format: .setenv KEY=VALUE");

  const [key, ...val] = q.split("=");
  const k = key.trim().toUpperCase();
  const v = val.join("=").trim();

  const env = readEnv();
  env[k] = v;
  writeEnv(env);

  await reply(`✅ *${k}* has been set to *${v}*.\n\n🔄 Restarting bot to apply changes...`);
  
  // Trigger PM2 restart
  process.exit(1);
});

cmd({
  pattern: "delenv",
  desc: "Delete an environment variable",
  category: "owner",
  filename: __filename
}, async (conn, mek, m, { reply, isOwner, q }) => {
  if (!isOwner) return reply("❌ Owner only.");
  if (!q) return reply("📝 Format: .delenv KEY");

  const k = q.trim().toUpperCase();
  const env = readEnv();
  
  if (!env[k]) return reply(`❌ Key *${k}* not found.`);
  
  delete env[k];
  writeEnv(env);

  await reply(`✅ *${k}* has been deleted.\n\n🔄 Restarting bot to apply changes...`);
  
  // Trigger PM2 restart
  process.exit(1);
});
