/**
 * Lab Remote Manager — Main Dashboard App
 * Connects to Socket.IO /admin namespace and orchestrates all components
 */

// ─── State ─────────────────────────────────────────────────────────────────
const state = {
  pcs: {},            // pcId -> pc object
  selectedPcId: null,
  filter: 'all',
  search: '',
  vncRfb: null,       // active noVNC RFB connection
};

// ─── Socket Connection ──────────────────────────────────────────────────────
const socket = io('/admin', { reconnectionDelay: 2000 });

// ─── DOM Refs ───────────────────────────────────────────────────────────────
const $grid        = document.getElementById('pc-grid');
const $emptyState  = document.getElementById('empty-state');
const $panel       = document.getElementById('side-panel');
const $gridWrap    = document.getElementById('pc-grid-container');
const $connStatus  = document.getElementById('conn-status');

// ─── Init ───────────────────────────────────────────────────────────────────
Terminal.init(socket);
FileManager.init(socket);

// ─── Socket Events ──────────────────────────────────────────────────────────
socket.on('connect', () => {
  $connStatus.textContent = '🟢 Terhubung';
  $connStatus.style.color = 'var(--accent-green)';
});

socket.on('disconnect', () => {
  $connStatus.textContent = '🔴 Terputus';
  $connStatus.style.color = 'var(--accent-red)';
});

socket.on('connect_error', () => {
  $connStatus.textContent = '⚠️ Error koneksi';
  $connStatus.style.color = 'var(--accent-orange)';
});

// Initial data from server
socket.on('init', ({ pcs, stats }) => {
  state.pcs = {};
  for (const pc of pcs) state.pcs[pc.id] = pc;
  updateStats(stats);
  renderGrid();
});

// New PC registered
socket.on('pc_registered', (pc) => {
  state.pcs[pc.id] = pc;
  renderGrid();
  showToast(`🟢 ${pc.hostname} terhubung (${pc.os})`, 'success');
});

// PC went offline
socket.on('pc_offline', ({ pcId }) => {
  const pc = state.pcs[pcId];
  if (pc) {
    pc.status = 'offline';
    pc.metrics = null;
    renderGrid();
    updatePcCard(pcId);
    if (state.selectedPcId === pcId) updatePanelStatus(pc);
    showToast(`🔴 ${pc.hostname} offline`, 'warning');
  }
});

// Real-time metrics update
socket.on('pc_metrics', ({ pcId, metrics }) => {
  const pc = state.pcs[pcId];
  if (pc) {
    pc.metrics = metrics;
    updatePcCardMetrics(pcId);
    if (state.selectedPcId === pcId) updateInfoTab(pc);
  }
});

// Stats update
socket.on('stats_update', (stats) => {
  updateStats(stats);
});

// Error from server
socket.on('error_msg', ({ message }) => {
  showToast(message, 'error');
});

// Screenshot result
socket.on('screenshot_result', (data) => {
  if (data.error) {
    showToast(`Screenshot gagal: ${data.error}`, 'error');
    return;
  }
  const pcId = data.pcId || state.selectedPcId;
  const pc = state.pcs[pcId] || state.pcs[state.selectedPcId];
  const cleanData = (data.data || '').replace(/[\r\n]+/g, '');
  document.getElementById('ss-pc-name').textContent = pc?.hostname || pcId || 'PC';
  document.getElementById('ss-img').src = `data:image/jpeg;base64,${cleanData}`;
  document.getElementById('ss-download').href = `data:image/jpeg;base64,${cleanData}`;
  document.getElementById('ss-time').textContent = `Diambil: ${new Date(data.timestamp || Date.now()).toLocaleString('id-ID')}`;
  document.getElementById('screenshot-modal').classList.remove('hidden');
  showToast('📸 Screenshot berhasil diterima!', 'success');
});

// ─── Stats ──────────────────────────────────────────────────────────────────
function updateStats(stats) {
  document.getElementById('stat-total').textContent   = stats.total;
  document.getElementById('stat-online').textContent  = stats.online;
  document.getElementById('stat-offline').textContent = stats.offline;
}

// ─── Grid Rendering ──────────────────────────────────────────────────────────
function renderGrid() {
  const pcs = getFilteredPCs();

  // Remove existing cards (keep empty state)
  $grid.querySelectorAll('.pc-card').forEach(el => el.remove());

  $emptyState.style.display = pcs.length === 0 ? 'flex' : 'none';

  for (const pc of pcs) {
    const card = createPcCard(pc);
    $grid.appendChild(card);
  }
}

