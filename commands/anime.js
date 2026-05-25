const { cmd } = require("../command");
const { getContext } = require("../lib/newsletter");
const axios = require("axios");
const config = require("../config");
const BASE = "https://api.jikan.moe/v4";

async function resolveAnimeId(query) {
  const value = query?.trim();
  if (!value) return null;
  if (/^[0-9]+$/.test(value)) return value;

  const url = `${BASE}/anime?q=${encodeURIComponent(value)}&limit=1`;
  const response = await axios.get(url);
  const payload = response.data;
  return payload?.data?.[0]?.mal_id ? String(payload.data[0].mal_id) : null;
}

// --- ANIME SEARCH ---
cmd({
  pattern: "anime",
  alias: ["animesearch", "searchanime"],
  react: "🏮",
  category: "anime",
  desc: "Search for anime information",
  usage: ".anime [title]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! What anime are we looking for? Usage: .anime naruto");

    const url = `${BASE}/anime?q=${encodeURIComponent(q)}&limit=5`;
    const response = await axios.get(url);
    const payload = response.data;

    if (!payload.data || !payload.data.length) {
      return reply("❌ *No results found.* I couldn't find that one.");
    }

    const results = payload.data.slice(0, 5);
    let txt = `╭━═『 *ANIME SEARCH* 』━╮\n┃ 🔎 *Query:* ${q}\n┃ 🔢 *Results:* ${payload.pagination?.items?.total ?? results.length}\n╰━━━━━━━━━━━━━━━╯\n\n`;

    results.forEach((anime, i) => {
      txt += `*${i + 1}. ${anime.title}*\n`;
      txt += `🆔 *ID:* ${anime.mal_id}\n`;
      txt += `⭐ *Score:* ${anime.score ?? "N/A"}\n`;
      txt += `📺 *Type:* ${anime.type ?? "N/A"} | *Episodes:* ${anime.episodes ?? "N/A"}\n`;
      txt += `📅 *Year:* ${anime.year || "N/A"}\n`;
      txt += `──────────────\n`;
    });

    txt += `\n*Tips:* Use \.animeinfo [id] for more details.\n🚀 *${config.BOT_NAME}*`;

    await conn.sendMessage(from, {
      image: { url: results[0]?.images?.jpg?.image_url || results[0]?.images?.webp?.image_url },
      caption: txt,
      contextInfo: getContext({ title: "Anime Database Search", body: `Found ${payload.data.length} matches` })
    }, { quoted: mek });

  } catch (err) {
    console.error("ANIME SEARCH ERROR:", err);
    reply("❌ *Search Error:* Something went wrong.");
  }
});

// --- ANIME INFO ---
cmd({
  pattern: "animeinfo",
  alias: ["ainfo"],
  react: "📑",
  category: "anime",
  desc: "Get detailed information about an anime by title or ID",
  usage: ".animeinfo [title|id]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Give me an anime ID or title. Usage: .animeinfo 20 or .animeinfo naruto");

    const animeId = await resolveAnimeId(q);
    if (!animeId) {
      return reply("❌ *Anime not found.* Try a different title.");
    }

    const url = `${BASE}/anime/${animeId}`;
    const response = await axios.get(url);
    const anime = response.data?.data;

    if (!anime) {
      return reply("❌ *Anime ID not found.* Check the ID and try again.");
    }
    const genres = anime.genres?.map(g => g.name).join(", ") || "N/A";
    const studios = anime.studios?.map(s => s.name).join(", ") || "N/A";
    const aired = anime.aired?.string || "N/A";
    const imageUrl = anime.images?.jpg?.image_url || anime.images?.webp?.image_url;

    const txt = `
╭━═『 *ANIME DETAILS* 』═━╮
┃ 🏷️ *Title:* ${anime.title}
┃ 🇯🇵 *Japanese:* ${anime.title_japanese || "N/A"}
┃ 🆔 *ID:* ${anime.mal_id}
╰━━━━━━━━━━━━━━━━━━╯

⭐ *Score:* ${anime.score ?? "N/A"}
📺 *Type:* ${anime.type || "N/A"} | *Source:* ${anime.source || "N/A"}
📂 *Episodes:* ${anime.episodes ?? "N/A"}
📊 *Status:* ${anime.status || "N/A"}
📅 *Aired:* ${aired}
🕒 *Duration:* ${anime.duration || "N/A"}
🔞 *Rating:* ${anime.rating || "N/A"}
🎭 *Genres:* ${genres}
🏢 *Studios:* ${studios}

📝 *SYNOPSIS:*
${anime.synopsis ? anime.synopsis.substring(0, 500) : "N/A"}...

🚀 *${config.BOT_NAME}*
`.trim();

    await conn.sendMessage(from, {
      image: { url: imageUrl },
      caption: txt,
      contextInfo: getContext({ title: "Anime Intel Core", body: "Detailed breakdown retrieved" })
    }, { quoted: mek });

  } catch (err) {
    console.error("ANIME INFO ERROR:", err);
    reply("❌ *Data Error:* Couldn't retrieve anime info.");
  }
});

