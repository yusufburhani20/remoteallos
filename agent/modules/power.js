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
    lock:     'loginctl lock-session 2>/dev/null || xdg-screensaver lock 2>/dev/null || gnome-screensaver-command -l',
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
    const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;

public class SessionLocker {
    [DllImport("kernel32.dll")]
    public static extern uint WTSGetActiveConsoleSessionId();

    [DllImport("wtsapi32.dll", SetLastError = true)]
    public static extern bool WTSDisconnectSession(IntPtr hServer, uint sessionId, bool bWait);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool LockWorkStation();

    public static void Lock() {
        uint sid = WTSGetActiveConsoleSessionId();
        if (sid != 0xFFFFFFFF) {
            WTSDisconnectSession(IntPtr.Zero, sid, false);
        }
        LockWorkStation();
    }
}
'@

Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
[SessionLocker]::Lock()
`;
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    exec(`powershell -NonInteractive -NoProfile -EncodedCommand ${encoded}`);

    // Fallback
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
  }
  return { success: true, isInputBlocked };
}

function showLockBanner() {
  hideLockBanner();
  try {
    const lockScript = path.join(__dirname, '..', 'lock_worker.ps1');
    overlayProcess = spawn('powershell.exe', [
      '-NonInteractive',
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', lockScript
    ], {
      detached: false,
      stdio: 'ignore'
    });
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
    exec('taskkill /F /FI "WINDOWTITLE eq Lab Manager Lock Banner" 2>nul', () => {});
    exec('wmic process where "commandline like \'%lock_worker.ps1%\'" call terminate 2>nul', () => {});
  }
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
