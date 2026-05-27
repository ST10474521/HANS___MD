/** Tracks cancellable bulk group operations (kickall, purge, etc.) */

const OPS = new Map();

function startBulkOp(groupId, type, meta = {}) {
  OPS.set(groupId, { type, cancelled: false, startedAt: Date.now(), ...meta });
}

function cancelBulkOp(groupId) {
  const op = OPS.get(groupId);
  if (!op) return null;
  op.cancelled = true;
  return op;
}

function isBulkCancelled(groupId) {
  return OPS.get(groupId)?.cancelled === true;
}

function endBulkOp(groupId) {
  OPS.delete(groupId);
}

function getBulkOp(groupId) {
  return OPS.get(groupId) || null;
}

async function bulkCountdown(groupId, seconds) {
  const total = Math.max(1, Math.min(60, Number(seconds) || 10));
  for (let i = 0; i < total; i++) {
    if (isBulkCancelled(groupId)) {
      endBulkOp(groupId);
      return false;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (isBulkCancelled(groupId)) {
    endBulkOp(groupId);
    return false;
  }
  return true;
}

function parseDurationMs(input) {
  const raw = String(input || "").toLowerCase().trim();
  const m = raw.match(/^(\d+)(s|m|h|d)?$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n || n < 1) return null;
  const unit = m[2] || "m";
  if (unit === "s") return n * 1000;
  if (unit === "m") return n * 60 * 1000;
  if (unit === "h") return n * 60 * 60 * 1000;
  if (unit === "d") return n * 24 * 60 * 60 * 1000;
  return null;
}

module.exports = {
  startBulkOp,
  cancelBulkOp,
  isBulkCancelled,
  endBulkOp,
  getBulkOp,
  bulkCountdown,
  parseDurationMs,
};
