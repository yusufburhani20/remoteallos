/**
 * File Manager Component
 * Handles the Files tab in the side panel with full drive access
 */

const FileManager = (() => {
  const listEl     = document.getElementById('fm-list');
  const pathEl     = document.getElementById('fm-path');
  const btnUp      = document.getElementById('fm-up');
  const btnDrives  = document.getElementById('fm-drives');
  const btnRefresh = document.getElementById('fm-refresh');
  const btnDelete  = document.getElementById('fm-delete');
  const btnDl      = document.getElementById('fm-download');

  let currentPcId   = null;
  let currentPath   = null;
  let currentParent = null;
  let selectedItem  = null;
  let socket        = null;

  const pendingRequests = new Map();

  function init(sock) {
    socket = sock;

    btnUp.addEventListener('click', () => {
      if (currentParent) {
        navigateTo(currentParent);
      } else if (currentPath) {
        const parent = getParentPath(currentPath);
        if (parent && parent !== currentPath) navigateTo(parent);
      }
    });

    if (btnDrives) {
      btnDrives.addEventListener('click', () => {
        navigateTo('DRIVES');
      });
    }

    btnRefresh.addEventListener('click', () => refresh());

    btnDelete.addEventListener('click', () => {
      if (!selectedItem || !currentPcId) return;
      const fullPath = joinPath(currentPath, selectedItem.name);
      if (!confirm(`Hapus: ${fullPath}?`)) return;
      const requestId = Date.now().toString();
      socket.emit('file_delete', { pcId: currentPcId, path: fullPath, requestId });
    });

    btnDl.addEventListener('click', () => {
      if (!selectedItem || selectedItem.isDirectory) return;
      const fullPath = joinPath(currentPath, selectedItem.name);
      const requestId = Date.now().toString();
      pendingRequests.set(requestId, selectedItem.name);
      socket.emit('file_download', { pcId: currentPcId, path: fullPath, requestId });
    });

    // Handle file list result
    socket.on('file_list_result', (data) => {
      renderList(data);
    });

    // Handle command result (delete, download)
    socket.on('command_result', (data) => {
      if (data.type === 'file_delete') {
        if (data.success) {
          showToast('File berhasil dihapus', 'success');
          refresh();
        } else {
          showToast(`Gagal hapus: ${data.error}`, 'error');
        }
      }

      if (data.type === 'file_download') {
        if (data.content) {
          const filename = pendingRequests.get(data.requestId) || 'download';
          pendingRequests.delete(data.requestId);
          downloadBase64(data.content, filename);
        } else {
          showToast(`Gagal download: ${data.error}`, 'error');
        }
      }
    });
  }

  function setPC(pcId) {
    currentPcId = pcId;
    currentPath = null;
    currentParent = null;
    selectedItem = null;
    render([]);
    navigateTo(null); // request default home directory
  }

  function navigateTo(path) {
    selectedItem = null;
    const requestId = Date.now().toString();
    socket.emit('file_list', { pcId: currentPcId, path, requestId });
    setLoading();
  }

  function refresh() {
    navigateTo(currentPath);
  }

  function renderList(data) {
    if (data.error) {
      listEl.innerHTML = `<div class="fm-empty">❌ ${data.error}</div>`;
      return;
    }

    currentPath = data.path;
    currentParent = data.parent;
    pathEl.textContent = data.path || '/';

    if (!data.items || data.items.length === 0) {
      listEl.innerHTML = '<div class="fm-empty">Folder kosong</div>';
      return;
    }

    render(data.items);
  }

  function render(items) {
    listEl.innerHTML = '';
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'fm-item';
      el.dataset.name = item.name;

      const isDrive = /^[A-Z]:\\?$/i.test(item.name);
      const icon = isDrive ? '💾' : item.isDirectory ? '📁' : getFileIcon(item.name);
      const meta = isDrive ? 'Drive' : item.isDirectory ? '' : formatBytes(item.size);

      el.innerHTML = `
        <span class="fm-item-icon">${icon}</span>
        <span class="fm-item-name">${escapeHtml(item.name)}</span>
        <span class="fm-item-meta">${meta}</span>
      `;

      el.addEventListener('click', (e) => {
        // Deselect previous
        document.querySelectorAll('.fm-item.selected').forEach(el => el.classList.remove('selected'));

        if (item.isDirectory) {
          const targetPath = (currentPath === 'Komputer Ini (Drives)' || !currentPath)
            ? item.name
            : joinPath(currentPath, item.name);
          navigateTo(targetPath);
        } else {
          el.classList.add('selected');
          selectedItem = item;
        }
      });

      el.addEventListener('dblclick', () => {
        if (!item.isDirectory) {
          btnDl.click();
        }
      });

      listEl.appendChild(el);
    }
  }

  function setLoading() {
    listEl.innerHTML = '<div class="fm-empty">⏳ Memuat...</div>';
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function getParentPath(p) {
    if (!p || p === 'Komputer Ini (Drives)') return null;
    const normalized = p.replace(/\\/g, '/').replace(/\/$/, '');
    const parts = normalized.split('/');
    if (parts.length <= 1) return 'DRIVES';
    parts.pop();
    const parent = parts.join('/') || '/';
    return parent || 'DRIVES';
  }

  function joinPath(base, name) {
    if (!base || base === 'Komputer Ini (Drives)') return name;
    const sep = base.includes('\\') ? '\\' : '/';
    return base.replace(/[/\\]$/, '') + sep + name;
  }

  function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
      pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
      ppt: '📎', pptx: '📎', txt: '📃', md: '📃', csv: '📊',
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', bmp: '🖼️', svg: '🖼️',
      mp4: '🎬', avi: '🎬', mkv: '🎬', mov: '🎬', mp3: '🎵', wav: '🎵',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
      exe: '⚙️', msi: '⚙️', bat: '⚙️', sh: '⚙️', py: '🐍', js: '⚡',
      html: '🌐', css: '🎨', json: '📋', xml: '📋', sql: '🗄️',
    };
    return icons[ext] || '📄';
  }

  function formatBytes(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes/1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes/1024/1024).toFixed(1)} MB`;
    return `${(bytes/1024/1024/1024).toFixed(2)} GB`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function downloadBase64(b64, filename) {
    const a = document.createElement('a');
    a.href = `data:application/octet-stream;base64,${b64}`;
    a.download = filename;
    a.click();
  }

  return { init, setPC };
})();
