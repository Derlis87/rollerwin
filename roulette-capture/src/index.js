// ============================================================
// index.js v5.0 - Punto de entrada — OCR SIMPLE
// ============================================================
// CAPTURA: Screenshot + Tesseract.js OCR
// NAVEGACION: Playwright CDP (login, navigate)
// COMUNICACION: OCR detecta numero → NumberProcessor → RollerWin API
// SIN CDP injection, SIN extension, SIN WebSocket, SIN bridge
// ============================================================

const { chromium } = require('playwright');
const { loadConfig } = require('./config');
const { getProfile, launchRealChrome } = require('./browser/stealth');
const { stopHumanBehavior } = require('./browser/human-behavior');
const { RollerWinAPI } = require('./api/rollerwin-api');
const { PinnacleCasino } = require('./casinos/pinnacle');
const { BetFuryCasino } = require('./casinos/betfury');
const { StakeCasino } = require('./casinos/stake');
const { Orchestrator } = require('./orchestrator');
const log = require('./utils/logger');

function printBanner() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   ROULETTE CAPTURE SYSTEM v5.0                  ║');
  console.log('  ║   Modo: OCR (Tesseract.js) — SIMPLE             ║');
  console.log('  ║   Captura el numero visible de la pantalla      ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
}

async function main() {
  printBanner();

  const config = loadConfig();
  log.setLevel(config.LOG_LEVEL);

  log.info('system', 'Configuracion cargada');
  log.info('system', `Casinos activos: ${config.activeCasinos.join(', ')}`);
  log.info('system', `RollerWin API: ${config.ROLLERWIN_API_URL}`);
  log.info('system', `OCR interval: ${config.OCR_INTERVAL || 3000}ms`);
  log.info('system', `OCR region: x=${config.OCR_CROP_X || 0} y=${config.OCR_CROP_Y || 50} w=${config.OCR_CROP_W || 1920} h=${config.OCR_CROP_H || 400}`);

  // Crear API client
  const apiClient = new RollerWinAPI(config.ROLLERWIN_API_URL);

  // Crear instancias de casinos
  const casinoInstances = [];
  if (config.betfuryEnabled) casinoInstances.push(new BetFuryCasino(config, apiClient));
  if (config.pinnacleEnabled) casinoInstances.push(new PinnacleCasino(config, apiClient));
  if (config.stakeEnabled) casinoInstances.push(new StakeCasino(config, apiClient));

  if (casinoInstances.length === 0) {
    log.error('system', 'No hay casinos activos. Activa al menos uno en .env');
    process.exit(1);
  }

  // ========================================
  // LANZAR CHROME via CDP
  // ========================================
  let browser;
  let context;

  if (config.headed && config.CHROME_PATH) {
    log.info('system', 'Lanzando Chrome...');
    const profile = getProfile();
    log.info('system', `  UA: ${profile.ua.substring(0, 60)}...`);
    log.info('system', `  Locale: ${profile.locale} | TZ: ${profile.tz}`);

    try {
      const port = await launchRealChrome(config);
      log.info('system', `Chrome escuchando en puerto ${port}`);

      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      log.info('system', 'Conectado a Chrome via CDP');

      const contexts = browser.contexts();
      if (contexts.length > 0) {
        context = contexts[0];
        log.info('system', 'Usando contexto existente de Chrome');
      } else {
        context = await browser.newContext();
        log.info('system', 'Creado nuevo contexto en Chrome');
      }
    } catch (err) {
      log.error('system', `Error con Chrome: ${err.message}`);
      log.error('system', 'Verifica que CHROME_PATH en .env apunte a chrome.exe');
      process.exit(1);
    }
  } else {
    log.error('system', 'MODO HEADED REQUERIDO');
    log.error('system', 'Set HEADED=true y CHROME_PATH en .env');
    process.exit(1);
  }

  // ========================================
  // INICIAR ORQUESTADOR
  // ========================================
  const orchestrator = new Orchestrator(casinoInstances, config, apiClient);

  // Manejo de seniales
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('');
    log.warn('system', `Senal ${signal} — cerrando...`);
    await orchestrator.stop();
    stopHumanBehavior();
    try { await context.close(); } catch(e) {}
    log.info('system', 'Sistema cerrado');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', async (err) => {
    log.error('system', `Excepcion: ${err.message}`);
  });
  process.on('unhandledRejection', (err) => {
    log.error('system', `Promise rechazada: ${err}`);
  });

  try {
    await orchestrator.start(context);

    log.info('system', '');
    log.info('system', '  ═══════════════════════════════════════════');
    log.info('system', '  Sistema activo — Ctrl+C para detener');
    log.info('system', '  Captura via OCR (lee el numero de la pantalla)');
    log.info('system', '  ═══════════════════════════════════════════');
    log.info('system', '');

    // Loop principal
    while (orchestrator.running) {
      await new Promise(r => setTimeout(r, 5000));

      if (browser && !browser.isConnected()) {
        log.error('system', 'Browser desconectado! Reconectando...');
        await orchestrator.stop();
        stopHumanBehavior();

        const port = await launchRealChrome(config);
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
        const contexts = browser.contexts();
        context = contexts.length > 0 ? contexts[0] : await browser.newContext();

        await orchestrator.start(context);
      }
    }
  } catch (err) {
    log.error('system', `Error fatal: ${err.message}`);
    log.error('system', err.stack);
    await shutdown('error');
  }
}

main().catch(err => {
  console.error('Error fatal:', err);
  process.exit(1);
});