// --- ANIME EPISODES ---
cmd({
  pattern: "animeeps",
  alias: ["eps"],
  react: "🎬",
  category: "anime",
  desc: "Get episode list for an anime by title or ID",
  usage: ".animeeps [title|id]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide an anime name or ID. Usage: .eps naruto");

    const animeId = await resolveAnimeId(q);
    if (!animeId) return reply("❌ *Anime not found.* Try a different title.");

    const url = `${BASE}/anime/${animeId}/episodes?limit=50`;
    const { data } = await axios.get(url);

    if (!data.data || !data.data.length) {
      return reply("❌ *No episodes found.*");
    }

    let txt = `╭━═『 *EPISODE LIST* 』━╮\n┃ 🆔 *Anime ID:* ${animeId}\n╰━━━━━━━━━━━━━━━╯\n\n`;

    data.data.slice(0, 50).forEach(ep => {
      txt += `*EP ${ep.mal_id}:* ${ep.title || "Untitled"}\n`;
      if (ep.filler) txt += `⚠️ *Filler*\n`;
      txt += `──────────────\n`;
    });

    if (data.data.length > 50) txt += `\n*...and ${data.data.length - 50} more episodes.*`;
    txt += `\n🚀 *${config.BOT_NAME}*`;

    await reply(txt, { title: "Episode Retrieval", body: `${data.data.length} episodes found` });

  } catch (err) {
    console.error("ANIME EPS ERROR:", err);
    reply("❌ *Fetch Error:* Couldn't get episode list.");
  }
});

// --- ANIME CHARACTERS ---
cmd({
  pattern: "animechars",
  alias: ["chars"],
  react: "👤",
  category: "anime",
  desc: "Get character list for an anime by title or ID",
  usage: ".chars [title|id]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("Yo! Provide an anime name or ID. Usage: .chars naruto");

    const animeId = await resolveAnimeId(q);
    if (!animeId) return reply("❌ *Anime not found.* Try a different title.");

    const url = `${BASE}/anime/${animeId}/characters`;
    const { data } = await axios.get(url);

    if (!data.data || !data.data.length) {
      return reply("❌ *No characters found.*");
    }

    let txt = `╭━═『 *CHARACTERS* 』═━╮\n┃ 🆔 *Anime ID:* ${animeId}\n╰━━━━━━━━━━━━━━╯\n\n`;

    data.data.slice(0, 15).forEach(char => {
      const character = char.character || {};
      const voiceActors = (char.voice_actors || []).map(va => `${va.person.name} [${va.language}]`).join(", ");
      txt += `*${character.name || "Unknown"}* (${char.role || "N/A"})\n`;
      txt += `🎙️ *VA:* ${voiceActors || "Unknown"}\n`;
      txt += `──────────────\n`;
    });

    txt += `\n🚀 *${config.BOT_NAME}*`;

    await conn.sendMessage(from, {
      image: { url: data.data[0]?.character?.images?.jpg?.image_url || data.data[0]?.character?.images?.webp?.image_url },
      caption: txt,
      contextInfo: getContext({ title: "Character Database", body: "Casting details ready" })
    }, { quoted: mek });

  } catch (err) {
    console.error("ANIME CHARS ERROR:", err);
    reply("❌ *Fetch Error:* Couldn't get character list.");
  }
});

