require("dotenv").config();

module.exports = {
  BOT_NAME: process.env.BOT_NAME || "HANS MD",
  OWNER_NAME: process.env.OWNER_NAME || "Harold",
  OWNER_NUMBER: (process.env.OWNER_NUMBER || "237680260772").split(","),
  PREFIX: (process.env.PREFIX || ".").split(""),
  AUTO_REACT: process.env.AUTO_REACT === "true",    
  ANTI_DELETE: process.env.ANTI_DELETE === "true",   
  AUTO_READ: process.env.AUTO_READ === "true",     
  AUTO_STATUS: process.env.AUTO_STATUS === "true",
  AUTO_STATUS_LIKE: process.env.AUTO_STATUS_LIKE === "true",
  AUTO_TYPING: process.env.AUTO_TYPING === "true",   
  AUTO_RECORDING: process.env.AUTO_RECORDING === "true",
  ALWAYS_ONLINE: process.env.ALWAYS_ONLINE === "true", 
  GITHUB_URL: process.env.GITHUB_URL || "https://github.com/haroldmth/hans___md",
  REPO_NAME: process.env.REPO_NAME || "hans___md",
  // Telegram Error Reporting
  TG_BOT_TOKEN: process.env.TG_BOT_TOKEN || "", 
  TG_CHAT_ID: process.env.TG_CHAT_ID || ""
};
