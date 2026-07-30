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
