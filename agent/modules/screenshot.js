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
          try {
            const Jimp = require('jimp');
            const image = await Jimp.read(imgBuffer);
            image.resize(400, Jimp.AUTO); // Resize width to 400px (height auto)
            image.quality(60); // Lower jpeg quality to 60%
            const compressedBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
            latestThumbnail = compressedBuffer.toString('base64');
          } catch (err) {
            console.error('[ScreenshotWorker] Jimp compress error:', err.message);
            // Fallback to uncompressed if Jimp fails
            latestThumbnail = imgBuffer.toString('base64');
          }
        } catch (e) {
          // console.error('[ScreenshotWorker] Error:', e.message);
        }
        setTimeout(captureWin, 8000); // Increased interval to 8 seconds
      };
      captureWin();
    } catch (err) {
      console.error('[ScreenshotWorker] Failed to load screenshot-desktop:', err.message);
    }
  } else {
    // Linux / Ubuntu screenshot worker using scrot + dynamic multi-display & auth resolution
    const captureLinux = () => {
      const tmpPath = path.join(os.tmpdir(), 'lab_thumb.jpg');
      const shellCmd = `
        for D in $(ls /tmp/.X11-unix 2>/dev/null | tr 'X' ':' | sort -r); do
          for A in $(ps aux 2>/dev/null | grep -oE '\\-auth [^ ]+' | awk '{print $2}') $(find /run/user /home /root /var/lib -name "*authority*" 2>/dev/null); do
            if [ -f "$A" ]; then
              XAUTHORITY="$A" DISPLAY="$D" scrot -z -q 25 -o "${tmpPath}" 2>/dev/null && break 2
            fi
          done
        done
        [ -f "${tmpPath}" ] && base64 -w 0 "${tmpPath}" && rm -f "${tmpPath}"
      `;
      exec(shellCmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (!err && stdout && stdout.length > 100) {
          latestThumbnail = stdout.trim();
        }
        setTimeout(captureLinux, 5000); // 5 seconds interval
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

