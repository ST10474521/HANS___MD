const axios = require("axios");
const config = require("../config");

const CHANGELOG = {
  "1.0.0": [
    "Initial release of HANS-MD.",
    "Integrated Baileys v7 with LID support.",
    "Advanced group management tools.",
    "Anti-link system implemented."
  ],
  "1.0.1": [
    "Added .report command for easy bug tracking.",
    "Hardcoded Telegram reporting logic for better stability.",
    "Fixed minor issues in the menu display."
  ],
  "1.1.0": [
    "New versioning system and .checkversion command.",
    "Improved performance for media handling.",
    "Updated greeting context for newsletters."
  ],
  "1.2.0": [
    "Complete migration to Official Baileys v7.",
    "Engineered Hybrid Protobuf Dictionary (8MB) support.",
    "Integrated Multi-Mode Anti-Delete (DM/Group/Both).",
    "Dynamic Prefix switching without restart.",
    "Automated post-install Protobuf surgery."
  ],
  "1.2.1": [
    "Added GiftedTech API fallbacks: GPT4o, magicstudio, txt2img.",
    "New fun commands: .joke, .pickupline.",
    "New tools: .encryptv3, .htmlobfuscate, .base64, .readqr, .ttp, .fancy, .proxy, .web2zip, .emojimix, .carbon, .createqr.",
    "Updated .rmbg with GiftedTech fallback.",
    "Added .gitclone command for GitHub repo downloads.",
    "Global fatal error Telegram crash reporting.",
    "Command execution crash reports sent to Telegram."
  ],
  "1.2.4": [
    "Launched X-LINK SENTINEL v5.0 Neural HUD.",
    "Integrated Real-Time System-wide RAM Monitoring.",
    "Added High-Precision Latency (Ping) Calculation.",
    "Optimized Menu Layout for Premium Mobile Experience.",
    "Implemented Slanted 'Neural' Indicators and Smallcaps Typography."
  ],
  "1.2.4.1": [
    "Fixed critical DM sender identification bug (fromMe messages showed wrong sender).",
    "Fixed isOwner always returning false in self-DM and cross-DM scenarios.",
    "Added fromMe + bot LID fallback checks to owner verification.",
    "New .whoami command with profile picture, bio, and device detection.",
    "New .whois command for deep user account inspection.",
    "New .test diagnostic command for role and JID debugging.",
    "Removed SECTOR label from menu categories.",
    "Fixed owner permission denied on setprefix and admin commands."
  ],
  "1.2.4.2": [
    "Fixed status auto-reaction routing for Baileys v7.",
    "Improved create-group parsing and participant normalization.",
    "Added global owner/sudo/dev verification hardening across PN/LID variants.",
    "Added .repo command with hardcoded repository URL.",
    "Improved welcome/goodbye dedupe and media handling."
  ]
};

async function getLatestVersion() {
  try {
    const url = `https://raw.githubusercontent.com/HaroldMth/HANS___MD/main/package.json`;
    const response = await axios.get(url);
    return response.data.version || module.exports.CURRENT_VERSION;
  } catch (err) {
    console.error("[VERSION CHECK ERROR]", err.message);
    return module.exports.CURRENT_VERSION;
  }
}

function getChangelog(version) {
  return CHANGELOG[version] || ["No features listed for this version."];
}

function getAllFeatures() {
  let text = "*HANS-MD FEATURE LIST*\n\n";
  for (const [ver, features] of Object.entries(CHANGELOG).reverse()) {
    text += `*v${ver}*\n`;
    text += features.map(f => `• ${f}`).join("\n") + "\n\n";
  }
  return text;
}

module.exports = {
  getLatestVersion,
  getChangelog,
  getAllFeatures,
  CURRENT_VERSION: "1.2.4.2" 
};