function getFilteredPCs() {
  let pcs = Object.values(state.pcs);

  // Filter
  switch (state.filter) {
    case 'online':  pcs = pcs.filter(p => p.status === 'online'); break;
    case 'offline': pcs = pcs.filter(p => p.status === 'offline'); break;
    case 'windows': pcs = pcs.filter(p => p.os === 'windows'); break;
    case 'linux':   pcs = pcs.filter(p => p.os === 'linux'); break;
  }

  // Search
  if (state.search) {
    const q = state.search.toLowerCase();
    pcs = pcs.filter(p =>
      (p.hostname || '').toLowerCase().includes(q) ||
      (p.ip || '').toLowerCase().includes(q)
    );
  }

  // Sort by hostname
  return pcs.sort((a, b) =>
    (a.hostname || '').localeCompare(b.hostname || '', undefined, { numeric: true })
  );
}

function createPcCard(pc) {
  const card = document.createElement('div');
  card.className = `pc-card ${pc.status}`;
  card.id = `card-${pc.id}`;
  if (state.selectedPcId === pc.id) card.classList.add('selected');

  const osIcon  = pc.os === 'windows' ? '🪟' : pc.os === 'linux' ? '🐧' : '💻';
  const cpu     = pc.metrics?.cpu ?? null;
  const ram     = pc.metrics?.ram?.percent ?? null;
  const disk    = pc.metrics?.disk?.percent ?? null;
  const netDown = pc.metrics?.network?.down ?? '0 KB/s';
  const netUp   = pc.metrics?.network?.up ?? '0 KB/s';
  const app     = pc.metrics?.activeApp || 'Desktop';
  const thumb   = pc.metrics?.thumbnail;

  const thumbHtml = thumb
    ? `<img class="pc-thumb-img" src="data:image/jpeg;base64,${thumb}" alt="Live Desktop">`
    : `<div class="pc-thumb-placeholder"><span>🖥️</span><span>${pc.status === 'online' ? 'Memuat Layar...' : 'Offline'}</span></div>`;

  card.innerHTML = `
    <div class="pc-card-top">
      <div class="pc-name-pill" title="${pc.hostname}">${pc.hostname}</div>
      <div class="pc-status-badge">
        <div class="pc-status-dot"></div>
        <span style="font-size:11px;">${osIcon}</span>
      </div>
    </div>
    <div class="pc-thumb-box" id="thumb-box-${pc.id}">
      ${thumbHtml}
      <div class="pc-thumb-hover">
        <span style="font-size:22px;">🔍</span>
        <span>Klik Remote Control</span>
      </div>
    </div>
    <div class="pc-card-detail">
      <div class="detail-grid">
        <div class="grid-cell" title="Alamat IP"><span class="cell-icon">🌐</span> <span class="cell-val net-ip">${pc.ip || '—'}</span></div>
        <div class="grid-cell" title="Penyimpanan Disk"><span class="cell-icon">💽</span> <span class="cell-val disk-val">Disk: ${disk !== null ? disk+'%' : '—'}</span></div>
        <div class="grid-cell" title="Trafik Download"><span class="cell-icon" style="color:#22c55e;">⬇</span> <span class="cell-val net-down">${netDown}</span></div>
        <div class="grid-cell" title="Trafik Upload"><span class="cell-icon" style="color:#3b82f6;">⬆</span> <span class="cell-val net-up">${netUp}</span></div>
      </div>
      <div class="detail-row app-banner" title="Aplikasi Utama Aktif: ${app}">
        <span style="color:#f59e0b; font-weight:700;">⚡ App:</span>
        <span class="app-name">${app}</span>
      </div>
      <div class="detail-resource-bar">
        <span class="res-label">CPU</span>
        <div class="res-bar"><div class="res-fill cpu" style="width:${cpu ?? 0}%"></div></div>
        <span class="res-val cpu-val">${cpu !== null ? cpu+'%' : '—'}</span>
      </div>
      <div class="detail-resource-bar">
        <span class="res-label">RAM</span>
        <div class="res-bar"><div class="res-fill ram" style="width:${ram ?? 0}%"></div></div>
        <span class="res-val ram-val">${ram !== null ? ram+'%' : '—'}</span>
      </div>
    </div>
  `;

  card.addEventListener('click', () => selectPC(pc.id));
  return card;
}

