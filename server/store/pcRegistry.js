// In-memory registry for all connected lab PCs
const pcs = new Map(); // pcId -> pc object

/**
 * Register or update a PC
 */
function upsertPC(id, data) {
  const existing = pcs.get(id) || { id, registeredAt: new Date().toISOString() };
  pcs.set(id, {
    ...existing,
    ...data,
    status: 'online',
    lastSeen: new Date().toISOString(),
  });
  return pcs.get(id);
}

/**
 * Mark PC as offline
 */
function markOffline(id) {
  const pc = pcs.get(id);
  if (pc) {
    pc.status = 'offline';
    pc.socketId = null;
    pc.metrics = null;
  }
}

/**
 * Update PC's Socket.IO socket ID
 */
function updateSocketId(id, socketId) {
  const pc = pcs.get(id);
  if (pc) pc.socketId = socketId;
}

/**
 * Update PC's real-time metrics
 */
function updateMetrics(id, metrics) {
  const pc = pcs.get(id);
  if (pc) {
    pc.metrics = metrics;
    pc.lastSeen = new Date().toISOString();
  }
}

/**
 * Get PC by ID
 */
function getPC(id) {
  return pcs.get(id);
}

/**
 * Find PC by its Socket.IO socket ID
 */
function getPCBySocketId(socketId) {
  for (const pc of pcs.values()) {
    if (pc.socketId === socketId) return pc;
  }
  return null;
}

/**
 * Get all PCs, sorted by hostname
 */
function getAllPCs() {
  return Array.from(pcs.values()).sort((a, b) =>
    (a.hostname || '').localeCompare(b.hostname || '', undefined, { numeric: true })
  );
}

/**
 * Get summary statistics
 */
function getStats() {
  const all = getAllPCs();
  const online = all.filter(p => p.status === 'online');
  return {
    total: all.length,
    online: online.length,
    offline: all.length - online.length,
    windows: all.filter(p => p.os === 'windows').length,
    linux: all.filter(p => p.os === 'linux').length,
  };
}

module.exports = {
  upsertPC,
  markOffline,
  updateSocketId,
  updateMetrics,
  getPC,
  getPCBySocketId,
  getAllPCs,
  getStats,
};
