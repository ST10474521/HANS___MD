const { getDB, saveGlobal } = require("./database");

const DEFAULT_TZ = "UTC";

function getOwnerTimezone(db) {
  return db?.env?.TIMEZONE || process.env.TIMEZONE || DEFAULT_TZ;
}

function parseTimeHHMM(input) {
  const raw = String(input || "").trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function getNowInTimezone(tz) {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return {
      hhmm: `${parts.hour}:${parts.minute}`,
      dateKey: `${parts.year}-${parts.month}-${parts.day}`,
      tz,
    };
  } catch {
    const d = new Date();
    return {
      hhmm: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
      dateKey: d.toISOString().slice(0, 10),
      tz: "UTC",
    };
  }
}

async function setGroupLock(conn, groupId, lock) {
  await conn.groupSettingUpdate(groupId, lock ? "announcement" : "not_announcement");
}

let schedulerStarted = false;

function startGcScheduler(conn) {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setInterval(async () => {
    if (!conn?.authState?.creds?.registered) return;

    const db = getDB();
    const tz = getOwnerTimezone(db);
    const now = getNowInTimezone(tz);
    let dirty = false;

    db.gcSchedule = db.gcSchedule && typeof db.gcSchedule === "object" ? db.gcSchedule : {};
    for (const [groupId, sched] of Object.entries(db.gcSchedule)) {
      if (!sched?.enabled) continue;

      const unlockAt = parseTimeHHMM(sched.unlockAt) || "08:00";
      const lockAt = parseTimeHHMM(sched.lockAt) || "20:00";

      if (now.hhmm === unlockAt && sched.lastUnlockDate !== now.dateKey) {
        try {
          await setGroupLock(conn, groupId, false);
          sched.lastUnlockDate = now.dateKey;
          sched.lastState = "unlocked";
          dirty = true;
          await conn
            .sendMessage(groupId, {
              text: `🔓 *Auto-unlock*\nGroup opened at *${unlockAt}* (${tz}).`,
            })
            .catch(() => {});
        } catch (err) {
          console.error("[gcSchedule] unlock failed:", groupId, err.message);
        }
      }

      if (now.hhmm === lockAt && sched.lastLockDate !== now.dateKey) {
        try {
          await setGroupLock(conn, groupId, true);
          sched.lastLockDate = now.dateKey;
          sched.lastState = "locked";
          dirty = true;
          await conn
            .sendMessage(groupId, {
              text: `🔒 *Auto-lock*\nGroup closed at *${lockAt}* (${tz}).`,
            })
            .catch(() => {});
        } catch (err) {
          console.error("[gcSchedule] lock failed:", groupId, err.message);
        }
      }
    }

    db.timedLocks = db.timedLocks && typeof db.timedLocks === "object" ? db.timedLocks : {};
    for (const [groupId, entry] of Object.entries(db.timedLocks)) {
      if (!entry?.unlockAt || Date.now() < entry.unlockAt) continue;
      try {
        await setGroupLock(conn, groupId, false);
        delete db.timedLocks[groupId];
        dirty = true;
        await conn
          .sendMessage(groupId, {
            text: "🔓 *Timed lock ended* — group is open again.",
          })
          .catch(() => {});
      } catch (err) {
        console.error("[timedLock] unlock failed:", groupId, err.message);
      }
    }

    if (dirty) saveGlobal(db);
  }, 60 * 1000);
}

module.exports = {
  startGcScheduler,
  parseTimeHHMM,
  getOwnerTimezone,
  getNowInTimezone,
  setGroupLock,
};
