// ============================================================
// index.js v3 - Punto de entrada — HYBRID APPROACH
// ============================================================
// CAPTURA: Chrome Extension (injecta en MAIN world de iframes)
// NAVEGACION: Node.js + Playwright CDP (login, navigate, recovery)
// COMUNICACION: Extension → fetch localhost:19555 → Node.js → RollerWin API
// ============================================================

const { chromium } = require('playwright');
const { loadConfig } = require('./config');
const { createStealthContext, getProfile, launchRealChrome } = require('./browser/stealth');
const { stopHumanBehavior } = require('./browser/human-behavior');
const { ExtensionBridge } = require('./capture/extension-bridge');
const { RollerWinAPI } = require('./api/rollerwin-api');
const { PinnacleCasino } = require('./casinos/pinnacle');
const { BetFuryCasino } = require('./casinos/betfury');
const { StakeCasino } = require('./casinos/stake');
const { Orchestrator } = require('./orchestrator');
const log = require('./utils/logger');

function printBanner() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════╗');
  console.log('  ║   ROULETTE CAPTURE SYSTEM v3.0                  ║');
  console.log('  ║   Hybrid: Chrome Extension + Node.js CDP        ║');
  console.log('  ║   Captura REAL en iframes cross-origin          ║');
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

  // ========================================
  // INICIAR EXTENSION BRIDGE (HTTP server local)
  // ========================================
  const bridgePort = 19555;
  const bridge = new ExtensionBridge(bridgePort);

  // Crear API client
  const apiClient = new RollerWinAPI(config.ROLLERWIN_API_URL);

  // Crear instancias de casinos
  const casinoInstances = [];
  if (config.betfuryEnabled) casinoInstances.push(new BetFuryCasino(config, apiClient));
  if (config.pinnacleEnabled) casinoInstances.push(new PinnacleCasino(config, apiClient));
  if (config.stakeEnabled) casinoInstances.push(new StakeCasino(config, apiClient));

  // Iniciar bridge — el extension envia numeros aquí
  try {
    // Callback: cuando el bridge recibe un numero del extension,
    // enviarlo al casino activo para procesamiento
    bridge.start(async (number, source) => {
      // Buscar el casino que esté capturando actualmente
      const orchestrator_ref = global.__orchestrator;
      if (orchestrator_ref && orchestrator_ref.currentCasino) {
        await orchestrator_ref.currentCasino.onNumberFromExtension(number, source);
      } else {
        log.warn('bridge', `Numero ${number} recibido pero no hay casino activo`);
      }
    });

    log.info('system', `Extension bridge activo en puerto ${bridgePort}`);
    global.__bridge = bridge;
  } catch (err) {
    log.error('system', `No se pudo iniciar el bridge: ${err.message}`);
    log.error('system', 'Asegurate de que el puerto 19555 esté libre');
    process.exit(1);
  }

  // ========================================
  // LANZAR NAVEGADOR CON EXTENSION
  // ========================================
  let browser;
  let context;

  if (config.headed && config.CHROME_PATH) {
    log.info('system', 'Lanzando Chrome REAL para captura via CDP...');
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
        log.info('system', 'Usando contexto existente de Chrome');
      } else {
        context = await browser.newContext();
        log.info('system', 'Creado nuevo contexto en Chrome');
      }
    } catch (err) {
      log.error('system', `Error con Chrome REAL: ${err.message}`);
      log.error('system', 'Verifica que CHROME_PATH en .env apunte a chrome.exe');
      bridge.stop();
      process.exit(1);
    }
  } else {
    log.error('system', 'MODO HEADED REQUERIDO — la captura necesita Chrome visible');
    log.error('system', 'Set HEADED=true y CHROME_PATH en .env');
    bridge.stop();
    process.exit(1);
  }

  // ========================================
  // INICIAR ORQUESTADOR
  // ========================================
  const orchestrator = new Orchestrator(casinoInstances, config, apiClient);
  global.__orchestrator = orchestrator;

  // Manejo de señales
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('');
    log.warn('system', `Señal ${signal} — cerrando...`);
    await orchestrator.stop();
    stopHumanBehavior();
    bridge.stop();
    try { await context.close(); } catch(e) {}
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

    log.info('system', '');
    log.info('system', '  ═══════════════════════════════════════════');
    log.info('system', '  Sistema activo — Ctrl+C para detener');
    log.info('system', '  Captura via Chrome Extension (MAIN world)');
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