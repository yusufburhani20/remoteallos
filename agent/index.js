/**
 * Lab Remote Manager — PC Agent
 *
 * Install di setiap PC lab (Windows & Ubuntu).
 * Agent akan otomatis terhubung ke server saat PC menyala.
 */

const { io }         = require('socket.io-client');
const os             = require('os');
const net            = require('net');
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

  // ─── REVERSE TUNNEL VNC ─────────────────────────────────────────────────────
  let vncSocket = null;
  socket.on('vnc-start', () => {
    console.log('[VNC] Starting local Reverse Tunnel to port 5900...');
    if (vncSocket) vncSocket.destroy();
    
    vncSocket = net.createConnection({ port: 5900, host: '127.0.0.1' });
    
    vncSocket.on('connect', () => {
      console.log('[VNC] Local socket connected');
    });

    vncSocket.on('data', (data) => {
      socket.emit('vnc-agent-data', data);
    });

    vncSocket.on('close', () => {
      console.log('[VNC] Local socket closed');
      socket.emit('vnc-agent-closed');
      vncSocket = null;
    });

    vncSocket.on('error', (err) => {
      console.error('[VNC] Local error:', err.message);
    });
  });

  socket.on('vnc-browser-data', (data) => {
    if (vncSocket && !vncSocket.destroyed) {
      vncSocket.write(data);
    }
  });

  socket.on('vnc-stop', () => {
    console.log('[VNC] Stopping Reverse Tunnel');
    if (vncSocket) {
      vncSocket.destroy();
      vncSocket = null;
    }
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
