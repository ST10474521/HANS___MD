<div align="center">

<img src="https://i.ibb.co/DPFmfvcX/Chat-GPT-Image-Apr-24-2026-01-51-32-AM.png" alt="HANS MD Logo" width="200" style="border-radius: 50%;" />

# 𝐇𝐀𝐍𝐒 𝐌𝐃

### ⚡ The Ultimate WhatsApp Multi-Device Bot ⚡

[![Stars](https://img.shields.io/github/stars/haroldmth/hans___md?style=for-the-badge&color=yellow)](https://github.com/haroldmth/hans___md/stargazers)
[![Forks](https://img.shields.io/github/forks/haroldmth/hans___md?style=for-the-badge&color=blue)](https://github.com/haroldmth/hans___md/network/members)
[![Issues](https://img.shields.io/github/issues/haroldmth/hans___md?style=for-the-badge&color=red)](https://github.com/haroldmth/hans___md/issues)
[![License](https://img.shields.io/github/license/haroldmth/hans___md?style=for-the-badge&color=green)](LICENSE)

**ĦΔŇŞ ΜĐ : ꃅꍏꈤꌗ ꂵꀸ [v2.1.4]** — A blazing-fast, feature-packed WhatsApp bot built on Baileys v7 with LID support, 225+ commands, and an elite terminal-style experience.

<a href="https://sessions.hanstech.xyz">
  <img src="https://img.shields.io/badge/GET%20SESSION%20ID-Click%20Here-brightgreen?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Get Session ID" />
</a>
&nbsp;&nbsp;
<a href="https://github.com/haroldmth/hans___md/fork">
  <img src="https://img.shields.io/badge/FORK%20REPO-Click%20Here-blue?style=for-the-badge&logo=github&logoColor=white" alt="Fork Repo" />
</a>

---

</div>

## 📋 Table of Contents

- [✨ Features](#-features)
- [🔐 Authentication & Pairing](#-authentication--pairing)
- [🚀 Deployment](#-deployment)
  - [Deploy to Heroku](#-deploy-to-heroku)
  - [Deploy to Koyeb](#-deploy-to-koyeb)
  - [Deploy to Render](#-deploy-to-render)
  - [Deploy to VPS / Linux](#-deploy-to-vps--linux)
  - [Deploy to Termux (Android)](#-deploy-to-termux-android)
  - [Deploy to Windows](#-deploy-to-windows)
- [⚙️ Configuration](#️-configuration)
- [📖 Commands](#-commands)
- [🛡️ Permissions System](#️-permissions-system)
- [🤝 Contributing](#-contributing)
- [📜 License](#-license)

---

### 🚀 What's New in v2.1.4 (Quantum Edition)

- **Neural Sentinel HUD v5.2**: A bespoke, slanted terminal interface (`┌──┈⳹`) optimized for mobile.
- **System-Wide Intelligence**: Real-time monitoring of your host machine's total RAM and precise latency.
- **Fancy Font Engine**: Built-in Serif Bold Italic conversion for premium menu aesthetics.
- **Global Error Shield**: Every single core error is tracked and reported to Telegram in real-time.
- **Infinite Matrix Connectivity**: Deep fixes for LID resolution and "Ghost Message" visibility.

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🤖 AI & Intelligence
- GPT-3, GPT-4, GPT-4o Mini
- Google Gemini & Gemma
- Meta AI & Llama 3
- Deepseek V3, R1, 67B
- Mixtral & QVQ 72B
- AI Music Generation
- AI Image Generation (Flux, Animagine, Epic Realism)

### 📥 Downloads
- YouTube (Audio & Video via `yt-search`)
- Spotify, SoundCloud
- TikTok (No Watermark)
- Instagram Reels
- Facebook & Twitter/X
- MediaFire & Google Drive
- APK Downloads
- Website Archiver

</td>
<td width="50%">

### 👥 Group Management
- Anti-Link System (Warn/Delete/Kick)
- Welcome & Goodbye Messages
- Promote / Demote / Kick / Add
- Mute / Unmute Groups
- Group Info, Invite Links
- Tag All & Hidetag
- Group Creation & Settings

### 🔧 Tools & Utilities
- View Once Bypass
- URL Shortener (TinyURL & is.gd)
- Image to URL (Catbox Upload)
- Credit Card Generator
- Temp Mail System
- Screenshot Website
- QR Code Generator
- Base64 Encode/Decode

</td>
</tr>
<tr>
<td width="50%">

### 🔍 Search & Discovery
- YouTube Search
- Pinterest Image Search
- Wallpaper Search
- Song Lyrics Finder
- SoundCloud Search
- Anime Search
- Web Search (DuckDuckGo)

### 🏆 Fun & Entertainment
- Anime Commands
- Movie Search
- Sports Scores
- Social Media Stalking
- News Headlines

</td>
<td width="50%">

### 🛡️ Owner & Admin
- Public / Private Mode
- DM / Group / Both Chat Modes
- Sudo User Management
- Ban / Unban Users & Groups
- Broadcast to All Chats
- Bot Profile Management
- Shell & JS Eval
- Privacy Controls
- Environment Variable Editor
- Live System Dashboard

### 📡 System
- Auto-Reconnect & Session Recovery
- PM2 & System-wide RAM Monitor
- Global Telegram Error Shield
- Neural Sentinel HUD v5.2
- LID-to-PN Resolution (Baileys v7)
- Always Online Presence [LIVE]

</td>
</tr>
</table>

---

## 🔐 Authentication & Pairing

HANS-MD v2.1.4 (Quantum Edition) features a **Direct Interactive Pairing System**. You no longer need external websites to link your bot. It happens right in your terminal or deployment logs.

### 📝 The Direct Pairing Flow:
1. **Deploy the Bot**: Follow the guides below for your platform.
2. **Set Owner Number**: Ensure your `OWNER_NUMBER` is set in your environment variables (with country code).
3. **Monitor Logs**: Once the bot starts for the first time, watch the terminal/logs.
4. **Terminal Prompt**: If `OWNER_NUMBER` is missing, the bot will ask you to type it in the console.
5. **Get Your Code**: The bot will generate a unique 8-character code (e.g., `ABCD-1234`).
6. **Link on Phone**: 
   - Open WhatsApp → **Settings** → **Linked Devices** → **Link a Device**.
   - Select **"Link with phone number instead"**.
   - Enter the code displayed in your bot's logs.

---

## 🚀 Deployment

### 🟣 Deploy to Heroku

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/haroldmth/hans___md)

1. Click the **Deploy to Heroku** button above
2. Fill in the environment variables (see [Configuration](#️-configuration))
3. Click **Deploy App**
4. Once deployed, open **Resources** → enable the `worker` dyno
5. Open the **Logs** tab. You will see the **Pairing Code** generated there. Use it to link your WhatsApp.

---

### 🟢 Deploy to Koyeb

1. Fork this repo to your GitHub account
2. Go to [koyeb.com](https://koyeb.com) and create a new **Web Service**
3. Connect your GitHub and select the `hans___md` repo
4. Set the **Build Command:** `pnpm install`
5. Set the **Run Command:** `node index.js`
6. Add all environment variables from [Configuration](#️-configuration)
7. Deploy!
8. Check the **Runtime Logs** to retrieve your **Pairing Code**.

---

### 🔵 Deploy to Render

1. Fork this repo
2. Go to [render.com](https://render.com) → **New** → **Background Worker**
3. Connect GitHub and select `hans___md`
4. **Build Command:** `pnpm install`
5. **Start Command:** `node index.js`
6. Add environment variables
7. Click **Create Background Worker**
8. Monitor the **Logs** to find your **Pairing Code**.

---

### 🖥️ Deploy to VPS / Linux

```bash
# 1. Install Node.js (v18+)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Install pnpm & PM2
npm install -g pnpm pm2

# 3. Clone the repository
git clone https://github.com/haroldmth/hans___md.git
cd hans___md

# 4. Install dependencies
pnpm install

# 5. Configure environment
cp example.env .env
nano .env   # Fill in your SESSION_ID and other settings

# 6. Start with PM2 (production)
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 7. Monitor logs
pm2 logs HANS-MD
```

**Useful PM2 Commands:**
```bash
pm2 restart HANS-MD    # Restart the bot
pm2 stop HANS-MD       # Stop the bot
pm2 logs HANS-MD       # View live logs
pm2 monit              # Monitor CPU/RAM usage
```

---

### 📱 Deploy to Termux (Android)

```bash
# 1. Update packages
pkg update && pkg upgrade -y

# 2. Install required packages
pkg install -y nodejs git

# 3. Install pnpm
npm install -g pnpm

# 4. Clone the repo
git clone https://github.com/haroldmth/hans___md.git
cd hans___md

# 5. Install dependencies
pnpm install

# 6. Configure
cp example.env .env
nano .env   # Add your SESSION_ID

# 7. Run the bot
node index.js
```

> 💡 **Tip:** Use `tmux` or `screen` to keep the bot running after closing Termux:
> ```bash
> pkg install tmux
> tmux new -s hans
> node index.js
> # Press Ctrl+B then D to detach
> ```

---

### 🪟 Deploy to Windows

```powershell
# 1. Install Node.js v18+ from https://nodejs.org
# 2. Install pnpm
npm install -g pnpm

# 3. Clone the repo
git clone https://github.com/haroldmth/hans___md.git
cd hans___md

# 4. Install dependencies
pnpm install

# 5. Create .env file (copy from example.env and edit)
copy example.env .env
# Edit .env with your OWNER_NUMBER

# 6. Run the bot
node index.js
```

---

## ⚙️ Configuration

Create a `.env` file in the root directory (or copy from `example.env`):

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `BOT_NAME` | Display name of the bot | `HANS MD` | ❌ |
| `OWNER_NAME` | Owner's display name | `Harold` | ❌ |
| `OWNER_NUMBER` | Owner's number (with country code) | `237680260772` | ✅ Yes |
| `PREFIX` | Command prefix | `.` | ❌ |
| `AUTO_REACT` | Auto-react to messages | `true` | ❌ |
| `ANTI_DELETE` | Recover deleted messages | `true` | ❌ |
| `AUTO_READ` | Auto-read incoming messages | `true` | ❌ |
| `AUTO_STATUS` | Auto-view & react to statuses | `true` | ❌ |
| `AUTO_TYPING` | Show typing indicator | `true` | ❌ |
| `AUTO_RECORDING` | Show recording indicator | `true` | ❌ |
| `ALWAYS_ONLINE` | Keep bot always online | `true` | ❌ |
| `TG_BOT_TOKEN` | Telegram bot token (error reporting) | — | ❌ |
| `TG_CHAT_ID` | Telegram chat ID (error reporting) | — | ❌ |

> 💡 You can also change most settings live using `.setenv`, `.readenv`, and `.setprefix` commands.

---

## 📖 Commands

**Default Prefix:** `.` (dot)

| Category | Commands | Description |
|----------|----------|-------------|
| 🤖 **AI** | `.ai` `.gemini` `.gpt` `.gpt4` `.llama` `.deepseek` `.meta` `.mixtral` `.flux` `.animagine` `.epicrealism` `.aimusic` | AI chatbots & generators |
| 📥 **Download** | `.play` `.video` `.ytmp3` `.ytmp4` `.spotify` `.tiktok` `.ig` `.fb` `.twitter` `.mediafire` `.gdrive` `.apk` `.webdl` | Media downloads |
| 🔍 **Search** | `.yts` `.wallpaper` `.lyrics` `.pinterest` `.soundcloud` `.animeindo` `.search` | Search engines |
| 👥 **Group** | `.kick` `.promote` `.demote` `.mute` `.unmute` `.antilink` `.welcome` `.goodbye` `.tagall` `.hidetag` `.gcinfo` | Group management |
| 🛠️ **Tools** | `.vv` `.tourl` `.ccgen` `.ssweb` `.qr` `.base64` `.tinyurl` `.shorten` `.tempmail` | Utility tools |
| 🎭 **Fun** | `.anime` `.movie` `.sports` `.stalk` `.news` | Entertainment |
| 👑 **Owner** | `.public` `.private` `.addsudo` `.removesudo` `.banuser` `.broadcast` `.eval` `.exec` `.leave` `.shutdown` | Bot management |
| ⚙️ **System** | `.menu` `.ping` `.runtime` `.system` `.version` `.update` `.help` `.report` | System info |
| 🔒 **Privacy** | `.block` `.unblock` `.disappearing` `.privacy` | Privacy controls |
| 👤 **Profile** | `.setname` `.setstatus` `.setpp` `.removepp` `.getpp` `.profile` | Profile management |

> 📝 Type `.menu` in any chat to see the full interactive command list.

---

## 🛡️ Permissions System

HANS MD has a layered permission system:

```
👑 Owner (OWNER_NUMBER in .env)
  └── Full access to everything
  
🛡️ Sudo (Added via .addsudo)
  └── Most owner commands except eval/exec
  
🛠️ Group Admin
  └── Group management commands
  
👤 User
  └── General, search, download, AI commands
```

**Managing Permissions:**
```
.addsudo @user      → Grant sudo access
.removesudo @user   → Revoke sudo access
.sudolist           → View all sudo users
.banuser @user      → Ban from using bot
.unbanuser @user    → Unban a user
.public             → Anyone can use the bot
.private            → Only owner/sudo can use
```

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork** this repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a **Pull Request**

---

## ⚠️ Disclaimer

This bot is **not affiliated with, endorsed by, or sponsored by WhatsApp** in any way. WhatsApp is a registered trademark of Meta Platforms, Inc.

We are **not responsible** for any bans, restrictions, or data loss that may occur from using this bot. Use it entirely **at your own risk**. You are solely responsible for ensuring your usage complies with WhatsApp's Terms of Service and any applicable local laws.

---

## 📜 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

### 🌟 Star this repo if you find it useful! 🌟

**Built with ❤️ by [HaroldMth](https://github.com/haroldmth)**

<a href="https://whatsapp.com/channel/0029Vb6F9V9FHWpsqWq1CF14">
  <img src="https://img.shields.io/badge/WhatsApp%20Channel-Join-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp Channel" />
</a>

*© 2026 HANS MD — All rights reserved.*

</div>
