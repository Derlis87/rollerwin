// ============================================================
// cdp-inject.js v1 - Captura via CDP Injection (SIN extension)
// ============================================================
// Inyecta hooks de WebSocket/Fetch/XHR directamente via CDP
// en TODOS los execution contexts (incluyendo iframes cross-origin).
//
// Ventajas sobre el extension:
//   - No necesita --load-extension
//   - No hay problemas con rutas con espacios
//   - CDP tiene acceso total a todos los frames
//   - Funciona incluso si Chrome bloquea extensiones
//
// Comunicacion: hooks → fetch directo a localhost:19555
// ============================================================
const log = require('../utils/logger');
const net = require('net');

// El codigo que se inyecta en cada frame del casino
// Es similar a inject-main.js pero comunica directo al bridge via fetch
const CAPTURE_CODE = `
(function() {
  'use strict';
  if (window.__rwCdpInjected) return;
  window.__rwCdpInjected = true;

  var hostname = location.hostname || '';
  console.log('[RW-CDP] Motor inyectado via CDP en:', hostname);

  var BRIDGE_URL = 'http://127.0.0.1:19555/capture';
  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function getColor(n) { return n === 0 ? 'green' : RED.indexOf(n) >= 0 ? 'red' : 'black'; }

  var _lastSent = 0;
  var _DEDUP = 9000;

  function sendNumber(n, source) {
    if (n < 0 || n > 36) return;
    var now = Date.now();
    if (now - _lastSent < _DEDUP) return;
    _lastSent = now;

    console.log('%c[RW-CDP] RESULTADO: ' + n + ' (' + getColor(n) + ') — ' + source, 'color: #0f0; font-size: 14px; font-weight: bold');

    try {
      fetch(BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: n,
          color: getColor(n),
          source: source,
          hostname: hostname,
          timestamp: Date.now()
        })
      }).catch(function() {});
    } catch(e) {}
  }

  // === Result fields ===
  var RESULT_FIELDS = [
    'number','result','resultnumber','winningnumber','win_number',
    'game_number','roulette_number','ball_number','pocket','pocket_number',
    'winningpocket','pocketid','resultid','displaynumber',
    'roundresult','gameoutcome','finalnumber','outcome',
    'winningnumberdisplay','final_number','game_result',
    'round_result','game_outcome','numberstr','numberstring',
    'winnum','win_num','result_num','gameresult',
    'resultnumberstr','rouletteresult','resultNumberStr',
    'roulettenumber','winningNumberStr','pocketnumber',
    'gamenumber','roundnumber','betresult','totalresult',
  ];

  function isResultField(key) {
    var k = key.replace(/[_\\-\\s]/g, '').toLowerCase();
    for (var i = 0; i < RESULT_FIELDS.length; i++) {
      if (k === RESULT_FIELDS[i].replace(/[_\\-\\s]/g, '')) return true;
    }
    return false;
  }

  function tryNum(val) {
    if (typeof val === 'number' && val >= 0 && val <= 36 && val === Math.floor(val)) return val;
    if (typeof val === 'string') {
      var s = val.trim();
      if ((s.length === 1 || s.length === 2) && s === String(parseInt(s, 10))) {
        var n = parseInt(s, 10);
        if (n >= 0 && n <= 36) return n;
      }
    }
    return null;
  }

  function extractObj(obj, depth, pathStr) {
    if (!obj || typeof obj !== 'object' || depth > 5) return;
    if (Array.isArray(obj)) {
      if (obj.length === 0 || obj.length > 10) return;
      var pathLow = pathStr.toLowerCase();
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0 ||
          pathLow.indexOf('recent') >= 0 || pathLow.indexOf('history') >= 0 ||
          pathLow.indexOf('number') >= 0) {
        for (var i = 0; i < obj.length; i++) {
          var item = obj[i];
          if (typeof item === 'number' && item >= 0 && item <= 36 && item === Math.floor(item)) {
            sendNumber(item, 'array-item@' + pathStr);
            return;
          }
          if (Array.isArray(item) && item.length > 0) {
            var last = item[item.length - 1];
            if (typeof last === 'string') {
              var n = tryNum(last);
              if (n !== null) { sendNumber(n, 'nested-array@' + pathStr); return; }
            } else if (typeof last === 'number') {
              var n2 = tryNum(last);
              if (n2 !== null) { sendNumber(n2, 'nested-array-num@' + pathStr); return; }
            }
          }
          if (typeof item === 'object' && item !== null) {
            extractObj(item, depth + 1, pathStr + '[' + i + ']');
          }
        }
        if (obj.length > 0) {
          var lastItem = obj[obj.length - 1];
          if (typeof lastItem === 'object' && lastItem !== null && !Array.isArray(lastItem)) {
            extractObj(lastItem, depth + 1, pathStr + '[last]');
          }
        }
      }
      return;
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj[key];
      if (isResultField(key)) {
        var n = tryNum(val);
        if (n !== null) { sendNumber(n, key + '@' + pathStr); return; }
      }
      if (key === 'recentResults' && Array.isArray(val) && val.length > 0) {
        var latest = val[val.length - 1];
        if (Array.isArray(latest) && latest.length > 0) {
          var innerVal = latest[latest.length - 1];
          var rn = tryNum(innerVal);
          if (rn !== null) { sendNumber(rn, 'recentResults@' + pathStr); return; }
        }
      }
      if (typeof val === 'object' && val !== null) {
        extractObj(val, depth + 1, pathStr + '.' + key);
      }
    }
  }

  var TEXT_PATTERNS = [
    /"resultNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"winningNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"winning_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"ball_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"pocket_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"roulette_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"finalNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"game_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"displayNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"winningPocket"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"result_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"result"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"number"\\s*:\\s*(\\d{1,2})\\b/gi,
  ];

  function extractFromText(text, source) {
    if (!text || typeof text !== 'string' || text.length > 500000) return;
    var lastMatch = null;
    for (var i = 0; i < TEXT_PATTERNS.length; i++) {
      TEXT_PATTERNS[i].lastIndex = 0;
      var m;
      while ((m = TEXT_PATTERNS[i].exec(text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) lastMatch = n;
      }
    }
    if (lastMatch !== null) sendNumber(lastMatch, 'regex@' + source);
  }

  function _processWSText(data, wsUrl) {
    if (!data || data.length < 3) return;
    // Socket.io
    if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
      try {
        var jsonStart = data.indexOf('[');
        if (jsonStart >= 0) {
          var p = JSON.parse(data.substring(jsonStart));
          if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'object') {
            var evt = String(p[0] || '');
            extractObj(p[1], 0, 'sio.' + evt);
            extractFromText(data, 'sio.' + evt);
          }
        }
      } catch(err) {}
    }
    // JSON directo
    if (data.charAt(0) === '{' || data.charAt(0) === '[') {
      try {
        var parsed = JSON.parse(data);
        extractObj(parsed, 0, 'ws');
      } catch(err) {}
      extractFromText(data, 'ws-raw');
    }
    if (data.indexOf('recentResults') >= 0) {
      extractFromText(data, 'ws-evo-recent');
    }
  }

  // === HOOK WEBSOCKET ===
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwCdpHooked) return;
    OrigWS.__rwCdpHooked = true;

    var ProxyWS = function(url, protocols) {
      console.log('[RW-CDP] WS conectado:', (url || '').substring(0, 100));
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) {
              try { data = new TextDecoder('utf-8').decode(new Uint8Array(data)); } catch(er) { return; }
            } else if (data instanceof Blob) {
              var reader = new FileReader();
              reader.onload = function() {
                try {
                  var text = new TextDecoder('utf-8').decode(new Uint8Array(reader.result));
                  _processWSText(text, url);
                } catch(err) {}
              };
              reader.readAsArrayBuffer(data);
              return;
            } else { return; }
          }
          _processWSText(data, url);
        } catch(err) {}
      });

      return ws;
    };

    ProxyWS.prototype = OrigWS.prototype;
    ProxyWS.CONNECTING = OrigWS.CONNECTING;
    ProxyWS.OPEN = OrigWS.OPEN;
    ProxyWS.CLOSING = OrigWS.CLOSING;
    ProxyWS.CLOSED = OrigWS.CLOSED;
    window.WebSocket = ProxyWS;
  })();

  // === HOOK FETCH ===
  (function() {
    var origFetch = window.fetch;
    if (!origFetch || origFetch.__rwCdpHooked) return;
    origFetch.__rwCdpHooked = true;

    window.fetch = function(input, init) {
      var url = '';
      try {
        url = typeof input === 'string' ? input :
              (input instanceof Request) ? (input.url || '') :
              (input && input.url) ? input.url : '';
      } catch(e) {}

      var promise = origFetch.apply(this, arguments);
      var urlLow = (url || '').toLowerCase();

      if (urlLow.indexOf('result') >= 0 || urlLow.indexOf('roulette') >= 0 ||
          urlLow.indexOf('evolution') >= 0 || urlLow.indexOf('round') >= 0 ||
          urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('game') >= 0 ||
          urlLow.indexOf('pragmatic') >= 0 || urlLow.indexOf('state') >= 0 ||
          urlLow.indexOf('update') >= 0 || urlLow.indexOf('event') >= 0 ||
          urlLow.indexOf('history') >= 0 || urlLow.indexOf('bet') >= 0) {
        promise.then(function(r) {
          try {
            r.clone().text().then(function(text) {
              if (text) {
                try { extractObj(JSON.parse(text), 0, 'fetch'); } catch(e) {}
                extractFromText(text, 'fetch');
              }
            }).catch(function() {});
          } catch(e) {}
        }).catch(function() {});
      }

      return promise;
    };
  })();

  // === HOOK XHR ===
  (function() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwCdpHooked) return;
    origSend.__rwCdpHooked = true;

    XMLHttpRequest.prototype.open = function(m, u) { this._rwUrl = String(u || ''); return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      this.addEventListener('load', function() {
        var u = (self._rwUrl || '').toLowerCase();
        if (u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 ||
            u.indexOf('evolution') >= 0 || u.indexOf('round') >= 0 ||
            u.indexOf('wheel') >= 0 || u.indexOf('game') >= 0 ||
            u.indexOf('pragmatic') >= 0 || u.indexOf('state') >= 0 ||
            u.indexOf('update') >= 0 || u.indexOf('event') >= 0 ||
            u.indexOf('history') >= 0 || u.indexOf('bet') >= 0) {
          try {
            var t = self.responseText;
            if (t) {
              try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {}
              extractFromText(t, 'xhr');
            }
          } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // === HOOK postMessage ===
  (function() {
    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null) {
          extractObj(data, 0, 'postMsg-in');
        }
      } catch(e) {}
    });
  })();

  // === DOM SCANNER ===
  (function() {
    var scanInterval = setInterval(function() {
      try {
        var selectors = [
          '[class*="result"]', '[class*="winning"]', '[class*="number"]',
          '[class*="pocket"]', '[class*="roulette"]', '[class*="ball"]',
          '[class*="history"]', '[class*="last-"]', '[class*="latest"]',
          '[data-result]', '[data-number]', '[data-winning]',
        ];
        for (var s = 0; s < selectors.length; s++) {
          var els = document.querySelectorAll(selectors[s]);
          for (var i = 0; i < els.length; i++) {
            var text = (els[i].textContent || '').trim();
            if (text.length === 1 || text.length === 2) {
              var n = parseInt(text, 10);
              if (n >= 0 && n <= 36 && String(n) === text) {
                sendNumber(n, 'dom-' + selectors[s]);
              }
            }
          }
        }
      } catch(e) {}
    }, 2000);
  })();

  console.log('[RW-CDP] Todos los hooks activos en:', hostname);
})();
`;

