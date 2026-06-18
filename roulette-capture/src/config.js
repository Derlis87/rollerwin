// ============================================================
// config.js v5.0 - Carga configuracion desde .env
// ============================================================
const fs = require('fs');
const path = require('path');

function loadConfig() {
  const envPath = path.join(__dirname, '..', '.env');
  const defaults = {
    ROLLERWIN_API_URL: 'https://rollerwin3.onrender.com/api/capture/receive',
    BETFURY_ENABLED: 'true',
    PINNACLE_ENABLED: 'true',
    STAKE_ENABLED: 'false',
    BETFURY_ROULETTE_URL: 'https://betfury.com/es/casino/games/roulette-live-by-evolution',
    PINNACLE_ROULETTE_URL: 'https://casino.pinnacle.com/es/live-casino/games/european-roulette/',
    STAKE_ROULETTE_URL: 'https://stake.com/casino/games/evolution/roulette',
    BETFURY_EMAIL: '',
    BETFURY_PASSWORD: '',
    PINNACLE_EMAIL: '',
    PINNACLE_PASSWORD: '',
    STAKE_EMAIL: '',
    STAKE_PASSWORD: '',
    MOUSE_MOVE_INTERVAL_MIN: '2000',
    MOUSE_MOVE_INTERVAL_MAX: '8000',
    SCROLL_INTERVAL_MIN: '15000',
    SCROLL_INTERVAL_MAX: '45000',
    RANDOM_CLICK_INTERVAL_MIN: '30000',
    RANDOM_CLICK_INTERVAL_MAX: '90000',
    HUMAN_BEHAVIOR_PROBABILITY: '0.3',
    RECOVERY_DELAY_MIN: '5000',
    RECOVERY_DELAY_MAX: '15000',
    MAX_RECOVERY_ATTEMPTS: '3',
    ROTATION_INTERVAL_MIN: '45',
    ROTATION_INTERVAL_MAX: '120',
    NO_SPIN_TIMEOUT: '120',
    HEADED: process.env.HEADED || 'true',
    LOG_LEVEL: 'info',
    CHROME_PATH: process.env.CHROME_PATH || '',
    CDP_PORT: process.env.CDP_PORT || '9222',
    CHROME_PROFILE: process.env.CHROME_PROFILE || './chrome-profile',
    // OCR
    OCR_INTERVAL: process.env.OCR_INTERVAL || '3000',
    OCR_CROP_X: process.env.OCR_CROP_X || '0',
    OCR_CROP_Y: process.env.OCR_CROP_Y || '50',
    OCR_CROP_W: process.env.OCR_CROP_W || '1920',
    OCR_CROP_H: process.env.OCR_CROP_H || '400',
  };

  let envVars = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (val) envVars[key] = val;
    }
  }

  // Merge: env vars override defaults
  const config = { ...defaults, ...envVars };

  // Parsear booleans
  config.betfuryEnabled = config.BETFURY_ENABLED === 'true';
  config.pinnacleEnabled = config.PINNACLE_ENABLED === 'true';
  config.stakeEnabled = config.STAKE_ENABLED === 'true';
  config.headed = config.HEADED === 'true';

  // Parsear numeros
  const parseNum = (k) => parseInt(config[k], 10) || 0;
  config.mouseMoveMin = parseNum('MOUSE_MOVE_INTERVAL_MIN');
  config.mouseMoveMax = parseNum('MOUSE_MOVE_INTERVAL_MAX');
  config.scrollMin = parseNum('SCROLL_INTERVAL_MIN');
  config.scrollMax = parseNum('SCROLL_INTERVAL_MAX');
  config.clickMin = parseNum('RANDOM_CLICK_INTERVAL_MIN');
  config.clickMax = parseNum('RANDOM_CLICK_INTERVAL_MAX');
  config.humanProbability = parseFloat(config.HUMAN_BEHAVIOR_PROBABILITY) || 0.3;
  config.recoveryMin = parseNum('RECOVERY_DELAY_MIN');
  config.recoveryMax = parseNum('RECOVERY_DELAY_MAX');
  config.maxRecovery = parseNum('MAX_RECOVERY_ATTEMPTS');
  config.rotationMin = parseNum('ROTATION_INTERVAL_MIN');
  config.rotationMax = parseNum('ROTATION_INTERVAL_MAX');
  config.noSpinTimeout = parseNum('NO_SPIN_TIMEOUT');
  // OCR
  config.ocrInterval = parseInt(config.OCR_INTERVAL, 10) || 3000;
  config.ocrCropX = parseInt(config.OCR_CROP_X, 10) || 0;
  config.ocrCropY = parseInt(config.OCR_CROP_Y, 10) || 50;
  config.ocrCropW = parseInt(config.OCR_CROP_W, 10) || 1920;
  config.ocrCropH = parseInt(config.OCR_CROP_H, 10) || 400;

  // Casinos activos ordenados
  config.activeCasinos = [];
  if (config.betfuryEnabled) config.activeCasinos.push('betfury');
  if (config.pinnacleEnabled) config.activeCasinos.push('pinnacle');
  if (config.stakeEnabled) config.activeCasinos.push('stake');

  if (config.activeCasinos.length === 0) {
    console.error('ERROR: No hay casinos activos. Activa al menos uno en .env');
    process.exit(1);
  }

  return config;
}

module.exports = { loadConfig };