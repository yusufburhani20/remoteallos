const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const IS_WINDOWS = os.platform() === 'win32';

function getWindowsDrives() {
  try {
    const stdout = execSync('wmic logicaldisk get caption', { encoding: 'utf8' });
    const drives = stdout.split('\n')
      .map(s => s.trim())
      .filter(s => /^[A-Z]:$/i.test(s))
      .map(drive => ({
        name: drive + '\\',
        isDirectory: true,
        isFile: false,
        size: null,
        modified: null,
      }));
    return drives.length > 0 ? drives : [{ name: 'C:\\', isDirectory: true, isFile: false, size: null, modified: null }];
  } catch (_) {
    return [{ name: 'C:\\', isDirectory: true, isFile: false, size: null, modified: null }];
  }
}

/**
 * List contents of a directory or drive list
 * @param {string|null} dirPath
 */
function listDirectory(dirPath) {
  // If requested drives view
  if (dirPath === 'DRIVES' || dirPath === 'MY_COMPUTER') {
    return {
      path: 'Komputer Ini (Drives)',
      parent: null,
      items: IS_WINDOWS ? getWindowsDrives() : [{ name: '/', isDirectory: true, isFile: false, size: null, modified: null }],
      error: null,
    };
  }

  const resolvedPath = dirPath ? path.resolve(dirPath) : os.homedir();
  const parentPath = path.dirname(resolvedPath);

  // If at drive root (e.g., C:\ or C:), parent is DRIVES view
  const parent = (resolvedPath === parentPath || resolvedPath === parentPath + '\\' || /^[A-Z]:\\?$/i.test(resolvedPath)) ? 'DRIVES' : parentPath;

  try {
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });

    const items = entries.map(entry => {
      let size = null;
      let modified = null;
      let isDir = false;
      let isFile = false;

      try {
        isDir = entry.isDirectory();
        isFile = entry.isFile();
        const stat = fs.statSync(path.join(resolvedPath, entry.name));
        size     = isFile ? stat.size : null;
        modified = stat.mtime ? stat.mtime.toISOString() : null;
      } catch (_) {
        // Fallback for system files with restricted permissions
        isDir = entry.isDirectory ? entry.isDirectory() : false;
        isFile = entry.isFile ? entry.isFile() : false;
      }

      return {
        name:        entry.name,
        isDirectory: isDir,
        isFile:      isFile,
        size,
        modified,
      };
    });

    // Sort: dirs first, then files
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return {
      path:   resolvedPath,
      parent: parent,
      items,
      error:  null,
    };
  } catch (err) {
    return { path: resolvedPath, parent: parent, items: [], error: err.message };
  }
}

/**
 * Delete a file or directory (recursive)
 */
function deleteItem(itemPath) {
  try {
    const stat = fs.statSync(itemPath);
    if (stat.isDirectory()) {
      fs.rmSync(itemPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(itemPath);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Read a file and return base64-encoded content for download (Max 50MB)
 */
function readFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > 50 * 1024 * 1024) {
      return { error: 'File terlalu besar (maksimal 50MB)' };
    }
    const content = fs.readFileSync(filePath);
    return {
      content:  content.toString('base64'),
      filename: path.basename(filePath),
    };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { listDirectory, deleteItem, readFile };
