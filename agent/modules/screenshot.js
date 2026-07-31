const { spawn, exec } = require('child_process');
const os = require('os');
const path = require('path');

const IS_WINDOWS = os.platform() === 'win32';
let latestThumbnail = null;
let workerProc = null;

function startThumbnailWorker() {
  if (workerProc) return;

  if (IS_WINDOWS) {
    try {
      const screenshot = require('screenshot-desktop');
      const captureWin = async () => {
        try {
          const imgBuffer = await screenshot({ format: 'jpg' });
          latestThumbnail = imgBuffer.toString('base64');
        } catch (e) {
          // console.error('[ScreenshotWorker] Error:', e.message);
        }
        setTimeout(captureWin, 3000);
      };
      captureWin();
    } catch (err) {
      console.error('[ScreenshotWorker] Failed to load screenshot-desktop:', err.message);
    }
  } else {
    // Linux / Ubuntu screenshot worker using scrot + dynamic XAUTHORITY & DISPLAY
    const captureLinux = () => {
      const tmpPath = path.join(os.tmpdir(), 'lab_thumb.jpg');
      const shellCmd = `
        AUTH=$(find /run/user /var/run/gdm3 /home /root -name Xauthority 2>/dev/null | head -n 1)
        DISP=$(w -h 2>/dev/null | awk '{print $2}' | grep -E '^:[0-9]' | head -n 1)
        [ -z "$DISP" ] && DISP=":0"
        XAUTHORITY="$AUTH" DISPLAY="$DISP" scrot -z -q 25 -o "${tmpPath}" 2>/dev/null && base64 -w 0 "${tmpPath}"
      `;
      exec(shellCmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (!err && stdout && stdout.length > 100) {
          latestThumbnail = stdout.trim();
        }
        setTimeout(captureLinux, 3000);
      });
    };
    captureLinux();
  }
}

function getLatestThumbnail() {
  return latestThumbnail;
}

function takeScreenshot() {
  return new Promise((resolve) => {
    if (latestThumbnail) {
      return resolve({
        data: latestThumbnail,
        format: 'jpg',
        timestamp: new Date().toISOString(),
      });
    }
    resolve({ error: 'Layar belum siap, tunggu beberapa detik...' });
  });
}

startThumbnailWorker();

module.exports = { takeScreenshot, getLatestThumbnail, startThumbnailWorker };

