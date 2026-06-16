// ============================================================
// stealth.js v2 - Anti-detección + flags OOPIF para captura
// ============================================================
const { randInt } = require('../utils/helpers');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
];

const LOCALES = ['en-US', 'en-GB', 'es-AR', 'es-ES', 'pt-BR'];
const TIMEZONES = [
  'America/Asuncion', 'America/Buenos_Aires', 'America/Sao_Paulo',
  'America/New_York', 'America/Mexico_City', 'America/Bogota',
  'Europe/Madrid', 'Europe/London',
];

let currentProfile = null;

function generateProfile() {
  const ua = USER_AGENTS[randInt(0, USER_AGENTS.length - 1)];
  const vp = VIEWPORTS[randInt(0, VIEWPORTS.length - 1)];
  const locale = LOCALES[randInt(0, LOCALES.length - 1)];
  const tz = TIMEZONES[randInt(0, TIMEZONES.length - 1)];
  currentProfile = { ua, vp, locale, tz };
  return currentProfile;
}

function getProfile() {
  return currentProfile;
}

// ============================================================
// Opciones para lanzar Chrome REAL via CDP
// ============================================================
function getLaunchOptions(config) {
  const profile = generateProfile();
  const chromePath = config.CHROME_PATH || null;

  if (config.headed && chromePath) {
    // MODO CDP: Conectar a Chrome REAL en puerto 9222
    // Chrome se lanza por separado con flags anti-OOPIF
    return {
      // No lanzamos nada — Chrome ya está corriendo
      cdpMode: true,
      cdpUrl: `http://127.0.0.1:9222`,
      chromePath,
      profile,
    };
  }

  // MODO PLAYWRIGHT: Lanzar Chromium con flags anti-OOPIF
  const args = [
    `--user-agent=${profile.ua}`,
    `--lang=${profile.locale}`,
    `--timezone-id=${profile.tz}`,
    '--disable-blink-features=AutomationControlled',
    '--disable-notifications',
    '--disable-default-apps',
    '--no-first-run',
    '--no-default-browser-check',
    // CRÍTICO: Deshabilitar aislamiento de sitios para que los iframes
    // corran en el MISMO proceso y Page.addScriptToEvaluateOnNewDocument
    // pueda inyectar en ellos
    '--disable-site-isolation-trials',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    // Para captura de iframes
    '--allow-running-insecure-content',
  ];

  return {
    headless: !config.headed,
    args,
    ignoreDefaultArgs: ['--enable-automation'],
    channel: 'chromium',
    cdpMode: false,
    profile,
  };
}

// ============================================================
// Lanzar Chrome REAL y conectar via CDP
// ============================================================
const { execSync, spawn } = require('child_process');
const net = require('net');

async function launchRealChrome(config) {
  const profile = currentProfile || generateProfile();
  const port = config.CDP_PORT || 9222;
  const chromePath = config.CHROME_PATH;

  if (!chromePath) {
    throw new Error('CHROME_PATH no configurado en .env — necesario para modo headed');
  }

  // Matar procesos existentes en el puerto
  try {
    if (process.platform === 'win32') {
      execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
      execSync(`for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`, { encoding: 'utf8', stdio: 'ignore' });
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { encoding: 'utf8' });
    }
  } catch (e) {}

  // Esperar a que el puerto se libere
  await new Promise(r => setTimeout(r, 1000));

  const profileDir = config.CHROME_PROFILE || './chrome-profile';

  const chromeArgs = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    `--user-agent=${profile.ua}`,
    `--lang=${profile.locale}`,
    '--disable-blink-features=AutomationControlled',
    '--disable-notifications',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    // CRÍTICO para inyección en iframes cross-origin:
    // Estos flags hacen que los iframes NO se separen en procesos distintos
    '--disable-site-isolation-trials',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security',
    '--allow-running-insecure-content',
    // Evitar que Chrome se cierre solo
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ];

  // Lanzar Chrome
  const chrome = spawn(chromePath, chromeArgs, {
    detached: !process.platform === 'win32',
    stdio: 'ignore',
  });

  if (process.platform !== 'win32') {
    chrome.unref();
  }

  // Esperar a que el puerto esté escuchando
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    const alive = await new Promise((resolve) => {
      const sock = net.createConnection({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => resolve(false));
      sock.setTimeout(1000);
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
    });
    if (alive) {
      return port;
    }
  }

  throw new Error(`Chrome no respondió en el puerto ${port} después de 15 segundos`);
}

// ============================================================
// Crear contexto stealth (para modo Playwright o CDP)
// ============================================================
async function createStealthContext(browser, config) {
  const profile = currentProfile || generateProfile();

  const context = await browser.newContext({
    userAgent: profile.ua,
    viewport: profile.vp,
    locale: profile.locale,
    timezoneId: profile.tz,
    geolocation: { latitude: -25.26, longitude: -57.57 },
    permissions: ['geolocation'],
    javaScriptEnabled: true,
    extraHTTPHeaders: {
      'Accept-Language': profile.locale + ',' + profile.locale.split('-')[0] + ';q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    },
  });

  // Inyectar anti-detección
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });

    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      ],
      configurable: true,
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'es'],
      configurable: true,
    });

    delete window.__playwright;
    delete window.__puppeteer_evaluation_script__;

    const originalDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(event) {
      try { Object.defineProperty(event, 'isTrusted', { value: true }); } catch(e) {}
      return originalDispatch.call(this, event);
    };

    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
      window.chrome.runtime = {
        connect: () => {},
        sendMessage: () => {},
        onMessage: { addListener: () => {} },
      };
    }
  });

  return context;
}

module.exports = { getLaunchOptions, createStealthContext, getProfile, generateProfile, launchRealChrome };