function updatePcCard(pcId) {
  const old = document.getElementById(`card-${pcId}`);
  const pc  = state.pcs[pcId];
  if (!old || !pc) return;
  const fresh = createPcCard(pc);
  old.replaceWith(fresh);
}

function updatePcCardMetrics(pcId) {
  const card = document.getElementById(`card-${pcId}`);
  const pc   = state.pcs[pcId];
  if (!card || !pc?.metrics) return;

  const m = pc.metrics;

  // Live update screen thumbnail
  if (m.thumbnail) {
    const thumbBox = document.getElementById(`thumb-box-${pcId}`);
    if (thumbBox) {
      thumbBox.innerHTML = `
        <img class="pc-thumb-img" src="data:image/jpeg;base64,${m.thumbnail}" alt="Live Desktop">
        <div class="pc-thumb-hover">
          <span style="font-size:22px;">🔍</span>
          <span>Klik Remote Control</span>
        </div>
      `;
    }
  }

  // Live update resource progress bars & traffic
  const cpuFill  = card.querySelector('.res-fill.cpu');
  const ramFill  = card.querySelector('.res-fill.ram');
  const cpuVal   = card.querySelector('.cpu-val');
  const ramVal   = card.querySelector('.ram-val');
  const diskEl   = card.querySelector('.disk-val');
  const netDown  = card.querySelector('.net-down');
  const netUp    = card.querySelector('.net-up');
  const appName  = card.querySelector('.app-name');

  if (cpuFill) cpuFill.style.width = (m.cpu ?? 0) + '%';
  if (ramFill) ramFill.style.width = (m.ram?.percent ?? 0) + '%';
  if (cpuVal) cpuVal.textContent = m.cpu !== undefined ? m.cpu + '%' : '—';
  if (ramVal) ramVal.textContent = m.ram?.percent !== undefined ? m.ram.percent + '%' : '—';
  if (diskEl && m.disk?.percent !== undefined) {
    diskEl.textContent = `Disk: ${m.disk.percent}%`;
  }
  if (netDown && m.network?.down) netDown.textContent = m.network.down;
  if (netUp && m.network?.up) netUp.textContent = m.network.up;
  if (appName && m.activeApp) appName.textContent = m.activeApp;
}

// ─── PC Selection & Panel ────────────────────────────────────────────────────
function selectPC(pcId) {
  // Deselect previous
  if (state.selectedPcId) {
    const prev = document.getElementById(`card-${state.selectedPcId}`);
    if (prev) prev.classList.remove('selected');
  }

  state.selectedPcId = pcId;
  const pc = state.pcs[pcId];
  if (!pc) return;

  // Highlight card
  const card = document.getElementById(`card-${pcId}`);
  if (card) card.classList.add('selected');

  // Populate panel
  document.getElementById('panel-pc-name').textContent = pc.hostname;
  document.getElementById('panel-pc-meta').textContent =
    `${pc.ip || '?'} • ${pc.os === 'windows' ? 'Windows' : 'Ubuntu'} • ${pc.arch || ''}`;

  updatePanelStatus(pc);
  updateInfoTab(pc);

  // Switch terminal to this PC
  Terminal.setPC(pcId, pc.os);

  // Switch file manager to this PC
  FileManager.setPC(pcId);

  // Open panel
  $panel.classList.add('open');
  $gridWrap.classList.add('panel-open');

  // Auto-switch to Remote Desktop tab and connect
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const remoteTabBtn = document.querySelector('.tab-btn[data-tab="remote"]');
  const remoteTabContent = document.getElementById('tab-remote');
  if (remoteTabBtn) remoteTabBtn.classList.add('active');
  if (remoteTabContent) remoteTabContent.classList.add('active');

  // Automatically connect VNC if PC is online
  if (pc.status === 'online') {
    connectVNC();
  } else {
    disconnectVNC();
  }
}

function updatePanelStatus(pc) {
  const dot = document.getElementById('panel-status-dot');
  dot.classList.toggle('online', pc.status === 'online');
}

