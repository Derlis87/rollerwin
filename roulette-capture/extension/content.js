// ============================================================
// content.js - Bridge entre el extension background y los iframes
// Escucha mensajes del script inyectado (inject-main.js)
// y los reenvía al background service worker
// ============================================================
(function() {
  'use strict';
  if (window.__rwContentBridge) return;
  window.__rwContentBridge = true;

  // Escuchar mensajes del script inyectado en MAIN world
  window.addEventListener('message', function(event) {
    try {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Mensaje del script inyectado en MAIN world
      if (data.__rwCapture || (data.source === 'rw-capture' && typeof data.number === 'number')) {
        chrome.runtime.sendMessage({
          type: 'rw-number',
          number: data.number,
          color: data.color || '',
          hostname: data.hostname || location.hostname,
          sourceHook: data.sourceHook || 'unknown',
          timestamp: Date.now()
        }).catch(() => {});
      }
    } catch(e) {}
  });

  // Notificar al background que este content script está listo
  try {
    chrome.runtime.sendMessage({ type: 'rw-content-ready', url: location.href, hostname: location.hostname }).catch(() => {});
  } catch(e) {}
})();