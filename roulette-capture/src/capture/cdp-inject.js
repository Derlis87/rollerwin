// ============================================================
// cdp-inject.js v4 — Captura via Playwright frames + CDP
// ============================================================
// Enfoque: NO depender de Target.setAutoAttach (conflicta con Playwright).
// En su lugar:
//   1. Usar page.frames() para descubrir TODOS los frames
//   2. Crear CDP session PER FRAME via newCDPSession(frame)
//   3. Inyectar hooks via Runtime.evaluate en CADA frame
//   4. page.on('frameattached') para frames nuevos
//   5. Network.webSocketFrameReceived como fallback (nivel de red)
//
// Ventaja sobre v1-v3:
//   - Playwright maneja el tracking de frames (incluidos cross-origin)
//   - newCDPSession(frame) funciona para iframes cross-origin
//   - No hay conflicto con Target.setAutoAttach
//   - Mas simple y confiable
// ============================================================
const log = require('../utils/logger');

// === Patron para detectar numeros en payloads de WS ===
const WS_NUMBER_PATTERNS = [
  /"recentResults"\s*:\s*\[\s*\[\s*"(\d{1,2})"\s*\]/,
  /"resultNumber"\s*:\s*(\d{1,2})\b/gi,
  /"winningNumber"\s*:\s*(\d{1,2})\b/gi,
  /"winning_number"\s*:\s*(\d{1,2})\b/gi,
  /"ball_number"\s*:\s*(\d{1,2})\b/gi,
  /"pocket_number"\s*:\s*(\d{1,2})\b/gi,
  /"roulette_number"\s*:\s*(\d{1,2})\b/gi,
  /"finalNumber"\s*:\s*(\d{1,2})\b/gi,
  /"displayNumber"\s*:\s*(\d{1,2})\b/gi,
  /"winningPocket"\s*:\s*(\d{1,2})\b/gi,
  /"result_number"\s*:\s*(\d{1,2})\b/gi,
];

function extractNumberFromWSPayload(payload) {
  if (!payload || typeof payload !== 'string' || payload.length < 5) return null;

  const evoMatch = payload.match(/"recentResults"\s*:\s*\[\s*\[\s*"(\d{1,2})"\s*\]/);
  if (evoMatch) {
    const n = parseInt(evoMatch[1], 10);
    if (n >= 0 && n <= 36) return n;
  }

  let lastMatch = null;
  for (const pat of WS_NUMBER_PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(payload)) !== null) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 36) lastMatch = n;
    }
  }
  return lastMatch;
}

