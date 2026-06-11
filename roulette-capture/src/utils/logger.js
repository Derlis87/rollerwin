// ============================================================
// logger.js - Sistema de logs con colores y niveles
// ============================================================
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3, none: 4 };

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
};

let currentLevel = 'info';

function setLevel(level) {
  currentLevel = level;
}

function log(level, casino, message, data = null) {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

  const timestamp = new Date().toLocaleTimeString('es-AR', { hour12: false });
  const casinoTag = casino ? `[${casino.toUpperCase()}]` : '';
  const levelColors = {
    debug: COLORS.dim,
    info: COLORS.cyan,
    warn: COLORS.yellow,
    error: COLORS.red,
  };
  const color = levelColors[level] || COLORS.reset;

  let line = `${COLORS.dim}${timestamp}${COLORS.reset} ${color}${level.toUpperCase()}${COLORS.reset} ${COLORS.bright}${casinoTag}${COLORS.reset} ${message}`;
  
  if (data) {
    if (typeof data === 'object') {
      line += ` ${COLORS.dim}${JSON.stringify(data)}${COLORS.reset}`;
    } else {
      line += ` ${COLORS.dim}${data}${COLORS.reset}`;
    }
  }

  console.log(line);
}

module.exports = {
  setLevel,
  debug: (casino, msg, data) => log('debug', casino, msg, data),
  info: (casino, msg, data) => log('info', casino, msg, data),
  warn: (casino, msg, data) => log('warn', casino, msg, data),
  error: (casino, msg, data) => log('error', casino, msg, data),
  COLORS,
};