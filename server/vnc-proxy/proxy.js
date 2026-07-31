const WebSocket = require('ws');
const pcRegistry = require('../store/pcRegistry');
const agentSockets = require('../store/agentSockets');

/**
 * VNC WebSocket Proxy (Reverse Tunneling via Socket.IO)
 *
 * When an admin requests remote desktop for a PC:
 *   Browser (noVNC) <--WS--> This Proxy <--Socket.io--> Agent <--TCP--> VNC Server on lab PC
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
  });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pcId = decodeURIComponent(url.pathname.split('/vnc/')[1] || '').toUpperCase();

    const pc = pcRegistry.getPC(pcId);
    const agentSocket = agentSockets.get(pcId);

    if (!pc || pc.status !== 'online' || !agentSocket) {
      console.warn(`[VNC] Rejected: PC "${pcId}" not found, offline, or agent socket missing`);
      ws.close(4000, 'PC not found or offline');
      return;
    }

    console.log(`[VNC] Starting Reverse Tunnel for ${pc.hostname}`);

    // Tell agent to start local VNC connection
    agentSocket.emit('vnc-start');

    // Agent -> Browser
    const onVncAgentData = (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data, { binary: true });
      }
    };
    
    const onVncAgentClosed = () => {
      console.log(`[VNC] Tunnel closed by Agent (${pc.hostname})`);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    agentSocket.on('vnc-agent-data', onVncAgentData);
    agentSocket.on('vnc-agent-closed', onVncAgentClosed);

    // Browser -> Agent
    ws.on('message', (data) => {
      agentSocket.emit('vnc-browser-data', data);
    });

    // Cleanup
    const cleanup = (source) => {
      console.log(`[VNC] Disconnected from ${pc.hostname} (${source})`);
      agentSocket.emit('vnc-stop');
      agentSocket.off('vnc-agent-data', onVncAgentData);
      agentSocket.off('vnc-agent-closed', onVncAgentClosed);
      if (ws.readyState === WebSocket.OPEN) ws.close();
    };

    ws.on('close', () => cleanup('browser'));
    ws.on('error', (err) => {
      console.error(`[VNC] WS error (${pc.hostname}):`, err.message);
      cleanup('ws-error');
    });
  });

  console.log('✓ VNC WebSocket Reverse Tunnel initialized');
}

module.exports = { setupVncProxy };
