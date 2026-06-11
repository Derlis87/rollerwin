// ============================================================
// index.js - Punto de entrada principal
// Roulette Capture System v1.0 - Multi-Casino 24/7
// ============================================================

const { chromium } = require('playwright');
const { loadConfig } = require('./config');
const { getLaunchOptions, createStealthContext, getProfile } = require('./browser/stealth');
const { startHumanBehavior, stopHumanBehavior, humanPause } = require('./browser/human-behavior');
const { RollerWinAPI } = require('./api/rollerwin-api');
const { BetFuryCasino } = require('./casinos/betfury');
const { PinnacleCasino } = require('./casinos/pinnacle');
const { StakeCasino } = require('./casinos/stake');
const { Orchestrator } = require('./orchestrator');
const log = require('./utils/logger');

// ============================================================
// BANNER
// ============================================================
function printBanner() {
  console.log('');
  console.log('  ██████╗ ███████╗ █████╗ ██╗  ████████╗██╗███╗   ███╗███████╗');
  console.log('  ██╔══██╗██╔════╝██╔══██╗██║  ╚══██╔══╝██║████╗ ████║██╔════╝');
  console.log('  ██████╔╝█████╗  ███████║██║     ██║   ██║██╔████╔██║█████╗  ');
  console.log('  ██╔══██╗██╔══╝  ██╔══██║██║     ██║   ██║██║╚██╔╝██║██╔══╝  ');
  console.log('  ██║  ██║███████╗██║  ██║███████╗██║   ██║██║ ╚═╝ ██║███████╗');
  console.log('  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝╚═╝   ╚═╝╚═╝     ╚═╝╚══════╝');
  console.log('');
  console.log('  Multi-Casino Roulette Capture System v1.0');
  console.log('  Comportamiento humano | Anti-deteccion | 24/7');
  console.log('');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  printBanner();

  // 1. Cargar configuracion
  const config = loadConfig();
  log.setLevel(config.LOG_LEVEL);

  log.info('system', 'Configuracion cargada');
  log.info('system', `Casinos activos: ${config.activeCasinos.join(', ')}`);
  log.info('system', `Modo: ${config.headed ? 'VISIBLE (head: false)' : 'HEADLESS (invisible)'}`);
  log.info('system', `RollerWin API: ${config.ROLLERWIN_API_URL}`);

  // 2. Crear cliente API
  const apiClient = new RollerWinAPI(config.ROLLERWIN_API_URL);

  // 3. Crear instancias de casinos
  const casinoInstances = [];
  if (config.betfuryEnabled) {
    casinoInstances.push(new BetFuryCasino(config, apiClient));
  }
  if (config.pinnacleEnabled) {
    casinoInstances.push(new PinnacleCasino(config, apiClient));
  }
  if (config.stakeEnabled) {
    casinoInstances.push(new StakeCasino(config, apiClient));
  }

  // 4. Lanzar navegador con stealth
  log.info('system', 'Lanzando navegador con anti-deteccion...');
  const launchOptions = getLaunchOptions(config);
  const profile = getProfile();

  log.info('system', `  User-Agent: ${profile.ua.substring(0, 60)}...`);
  log.info('system', `  Viewport: ${profile.vp.width}x${profile.vp.height}`);
  log.info('system', `  Locale: ${profile.locale} | TZ: ${profile.tz}`);

  let browser;
  try {
    browser = await chromium.launch(launchOptions);
    log.info('system', 'Navegador lanzado correctamente');
  } catch (err) {
    log.error('system', `Error lanzando navegador: ${err.message}`);
    log.error('system', 'Asegurate de tener Playwright instalado: npx playwright install chromium');
    process.exit(1);
  }

  // 5. Crear contexto con stealth
  const context = await createStealthContext(browser, config);

  // Inyectar cookies de sesion si existen (para mantener login)
  // El usuario puede exportar sus cookies desde el navegador
  const cookiesPath = './config/cookies.json';
  try {
    const fs = require('fs');
    if (fs.existsSync(cookiesPath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
      await context.addCookies(cookies);
      log.info('system', `Cookies cargadas desde ${cookiesPath} (${cookies.length} cookies)`);
    } else {
      log.info('system', 'No se encontraron cookies guardadas - se usara sesion nueva');
      log.info('system', 'Si necesitas login, exporta las cookies de tu navegador a config/cookies.json');
    }
  } catch (e) {
    log.debug('system', 'No se pudieron cargar cookies (es normal si no existen)');
  }

  // 6. Iniciar orquestador
  const orchestrator = new Orchestrator(casinoInstances, config, apiClient);

  // Manejo de senales
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log('');
    log.warn('system', `Recibida señal ${signal} - cerrando...`);
    await orchestrator.stop();
    stopHumanBehavior();
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    log.info('system', 'Sistema cerrado correctamente. Chau!');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', async (err) => {
    log.error('system', `Excepcion no capturada: ${err.message}`);
    log.error('system', err.stack);
  });
  process.on('unhandledRejection', (err) => {
    log.error('system', `Promise rechazada: ${err}`);
  });

  // 7. Iniciar captura
  try {
    await orchestrator.start(context);

    // Iniciar comportamiento humano en la pagina activa
    // Lo hacemos periodicamente en la pagina del casino activo
    const humanBehaviorLoop = setInterval(() => {
      if (!orchestrator.running || !orchestrator.currentCasino?.page) return;
      const page = orchestrator.currentCasino.page;
      if (!page.isClosed()) {
        startHumanBehavior(page, config);
      }
    }, 30000); // Re-evaluar cada 30s

    // Mantener el proceso vivo
    log.info('system', '');
    log.info('system', '  ═══════════════════════════════════════════');
    log.info('system', '  Sistema de captura activo - Ctrl+C para detener');
    log.info('system', '  ═══════════════════════════════════════════');
    log.info('system', '');

    // Loop para mantener vivo el proceso y guardar cookies periodicamente
    const cookieSaveLoop = setInterval(async () => {
      if (!orchestrator.running) return;
      try {
        const cookies = await context.cookies();
        const fs = require('fs');
        if (!fs.existsSync('./config')) fs.mkdirSync('./config', { recursive: true });
        fs.writeFileSync('./config/cookies.json', JSON.stringify(cookies, null, 2));
        log.debug('system', `Cookies guardadas (${cookies.length} cookies)`);
      } catch (e) {
        // Silencioso
      }
    }, 300000); // Cada 5 minutos

    // Loop infinito para mantener el proceso vivo
    while (orchestrator.running) {
      await new Promise(r => setTimeout(r, 5000));

      // Verificar que el browser sigue vivo
      if (browser && !browser.isConnected()) {
        log.error('system', 'Browser se desconecto! Reiniciando...');
        await orchestrator.stop();
        stopHumanBehavior();

        browser = await chromium.launch(launchOptions);
        const newContext = await createStealthContext(browser, config);

        // Re-cargar cookies
        try {
          const fs = require('fs');
          if (fs.existsSync(cookiesPath)) {
            const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
            await newContext.addCookies(cookies);
          }
        } catch (e) { /* ok */ }

        await orchestrator.start(newContext);
      }
    }

  } catch (err) {
    log.error('system', `Error fatal: ${err.message}`);
    log.error('system', err.stack);
    await shutdown('error');
  }
}

// Ejecutar
main().catch(err => {
  console.error('Error fatal al iniciar:', err);
  process.exit(1);
});