/**
 * CDPInjector - Inyecta codigo de captura via CDP en todos los frames
 */
class CDPInjector {
  constructor() {
    this.injectedPages = new Set();
    this.cdpSessions = new Map();
  }

  /**
   * Inyecta en todos los frames de una pagina via CDP
   */
  async injectInPage(page) {
    if (!page || page.isClosed()) return;
    
    const pageUrl = page.url();
    if (this.injectedPages.has(pageUrl)) {
      log.debug('cdp-inject', `Ya inyectado en ${pageUrl.substring(0, 60)}`);
      return;
    }

    try {
      // Crear sesion CDP para esta pagina
      const cdp = await page.context().newCDPSession(page);
      this.cdpSessions.set(pageUrl, cdp);

      // Habilitar Runtime para recibir eventos de contextos
      await cdp.send('Runtime.enable');

      // Recolectar todos los execution contexts (frames)
      const contexts = new Map();
      
      // Esperar a que se creen los contextos de los iframes
      await new Promise(resolve => {
        const timeout = setTimeout(resolve, 8000);
        
        cdp.on('Runtime.executionContextCreated', (params) => {
          const ctx = params.context;
          if (ctx && ctx.id) {
            contexts.set(ctx.id, ctx);
          }
        });

        // Ya pedir el frame tree para forzar la creacion de contextos
        cdp.send('Page.getFrameTree').catch(() => {});
      });

      log.info('cdp-inject', `Encontrados ${contexts.size} execution contexts en ${pageUrl.substring(0, 60)}`);

      // Inyectar en cada contexto
      let injected = 0;
      for (const [id, ctx] of contexts) {
        try {
          await cdp.send('Runtime.evaluate', {
            contextId: id,
            expression: CAPTURE_CODE,
            allowUnsafeEvalBlockedByCSP: true,
          });
          injected++;
          log.debug('cdp-inject', `  ✓ Context ${id} inyectado (${ctx.origin || 'unknown'})`);
        } catch (err) {
          log.debug('cdp-inject', `  ✗ Context ${id} fallo: ${err.message.substring(0, 60)}`);
        }
      }

      if (injected > 0) {
        this.injectedPages.add(pageUrl);
        log.info('cdp-inject', `Inyectado en ${injected}/${contexts.size} contexts`);
      } else {
        log.warn('cdp-inject', 'No se pudo inyectar en ningun context');
      }

    } catch (err) {
      log.error('cdp-inject', `Error inyectando CDP: ${err.message}`);
    }
  }

  /**
   * Re-inyectar periodcamente (los iframes se recargan)
   */
  async reInject(page) {
    // Limpiar cache para forzar re-inyeccion
    const pageUrl = page.url();
    this.injectedPages.delete(pageUrl);
    await this.injectInPage(page);
  }

  /**
   * Limpiar sesiones CDP
   */
  async cleanup() {
    for (const [url, cdp] of this.cdpSessions) {
      try {
        await cdp.detach();
      } catch (e) {}
    }
    this.cdpSessions.clear();
    this.injectedPages.clear();
  }
}

module.exports = { CDPInjector, CAPTURE_CODE };