// === Codigo JS que se inyecta en cada frame (MAIN world) ===
const CAPTURE_CODE = `
(function() {
  'use strict';
  if (window.__rwCdpInjected) return;
  window.__rwCdpInjected = true;

  var hostname = location.hostname || '';
  console.log('[RW-CDP] Motor inyectado en:', hostname);

  var BRIDGE_URL = 'http://127.0.0.1:19555/capture';
  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function getColor(n) { return n === 0 ? 'green' : RED.indexOf(n) >= 0 ? 'red' : 'black'; }

  var _lastSent = 0;
  function sendNumber(n, source) {
    if (n < 0 || n > 36) return;
    var now = Date.now();
    if (now - _lastSent < 9000) return;
    _lastSent = now;

    console.log('%c[RW-CDP] RESULTADO: ' + n + ' (' + getColor(n) + ') - ' + source, 'color: #0f0; font-size: 14px; font-weight: bold');

    try {
      fetch(BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: n, color: getColor(n), source: source, hostname: hostname, timestamp: Date.now() })
      }).catch(function() {});
    } catch(e) {}
  }

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
            sendNumber(item, 'array-item@' + pathStr); return;
          }
          if (Array.isArray(item) && item.length > 0) {
            var last = item[item.length - 1];
            if (typeof last === 'string') { var n = tryNum(last); if (n !== null) { sendNumber(n, 'nested-array@' + pathStr); return; } }
            else if (typeof last === 'number') { var n2 = tryNum(last); if (n2 !== null) { sendNumber(n2, 'nested-array-num@' + pathStr); return; } }
          }
          if (typeof item === 'object' && item !== null) extractObj(item, depth + 1, pathStr + '[' + i + ']');
        }
        if (obj.length > 0) {
          var lastItem = obj[obj.length - 1];
          if (typeof lastItem === 'object' && lastItem !== null && !Array.isArray(lastItem))
            extractObj(lastItem, depth + 1, pathStr + '[last]');
        }
      }
      return;
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i]; var val = obj[key];
      if (isResultField(key)) { var n = tryNum(val); if (n !== null) { sendNumber(n, key + '@' + pathStr); return; } }
      if (key === 'recentResults' && Array.isArray(val) && val.length > 0) {
        var latest = val[val.length - 1];
        if (Array.isArray(latest) && latest.length > 0) {
          var innerVal = latest[latest.length - 1]; var rn = tryNum(innerVal);
          if (rn !== null) { sendNumber(rn, 'recentResults@' + pathStr); return; }
        }
      }
      if (typeof val === 'object' && val !== null) extractObj(val, depth + 1, pathStr + '.' + key);
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
    if (data.charAt(0) === '{' || data.charAt(0) === '[') {
      try { extractObj(JSON.parse(data), 0, 'ws'); } catch(err) {}
      extractFromText(data, 'ws-raw');
    }
    if (data.indexOf('recentResults') >= 0) extractFromText(data, 'ws-evo-recent');
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
            if (data instanceof ArrayBuffer) { try { data = new TextDecoder('utf-8').decode(new Uint8Array(data)); } catch(er) { return; } }
            else if (data instanceof Blob) { var r = new FileReader(); r.onload = function() { try { _processWSText(new TextDecoder('utf-8').decode(new Uint8Array(r.result)), url); } catch(err) {} }; r.readAsArrayBuffer(data); return; }
            else { return; }
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
      try { url = typeof input === 'string' ? input : (input instanceof Request) ? (input.url || '') : (input && input.url) ? input.url : ''; } catch(e) {}
      var promise = origFetch.apply(this, arguments);
      var urlLow = (url || '').toLowerCase();
      if (urlLow.indexOf('result') >= 0 || urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 || urlLow.indexOf('round') >= 0 || urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('game') >= 0 || urlLow.indexOf('pragmatic') >= 0 || urlLow.indexOf('state') >= 0 || urlLow.indexOf('update') >= 0 || urlLow.indexOf('event') >= 0 || urlLow.indexOf('history') >= 0 || urlLow.indexOf('bet') >= 0) {
        promise.then(function(r) {
          try { r.clone().text().then(function(text) { if (text) { try { extractObj(JSON.parse(text), 0, 'fetch'); } catch(e) {} extractFromText(text, 'fetch'); } }).catch(function() {}); } catch(e) {}
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
        if (u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0 || u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0 || u.indexOf('game') >= 0 || u.indexOf('pragmatic') >= 0 || u.indexOf('state') >= 0 || u.indexOf('update') >= 0 || u.indexOf('event') >= 0 || u.indexOf('history') >= 0 || u.indexOf('bet') >= 0) {
          try { var t = self.responseText; if (t) { try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {} extractFromText(t, 'xhr'); } } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // === HOOK postMessage ===
  (function() {
    window.addEventListener('message', function(event) {
      try { var data = event.data; if (typeof data === 'object' && data !== null) extractObj(data, 0, 'postMsg-in'); } catch(e) {}
    });
  })();

  // === DOM SCANNER ===
  (function() {
    var scanInterval = setInterval(function() {
      try {
        var selectors = ['[class*="result"]','[class*="winning"]','[class*="number"]','[class*="pocket"]','[class*="roulette"]','[class*="ball"]','[class*="history"]','[class*="last-"]','[class*="latest"]','[data-result]','[data-number]','[data-winning]'];
        for (var s = 0; s < selectors.length; s++) {
          var els = document.querySelectorAll(selectors[s]);
          for (var i = 0; i < els.length; i++) {
            var text = (els[i].textContent || '').trim();
            if (text.length === 1 || text.length === 2) {
              var n = parseInt(text, 10);
              if (n >= 0 && n <= 36 && String(n) === text) sendNumber(n, 'dom-' + selectors[s]);
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
 * CDPInjector v4 — Playwright frames + per-frame CDP sessions
 * 
 * Enfoque: usa page.frames() de Playwright para descubrir frames,
 * luego crea CDP session para cada frame e inyecta hooks.
 * Network fallback a nivel de pagina principal.
 */
class CDPInjector {
  constructor(onNumberFromNetwork) {
    this.onNumberFromNetwork = onNumberFromNetwork;
    this.page = null;
    this.mainCdpSession = null;
    this.injectedFrames = new Set(); // frame url -> timestamp
    this.injectCount = 0;
    this.networkNumberCount = 0;
    this.wsFrameCount = 0;
    this.wsUrlLog = new Set(); // urls de WS vistas
    this.stopped = false;
    this._frameAttachedHandler = null;
    this._frameNavigatedHandler = null;
    this._reinjectInterval = null;
  }

  /**
   * Inyecta en todos los frames de la pagina
   */
  async injectInPage(page) {
    if (!page || page.isClosed()) return;
    this.page = page;
    this.stopped = false;

    // ===== 1. Network fallback a nivel de pagina principal =====
    // Captura TODOS los WS frames (main + iframes) a nivel de red
    try {
      this.mainCdpSession = await page.context().newCDPSession(page);
      await this.mainCdpSession.send('Network.enable');

      this.mainCdpSession.on('Network.webSocketFrameReceived', (params) => {
        if (this.stopped) return;
        const payload = params.response && params.response.payloadData;
        const requestId = params.requestId;
        if (!payload || typeof payload !== 'string') return;

        this.wsFrameCount++;

        // Loggear preview de cada frame (primeros 3 y luego cada 100)
        if (this.wsFrameCount <= 10 || this.wsFrameCount % 100 === 0) {
          log.info('cdp-inject',
            `[Network] WS frame #${this.wsFrameCount} (${payload.length} chars)` +
            (payload.length > 0 ? ` preview: ${payload.substring(0, 120).replace(/\n/g, ' ')}` : '')
          );
        }

        const n = extractNumberFromWSPayload(payload);
        if (n !== null) {
          this.networkNumberCount++;
          log.info('cdp-inject', `[Network] *** NUMERO ${n} detectado en WS frame ***`);
          if (this.onNumberFromNetwork) {
            this.onNumberFromNetwork(n, 'cdp-network');
          }
        }
      });

      this.mainCdpSession.on('Network.webSocketCreated', (params) => {
        if (this.stopped) return;
        const url = params.url || '';
        if (!this.wsUrlLog.has(url)) {
          this.wsUrlLog.add(url);
          log.info('cdp-inject', `[Network] WS conectado: ${url.substring(0, 100)}`);
        }
      });

      log.info('cdp-inject', 'Network fallback activado (WebSocket interception)');
    } catch (err) {
      log.error('cdp-inject', `Error Network fallback: ${err.message}`);
    }

    // ===== 2. Escuchar frames nuevos =====
    if (this._frameAttachedHandler) {
      page.off('frameattached', this._frameAttachedHandler);
    }
    this._frameAttachedHandler = (frame) => {
      if (this.stopped) return;
      log.info('cdp-inject', `[frameattached] Nuevo frame detectado`);
      // Esperar un poco a que el frame cargue
      setTimeout(() => {
        if (!this.stopped) this._injectIntoFrame(frame);
      }, 3000);
    };
    page.on('frameattached', this._frameAttachedHandler);

    // Tambien escuchar navegaciones dentro de frames (el iframe recarga)
    if (this._frameNavigatedHandler) {
      page.off('framenavigated', this._frameNavigatedHandler);
    }
    this._frameNavigatedHandler = (frame) => {
      if (this.stopped) return;
      if (frame === page.mainFrame()) return; // ignorar navegacion del main
      log.info('cdp-inject', `[framenavigated] Frame navigo: ${frame.url().substring(0, 80)}`);
      setTimeout(() => {
        if (!this.stopped) this._injectIntoFrame(frame);
      }, 3000);
    };
    page.on('framenavigated', this._frameNavigatedHandler);

    // ===== 3. Inyectar en la pagina principal =====
    await this._injectIntoFrame(page.mainFrame());

    // ===== 4. Inyectar en todos los frames existentes =====
    await this._injectIntoAllFrames();

    // ===== 5. Re-scan cada 15s para encontrar frames que aparezcan tarde =====
    if (this._reinjectInterval) clearInterval(this._reinjectInterval);
    this._reinjectInterval = setInterval(() => {
      if (!this.stopped && this.page && !this.page.isClosed()) {
        this._injectIntoAllFrames();
      }
    }, 15000);
  }

  /**
   * Inyectar en todos los frames actuales de la pagina
   */
  async _injectIntoAllFrames() {
    if (!this.page || this.page.isClosed() || this.stopped) return;

    const frames = this.page.frames();
    const now = Date.now();

    log.info('cdp-inject', `Scanning ${frames.length} frames...`);

    // Listar URLs de todos los frames para debug
    for (const f of frames) {
      const url = f.url() || 'about:blank';
      if (url !== 'about:blank' && url.length > 5) {
        const isMain = f === this.page.mainFrame();
        log.info('cdp-inject', `  ${isMain ? '[MAIN]' : '[FRAME]'} ${url.substring(0, 100)}`);
      }
    }

    let injected = 0;
    for (const frame of frames) {
      try {
        const url = frame.url();
        if (url === 'about:blank' || url.length < 10) continue;

        // No re-inyectar si fue inyectado hace menos de 30 segundos
        if (this.injectedFrames.has(url) && now - (this.injectedFrames.get(url) || 0) < 30000) {
          continue;
        }

        const success = await this._injectIntoFrame(frame);
        if (success) injected++;
      } catch (e) {
        log.debug('cdp-inject', `Error en frame: ${e.message.substring(0, 60)}`);
      }
    }

    if (injected > 0) {
      log.info('cdp-inject', `Inyectado en ${injected} frame(s) nuevo(s) — total: ${this.injectCount}`);
    }
  }

  /**
   * Inyectar hooks en un frame especifico via CDP session
   */
  async _injectIntoFrame(frame) {
    if (this.stopped) return false;

    const url = frame.url();
    if (!url || url === 'about:blank' || url.length < 10) return false;

    try {
      // Crear CDP session para ESTE frame especifico
      // Playwright usa el target ID interno del frame para crear la session
      const session = await frame.page().context().newCDPSession(frame);

      // Habilitar Runtime
      await session.send('Runtime.enable');

      // Inyectar en MAIN world (donde estan los WebSockets reales)
      const result = await session.send('Runtime.evaluate', {
        expression: CAPTURE_CODE,
        allowUnsafeEvalBlockedByCSP: true,
      });

      // Marcar como inyectado
      this.injectedFrames.set(url, Date.now());
      this.injectCount++;

      const isMain = frame === this.page.mainFrame();
      const urlShort = url.substring(0, 80);
      log.info('cdp-inject',
        `#${this.injectCount} ${isMain ? '[MAIN]' : '[FRAME]'} OK: ${urlShort}`
      );

      // Detach la session (no la necesitamos mas, el codigo ya se ejecuto)
      try { await session.detach(); } catch (e) {}

      return true;
    } catch (err) {
      const msg = err.message || '';
      const urlShort = url.substring(0, 60);

      // Si es un error de "Target closed" o similar, no loggear como error
      if (msg.includes('Target closed') || msg.includes('detached') || msg.includes('not attached')) {
        log.debug('cdp-inject', `Frame no disponible: ${urlShort}`);
      } else {
        log.debug('cdp-inject', `Fallo inject: ${urlShort} — ${msg.substring(0, 80)}`);
      }
      return false;
    }
  }

  /**
   * Re-inyectar — limpiar cache y escanear todo de nuevo
   */
  async reInject(page) {
    if (!page || page.isClosed() || this.stopped) return;
    log.info('cdp-inject', 'Re-inyectando (limpiando cache)...');

    // Limpiar cache de inyecciones para forzar re-inyeccion
    this.injectedFrames.clear();

    // Re-inyectar en todo
    await this._injectIntoAllFrames();
  }

  /**
   * Limpiar todo
   */
  async cleanup() {
    this.stopped = true;

    if (this._reinjectInterval) {
      clearInterval(this._reinjectInterval);
      this._reinjectInterval = null;
    }

    if (this.page) {
      if (this._frameAttachedHandler) {
        this.page.off('frameattached', this._frameAttachedHandler);
      }
      if (this._frameNavigatedHandler) {
        this.page.off('framenavigated', this._frameNavigatedHandler);
      }
    }

    if (this.mainCdpSession) {
      try { await this.mainCdpSession.detach(); } catch (e) {}
    }

    this.page = null;
    this.mainCdpSession = null;
    this.injectedFrames.clear();
    this.wsUrlLog.clear();

    log.info('cdp-inject',
      `Cleanup: injects=${this.injectCount}, network_nums=${this.networkNumberCount}, ws_frames=${this.wsFrameCount}`
    );
  }

  getStats() {
    return {
      injectCount: this.injectCount,
      networkNumberCount: this.networkNumberCount,
      wsFrameCount: this.wsFrameCount,
      injectedFrames: this.injectedFrames.size,
      wsConnections: this.wsUrlLog.size,
    };
  }
}

module.exports = { CDPInjector, CAPTURE_CODE, extractNumberFromWSPayload };