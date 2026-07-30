const si = require('systeminformation');
const { isBlocked } = require('./power');

/**
 * Format bytes per second to readable string (KB/s or MB/s)
 */
function formatSpeed(bytesPerSec) {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec >= 1024 * 1024) {
    return (bytesPerSec / (1024 * 1024)).toFixed(1) + ' MB/s';
  }
  return (bytesPerSec / 1024).toFixed(0) + ' KB/s';
}

/**
 * Collect CPU, RAM, Disk, Network Traffic & Active Apps
 */
async function getMetrics() {
  try {
    const [cpuLoad, mem, diskArr, netStatsArr, procData] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.networkStats(),
      si.processes(),
    ]);

    // Pick largest disk (usually C: or /)
    const disk = diskArr.sort((a, b) => (b.size || 0) - (a.size || 0))[0] || {};

    // Total Network Traffic Speed (sum all active interfaces)
    let totalRxSec = 0;
    let totalTxSec = 0;
    if (Array.isArray(netStatsArr)) {
      for (const iface of netStatsArr) {
        totalRxSec += Math.max(0, iface.rx_sec || 0);
        totalTxSec += Math.max(0, iface.tx_sec || 0);
      }
    }

    // Top active user app process names (excluding system background tasks)
    const activeProcs = (procData.list || [])
      .filter(p => p.cpu > 0 || p.mem > 0.1)
      .filter(p => p.name && !['system idle process', 'system', 'registry', 'smss.exe', 'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'svchost.exe', 'fontdrvhost.exe', 'dwm.exe', 'sihost.exe', 'taskhostw.exe'].includes(p.name.toLowerCase()))
      .sort((a, b) => b.cpu - a.cpu);

    const activeApp = activeProcs[0]?.name || 'Desktop';
    const appList = Array.from(new Set(activeProcs.slice(0, 8).map(p => p.name.replace(/\.exe$/i, ''))));

    return {
      cpu: Math.round(cpuLoad.currentLoad || 0),
      ram: {
        total:   mem.total   || 0,
        used:    mem.active  || mem.used || 0,
        percent: Math.round(((mem.active || mem.used || 0) / (mem.total || 1)) * 100),
      },
      disk: {
        total:   disk.size || 0,
        used:    disk.used || 0,
        percent: Math.round(disk.use || 0),
      },
      network: {
        down: formatSpeed(totalRxSec),
        up:   formatSpeed(totalTxSec),
        rx_sec: Math.round(totalRxSec),
        tx_sec: Math.round(totalTxSec),
      },
      activeApp: activeApp.replace(/\.exe$/i, ''),
      appList: appList.length > 0 ? appList : ['Desktop'],
      isInputBlocked: isBlocked(),
    };
  } catch (err) {
    console.error('[Metrics] Error:', err.message);
    return {
      cpu: 0,
      ram:  { total: 0, used: 0, percent: 0 },
      disk: { total: 0, used: 0, percent: 0 },
      network: { down: '0 KB/s', up: '0 KB/s', rx_sec: 0, tx_sec: 0 },
      activeApp: '—',
      appList: ['—'],
      isInputBlocked: isBlocked(),
    };
  }
}

module.exports = { getMetrics };
