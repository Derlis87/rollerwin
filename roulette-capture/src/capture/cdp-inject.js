// ============================================================
// cdp-inject.js v2 - Captura via CDP Target.setAutoAttach
// ============================================================
// v1 usaba Runtime.executionContextCreated que SOLO detecta
// contextos NUEVOS (los iframes ya cargados no se detectaban).
//
// v2 usa Target.setAutoAttach que:
//   - Detecta TODOS los targets (iframes) automaticamente
//   - Se dispara tanto para iframes existentes como nuevos
//   - Inyecta en MAIN world de cada target
//   - Agrega Network.webSocketFrameReceived como fallback
//     (captura WS frames a nivel de red, sin depender de JS)
//
// Comunicacion:
//   Metodo A: Hooks JS inyectados → fetch localhost:19555
//   Metodo B: CDP Network.webSocketFrameReceived → Node.js directo
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

  // Evolution: recentResults:[["N"],...]
  const evoMatch = payload.match(/"recentResults"\s*:\s*\[\s*\[\s*"(\d{1,2})"\s*\]/);
  if (evoMatch) {
    const n = parseInt(evoMatch[1], 10);
    if (n >= 0 && n <= 36) return n;
  }

  // Regex general — tomar el ULTIMO match (el mas reciente)
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

    console.log('%c[RW-CDP] RESULTADO: ' + n + ' (' + getColor(n) + ') — ' + source, 'color: #0f0; font-size: 14px; font-weight: bold');

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
 * CDPInjector v2 — Usa Target.setAutoAttach para inyectar en TODOS los frames
 */
class CDPInjector {
  constructor(onNumberFromNetwork) {
    this.mainSession = null;
    this.attachedTargets = new Map(); // targetId -> { sessionId, url, type }
    this.injectCount = 0;
    this.networkNumberCount = 0;
    this.stopped = false;
    this.onNumberFromNetwork = onNumberFromNetwork; // callback para numeros del Network fallback
  }

  /**
   * Inyecta en todos los frames de una pagina via Target.setAutoAttach
   */
  async injectInPage(page) {
    if (!page || page.isClosed()) return;
    this.stopped = false;

    try {
      // Crear sesion CDP para la pagina
      this.mainSession = await page.context().newCDPSession(page);

      // ===== METODO 1: Target.setAutoAttach =====
      // Se dispara para TODOS los targets (iframes) nuevos y existentes
      await this.mainSession.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: false,
      });

      this.mainSession.on('Target.attachedToTarget', async (event) => {
        if (this.stopped) return;
        await this._onTargetAttached(event);
      });

      log.info('cdp-inject', 'Target.setAutoAttach activado — esperando iframes...');

      // ===== METODO 2: Inyectar en la pagina principal =====
      await this.mainSession.send('Runtime.enable');
      await this.mainSession.send('Runtime.evaluate', {
        expression: CAPTURE_CODE,
        allowUnsafeEvalBlockedByCSP: true,
      });
      this.injectCount++;
      log.info('cdp-inject', 'Codigo inyectado en pagina principal');

      // ===== METODO 3: Network.webSocketFrameReceived como FALLBACK =====
      // Captura frames WebSocket a nivel de red — funciona SIEMPRE,
      // sin depender de que el JS inyectado funcione
      await this._setupNetworkFallback(page);

    } catch (err) {
      log.error('cdp-inject', `Error en injectInPage: ${err.message}`);
    }
  }

  /**
   * Cuando un target (iframe) se attache, inyectar codigo en el
   */
  async _onTargetAttached(event) {
    const { targetInfo, sessionId } = event;
    const targetId = targetInfo.targetId;
    const url = (targetInfo.url || '').substring(0, 80);
    const type = targetInfo.type || '?';

    // No re-inyectar si ya fue procesado
    if (this.attachedTargets.has(targetId)) {
      try { await this.mainSession.send('Runtime.runIfWaitingForDebugger', {}, sessionId); } catch(e) {}
      return;
    }

    this.attachedTargets.set(targetId, { sessionId, url, type });

    try {
      // Inyectar script persistente (se ejecuta en cada navegacion del frame)
      await this.mainSession.send('Page.addScriptToEvaluateOnNewDocument', {
        source: CAPTURE_CODE,
        worldName: '', // MAIN world
        runImmediately: true,
      }, sessionId);

      // Habilitar Console para ver logs del frame
      await this.mainSession.send('Runtime.enable', {}, sessionId);
      await this.mainSession.send('Console.enable', {}, sessionId);

      // Habilitar Network para capturar WS frames de ESTE target
      await this.mainSession.send('Network.enable', {}, sessionId);

      // Escuchar WS frames de este target especifico
      const wsHandler = (params) => {
        if (this.stopped) return;
        const payload = params.response && params.response.payloadData;
        if (!payload || typeof payload !== 'string') return;
        if (payload.length < 5) return;

        const n = extractNumberFromWSPayload(payload);
        if (n !== null) {
          this.networkNumberCount++;
          log.info('cdp-inject', `[Network-Fallback] Numero ${n} detectado en WS de ${url}`);
          if (this.onNumberFromNetwork) {
            this.onNumberFromNetwork(n, `cdp-network@${type}`);
          }
        }
      };

      this.mainSession.on('Network.webSocketFrameReceived', wsHandler);

      this.injectCount++;
      log.info('cdp-inject', `Injectado en ${type} #${this.injectCount}: ${url}`);

    } catch (err) {
      log.debug('cdp-inject', `Error inyectando en target ${type}: ${err.message.substring(0, 80)}`);
    }

    // CRITICO: Resumir el target para que el juego cargue
    try {
      await this.mainSession.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
    } catch (e) {}
  }

  /**
   * Network fallback a nivel de pagina principal
   */
  async _setupNetworkFallback(page) {
    try {
      // Escuchar WS frames en la sesion principal tambien
      this.mainSession.on('Network.webSocketFrameReceived', (params) => {
        if (this.stopped) return;
        const payload = params.response && params.response.payloadData;
        if (!payload || typeof payload !== 'string') return;

        const n = extractNumberFromWSPayload(payload);
        if (n !== null) {
          this.networkNumberCount++;
          log.info('cdp-inject', `[Network-Main] Numero ${n} detectado en WS principal`);
          if (this.onNumberFromNetwork) {
            this.onNumberFromNetwork(n, 'cdp-network-main');
          }
        }
      });

      await this.mainSession.send('Network.enable');
      log.info('cdp-inject', 'Network fallback activado (WebSocket frame interception)');
    } catch (err) {
      log.debug('cdp-inject', `Network fallback error: ${err.message}`);
    }
  }

  /**
   * Re-inyectar — solo limpia el cache y vuelve a inyectar
   */
  async reInject(page) {
    if (!page || page.isClosed()) return;
    log.info('cdp-inject', 'Re-inyectando (cache limpiado)...');
    this.attachedTargets.clear();
    // No necesitamos crear nueva sesion — los targets se re-attacharan solos
  }

  /**
   * Limpiar todo
   */
  async cleanup() {
    this.stopped = true;

    if (this.mainSession) {
      try {
        await this.mainSession.send('Target.setAutoAttach', { autoAttach: false, waitForDebuggerOnStart: false, flatten: false });
      } catch(e) {}
      try { await this.mainSession.detach(); } catch(e) {}
    }

    this.mainSession = null;
    this.attachedTargets.clear();
    log.info('cdp-inject', `Limpieza completada. Inyecciones: ${this.injectCount}, Network numeros: ${this.networkNumberCount}`);
  }

  getStats() {
    return {
      injectCount: this.injectCount,
      networkNumberCount: this.networkNumberCount,
      attachedTargets: this.attachedTargets.size,
    };
  }
}

module.exports = { CDPInjector, CAPTURE_CODE, extractNumberFromWSPayload };