// --- TOP ANIME ---
cmd({
  pattern: "topanime",
  alias: ["topranking"],
  react: "🏆",
  category: "anime",
  desc: "Show top ranked anime",
  usage: ".topanime",
  noPrefix: false,
}, async (conn, mek, m, { from, reply }) => {
  try {
    const url = `${BASE}/top/anime?filter=airing&limit=10`;
    const { data } = await axios.get(url);

    if (!data.data || !data.data.length) return reply("❌ Failed to fetch top anime.");

    let txt = `╭━═『 *TOP AIRING* 』━╮\n┃ 📅 *Mode:* Global Ranking\n╰━━━━━━━━━━━━━╯\n\n`;

    data.data.forEach((anime, i) => {
      txt += `*${i + 1}. [${anime.rank}] ${anime.title}*\n`;
      txt += `⭐ *Score:* ${anime.score ?? "N/A"} | 🆔: ${anime.mal_id}\n`;
      txt += `──────────────\n`;
    });

    txt += `\n🚀 *${config.BOT_NAME} — Keeping it cool.*`;

    await conn.sendMessage(from, {
      image: { url: data.data[0]?.images?.jpg?.image_url || data.data[0]?.images?.webp?.image_url },
      caption: txt,
      contextInfo: getContext({ title: "Global Top Ranking", body: "The best shows right now" })
    }, { quoted: mek });

  } catch (err) {
    console.error("TOP ANIME ERROR:", err);
    reply("❌ *Data Error:* Global rankings unreachable.");
  }
});

// --- ANIME SCHEDULE ---
cmd({
  pattern: "schedule",
  alias: ["animeschedule"],
  react: "📅",
  category: "anime",
  desc: "Show anime airing schedule",
  usage: ".schedule [day]",
  noPrefix: false,
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    const day = q ? q.toLowerCase() : "";
    const url = `${BASE}/schedules${day ? `?filter=${day}` : ""}`;
    const { data } = await axios.get(url);

    if (!data.data || !data.data.length) return reply("❌ Failed to fetch schedule.");

    let txt = `╭━═『 *SCHEDULE* 』━╮\n┃ 📅 *Day:* ${day || "All Week"}\n╰━━━━━━━━━━━━╯\n\n`;

    data.data.slice(0, 15).forEach(anime => {
      txt += `• *${anime.title}* (${anime.broadcast?.day || "TBA"} ${anime.broadcast?.time || ""})\n`;
      txt += `⭐ *Score:* ${anime.score ?? "N/A"} | 🆔: ${anime.mal_id}\n`;
      txt += `──────────────\n`;
    });

    txt += `\n🚀 *${config.BOT_NAME}*`;

    await reply(txt, { title: "Airing Schedule", body: "Check what's dropping today" });

  } catch (err) {
    console.error("SCHEDULE ERROR:", err);
    reply("❌ *Fetch Error:* Schedule sync failed.");
  }
});

// --- SEASON / TRENDING AIRING ---
cmd({
  pattern: "trendinganime",
  alias: ["trending", "otaku"],
  react: "🔥",
  category: "anime",
  desc: "Show trending anime",
  usage: ".trending",
  noPrefix: false,
}, async (conn, mek, m, { from, reply }) => {
  try {
    const url = `${BASE}/top/anime?filter=bypopularity&limit=10`;
    const { data } = await axios.get(url);

    if (!data.data || !data.data.length) return reply("❌ Failed to fetch trending anime.");

    let txt = `╭━═『 *TRENDING NOW* 』━╮\n┃ 🔥 *Hot:* Most popular anime\n╰━━━━━━━━━━━━━━━╯\n\n`;

    data.data.forEach((anime, i) => {
      txt += `*${i + 1}. ${anime.title}*\n`;
      txt += `⭐ *Score:* ${anime.score ?? "N/A"} | 🆔: ${anime.mal_id}\n`;
      txt += `──────────────\n`;
    });

    txt += `\n🚀 *${config.BOT_NAME}*`;

    await conn.sendMessage(from, {
      image: { url: data.data[0]?.images?.jpg?.image_url || data.data[0]?.images?.webp?.image_url },
      caption: txt,
      contextInfo: getContext({ title: "Trending Intelligence", body: "What the streets are watching" })
    }, { quoted: mek });

  } catch (err) {
    console.error("TRENDING ANIME ERROR:", err);
    reply("❌ *Data Error:* Trending list offline.");
  }
});
