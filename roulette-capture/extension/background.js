// ============================================================
// background.js - Service Worker del extension
// Recibe numeros del content script y los envia al servidor local.
// Inyecta inject-main.js en MAIN world de todos los frames.
// ============================================================

const BRIDGE_PORT = 19555;
const BRIDGE_URL = `http://127.0.0.1:${BRIDGE_PORT}/capture`;
const PING_URL = `http://127.0.0.1:${BRIDGE_PORT}/ping`;

let tabsInjected = new Set();
let stats = { sent: 0, errors: 0, lastNumber: null, lastTime: 0 };

// ============================================================
// Enviar numero al servidor local Node.js
// ============================================================
async function sendToServer(number, source, hostname, color) {
  try {
    const resp = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: number,
        source: source,
        hostname: hostname,
        color: color,
        timestamp: Date.now()
      })
    });

    if (resp.ok) {
      stats.sent++;
      stats.lastNumber = number;
      stats.lastTime = Date.now();
      console.log('[RW-BG] Numero ' + number + ' enviado al servidor [' + source + '@' + hostname + ']');
    } else {
      stats.errors++;
      console.error('[RW-BG] Server respondio ' + resp.status);
    }
  } catch(e) {
    stats.errors++;
    // Solo logear cada 10 errores para no spamear
    if (stats.errors % 10 === 1) {
      console.error('[RW-BG] Error enviando al server (total: ' + stats.errors + '):', e.message);
    }
  }
}

// ============================================================
// Inyectar el script de captura en MAIN world de TODOS los frames
// de una tab especifica. Esto es lo que hace que la captura funcione
// en iframes cross-origin (Evolution, Pragmatic, etc.)
// ============================================================
async function injectInTab(tabId) {
  if (tabsInjected.has(tabId)) return;

  try {
    // Usar files: [] para inyectar el script directamente
    // chrome.scripting.executeScript con world: 'MAIN' es la UNICA forma
    // de ejecutar codigo dentro del contexto JS de iframes cross-origin
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      world: 'MAIN',
      files: ['inject-main.js']
    });

    tabsInjected.add(tabId);
    console.log('[RW-BG] inject-main.js inyectado en tab ' + tabId + ' (allFrames, MAIN world)');
  } catch(e) {
    console.error('[RW-BG] Error inyectando en tab ' + tabId + ':', e.message);
  }
}

// ============================================================
// Re-inyectar periódicamente (cada 20s) en tabs con casino URLs
// Los iframes cross-origin pueden recargarse y perder la inyeccion
// ============================================================
setInterval(async () => {
  try {
    const tabs = await chrome.tabs.query({ status: 'complete' });
    for (const tab of tabs) {
      const url = (tab.url || '').toLowerCase();
      if (url.includes('pinnacle') || url.includes('betfury') || url.includes('stake') ||
          url.includes('everymatrix') || url.includes('evolution') || url.includes('evo-games') ||
          url.includes('pragmatic') || url.includes('pragmaticplay')) {
        // Forzar re-inyeccion limpiando el cache
        tabsInjected.delete(tab.id);
        await injectInTab(tab.id);
      }
    }
  } catch(e) {
    // Silencioso
  }
}, 20000);

// ============================================================
// Escuchar mensajes del content script
// ============================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) return false;

  // Content script listo — inyectar
  if (message.type === 'rw-content-ready') {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) {
      // Pequeño delay para que la pagina termine de cargar
      setTimeout(() => injectInTab(tabId), 1000);
    }
    return false;
  }

  // Numero capturado (via postMessage desde inject-main.js → content.js → aqui)
  if (message.type === 'rw-number') {
    const n = message.number;
    if (typeof n === 'number' && n >= 0 && n <= 36) {
      sendToServer(n, message.sourceHook || 'unknown', message.hostname || '', message.color || '');
    }
    return false;
  }

  return false;
});

// ============================================================
// Inyectar en tabs que se actualicen o naveguen
// ============================================================
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const url = tab.url.toLowerCase();
    if (url.includes('pinnacle') || url.includes('betfury') || url.includes('stake') ||
        url.includes('everymatrix') || url.includes('evolution') || url.includes('evo-games') ||
        url.includes('pragmatic') || url.includes('pragmaticplay')) {
      // Limpiar cache para permitir re-inyeccion
      tabsInjected.delete(tabId);
      // Inyectar en cascada: rapido y luego otra vez despues de que carguen iframes
      setTimeout(() => injectInTab(tabId), 2000);
      setTimeout(() => injectInTab(tabId), 6000);
      setTimeout(() => injectInTab(tabId), 15000);
    }
  }
});

// ============================================================
// Ping al server cada 30s para verificar que Node.js está vivo
// ============================================================
setInterval(async () => {
  try {
    const resp = await fetch(PING_URL);
    if (resp.ok) {
      // Server vivo — OK
    }
  } catch(e) {
    // Server no responde — Node.js puede no estar levantado aún
  }
}, 30000);

console.log('[RW-BG] RW Capture Bridge v2.0 iniciado');