function updateInfoTab(pc) {
  const m = pc.metrics;
  document.getElementById('info-cpu').textContent      = m ? `${m.cpu}%` : '—';
  document.getElementById('info-ram').textContent      = m ? `${m.ram.percent}%` : '—';
  document.getElementById('info-ram-sub').textContent  = m ? `${fmtBytes(m.ram.used)} / ${fmtBytes(m.ram.total)}` : '—';
  document.getElementById('info-disk').textContent     = m ? `${m.disk.percent}%` : '—';
  document.getElementById('info-disk-sub').textContent = m ? `${fmtBytes(m.disk.used)} / ${fmtBytes(m.disk.total)}` : '—';

  // Network traffic & Apps
  const netDown = m?.network?.down || '0 KB/s';
  const netUp   = m?.network?.up || '0 KB/s';
  const elNet   = document.getElementById('info-net');
  const elNetSub = document.getElementById('info-net-sub');
  if (elNet) elNet.textContent = `⬇ ${netDown}`;
  if (elNetSub) elNetSub.textContent = `⬆ ${netUp}`;

  const elAppMain = document.getElementById('d-app-main');
  const elNetDown = document.getElementById('d-net-down');
  const elNetUp   = document.getElementById('d-net-up');
  const elAppList = document.getElementById('d-app-list');

  if (elAppMain) elAppMain.textContent = m?.activeApp || '—';
  if (elNetDown) elNetDown.textContent = `⬇ ${netDown}`;
  if (elNetUp)   elNetUp.textContent   = `⬆ ${netUp}`;

  const appList = m?.appList || [];
  const appBadges = appList.length > 0
    ? appList.map(a => `<span style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); padding:2px 6px; border-radius:4px; margin:2px; font-size:11px; color:#fff; display:inline-block;">${a}</span>`).join('')
    : '—';
  if (elAppList) elAppList.innerHTML = appBadges;

  const btnLockInput = document.getElementById('btn-lock-input');
  if (btnLockInput) {
    const blocked = m?.isInputBlocked;
    btnLockInput.textContent = blocked ? '🔓 Buka Input' : '🔒 Kunci Input';
    btnLockInput.className = blocked ? 'btn btn-success' : 'btn btn-warning';
  }

  document.getElementById('info-status').textContent   = pc.status === 'online' ? '🟢 Online' : '🔴 Offline';
  document.getElementById('info-lastseen').textContent = pc.lastSeen
    ? `${new Date(pc.lastSeen).toLocaleTimeString('id-ID')}`
    : '—';
  document.getElementById('d-hostname').textContent   = pc.hostname || '—';
  document.getElementById('d-ip').textContent         = pc.ip || '—';
  document.getElementById('d-os').textContent         = pc.os === 'windows' ? '🪟 Windows' : pc.os === 'linux' ? '🐧 Ubuntu/Linux' : '—';
  document.getElementById('d-arch').textContent       = pc.arch || '—';
  document.getElementById('d-registered').textContent = pc.registeredAt
    ? new Date(pc.registeredAt).toLocaleString('id-ID') : '—';
}

// ─── Filter & Search ─────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filter = btn.dataset.filter;
    renderGrid();
  });
});

document.getElementById('search-input').addEventListener('input', (e) => {
  state.search = e.target.value.trim();
  renderGrid();
});

// ─── Panel Close / Return to Dashboard ───────────────────────────────────────
function closePanel() {
  $panel.classList.remove('open');
  $gridWrap.classList.remove('panel-open');
  if (state.selectedPcId) {
    const card = document.getElementById(`card-${state.selectedPcId}`);
    if (card) card.classList.remove('selected');
    state.selectedPcId = null;
  }
  disconnectVNC();
}

document.getElementById('panel-close').addEventListener('click', closePanel);
document.getElementById('btn-back')?.addEventListener('click', closePanel);

// Click background grid to close panel
$gridWrap.addEventListener('click', (e) => {
  if (e.target === $gridWrap || e.target === $grid) {
    closePanel();
  }
});

// ─── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');

    if (tab === 'shell') Terminal.focus();
  });
});

// ─── Panel Action Buttons ─────────────────────────────────────────────────────
document.getElementById('btn-screenshot').addEventListener('click', () => {
  if (!state.selectedPcId) return;
  socket.emit('screenshot', { pcId: state.selectedPcId, requestId: Date.now().toString() });
  showToast('📸 Mengambil screenshot...', 'info');
});

document.getElementById('btn-lock-input')?.addEventListener('click', () => {
  if (!state.selectedPcId) return;
  const pc = state.pcs[state.selectedPcId];
  const currentlyBlocked = pc?.metrics?.isInputBlocked;
  const action = currentlyBlocked ? 'unblock_input' : 'block_input';
  socket.emit('power', { pcId: state.selectedPcId, action });
  showToast(currentlyBlocked ? '🔓 Membuka kunci input...' : '🔒 Mengunci input keyboard & mouse...', 'warning');
});

