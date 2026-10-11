const pcRegistry = require('../store/pcRegistry');
const wol = require('wake_on_lan');

/**
 * Setup handlers for admin dashboard connections via Socket.IO /admin namespace
 */
function setupAdminHandlers(adminIO, agentIO) {
  adminIO.on('connection', (socket) => {
    console.log(`[+] Admin dashboard connected: ${socket.id}`);

    // Send current state on connect
    socket.emit('init', {
      pcs: pcRegistry.getAllPCs(),
      stats: pcRegistry.getStats(),
    });

    // ─── Helper: get agent socket by pcId ────────────────────────
    function getAgentSocket(pcId) {
      const pc = pcRegistry.getPC(pcId);
      if (!pc || !pc.socketId) return null;
      return agentIO.sockets.get(pc.socketId) || null;
    }

    function sendToAgent(pcId, event, data) {
      const agent = getAgentSocket(pcId);
      if (agent) {
        agent.emit(event, data);
        return true;
      }
      socket.emit('error_msg', { message: `PC "${pcId}" tidak terhubung`, pcId });
      return false;
    }

    // ─── SHELL COMMAND ────────────────────────────────────────────
    socket.on('shell_exec', ({ pcId, command, requestId }) => {
      sendToAgent(pcId, 'shell_exec', { command, requestId });
    });

    // ─── FILE MANAGER ─────────────────────────────────────────────
    socket.on('file_list', ({ pcId, path, requestId }) => {
      sendToAgent(pcId, 'file_list', { path, requestId });
    });

    socket.on('file_delete', ({ pcId, path, requestId }) => {
      sendToAgent(pcId, 'file_delete', { path, requestId });
    });

    socket.on('file_download', ({ pcId, path, requestId }) => {
      sendToAgent(pcId, 'file_download', { path, requestId });
    });

    // ─── SCREENSHOT ───────────────────────────────────────────────
    socket.on('screenshot', ({ pcId, requestId }) => {
      sendToAgent(pcId, 'screenshot', { requestId });
    });

    // ─── POWER CONTROL ────────────────────────────────────────────
    socket.on('power', ({ pcId, action }) => {
      sendToAgent(pcId, 'power', { action });
    });

    // ─── WAKE ON LAN ──────────────────────────────────────────────
    socket.on('wake_pc', ({ pcId }) => {
      const pc = pcRegistry.getPC(pcId);
      if (pc && pc.mac) {
        // Kumpulkan target broadcast: global, subnet broadcast, dan direct IP
        const targets = ['255.255.255.255'];
        if (pc.ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(pc.ip)) {
          const parts = pc.ip.split('.');
          const subnetBrd = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
          if (!targets.includes(subnetBrd)) targets.push(subnetBrd);
          if (!targets.includes(pc.ip)) targets.push(pc.ip);
        }

        // Kirim Magic Packet ke setiap target pada port 9 dan port 7
        const ports = [9, 7];
        let sentCount = 0;
        let lastErr = null;

        targets.forEach(addr => {
          ports.forEach(port => {
            wol.wake(pc.mac, { address: addr, port: port }, (err) => {
              if (err) {
                lastErr = err;
                console.error(`[WOL] Error sending to ${addr}:${port} -> ${err.message}`);
              } else {
                sentCount++;
              }
            });
          });
        });

        // 2. Peer-Assisted WOL: Minta PC lab lain yang sedang ONLINE untuk menembak WOL secara lokal di dalam LAN
        let relayedVia = null;
        const targetSubnet = pc.ip ? pc.ip.split('.').slice(0, 3).join('.') : null;
        const onlinePeers = Array.from(pcRegistry.getAllPCs()).filter(p => 
          p.status === 'online' && p.id !== pcId && p.socketId
        );
        const sameSubnetPeer = onlinePeers.find(p => p.ip && targetSubnet && p.ip.startsWith(targetSubnet + '.'));
        const relayPeer = sameSubnetPeer || onlinePeers[0];

        if (relayPeer) {
          const peerSocket = agentIO.sockets.get(relayPeer.socketId);
          if (peerSocket) {
            const subnetBrd = targetSubnet ? `${targetSubnet}.255` : '255.255.255.255';
            peerSocket.emit('relay_wol', { mac: pc.mac, broadcastIp: subnetBrd });
            relayedVia = relayPeer.hostname;
            console.log(`[WOL] Relayed magic packet via online peer: ${relayPeer.hostname} (${relayPeer.ip})`);
          }
        }

        const relayMsg = relayedVia ? ` + Relay via ${relayedVia}` : '';
        console.log(`[WOL] Magic packet sent for ${pc.hostname} (${pc.mac}) to targets: [${targets.join(', ')}]${relayMsg}`);
        socket.emit('wol_result', {
          success: true,
          pcId,
          hostname: pc.hostname,
          mac: pc.mac,
          targets,
          relayedVia,
          message: `Magic Packet terkirim ke MAC: ${pc.mac}${relayMsg}`,
        });
      } else {
        socket.emit('error_msg', { message: `MAC Address tidak ditemukan untuk PC ini (${pcId}). PC harus pernah online sebelumnya.`, pcId });
      }
    });



    // ─── BROADCAST: kirim ke SEMUA PC agent ──────────────────────
    socket.on('broadcast_power', ({ action }) => {
      agentIO.emit('power', { action });
    });

    socket.on('broadcast_message', ({ message }) => {
      agentIO.emit('show_notification', { message });
    });

    // ─── PC METADATA ──────────────────────────────────────────────
    socket.on('update_pc_meta', ({ pcId, alias, notes }) => {
      pcRegistry.updateMetadata(pcId, { alias, notes });
      // Broadcast updated PC back to all admins
      adminIO.emit('pc_registered', pcRegistry.getPC(pcId));
    });

    // ─── DELETE PC (SINGLE OFFLINE PC) ────────────────────────────
    socket.on('delete_pc', ({ pcId }) => {
      const pc = pcRegistry.getPC(pcId);
      if (!pc) return socket.emit('error_msg', { message: 'PC tidak ditemukan' });
      if (pc.status === 'online') {
        return socket.emit('error_msg', { message: `PC "${pc.hostname}" sedang ONLINE, tidak dapat dihapus.` });
      }
      pcRegistry.deletePC(pcId);
      adminIO.emit('pc_deleted', { pcId });
      adminIO.emit('stats_update', pcRegistry.getStats());
      console.log(`[Registry] Deleted offline PC: ${pcId}`);
    });

    // ─── CLEAR ALL OFFLINE PCS ────────────────────────────────────
    socket.on('clear_offline_pcs', () => {
      const count = pcRegistry.clearOfflinePCs();
      adminIO.emit('pcs_cleared', { count, pcs: pcRegistry.getAllPCs() });
      adminIO.emit('stats_update', pcRegistry.getStats());
      console.log(`[Registry] Cleared ${count} offline PCs`);
    });

    // ─── UPDATE AGENT SCRIPT ──────────────────────────────────────
    socket.on('update_agent', ({ pcId }) => {
      const updateCmd = `for d in /opt/lab-agent /opt/remote-agent; do [ -d "$d" ] && curl -sL http://80.80.80.4:3000/agent/modules/screenshot.js -o "$d/modules/screenshot.js" && curl -sL http://80.80.80.4:3000/agent/index.js -o "$d/index.js"; done; systemctl restart lab-remote-agent`;
      if (pcId) {
        sendToAgent(pcId, 'shell_exec', { command: updateCmd, requestId: 'upd-' + Date.now() });
        console.log(`[Update] Triggered agent screenshot update for: ${pcId}`);
      } else {
        agentIO.emit('shell_exec', { command: updateCmd, requestId: 'upd-all-' + Date.now() });
        console.log(`[Update] Broadcasted agent screenshot update to all online PCs`);
      }
    });

    // ─── BULK SCREENSHOT: request screenshot semua PC ────────────
    socket.on('broadcast_screenshot', () => {
      const requestId = Date.now().toString();
      agentIO.emit('screenshot', { requestId });
    });

    // ─── DISCONNECT ───────────────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`[-] Admin disconnected: ${socket.id}`);
    });

  });
}

module.exports = { setupAdminHandlers };
