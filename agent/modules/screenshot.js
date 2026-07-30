const { spawn } = require('child_process');
const os = require('os');

const IS_WINDOWS = os.platform() === 'win32';
let latestThumbnail = null;
let workerProc = null;

function startThumbnailWorker() {
  if (!IS_WINDOWS || workerProc) return;

  const psCode = `
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
while ($true) {
  try {
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap($b.Width, $b.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $b64 = [Convert]::ToBase64String($ms.ToArray())
    [Console]::WriteLine("SHOT:" + $b64)
    $g.Dispose()
    $bmp.Dispose()
    $ms.Dispose()
  } catch {}
  Start-Sleep -Seconds 3
}
`;

  try {
    const encoded = Buffer.from(psCode, 'utf16le').toString('base64');
    workerProc = spawn('powershell.exe', ['-NonInteractive', '-NoProfile', '-EncodedCommand', encoded]);

    let buffer = '';
    workerProc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('SHOT:')) {
          latestThumbnail = trimmed.substring(5);
        }
      }
    });

    workerProc.on('exit', () => {
      workerProc = null;
      setTimeout(startThumbnailWorker, 5000);
    });
  } catch (err) {
    console.error('[ScreenshotWorker] Error:', err.message);
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

if (IS_WINDOWS) {
  startThumbnailWorker();
}

module.exports = { takeScreenshot, getLatestThumbnail, startThumbnailWorker };