document.getElementById('btn-lock-input-all')?.addEventListener('click', () => {
  const online = Object.values(state.pcs).filter(p => p.status === 'online').length;
  if (!online) return showToast('Tidak ada PC online', 'warning');
  if (!confirm(`Kunci input keyboard & mouse pada ${online} PC online?`)) return;
  socket.emit('broadcast_power', { action: 'block_input' });
  showToast(`🔒 Perintah Kunci Input dikirim ke ${online} PC`, 'warning');
});

document.getElementById('btn-lock').addEventListener('click', () => powerAction('lock'));
document.getElementById('btn-restart').addEventListener('click', () => {
  if (!confirm('Restart PC ini?')) return;
  powerAction('restart');
});
document.getElementById('btn-shutdown').addEventListener('click', () => {
  if (!confirm('Matikan PC ini?')) return;
  powerAction('shutdown');
});

function powerAction(action) {
  if (!state.selectedPcId) return;
  socket.emit('power', { pcId: state.selectedPcId, action });
  showToast(`⚙️ Perintah "${action}" dikirim ke ${state.pcs[state.selectedPcId]?.hostname}`, 'info');
}

// ─── Bulk Actions ─────────────────────────────────────────────────────────────
document.getElementById('btn-shutdown-all').addEventListener('click', () => {
  const online = Object.values(state.pcs).filter(p => p.status === 'online').length;
  if (!online) return showToast('Tidak ada PC online', 'warning');
  if (!confirm(`Matikan ${online} PC yang sedang online?`)) return;
  socket.emit('broadcast_power', { action: 'shutdown' });
  showToast(`⏻ Perintah shutdown dikirim ke ${online} PC`, 'warning');
});

// ─── Broadcast Modal ──────────────────────────────────────────────────────────
const broadcastModal = document.getElementById('broadcast-modal');
document.getElementById('btn-broadcast').addEventListener('click', () => {
  broadcastModal.classList.remove('hidden');
  document.getElementById('broadcast-text').focus();
});
document.getElementById('broadcast-cancel').addEventListener('click', () => broadcastModal.classList.add('hidden'));
document.getElementById('broadcast-send').addEventListener('click', () => {
  const msg = document.getElementById('broadcast-text').value.trim();
  if (!msg) return;
  socket.emit('broadcast_message', { message: msg });
  showToast('📢 Pesan dikirim ke semua PC', 'success');
  broadcastModal.classList.add('hidden');
  document.getElementById('broadcast-text').value = '';
});

// ─── Screenshot Modal ──────────────────────────────────────────────────────────
document.getElementById('ss-close').addEventListener('click', () => {
  document.getElementById('screenshot-modal').classList.add('hidden');
});

// ─── Remote Desktop (noVNC) ───────────────────────────────────────────────────
document.getElementById('vnc-connect').addEventListener('click', connectVNC);
document.getElementById('vnc-disconnect').addEventListener('click', disconnectVNC);
const toggleFullscreen = () => {
  const container = document.getElementById('vnc-canvas-container');
  if (!document.fullscreenElement) {
    container.requestFullscreen?.().catch(err => console.error('Fullscreen error:', err));
  } else {
    document.exitFullscreen?.().catch(err => console.error('Exit fullscreen error:', err));
  }
};

