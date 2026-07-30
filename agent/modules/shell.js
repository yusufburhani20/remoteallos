const { exec } = require('child_process');
const os = require('os');

const IS_WINDOWS = os.platform() === 'win32';

/**
 * Execute a shell command and return output via callback
 * @param {string} command
 * @param {Function} callback - called with { stdout, stderr, error, exitCode }
 */
function executeCommand(command, callback) {
  const options = {
    shell:     IS_WINDOWS ? 'cmd.exe' : '/bin/bash',
    timeout:   30_000,    // 30 second timeout
    maxBuffer: 5 * 1024 * 1024, // 5MB max output
    encoding:  'utf8',
  };

  exec(command, options, (error, stdout, stderr) => {
    callback({
      stdout:   stdout || '',
      stderr:   stderr || '',
      error:    error ? error.message : null,
      exitCode: error ? (error.code || 1) : 0,
    });
  });
}

module.exports = { executeCommand };
