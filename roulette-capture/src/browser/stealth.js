// ============================================================
// stealth.js - Anti-deteccion y configuracion de navegador invisible
// ============================================================
const { randInt, randomDelay } = require('../utils/helpers');

// User-Agentes reales y actualizados (Chrome en Windows/Mac/Linux)
const USER_AGENTS = [
  // Windows Chrome
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 11.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  // Mac Chrome
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  // Linux Chrome
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

// Viewports realistas (no tamanios raros que delatan bots)
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 1600, height: 900 },
  { width: 1680, height: 1050 },
  { width: 2560, height: 1440 },
];

// Lenguajes del navegador
const LOCALES = ['en-US', 'en-GB', 'es-AR', 'es-ES', 'pt-BR', 'pt-PT', 'fr-FR'];

// Timezones comunes de jugadores de casino
const TIMEZONES = [
  'America/Asuncion', 'America/Buenos_Aires', 'America/Sao_Paulo',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'Europe/Madrid', 'Europe/London', 'Europe/Paris',
  'America/Mexico_City', 'America/Bogota', 'America/Lima',
];

let currentProfile = null;

/**
 * Genera un perfil de navegador aleatorio y consistente
 */
function generateProfile() {
  const ua = USER_AGENTS[randInt(0, USER_AGENTS.length - 1)];
  const vp = VIEWPORTS[randInt(0, VIEWPORTS.length - 1)];
  const locale = LOCALES[randInt(0, LOCALES.length - 1)];
  const tz = TIMEZONES[randInt(0, TIMEZONES.length - 1)];

  // Desplazamiento aleatorio del viewport (no empezar en 0,0)
  const offsetX = randInt(0, 100);
  const offsetY = randInt(0, 50);

  currentProfile = { ua, vp, locale, tz, offsetX, offsetY };
  return currentProfile;
}

/**
 * Retorna las opciones de lanzamiento del navegador con anti-deteccion
 */
function getLaunchOptions(config) {
  const profile = generateProfile();
  const args = [
    `--user-agent=${profile.ua}`,
    `--lang=${profile.locale}`,
    `--timezone-id=${profile.tz}`,
    // Deshabilitar features que los bots suelen activar
    '--disable-blink-features=AutomationControlled',
    // Evitar deteccion de headless
    '--window-position=' + profile.offsetX + ',' + profile.offsetY,
    // Deshabilitar notificaciones
    '--disable-notifications',
    // Preferencias de idioma
    '--accept-lang=' + profile.locale,
    // Deshabilitar extensiones por defecto
    '--disable-default-apps',
    '--disable-extensions',
    // GPU rendering (evita flag de headless)
    '--use-gl=swiftshader',
    // Deshabilitar el banner de automatizacion
    '--no-first-run',
    '--no-default-browser-check',
  ];

  return {
    headless: !config.headed,
    args,
    // Ignorar errores de defaultArgs de Playwright
    ignoreDefaultArgs: ['--enable-automation'],
    // Deshabilitar la deteccion de automatizacion a nivel de Playwright
    channel: 'chromium',
  };
}

/**
 * Retorna el contexto del navegador con stealth
 */
async function createStealthContext(browser, config) {
  const profile = currentProfile || generateProfile();

  const context = await browser.newContext({
    userAgent: profile.ua,
    viewport: profile.vp,
    locale: profile.locale,
    timezoneId: profile.tz,
    geolocation: { latitude: -25.26 + Math.random() * 2 - 1, longitude: -57.57 + Math.random() * 2 - 1 },
    permissions: ['geolocation'],
    // JavaScript con realisticos
    javaScriptEnabled: true,
    // Headers extra para parecer real
    extraHTTPHeaders: {
      'Accept-Language': profile.locale + ',' + profile.locale.split('-')[0] + ';q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  });

  // Inyectar scripts anti-deteccion en cada pagina nueva
  await context.addInitScript(() => {
    // 1. Eliminar la propiedad 'webdriver' que delata automatizacion
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });

    // 2. Spoofear plugins para que no parezca headless
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
        ];
        return plugins;
      },
      configurable: true,
    });

    // 3. Spoofear languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en', 'es'],
      configurable: true,
    });

    // 4. Canvas fingerprint randomization (sutil, no rompe rendering)
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function(type) {
      if (type === 'image/png' || type === undefined) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            // Cambio imperceptible en el canal alpha (no visible)
            imageData.data[i + 3] = Math.min(255, imageData.data[i + 3] + (Math.random() > 0.5 ? 1 : 0));
          }
          context.putImageData(imageData, 0, 0);
        }
      }
      return originalToDataURL.apply(this, arguments);
    };

    // 5. WebGL renderer spoofing
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
      // UNMASKED_VENDOR_WEBGL
      if (param === 37445) return 'Google Inc. (Intel)';
      // UNMASKED_RENDERER_WEBGL
      if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)';
      return getParameter.call(this, param);
    };

    // 6. Ocultar propiedades de Playwright/Puppeteer
    delete window.__playwright;
    delete window.__puppeteer_evaluation_script__;

    // 7. Mouse events naturales (sin el flag isTrusted false)
    const originalDispatch = EventTarget.prototype.dispatchEvent;
    EventTarget.prototype.dispatchEvent = function(event) {
      try { Object.defineProperty(event, 'isTrusted', { value: true }); } catch(e) {}
      return originalDispatch.call(this, event);
    };

    // 8. Permissions API spoof
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) => {
        if (parameters.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission });
        }
        return originalQuery(parameters);
      };
    }

    // 9. Chrome runtime spoof (evitar deteccion de extension automatizada)
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

/**
 * Retorna el perfil actual (para log)
 */
function getProfile() {
  return currentProfile;
}

module.exports = { getLaunchOptions, createStealthContext, getProfile, generateProfile };