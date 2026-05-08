/**
 * GODSEYE Logger
 * Structured logging with levels, timestamps, and module tags.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel = LEVELS.info;
let logStream = null;

function init(level = 'info') {
  currentLevel = LEVELS[level] ?? LEVELS.info;
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `godseye-${new Date().toISOString().slice(0, 10)}.log`);
    logStream = fs.createWriteStream(logFile, { flags: 'a' });
  } catch {
    // Fallback: console only
  }
}

function format(level, module, message, data) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] [${module}] ${message}`;
  if (data !== undefined) {
    return `${base} ${JSON.stringify(data)}`;
  }
  return base;
}

function log(level, module, message, data) {
  if (LEVELS[level] < currentLevel) return;
  const line = format(level, module, message, data);

  // Console output with color
  const colors = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
  const reset = '\x1b[0m';
  console.log(`${colors[level] || ''}${line}${reset}`);

  // File output
  if (logStream) {
    logStream.write(line + '\n');
  }
}

function createModuleLogger(module) {
  return {
    debug: (msg, data) => log('debug', module, msg, data),
    info: (msg, data) => log('info', module, msg, data),
    warn: (msg, data) => log('warn', module, msg, data),
    error: (msg, data) => log('error', module, msg, data),
  };
}

module.exports = { init, createModuleLogger };
