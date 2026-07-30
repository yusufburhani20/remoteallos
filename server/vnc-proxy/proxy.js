const WebSocket = require('ws');
const net = require('net');
const pcRegistry = require('../store/pcRegistry');

/**
 * VNC WebSocket Proxy (websockify equivalent in Node.js)
 *
 * When an admin requests remote desktop for a PC:
 *   Browser (noVNC) <--WS--> This Proxy <--TCP--> VNC Server on lab PC
 *
 * VNC server must be running on port 5900 on each lab PC.
 *
 * Path format: /vnc/<pcId>
 */
function setupVncProxy(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  // Intercept HTTP upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith('/vnc/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // All other upgrades (Socket.IO) are handled by Socket.IO itself
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pcId = decodeURIComponent(url.pathname.split('/vnc/')[1] || '').toUpperCase();

    const pc = pcRegistry.getPC(pcId);

    if (!pc || pc.status !== 'online' || !pc.ip) {
      console.warn(`[VNC] Rejected: PC "${pcId}" not found or offline`);
      ws.close(4000, 'PC not found or offline');
      return;
    }

    const vncHost = pc.ip;
    const vncPort = 5900;

    console.log(`[VNC] Connecting to ${pc.hostname} at ${vncHost}:${vncPort}`);

    const tcpSocket = net.createConnection({ host: vncHost, port: vncPort });

    tcpSocket.on('connect', () => {
      console.log(`[VNC] ✓ Connected to ${pc.hostname}`);
    });

    // VNC → browser
    tcpSocket.on('data', (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data, { binary: true }, (err) => {
          if (err) tcpSocket.destroy();
        });
      }
    });

    // browser → VNC
    ws.on('message', (data) => {
      if (!tcpSocket.destroyed) {
        tcpSocket.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
      }
    });

    // Cleanup
    const cleanup = (source) => {
      console.log(`[VNC] Disconnected from ${pc.hostname} (${source})`);
      if (!tcpSocket.destroyed) tcpSocket.destroy();
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    ws.on('close', () => cleanup('browser'));
    ws.on('error', (err) => {
      console.error(`[VNC] WS error (${pc.hostname}):`, err.message);
      cleanup('ws-error');
    });

    tcpSocket.on('close', () => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });

    tcpSocket.on('error', (err) => {
      console.error(`[VNC] TCP error (${pc.hostname}):`, err.message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(4001, `VNC connection failed: ${err.message}`);
      }
    });
  });

  console.log('✓ VNC WebSocket proxy initialized');
}

module.exports = { setupVncProxy };
