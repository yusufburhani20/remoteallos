const express = require('express');
const router = express.Router();
const pcRegistry = require('../store/pcRegistry');

// GET all PCs
router.get('/pcs', (req, res) => {
  res.json({
    pcs: pcRegistry.getAllPCs(),
    stats: pcRegistry.getStats(),
  });
});

// GET single PC by ID
router.get('/pcs/:pcId', (req, res) => {
  const pc = pcRegistry.getPC(req.params.pcId.toUpperCase());
  if (!pc) return res.status(404).json({ error: 'PC not found' });
  res.json(pc);
});

// WAKE PC via REST API
const wol = require('wake_on_lan');
router.all('/pcs/:pcId/wake', (req, res) => {
  const pc = pcRegistry.getPC(req.params.pcId.toUpperCase());
  if (!pc || !pc.mac) {
    return res.status(404).json({ error: 'PC atau MAC address tidak ditemukan' });
  }

  const targets = ['255.255.255.255'];
  if (pc.ip && /^(\d{1,3}\.){3}\d{1,3}$/.test(pc.ip)) {
    const parts = pc.ip.split('.');
    const subnetBrd = `${parts[0]}.${parts[1]}.${parts[2]}.255`;
    if (!targets.includes(subnetBrd)) targets.push(subnetBrd);
    if (!targets.includes(pc.ip)) targets.push(pc.ip);
  }

  targets.forEach(addr => {
    [9, 7].forEach(port => {
      wol.wake(pc.mac, { address: addr, port }, () => {});
    });
  });

  res.json({
    success: true,
    message: `Magic packet dikirim ke ${pc.hostname} (${pc.mac})`,
    mac: pc.mac,
    targets,
  });
});


// DELETE single offline PC
router.delete('/pcs/:pcId', (req, res) => {
  const pcId = req.params.pcId.toUpperCase();
  const pc = pcRegistry.getPC(pcId);
  if (!pc) return res.status(404).json({ error: 'PC tidak ditemukan' });
  if (pc.status === 'online') {
    return res.status(400).json({ error: 'PC sedang online, tidak dapat dihapus' });
  }
  pcRegistry.deletePC(pcId);
  res.json({ success: true, message: `PC ${pcId} berhasil dihapus` });
});

// POST clear all offline PCs
router.post('/pcs/clear-offline', (req, res) => {
  const count = pcRegistry.clearOfflinePCs();
  res.json({ success: true, count, message: `${count} PC offline berhasil dibersihkan` });
});

// POST execute command on PC agent
const agentSockets = require('../store/agentSockets');
router.post('/pcs/:pcId/exec', (req, res) => {
  const pcId = req.params.pcId.toUpperCase();
  const pc = pcRegistry.getPC(pcId);
  if (!pc || pc.status !== 'online') return res.status(404).json({ error: 'PC not found or offline' });
  const agentSocket = agentSockets.get(pcId);
  if (!agentSocket) return res.status(404).json({ error: 'Agent socket not found' });

  const requestId = 'api-' + Date.now();
  const command = req.body.command || req.query.command;
  if (!command) return res.status(400).json({ error: 'Command is required' });

  const timeout = setTimeout(() => {
    agentSocket.off('shell_output', onOutput);
    res.status(504).json({ error: 'Timeout waiting for agent shell output' });
  }, 10000);

  const onOutput = (data) => {
    if (data.requestId === requestId) {
      clearTimeout(timeout);
      agentSocket.off('shell_output', onOutput);
      res.json(data);
    }
  };

  agentSocket.on('shell_output', onOutput);
  agentSocket.emit('shell_exec', { command, requestId });
});


// GET stats summary
router.get('/stats', (req, res) => {
  res.json(pcRegistry.getStats());
});

// GET server info
router.get('/info', (req, res) => {
  res.json({
    version: '1.0.0',
    uptime: process.uptime(),
    nodeVersion: process.version,
  });
});


module.exports = router;
