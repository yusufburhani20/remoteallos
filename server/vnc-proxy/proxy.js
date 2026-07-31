const WebSocket = require('ws');
const pcRegistry = require('../store/pcRegistry');
const agentSockets = require('../store/agentSockets');
const crypto = require('crypto');

const pendingTunnels = new Map();

/**
 * VNC WebSocket Proxy (Raw Reverse Tunneling)
 *
 * When an admin requests remote desktop for a PC:
 *   Browser (noVNC) <--WS--> This Proxy <--WS--> Agent <--TCP--> VNC Server on lab PC
 */
function setupVncProxy(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });
  const wssAgent = new WebSocket.Server({ noServer: true });

  // Intercept HTTP upgrade requests
  httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith('/vnc/')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (url.pathname.startsWith('/agent-vnc/')) {
      wssAgent.handleUpgrade(request, socket, head, (ws) => {
        wssAgent.emit('connection', ws, request);
      });
    }
  });

  // ─── DASHBOARD BROWSER CONNECTS ───────────────────────────────────────────────
  wss.on('connection', (browserWs, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pcId = decodeURIComponent(url.pathname.split('/vnc/')[1] || '').toUpperCase();

    const pc = pcRegistry.getPC(pcId);
    const agentSocketio = agentSockets.get(pcId);

    if (!pc || pc.status !== 'online' || !agentSocketio) {
      console.warn(`[VNC] Rejected: PC "${pcId}" not found, offline, or agent socket missing`);
      browserWs.close(4000, 'PC not found or offline');
      return;
    }

    console.log(`[VNC] Browser requested tunnel for ${pc.hostname}`);

    const token = crypto.randomBytes(16).toString('hex');
    pendingTunnels.set(token, browserWs);

    // Timeout if agent doesn't connect within 10s
    const timeout = setTimeout(() => {
      pendingTunnels.delete(token);
      if (browserWs.readyState === WebSocket.OPEN) browserWs.close(4008, 'Agent connection timeout');
      console.warn(`[VNC] Agent ${pc.hostname} failed to open raw tunnel in time.`);
    }, 10000);

    browserWs.on('close', () => {
      clearTimeout(timeout);
      pendingTunnels.delete(token);
    });

    // Tell Agent to open a RAW WebSocket to /agent-vnc/TOKEN
    agentSocketio.emit('vnc-start-raw', { token });
  });

  // ─── AGENT CONNECTS RAW WEBSOCKET ──────────────────────────────────────────────
  wssAgent.on('connection', (agentWs, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.pathname.split('/agent-vnc/')[1];

    const browserWs = pendingTunnels.get(token);
    if (!browserWs || browserWs.readyState !== WebSocket.OPEN) {
      agentWs.close(4004, 'Invalid token or browser disconnected');
      return;
    }

    pendingTunnels.delete(token); // Token consumed
    console.log(`[VNC] Raw Tunnel established securely.`);

    // ─── DIRECT PIPE (RAW TCP SPEED) ───
    agentWs.on('message', data => {
      if (browserWs.readyState === WebSocket.OPEN) browserWs.send(data, { binary: true });
    });
    
    browserWs.on('message', data => {
      if (agentWs.readyState === WebSocket.OPEN) agentWs.send(data, { binary: true });
    });

    // ─── CLEANUP ───
    const cleanup = () => {
      if (agentWs.readyState === WebSocket.OPEN) agentWs.close();
      if (browserWs.readyState === WebSocket.OPEN) browserWs.close();
    };

    agentWs.on('close', cleanup);
    browserWs.on('close', cleanup);
    agentWs.on('error', cleanup);
    browserWs.on('error', cleanup);
  });

  console.log('✓ VNC Raw WebSocket Reverse Tunnel initialized');
}

module.exports = { setupVncProxy };
