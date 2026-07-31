const pcRegistry = require('../store/pcRegistry');
const agentSockets = require('../store/agentSockets');

/**
 * Setup handlers for lab PC agents connecting via Socket.IO /agent namespace
 */
function setupAgentHandlers(agentIO, adminIO) {
  agentIO.on('connection', (socket) => {
    const clientIP = socket.handshake.address.replace('::ffff:', '');
    console.log(`[+] Agent connected from ${clientIP} (${socket.id})`);

    // ─── REGISTER ─────────────────────────────────────────────────
    socket.on('register', (data) => {
      // Use hostname as unique ID (normalized to uppercase)
      const pcId = (data.hostname || socket.id).toUpperCase().replace(/\s+/g, '-');

      const pc = pcRegistry.upsertPC(pcId, {
        socketId: socket.id,
        hostname: data.hostname || pcId,
        os: data.os || 'unknown',       // 'windows' or 'linux'
        platform: data.platform || '',
        arch: data.arch || '',
        ip: data.ip || clientIP,
      });

      socket.pcId = pcId;
      agentSockets.set(pcId, socket);

      console.log(`[✓] Registered: ${pc.hostname} | ${pc.os} | ${pc.ip}`);

      // Notify all admin dashboards
      adminIO.emit('pc_registered', pcRegistry.getPC(pcId));
      adminIO.emit('stats_update', pcRegistry.getStats());
    });

    // ─── METRICS ──────────────────────────────────────────────────
    socket.on('metrics', (metrics) => {
      if (!socket.pcId) return;
      pcRegistry.updateMetrics(socket.pcId, metrics);
      adminIO.emit('pc_metrics', { pcId: socket.pcId, metrics });
    });

    // ─── SHELL OUTPUT ─────────────────────────────────────────────
    socket.on('shell_output', (data) => {
      adminIO.emit('shell_output', data);
    });

    // ─── FILE OPERATIONS ──────────────────────────────────────────
    socket.on('file_list_result', (data) => {
      adminIO.emit('file_list_result', data);
    });

    // ─── SCREENSHOT ───────────────────────────────────────────────
    socket.on('screenshot_result', (data) => {
      adminIO.emit('screenshot_result', data);
    });

    // ─── GENERIC COMMAND RESULT ───────────────────────────────────
    socket.on('command_result', (data) => {
      adminIO.emit('command_result', data);
    });

    // ─── DISCONNECT ───────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      if (socket.pcId) {
        agentSockets.remove(socket.pcId);
        const pc = pcRegistry.getPC(socket.pcId);
        pcRegistry.markOffline(socket.pcId);
        console.log(`[-] Agent offline: ${pc?.hostname || socket.pcId} (${reason})`);
        adminIO.emit('pc_offline', { pcId: socket.pcId });
        adminIO.emit('stats_update', pcRegistry.getStats());
      }
    });
  });
}

module.exports = { setupAgentHandlers };
