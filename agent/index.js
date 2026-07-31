/**
 * Lab Remote Manager — PC Agent
 *
 * Install di setiap PC lab (Windows & Ubuntu).
 * Agent akan otomatis terhubung ke server saat PC menyala.
 */

const { io }         = require('socket.io-client');
const os             = require('os');
const net            = require('net');
const WebSocket      = require('ws');
const config         = require('./config');
const { getMetrics } = require('./modules/metrics');
const { executeCommand }           = require('./modules/shell');
const { listDirectory, deleteItem, readFile } = require('./modules/fileManager');
const { takeScreenshot, getLatestThumbnail } = require('./modules/screenshot');
const { executePowerAction, showNotification } = require('./modules/power');

const HOSTNAME = os.hostname();
const PLATFORM = os.platform();
const OS_TYPE  = PLATFORM === 'win32' ? 'windows' : 'linux';

// ─── Get local IP ─────────────────────────────────────────────────────────────
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const ifaces of Object.values(interfaces)) {
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === 'IPv4') {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// ─── Banner ───────────────────────────────────────────────────────────────────
console.log('╔═══════════════════════════════════════╗');
console.log('║    🤖  Lab Remote Agent               ║');
console.log('╚═══════════════════════════════════════╝');
console.log(`  Hostname : ${HOSTNAME}`);
console.log(`  OS       : ${OS_TYPE} (${PLATFORM})`);
console.log(`  IP       : ${getLocalIP()}`);
console.log(`  Server   : ${config.SERVER_URL}`);
console.log('');

// ─── Socket Connection ────────────────────────────────────────────────────────
let metricsInterval = null;
let socket;

function connect() {
  socket = io(`${config.SERVER_URL}/agent`, {
    reconnection:        true,
    reconnectionDelay:   3000,
    reconnectionDelayMax: 15000,
    timeout:             10000,
    rejectUnauthorized:  false
  });

  // ── Connected ──────────────────────────────────────────────
  socket.on('connect', () => {
    console.log(`✅ Terhubung ke server (${socket.id})`);

    // Register this PC to the server
    socket.emit('register', {
      hostname: HOSTNAME,
      os:       OS_TYPE,
      platform: PLATFORM,
      arch:     os.arch(),
      ip:       getLocalIP(),
    });

    // Start sending metrics every 4 seconds (lightweight, zero process creation overhead)
    if (metricsInterval) clearInterval(metricsInterval);
    metricsInterval = setInterval(async () => {
      try {
        const metrics = await getMetrics();
        const thumb = getLatestThumbnail();
        socket.emit('metrics', { ...metrics, thumbnail: thumb || null });
      } catch (err) {
        console.error('[Metrics] Error:', err.message);
      }
    }, 4000);

    getMetrics().then(m => socket.emit('metrics', { ...m, thumbnail: getLatestThumbnail() || null }));
  });

  // ── Disconnected ───────────────────────────────────────────
  socket.on('disconnect', (reason) => {
    console.log(`❌ Terputus dari server: ${reason}`);
    if (metricsInterval) { clearInterval(metricsInterval); metricsInterval = null; }
  });

  socket.on('connect_error', (err) => {
    console.log(`⚠️  Gagal terhubung: ${err.message} — Mencoba lagi...`);
  });

  // ── Shell Command ──────────────────────────────────────────
  socket.on('shell_exec', ({ command, requestId }) => {
    console.log(`[Shell] ${command}`);
    executeCommand(command, (result) => {
      socket.emit('shell_output', { ...result, requestId });
    });
  });

  // ── File List ──────────────────────────────────────────────
  socket.on('file_list', ({ path, requestId }) => {
    const result = listDirectory(path);
    socket.emit('file_list_result', { ...result, requestId });
  });

  // ── File Delete ────────────────────────────────────────────
  socket.on('file_delete', ({ path, requestId }) => {
    console.log(`[File] Delete: ${path}`);
    const result = deleteItem(path);
    socket.emit('command_result', { ...result, requestId, type: 'file_delete' });
  });

  // ── File Download ──────────────────────────────────────────
  socket.on('file_download', ({ path, requestId }) => {
    console.log(`[File] Download: ${path}`);
    const result = readFile(path);
    socket.emit('command_result', { ...result, requestId, type: 'file_download' });
  });

  // ── Screenshot ─────────────────────────────────────────────
  socket.on('screenshot', async ({ requestId }) => {
    console.log('[Screenshot] Capturing...');
    const result = await takeScreenshot();
    socket.emit('screenshot_result', { ...result, requestId, pcId: HOSTNAME.toUpperCase() });
  });

  // ─── Power Control ────────────────────────────────────────────────────────────
  socket.on('power', ({ action }) => {
    console.log(`[Power] ${action}`);
    executePowerAction(action);
  });

  // ─── Notification ─────────────────────────────────────────────────────────────
  socket.on('show_notification', ({ message }) => {
    console.log(`[Notify] ${message}`);
    showNotification(message);
  });

  // ─── REVERSE TUNNEL VNC (RAW WEBSOCKET) ─────────────────────────────────────
  let localTcp = null;
  let agentWs = null;

  socket.on('vnc-start-raw', ({ token }) => {
    console.log('[VNC] Starting RAW Reverse Tunnel to server...');
    
    // Clean up old instances if any
    if (localTcp) localTcp.destroy();
    if (agentWs) agentWs.close();

    const serverUrl = new URL(config.SERVER_URL);
    serverUrl.protocol = serverUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    serverUrl.pathname = `/agent-vnc/${token}`;
    const wsUrl = serverUrl.toString();
    
    agentWs = new WebSocket(wsUrl, { rejectUnauthorized: false });
    localTcp = net.createConnection({ port: 5900, host: '127.0.0.1' });

    localTcp.on('connect', () => {
      console.log('[VNC] Local TCP connected');
    });

    agentWs.on('open', () => {
      console.log('[VNC] Raw WebSocket connected to Server');
    });

    // ─── DIRECT PIPE ───
    localTcp.on('data', data => {
      if (agentWs.readyState === WebSocket.OPEN) agentWs.send(data);
    });

    agentWs.on('message', data => {
      if (!localTcp.destroyed) localTcp.write(data);
    });

    // ─── CLEANUP ───
    localTcp.on('close', () => {
      if (agentWs.readyState === WebSocket.OPEN) agentWs.close();
      localTcp = null;
    });

    agentWs.on('close', () => {
      console.log('[VNC] Raw Tunnel closed');
      if (localTcp && !localTcp.destroyed) localTcp.destroy();
      agentWs = null;
    });
    
    localTcp.on('error', (err) => console.error('[VNC TCP Error]', err.message));
    agentWs.on('error', (err) => console.error('[VNC WS Error]', err.message));
  });
}

connect();

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGINT', () => {
  console.log('\n🛑 Agent dihentikan.');
  if (metricsInterval) clearInterval(metricsInterval);
  if (socket) socket.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (metricsInterval) clearInterval(metricsInterval);
  if (socket) socket.disconnect();
  process.exit(0);
});

// Keep process alive
process.on('uncaughtException', (err) => {
  console.error('[Agent] Uncaught error:', err.message);
  // Don't crash — agent must stay running
});
