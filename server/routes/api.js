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
