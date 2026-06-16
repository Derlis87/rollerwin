// ============================================================
// index.js v2 - Punto de entrada — Chrome REAL via CDP
// ============================================================
// CAMBIO FUNDAMENTAL: En vez de lanzar Chromium de Playwright,
// lanzamos Chrome REAL con --remote-debugging-port y nos
// conectamos via CDP. Esto permite:
//   1. Usar Page.addScriptToEvaluateOnNewDocument en MAIN world
//   2. Los iframes cross-origin corren en el mismo proceso
//   3. Los hooks de WebSocket/Fetch/XHR se ejecutan DENTRO del juego
// ============================================================

const { chromium } = require('playwright');
const { loadConfig } = require('./config');
const { getLaunchOptions, createStealthContext, getProfile, launchRealChrome } = require('./browser/stealth');
const { startHumanBehavior, stopHumanBehavior, setCaptureActive } = require('./browser/human-behavior');
const { RollerWinAPI } = require('./api/rollerwin-api');
const { PinnacleCasino } = require('./casinos/pinnacle');
const { BetFuryCasino } = require('./casinos/betfury');
const { StakeCasino } = require('./casinos/stake');
const { Orchestrator } = require('./orchestrator');
const log = require('./utils/logger');

function printBanner() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   ROULETTE CAPTURE SYSTEM v2.0                  ║');
  console.log('  ║   Inyección MAIN world en iframes               ║');
  console.log('  ║   Chrome REAL + CDP + postMessage bridge        ║');
  console.log('  ╚══════════════════════════════════════════════════╝');
  console.log('');
}

async function main() {
  printBanner();

  const config = loadConfig();
  log.setLevel(config.LOG_LEVEL);

  log.info('system', 'Configuración cargada');
  log.info('system', `Casinos activos: ${config.activeCasinos.join(', ')}`);
  log.info('system', `RollerWin API: ${config.ROLLERWIN_API_URL}`);

  const apiClient = new RollerWinAPI(config.ROLLERWIN_API_URL);

  // Crear instancias de casinos
  const casinoInstances = [];
  if (config.betfuryEnabled) casinoInstances.push(new BetFuryCasino(config, apiClient));
  if (config.pinnacleEnabled) casinoInstances.push(new PinnacleCasino(config, apiClient));
  if (config.stakeEnabled) casinoInstances.push(new StakeCasino(config, apiClient));

  // ========================================
  // LANZAR NAVEGADOR
  // ========================================
  let browser;
  let context;

  if (config.headed && config.CHROME_PATH) {
    // MODO HEADED: Lanzar Chrome REAL y conectar via CDP
    log.info('system', 'Lanzando Chrome REAL con anti-OOPIF...');
    const profile = getProfile();
    log.info('system', `  UA: ${profile.ua.substring(0, 60)}...`);
    log.info('system', `  Locale: ${profile.locale} | TZ: ${profile.tz}`);

    try {
      const port = await launchRealChrome(config);
      log.info('system', `Chrome REAL escuchando en puerto ${port}`);

      // Conectar via CDP
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      log.info('system', 'Conectado a Chrome via CDP');

      // Obtener el contexto por defecto (con las cookies ya guardadas)
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        context = contexts[0];
        log.info('system', 'Usando contexto existente de Chrome (con cookies)');
      } else {
        context = await browser.newContext();
        log.info('system', 'Creado nuevo contexto en Chrome');
      }
    } catch (err) {
      log.error('system', `Error con Chrome REAL: ${err.message}`);
      log.error('system', 'Verifica que CHROME_PATH en .env apunte a chrome.exe / google-chrome');
      process.exit(1);
    }
  } else {
    // MODO HEADLESS: Usar Chromium de Playwright
    log.info('system', 'Lanzando Chromium (headless) con anti-OOPIF...');
    const launchOptions = getLaunchOptions(config);
    const profile = launchOptions.profile;

    log.info('system', `  UA: ${profile.ua.substring(0, 60)}...`);

    browser = await chromium.launch({
      headless: !config.headed,
      args: launchOptions.args,
      ignoreDefaultArgs: ['--enable-automation'],
      channel: 'chromium',
    });
    log.info('system', 'Chromium lanzado');

    context = await createStealthContext(browser, config);
    log.info('system', 'Contexto stealth creado');
  }

  // ========================================
  // INICIAR ORQUESTADOR
  // ========================================
  const orchestrator = new Orchestrator(casinoInstances, config, apiClient);

  // Manejo de señales
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('');
    log.warn('system', `Señal ${signal} — cerrando...`);
    await orchestrator.stop();
    stopHumanBehavior();
    try { await context.close(); } catch(e) {}
    // NO cerrar browser si es CDP (Chrome REAL se mantiene abierto)
    if (!config.headed || !config.CHROME_PATH) {
      try { await browser.close(); } catch(e) {}
    }
    log.info('system', 'Sistema cerrado');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', async (err) => {
    log.error('system', `Excepción: ${err.message}`);
  });
  process.on('unhandledRejection', (err) => {
    log.error('system', `Promise rechazada: ${err}`);
  });

  try {
    await orchestrator.start(context);

    // Guardar cookies periódicamente
    const cookieSaveLoop = setInterval(async () => {
      if (!orchestrator.running) return;
      try {
        const cookies = await context.cookies();
        const fs = require('fs');
        if (!fs.existsSync('./config')) fs.mkdirSync('./config', { recursive: true });
        fs.writeFileSync('./config/cookies.json', JSON.stringify(cookies, null, 2));
        log.debug('system', `Cookies guardadas (${cookies.length})`);
      } catch (e) {}
    }, 300000);

    log.info('system', '');
    log.info('system', '  ═══════════════════════════════════════════');
    log.info('system', '  Sistema activo — Ctrl+C para detener');
    log.info('system', '  ═══════════════════════════════════════════');
    log.info('system', '');

    // Loop principal
    while (orchestrator.running) {
      await new Promise(r => setTimeout(r, 5000));

      if (browser && !browser.isConnected()) {
        log.error('system', 'Browser desconectado! Reconectando...');
        await orchestrator.stop();
        stopHumanBehavior();

        if (config.headed && config.CHROME_PATH) {
          const port = await launchRealChrome(config);
          browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
          const contexts = browser.contexts();
          context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        } else {
          browser = await chromium.launch({
            headless: true,
            args: ['--disable-site-isolation-trials', '--disable-features=IsolateOrigins,site-per-process'],
            ignoreDefaultArgs: ['--enable-automation'],
            channel: 'chromium',
          });
          context = await createStealthContext(browser, config);
        }

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