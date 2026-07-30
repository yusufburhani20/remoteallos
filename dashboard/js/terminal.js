/**
 * Remote Shell Terminal Component
 * Handles the shell tab in the side panel
 */

const Terminal = (() => {
  const output = document.getElementById('terminal-output');
  const input  = document.getElementById('terminal-input');
  const prompt = document.getElementById('terminal-prompt');

  let currentPcId = null;
  const history = [];
  let histIdx = -1;

  function init(socket) {
    // Enter = send command
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = input.value.trim();
        if (!cmd || !currentPcId) return;
        sendCommand(socket, cmd);
        history.unshift(cmd);
        histIdx = -1;
        input.value = '';
      }

      // Arrow up/down = history navigation
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (histIdx < history.length - 1) histIdx++;
        input.value = history[histIdx] || '';
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (histIdx > 0) histIdx--;
        else { histIdx = -1; input.value = ''; return; }
        input.value = history[histIdx] || '';
      }
    });

    // Handle output from server
    socket.on('shell_output', (data) => {
      if (data.stdout) appendLine(data.stdout, 'out');
      if (data.stderr) appendLine(data.stderr, 'err');
      if (data.error)  appendLine(`Error: ${data.error}`, 'err');
    });
  }

  function sendCommand(socket, cmd) {
    appendLine(`${getPromptText()} ${cmd}`, 'cmd');
    socket.emit('shell_exec', {
      pcId: currentPcId,
      command: cmd,
      requestId: Date.now().toString(),
    });
    scrollBottom();
  }

  function appendLine(text, type = 'out') {
    const lines = String(text).split('\n');
    for (const line of lines) {
      const el = document.createElement('div');
      el.className = `terminal-line ${type}`;
      el.textContent = line;
      output.appendChild(el);
    }
    scrollBottom();
  }

  function scrollBottom() {
    output.scrollTop = output.scrollHeight;
  }

  function getPromptText() {
    return prompt.textContent;
  }

  function setPC(pcId, os) {
    currentPcId = pcId;
    prompt.textContent = os === 'windows' ? '>' : '$';
    clear();
    appendLine(`─── Connected to ${pcId} ───`, 'info');
  }

  function clear() {
    output.innerHTML = '';
    appendLine('─── Remote Shell ─── Ketik perintah lalu tekan Enter ───', 'info');
  }

  function focus() {
    input.focus();
  }

  return { init, setPC, clear, focus, appendLine };
})();