document.getElementById('vnc-fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('vnc-canvas-container').addEventListener('dblclick', toggleFullscreen);

document.addEventListener('fullscreenchange', () => {
  if (state.vncRfb) {
    // Force RFB viewport recalculation
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }
});

document.getElementById('vnc-ctrl-alt-del').addEventListener('click', () => {
  if (state.vncRfb) state.vncRfb.sendCtrlAltDel();
});

// Clipboard paste handling for VNC remote control
function sendTextToRemoteClipboard(text) {
  if (!state.vncRfb) {
    return showToast('Remote desktop belum terhubung', 'warning');
  }
  if (!text) return;
  try {
    state.vncRfb.clipboardPasteFrom(text);
    showToast('📋 Teks terkirim ke clipboard PC Client!', 'success');
  } catch (err) {
    console.error('Clipboard paste error:', err);
    showToast('Gagal mengirim teks ke clipboard client', 'error');
  }
}

function promptPasteToRemote() {
  const text = prompt('Ketik / Paste teks yang ingin dikirim ke clipboard PC Client:');
  if (text !== null && text.trim() !== '') {
    sendTextToRemoteClipboard(text);
  }
}

document.getElementById('vnc-paste')?.addEventListener('click', () => {
  if (navigator.clipboard && navigator.clipboard.readText) {
    navigator.clipboard.readText()
      .then(text => {
        if (text && text.trim()) {
          sendTextToRemoteClipboard(text);
        } else {
          promptPasteToRemote();
        }
      })
      .catch(() => promptPasteToRemote());
  } else {
    promptPasteToRemote();
  }
});

// Intercept Ctrl+V paste event when Remote Desktop tab is active
window.addEventListener('paste', (e) => {
  const remoteTab = document.getElementById('tab-remote');
  if (remoteTab && remoteTab.classList.contains('active') && state.vncRfb) {
    // Prevent default duplicate handling if active target is not a text input
    if (!['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      const text = e.clipboardData?.getData('text');
      if (text) {
        sendTextToRemoteClipboard(text);
      }
    }
  }
});

async function connectVNC() {
  if (!state.selectedPcId) return;
  const pc = state.pcs[state.selectedPcId];
  if (!pc || pc.status !== 'online') {
    return showToast('PC offline, tidak bisa connect', 'error');
  }

  disconnectVNC();

  const placeholder = document.getElementById('vnc-placeholder');
  const screen = document.getElementById('vnc-screen');

  if (placeholder) placeholder.style.display = 'flex';
  if (screen) {
    screen.innerHTML = '';
    screen.style.display = 'none';
  }

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/vnc/${encodeURIComponent(state.selectedPcId)}`;

  try {
    // Dynamically import noVNC RFB from CDN
    const { default: RFB } = await import('https://cdn.jsdelivr.net/npm/@novnc/novnc@1.4.0/core/rfb.js');

    const rfb = new RFB(screen, wsUrl, {
      credentials: { password: 'labpassword' }, // Sesuai password saat install TightVNC
    });

    rfb.viewOnly    = false;
    rfb.scaleViewport = true;
    rfb.resizeSession = false;

    rfb.addEventListener('connect', () => {
      showToast(`🖥️ Remote desktop ${pc.hostname} terhubung`, 'success');
      if (placeholder) placeholder.style.display = 'none';
      if (screen) screen.style.display = 'flex';
      document.getElementById('vnc-connect').style.display = 'none';
      document.getElementById('vnc-disconnect').style.display = '';
      setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    });

    rfb.addEventListener('clipboard', (e) => {
      if (e.detail && e.detail.text && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(e.detail.text).catch(() => {});
      }
    });

    rfb.addEventListener('disconnect', (e) => {
      if (placeholder) placeholder.style.display = 'flex';
      if (screen) {
        screen.style.display = 'none';
        screen.innerHTML = '';
      }
      document.getElementById('vnc-connect').style.display = '';
      document.getElementById('vnc-disconnect').style.display = 'none';
      state.vncRfb = null;
    });

    rfb.addEventListener('credentialsrequired', () => {
      const pw = prompt('Masukkan password VNC:');
      if (pw !== null) rfb.sendCredentials({ password: pw });
    });

    state.vncRfb = rfb;
  } catch (err) {
    console.error('VNC error:', err);
    showToast('Gagal memuat noVNC. Pastikan koneksi internet tersedia.', 'error');
    if (placeholder) placeholder.style.display = 'flex';
    if (screen) screen.style.display = 'none';
  }
}

function disconnectVNC() {
  if (state.vncRfb) {
    try { state.vncRfb.disconnect(); } catch (_) {}
    state.vncRfb = null;
  }
  const placeholder = document.getElementById('vnc-placeholder');
  const screen = document.getElementById('vnc-screen');
  if (placeholder) placeholder.style.display = 'flex';
  if (screen) {
    screen.style.display = 'none';
    screen.innerHTML = '';
  }
  document.getElementById('vnc-connect').style.display = '';
  document.getElementById('vnc-disconnect').style.display = 'none';
}

// ─── Toast Notification ───────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Expose globally for filemanager.js usage
window.showToast = showToast;

// ─── Utility ─────────────────────────────────────────────────────────────────
function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes/1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes/1024**2).toFixed(1)} MB`;
  return `${(bytes/1024**3).toFixed(2)} GB`;
}

// ─── Close modal on backdrop click ───────────────────────────────────────────
[broadcastModal, document.getElementById('screenshot-modal')].forEach(modal => {
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
});

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('broadcast-modal').classList.add('hidden');
    document.getElementById('screenshot-modal').classList.add('hidden');
    closePanel();
  }
});
