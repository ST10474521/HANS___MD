/** Presence cache for .seeonline */

const CACHE = new Map();
let wired = false;

function wirePresence(conn) {
  if (!conn?.ev || wired) return;
  wired = true;

  conn.ev.on("presence.update", (update) => {
    try {
      const presences = update?.presences || {};
      for (const [jid, data] of Object.entries(presences)) {
        CACHE.set(jid, {
          presence: data?.lastKnownPresence || "unavailable",
          updatedAt: Date.now(),
        });
      }
      if (update?.id && update?.lastKnownPresence) {
        CACHE.set(update.id, {
          presence: update.lastKnownPresence,
          updatedAt: Date.now(),
        });
      }
    } catch {}
  });
}

async function subscribePresence(conn, jids) {
  wirePresence(conn);
  const fn = conn.presenceSubscribe?.bind(conn);
  if (!fn) return false;

  for (const jid of jids) {
    try {
      await fn(jid);
    } catch {}
    await new Promise((r) => setTimeout(r, 80));
  }
  return true;
}

function getPresence(jid) {
  return CACHE.get(jid)?.presence || "unavailable";
}

function labelPresence(p) {
  if (p === "available") return "🟢 online";
  if (p === "composing") return "✍️ typing";
  if (p === "recording") return "🎙️ recording";
  if (p === "paused") return "⏸️ paused";
  return "⚫ offline";
}

async function scanGroupOnline(conn, participantJids, waitMs = 4000) {
  await subscribePresence(conn, participantJids);
  await new Promise((r) => setTimeout(r, waitMs));

  const online = [];
  const offline = [];

  for (const jid of participantJids) {
    const p = getPresence(jid);
    const row = { jid, presence: p };
    if (["available", "composing", "recording", "paused"].includes(p)) {
      online.push(row);
    } else {
      offline.push(row);
    }
  }

  online.sort((a, b) => a.presence.localeCompare(b.presence));
  return { online, offline, total: participantJids.length };
}

module.exports = {
  wirePresence,
  scanGroupOnline,
  getPresence,
  labelPresence,
};
