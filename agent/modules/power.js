const { exec, spawn } = require('child_process');
const path = require('path');
const os   = require('os');

const IS_WINDOWS = os.platform() === 'win32';

let isInputBlocked = false;
let overlayProcess = null;

// ─── Power Commands ───────────────────────────────────────────────────────────
const COMMANDS = {
  windows: {
    shutdown: 'shutdown /s /f /t 0',
    restart:  'shutdown /r /f /t 0',
    lock:     'rundll32.exe user32.dll,LockWorkStation',
    logoff:   'logoff',
    sleep:    'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
  },
  linux: {
    shutdown: 'shutdown -h now',
    restart:  'reboot',
    lock:     'loginctl lock-sessions 2>/dev/null || xdg-screensaver lock 2>/dev/null || gnome-screensaver-command -l',
    logoff:   'pkill -u $(whoami) -KILL',
    sleep:    'systemctl suspend',
  },
};

/**
 * Execute a power management action or input lock action
 */
function executePowerAction(action) {
  if (action === 'block_input' || action === 'lock_input') {
    return setBlockInput(true);
  }
  if (action === 'unblock_input' || action === 'unlock_input') {
    return setBlockInput(false);
  }
  if (action === 'toggle_input_lock') {
    return setBlockInput(!isInputBlocked);
  }

  if (IS_WINDOWS && action === 'lock') {
    console.log('[Power] Locking active Windows user session...');
    const sys32 = process.env.SystemRoot ? `${process.env.SystemRoot}\\System32` : 'C:\\Windows\\System32';
    exec(`"${sys32}\\tsdiscon.exe"`);
    exec(`"${sys32}\\rundll32.exe" user32.dll,LockWorkStation`);
    return;
  }

  const platform = IS_WINDOWS ? 'windows' : 'linux';
  const cmd = COMMANDS[platform]?.[action];

  if (!cmd) {
    console.warn(`[Power] Unknown action: ${action}`);
    return;
  }

  console.log(`[Power] Executing: ${action} → ${cmd}`);
  exec(cmd, { shell: IS_WINDOWS ? 'cmd.exe' : '/bin/bash' }, (err) => {
    if (err) console.error(`[Power] ${action} failed:`, err.message);
  });
}

/**
 * Enable / Disable client input locking mode using Low-Level Injected Input Filtering.
 * Physical client mouse & keyboard events are trapped and blocked.
 * Admin remote access (VNC / Shell / Files / Dashboard) remains 100% operational.
 */
function setBlockInput(block) {
  isInputBlocked = !!block;
  console.log(`[Power] Set BlockInput -> ${isInputBlocked}`);

  if (IS_WINDOWS) {
    if (isInputBlocked) {
      showLockBanner();
    } else {
      hideLockBanner();
    }
  } else {
    if (isInputBlocked) {
      showLinuxLockBanner();
    } else {
      hideLinuxLockBanner();
    }
  }
  return { success: true, isInputBlocked };
}

function showLockBanner() {
  hideLockBanner();
  try {
    const lockScript = path.join(__dirname, '..', 'lock_worker.ps1');
    overlayProcess = spawn('powershell.exe', ['-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', lockScript], {
      detached: true,
      windowsHide: true
    });
    overlayProcess.unref();
  } catch (err) {
    console.error('[Power] Failed to spawn lock_worker.ps1:', err.message);
  }
}

function hideLockBanner() {
  if (overlayProcess) {
    try { overlayProcess.kill('SIGKILL'); } catch (_) {}
    overlayProcess = null;
  }
  if (IS_WINDOWS) {
    exec('powershell -Command "Get-Process powershell | Where-Object { $_.CommandLine -match \'lock_worker.ps1\' } | Stop-Process -Force" 2>nul', () => {});
  }
}

function showLinuxLockBanner() {
  hideLinuxLockBanner();
  const script = `
  USER_PID=$(pgrep -f "gnome-session|xfce4-session|lxsession|mate-session|gnome-shell" | head -n 1)
  if [ -n "$USER_PID" ]; then
    export DISPLAY=$(cat /proc/$USER_PID/environ 2>/dev/null | tr '\\0' '\\n' | grep -m 1 '^DISPLAY=' | cut -d= -f2)
    export XAUTHORITY=$(cat /proc/$USER_PID/environ 2>/dev/null | tr '\\0' '\\n' | grep -m 1 '^XAUTHORITY=' | cut -d= -f2)
  fi
  [ -z "$DISPLAY" ] && export DISPLAY=:0
  [ -z "$XAUTHORITY" ] && export XAUTHORITY=$(find /run/user -name "Xauthority" -print -quit 2>/dev/null || find /home -maxdepth 2 -name ".Xauthority" -print -quit 2>/dev/null)
  
  ids=$(xinput list 2>/dev/null | grep -v "Virtual core" | grep -Eo "id=[0-9]+" | cut -d= -f2)
  for id in $ids; do xinput disable $id 2>/dev/null; done
  
  # Try to show a banner if zenity is available
  zenity --info --title="Lab Manager Admin" --text="🔒 PERHATIAN: HAK AKSES CLIENT DIKUNCI OLEH ADMIN\n\nClient Dilarang Menggunakan PC | Remote Control Admin Aktif" --width=500 --timeout=86400 2>/dev/null &
  `;
  exec(script, { shell: '/bin/bash' });
}

function hideLinuxLockBanner() {
  const script = `
  USER_PID=$(pgrep -f "gnome-session|xfce4-session|lxsession|mate-session|gnome-shell" | head -n 1)
  if [ -n "$USER_PID" ]; then
    export DISPLAY=$(cat /proc/$USER_PID/environ 2>/dev/null | tr '\\0' '\\n' | grep -m 1 '^DISPLAY=' | cut -d= -f2)
    export XAUTHORITY=$(cat /proc/$USER_PID/environ 2>/dev/null | tr '\\0' '\\n' | grep -m 1 '^XAUTHORITY=' | cut -d= -f2)
  fi
  [ -z "$DISPLAY" ] && export DISPLAY=:0
  [ -z "$XAUTHORITY" ] && export XAUTHORITY=$(find /run/user -name "Xauthority" -print -quit 2>/dev/null || find /home -maxdepth 2 -name ".Xauthority" -print -quit 2>/dev/null)
  
  ids=$(xinput list 2>/dev/null | grep -v "Virtual core" | grep -Eo "id=[0-9]+" | cut -d= -f2)
  for id in $ids; do xinput enable $id 2>/dev/null; done
  killall zenity 2>/dev/null
  `;
  exec(script, { shell: '/bin/bash' });
}

function isBlocked() {
  return isInputBlocked;
}

/**
 * Show a notification/popup message on the screen
 */
function showNotification(message) {
  const safe = message.replace(/"/g, '\\"').replace(/'/g, "'");

  if (IS_WINDOWS) {
    const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${safe.replace(/'/g, "''")}', 'Lab Manager Admin', 'OK', 'Information')`;
    exec(`powershell -NonInteractive -Command "${ps}"`, (err) => {
      if (err) {
        exec(`msg * "${safe}"`, () => {});
      }
    });
  } else {
    exec(`notify-send "Lab Manager Admin" "${safe}" --icon=computer 2>/dev/null || zenity --info --title="Lab Manager Admin" --text="${safe}" 2>/dev/null`, () => {});
  }
}

module.exports = { executePowerAction, setBlockInput, isBlocked, showNotification };
