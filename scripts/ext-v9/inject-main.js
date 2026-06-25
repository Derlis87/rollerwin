// RollerWin Capture v9.2 — PRECISION DETECTION ENGINE
// FIX: Elimina falsos positivos — solo captura resultados REALES de ruleta
// v9.2: extractFromText eliminado, RESULT_FIELDS restrictivos, dedup 20s
(function() {
  'use strict';

  if (window.__rwMainV9) return;
  window.__rwMainV9 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  var isInIframe = (window.self !== window.top);
  var hostname = location.hostname || '';

  console.log('[RW] v9.2 CARGADO en ' + (isInIframe ? 'IFRAME' : 'PARENT') + ' | ' + hostname + ' | ' + location.href.substring(0, 80));

  // ═══════════════════════════════════════════════════
  // DEDUP: 20s entre envios (una ronda tarda ~30-60s)
  // ═══════════════════════════════════════════════════
  var _lastSentTime = 0;
  var _DEDUP_MS = 20000;
  var _sentCount = 0;

  function _isDup() {
    return Date.now() - _lastSentTime < _DEDUP_MS;
  }

  function _markSent() { _lastSentTime = Date.now(); }

  function getColor(n) {
    if (n === 0) return 'green';
    return RED.indexOf(n) >= 0 ? 'red' : 'black';
  }

  // Convierte un valor a numero de ruleta (0-36) o null
  function tryNum(val) {
    if (typeof val === 'number' && val >= 0 && val <= 36 && val === Math.floor(val)) return val;
    if (typeof val === 'string') {
      var s = String(val).trim();
      if (s.length >= 1 && s.length <= 2) {
        var n = parseInt(s, 10);
        if (!isNaN(n) && n >= 0 && n <= 36 && String(n) === s) return n;
      }
    }
    return null;
  }

  // ═══════════════════════════════════════════════════
  // ENVIAR numero al servidor
  // ═══════════════════════════════════════════════════
  function sendNumber(n, source, confidence) {
    if (n === null || n < 0 || n > 36) return;
    if (_isDup()) {
      console.log('[RW] DUP ignorado: ' + n + ' (' + source + ')');
      return;
    }

    _markSent();
    _sentCount++;
    var color = getColor(n);
    var confTag = confidence ? ' [' + confidence + ']' : '';
    console.log('%c[RW] #' + _sentCount + ': ' + n + ' (' + color + ')' + confTag + ' — ' + source +
      (isInIframe ? ' [IFRAME ' + hostname + ']' : ' [PARENT ' + hostname + ']'),
      'color: #22c55e; font-weight: bold; font-size: 14px;');

    (function doSend(attempt) {
      fetch(SERVER + '/api/capture/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: n })
      }).then(function(r) {
        if (r.ok) {
          console.log('[RW] Servidor OK:', n);
        } else if (attempt < 2) {
          setTimeout(function() { doSend(attempt + 1); }, 2000);
        }
      }).catch(function() {
        if (attempt < 2) setTimeout(function() { doSend(attempt + 1); }, 2000);
      });
    })(0);

    if (isInIframe) {
      try {
        window.parent.postMessage({
          source: 'rollerwin-capture',
          number: n, color: color, hostname: hostname
        }, '*');
      } catch(e) {}
    }

    try {
      document.dispatchEvent(new CustomEvent('rw-number', {
        detail: { number: n, color: color }
      }));
    } catch(e) {}
  }

  // ═══════════════════════════════════════════════════
  // EXTRACTOR DE OBJETOS JSON — VERSION PRECISA
  // Solo campos ALTAMENTE especificos de resultado de ruleta
  // ═══════════════════════════════════════════════════

  // CAMPOS ALTA CONFIANZA: nombres que SOLO aparecen en contexto de resultado
  var HIGH_CONF = [
    'winningnumber', 'winning_number', 'winningNumber',
    'resultnumber', 'result_number', 'resultNumber',
    'roulettenumber', 'roulette_number', 'rouletteNumber',
    'ballnumber', 'ball_number', 'ballNumber',
    'pocketnumber', 'pocket_number', 'pocketNumber',
    'winningpocket', 'winning_pocket', 'winningPocket',
    'displaynumber', 'display_number', 'displayNumber',
    'finalnumber', 'final_number', 'finalNumber',
    'winningnumberdisplay', 'winning_number_display'
  ];

  // CAMPOS MEDIA CONFIANZA: pueden ser resultado pero tambien otras cosas
  // Solo se aceptan si estan en un contexto claro de game/round/roulette
  var MED_CONF = [
    'gameresult', 'game_result', 'gameResult',
    'roundresult', 'round_result', 'roundResult',
    'gameoutcome', 'game_outcome', 'gameOutcome',
    'result'
  ];

  function isHighConf(key) {
    var k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (var i = 0; i < HIGH_CONF.length; i++) {
      if (k === HIGH_CONF[i].replace(/[_\-\s]/g, '')) return true;
    }
    return false;
  }

  function isMedConf(key) {
    var k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (var i = 0; i < MED_CONF.length; i++) {
      if (k === MED_CONF[i].replace(/[_\-\s]/g, '')) return true;
    }
    return false;
  }

  // Extraer numero de un objeto JSON — recursivo pero controlado
  function extractObj(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 3) return;

    if (Array.isArray(obj)) {
      // NO procesar arrays genericos — solo arrays con nombre claro de resultado
      var pathLow = path.toLowerCase();
      var isResultArray = pathLow.indexOf('winningnumber') >= 0 ||
          pathLow.indexOf('resultnumber') >= 0 ||
          pathLow.indexOf('roulettenumber') >= 0 ||
          pathLow.indexOf('pocketnumber') >= 0 ||
          pathLow.indexOf('ballnumber') >= 0 ||
          pathLow.indexOf('finalnumber') >= 0 ||
          pathLow.indexOf('gameresult') >= 0 ||
          pathLow.indexOf('roundresult') >= 0;

      if (!isResultArray) return;
      if (obj.length === 0 || obj.length > 100) return;

      // Tomar el ULTIMO elemento (resultado mas reciente)
      var last = obj[obj.length - 1];
      var n = tryNum(last);
      if (n !== null) {
        sendNumber(n, 'array@' + path, 'HIGH');
        return;
      }
      if (typeof last === 'object') extractObj(last, depth + 1, path + '[]');
      return;
    }

    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj[key];

      // ALTA CONFIANZA: enviar inmediatamente
      if (isHighConf(key)) {
        var n = tryNum(val);
        if (n !== null) {
          sendNumber(n, key + '@' + path, 'HIGH');
          return;
        }
      }

      // MEDIA CONFIANZA: solo si el PATH contiene contexto de juego
      if (isMedConf(key)) {
        var pathLow = path.toLowerCase();
        var inGameContext = pathLow.indexOf('game') >= 0 || pathLow.indexOf('round') >= 0 ||
            pathLow.indexOf('roulette') >= 0 || pathLow.indexOf('wheel') >= 0 ||
            pathLow.indexOf('spin') >= 0 || pathLow.indexOf('result') >= 0 ||
            pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('win') >= 0 ||
            pathLow.indexOf('bet') >= 0 || depth === 0;
        if (inGameContext) {
          var n2 = tryNum(val);
          if (n2 !== null) {
            sendNumber(n2, key + '@' + path, 'MED');
            return;
          }
        }
      }

      // Bajar un nivel SOLO si es un objeto y no hemos llegado al limite
      if (typeof val === 'object' && val !== null && depth < 3) {
        extractObj(val, depth + 1, path + '.' + key);
      }
    }
  }

  // ═══════════════════════════════════════════════════
  // EXTRACTOR DE TEXTO — VERSION RESTRINGIDA
  // Solo los patrones MAS especificos, sin falsos positivos
  // ═══════════════════════════════════════════════════
  function extractFromText(text, source) {
    if (!text || typeof text !== 'string' || text.length > 100000) return;

    // SOLO patrones camelCase o snake_case muy especificos
    var patterns = [
      /"winningNumber"\s*:\s*"?(\d{1,2})\b/gi,
      /"winning_number"\s*:\s*"?(\d{1,2})\b/gi,
      /"resultNumber"\s*:\s*"?(\d{1,2})\b/gi,
      /"result_number"\s*:\s*"?(\d{1,2})\b/gi,
      /"rouletteNumber"\s*:\s*"?(\d{1,2})\b/gi,
      /"roulette_number"\s*:\s*"?(\d{1,2})\b/gi,
      /"ballNumber"\s*:\s*"?(\d{1,2})\b/gi,
      /"ball_number"\s*:\s*"?(\d{1,2})\b/gi,
      /"pocketNumber"\s*:\s*"?(\d{1,2})\b/gi,
      /"pocket_number"\s*:\s*"?(\d{1,2})\b/gi,
      /"winningPocket"\s*:\s*"?(\d{1,2})\b/gi,
      /"winning_pocket"\s*:\s*"?(\d{1,2})\b/gi,
      /"displayNumber"\s*:\s*"?(\d{1,2})\b/gi,
      /"display_number"\s*:\s*"?(\d{1,2})\b/gi,
      /"finalNumber"\s*:\s*"?(\d{1,2})\b/gi,
      /"final_number"\s*:\s*"?(\d{1,2})\b/gi,
      /"gameResult"\s*:\s*"?(\d{1,2})\b/gi,
      /"game_result"\s*:\s*"?(\d{1,2})\b/gi,
      /"roundResult"\s*:\s*"?(\d{1,2})\b/gi,
      /"round_result"\s*:\s*"?(\d{1,2})\b/gi
    ];

    var lastMatch = null;
    for (var i = 0; i < patterns.length; i++) {
      var m;
      patterns[i].lastIndex = 0;
      while ((m = patterns[i].exec(text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) lastMatch = n;
      }
    }
    if (lastMatch !== null) sendNumber(lastMatch, 'regex@' + source, 'HIGH');
  }

  // ═══════════════════════════════════════════════════
  // LOG DE TRAFICO (debug) — muestra lo que llega por WS
  // ═══════════════════════════════════════════════════
  var _wsMsgCount = 0;
  var _lastWsLog = 0;

  function debugLogWs(data, source) {
    var now = Date.now();
    _wsMsgCount++;
    // Solo logear cada 50 mensajes o cada 10 segundos
    if (now - _lastWsLog > 10000 || _wsMsgCount <= 5) {
      _lastWsLog = now;
      console.log('[RW] WS #' + _wsMsgCount + ' (' + source + '): ' + (data || '').substring(0, 200));
    }
  }

  // ═══════════════════════════════════════════════════
  // HOOK WEBSOCKET — fuente principal
  // ═══════════════════════════════════════════════════
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwV9) return;
    OrigWS.__rwV9 = true;

    var ProxyWS = function(url, protocols) {
      console.log('[RW] WS abierto: ' + (url || '').substring(0, 120));
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;

          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) {
              try { data = String.fromCharCode.apply(null, new Uint8Array(data)); } catch(er) { return; }
            } else if (data instanceof Blob) {
              data.arrayBuffer().then(function(buf) {
                try {
                  var str = String.fromCharCode.apply(null, new Uint8Array(buf));
                  processWSMessage(str);
                } catch(er) {}
              });
              return;
            } else {
              return;
            }
          }

          processWSMessage(data);
        } catch(err) {}
      });

      return ws;
    };

    function processWSMessage(data) {
      if (!data || typeof data !== 'string') return;

      // Socket.io: 42["event",{...}] o 43["event",{...}]
      if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
        try {
          var payload = data.substring(2);
          var p = JSON.parse(payload);
          if (Array.isArray(p) && p.length >= 2) {
            var evtName = String(p[0] || '');
            var evtData = p[1];

            debugLogWs(data, 'sio.' + evtName);

            // Filtrar eventos que claramente NO son resultados
            var evtLow = evtName.toLowerCase();
            var isGameEvent = evtLow.indexOf('result') >= 0 ||
                evtLow.indexOf('win') >= 0 ||
                evtLow.indexOf('game') >= 0 ||
                evtLow.indexOf('round') >= 0 ||
                evtLow.indexOf('spin') >= 0 ||
                evtLow.indexOf('complete') >= 0 ||
                evtLow.indexOf('outcome') >= 0 ||
                evtLow.indexOf('number') >= 0 ||
                evtLow.indexOf('pocket') >= 0 ||
                evtLow.indexOf('ball') >= 0 ||
                evtLow.indexOf('roulette') >= 0 ||
                evtLow.indexOf('update') >= 0 ||
                evtLow.indexOf('state') >= 0 ||
                evtLow.indexOf('bet') >= 0 ||
                evtLow.indexOf('history') >= 0;

            // Procesar SOLO eventos relevantes al juego
            if (isGameEvent && typeof evtData === 'object' && evtData !== null) {
              extractObj(evtData, 0, 'sio.' + evtName);
            }

            // Regex restringido solo en eventos de juego
            if (isGameEvent) {
              extractFromText(data, 'sio.' + evtName);
            }
          }
        } catch(err) {}
        return;
      }

      // JSON puro
      if (data.charAt(0) === '{' || data.charAt(0) === '[') {
        try {
          var parsed = JSON.parse(data);
          debugLogWs(data, 'ws-json');
          extractObj(parsed, 0, 'ws-json');
        } catch(err) {}
        extractFromText(data, 'ws-json');
        return;
      }

      // NO procesar mensajes de texto plano que no son JSON
      // Esto evita falsos positivos de mensajes de chat, etc.
    }

    ProxyWS.prototype = OrigWS.prototype;
    ProxyWS.CONNECTING = OrigWS.CONNECTING;
    ProxyWS.OPEN = OrigWS.OPEN;
    ProxyWS.CLOSING = OrigWS.CLOSING;
    ProxyWS.CLOSED = OrigWS.CLOSED;
    window.WebSocket = ProxyWS;
  })();

  // ═══════════════════════════════════════════════════
  // HOOK FETCH — intercepta respuestas HTTP
  // ═══════════════════════════════════════════════════
  (function() {
    var origFetch = window.fetch;
    if (!origFetch || origFetch.__rwV9) return;
    origFetch.__rwV9 = true;

    window.fetch = function(input, init) {
      var url = '';
      try {
        url = typeof input === 'string' ? input :
              (input instanceof Request) ? (input.url || '') :
              (input && input.url) ? input.url : '';
      } catch(e) {}

      var promise = origFetch.apply(this, arguments);
      var urlLow = (url || '').toLowerCase();

      // Solo URLs que claramente contienen resultados de juego
      var isResult = urlLow.indexOf('result') >= 0 ||
          urlLow.indexOf('winning') >= 0 ||
          urlLow.indexOf('outcome') >= 0 ||
          urlLow.indexOf('roulette') >= 0;

      var isExcluded = urlLow.indexOf('history') >= 0 ||
          urlLow.indexOf('state') >= 0 || urlLow.indexOf('stats') >= 0 ||
          urlLow.indexOf('.js') >= 0 || urlLow.indexOf('.css') >= 0 ||
          urlLow.indexOf('.png') >= 0 || urlLow.indexOf('.jpg') >= 0 ||
          urlLow.indexOf('.svg') >= 0 || urlLow.indexOf('.woff') >= 0 ||
          urlLow.indexOf('favicon') >= 0 || urlLow.indexOf('analytics') >= 0 ||
          urlLow.indexOf('tracker') >= 0 || urlLow.indexOf('telemetry') >= 0 ||
          urlLow.indexOf('balance') >= 0 || urlLow.indexOf('user') >= 0 ||
          urlLow.indexOf('profile') >= 0 || urlLow.indexOf('settings') >= 0 ||
          urlLow.indexOf('bonus') >= 0 || urlLow.indexOf('promo') >= 0;

      if (isResult && !isExcluded) {
        promise.then(function(r) {
          try {
            r.clone().text().then(function(text) {
              if (text && text.length < 50000) {
                try { extractObj(JSON.parse(text), 0, 'fetch:' + url.substring(0, 60)); } catch(e) {}
                extractFromText(text, 'fetch:' + url.substring(0, 60));
              }
            }).catch(function() {});
          } catch(e) {}
        }).catch(function() {});
      }

      return promise;
    };
  })();

  // ═══════════════════════════════════════════════════
  // HOOK XHR — intercepta respuestas XHR
  // ═══════════════════════════════════════════════════
  (function() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwV9) return;
    origSend.__rwV9 = true;

    XMLHttpRequest.prototype.open = function(m, u) {
      this._rwUrl = String(u || '');
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      this.addEventListener('load', function() {
        var u = (self._rwUrl || '').toLowerCase();
        var isResult = u.indexOf('result') >= 0 || u.indexOf('winning') >= 0 ||
            u.indexOf('outcome') >= 0 || u.indexOf('roulette') >= 0;
        var isExcluded = u.indexOf('history') >= 0 || u.indexOf('state') >= 0 ||
            u.indexOf('stats') >= 0 || u.indexOf('.js') >= 0 ||
            u.indexOf('balance') >= 0 || u.indexOf('user') >= 0;
        if (isResult && !isExcluded) {
          try {
            var t = self.responseText;
            if (t && t.length < 50000) {
              try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {}
              extractFromText(t, 'xhr');
            }
          } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // ═══════════════════════════════════════════════════
  // HOOK postMessage — MENOS agresivo
  // ═══════════════════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwV9) return;
    orig.__rwV9 = true;

    window.postMessage = function(data, origin, transfer) {
      try {
        if (typeof data === 'object' && data !== null) {
          if (data.source !== 'rollerwin-capture' && data.source !== 'rollerwin-sync') {
            // Solo procesar si contiene campos de alta confianza
            var str = JSON.stringify(data).toLowerCase();
            if (str.indexOf('winningnumber') >= 0 || str.indexOf('resultnumber') >= 0 ||
                str.indexOf('roulettenumber') >= 0 || str.indexOf('ballnumber') >= 0 ||
                str.indexOf('pocketnumber') >= 0 || str.indexOf('gameresult') >= 0 ||
                str.indexOf('roundresult') >= 0) {
              extractObj(data, 0, 'postMsg-out');
            }
          }
        }
      } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null) {
          if (data.source === 'rollerwin-capture' || data.source === 'rollerwin-sync') return;
          var str = JSON.stringify(data).toLowerCase();
          if (str.indexOf('winningnumber') >= 0 || str.indexOf('resultnumber') >= 0 ||
              str.indexOf('roulettenumber') >= 0 || str.indexOf('ballnumber') >= 0 ||
              str.indexOf('pocketnumber') >= 0 || str.indexOf('gameresult') >= 0 ||
              str.indexOf('roundresult') >= 0) {
            extractObj(data, 0, 'postMsg-in');
          }
        }
      } catch(e) {}
    });
  })();

  // ═══════════════════════════════════════════════════
  // HOOK EventSource (SSE) — restringido
  // ═══════════════════════════════════════════════════
  (function() {
    if (typeof window.EventSource === 'undefined') return;
    var Orig = window.EventSource;
    if (Orig.__rwV9) return;
    Orig.__rwV9 = true;

    var Proxy = function(url, opts) {
      console.log('[RW] SSE abierto: ' + (url || '').substring(0, 100));
      var es = opts ? new Orig(url, opts) : new Orig(url);

      var origAdd = es.addEventListener.bind(es);
      // Solo escuchar eventos claramente de resultado
      var eventTypes = ['result', 'game', 'roulette', 'number', 'outcome',
        'round', 'spin', 'complete', 'win'];

      eventTypes.forEach(function(t) {
        origAdd(t, function(e) {
          try {
            if (typeof e.data === 'string') {
              extractFromText(e.data, 'sse.' + t);
              try { extractObj(JSON.parse(e.data), 0, 'sse.' + t); } catch(err) {}
            }
          } catch(err) {}
        });
      });

      return es;
    };

    Proxy.prototype = Orig.prototype;
    Proxy.CONNECTING = Orig.CONNECTING;
    Proxy.OPEN = Orig.OPEN;
    Proxy.CLOSED = Orig.CLOSED;
    window.EventSource = Proxy;
  })();

  // ═══════════════════════════════════════════════════
  // DOM SCANNER — busca resultado ACTUAL en pantalla
  // Selectores muy especificos, excluye historial
  // ═══════════════════════════════════════════════════
  (function() {
    // Keywords de historial — cualquier elemento con estos se ignora
    var HISTORY_KW = ['history', 'past', 'track', 'sequence', 'previous', 'older',
      'last-result', 'lastresults', 'gamehistory', 'result-history', 'historyitem',
      'resultshistory', 'bng', 'stats', 'statistics', 'roadmap', 'bigroad', 'beadroad',
      'marker', 'scoreboard', 'score', 'recent', 'hot', 'cold', 'last'];

    function isHistoryEl(el) {
      if (!el) return false;
      var c = ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-test') || '')).toLowerCase();
      for (var i = 0; i < HISTORY_KW.length; i++) {
        if (c.indexOf(HISTORY_KW[i]) >= 0) return true;
      }
      var p = el.parentElement;
      var d = 0;
      while (p && d < 5) {
        var pc = ((p.className || '') + ' ' + (p.id || '')).toLowerCase();
        for (var i = 0; i < HISTORY_KW.length; i++) {
          if (pc.indexOf(HISTORY_KW[i]) >= 0) return true;
        }
        p = p.parentElement;
        d++;
      }
      return false;
    }

    // Selectores ALTAMENTE especificos para resultado ACTUAL
    var SELECTORS = [
      '[class*="winning-number"]',
      '[class*="winning-pocket"]',
      '[class*="result-display"]',
      '[class*="result-value"]',
      '[class*="current-result"]',
      '[data-result-number]',
      '[data-winning-number]',
      '[data-game-result]',
      '[class*="announced"]',
      '[class*="round-result"]',
      '[class*="roulette-result"]',
      '[class*="live-result"]',
      '[class*="ball-number"]',
      '[class*="pocket-number"]'
    ];

    var _lastDomNum = -1;
    var _lastDomTime = 0;
    var _DOM_REPEAT = 20000; // No repetir DOM scan del mismo numero en 20s

    function scanDOM() {
      for (var i = 0; i < SELECTORS.length; i++) {
        try {
          var els = document.querySelectorAll(SELECTORS[i]);
          for (var j = 0; j < els.length; j++) {
            if (isHistoryEl(els[j])) continue;
            var text = (els[j].textContent || '').trim();
            var num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
              var now = Date.now();
              if (num === _lastDomNum && now - _lastDomTime < _DOM_REPEAT) return;
              _lastDomNum = num;
              _lastDomTime = now;
              sendNumber(num, 'DOM:' + SELECTORS[i], 'DOM');
              return;
            }
          }
        } catch(e) {}
      }
    }

    function setup() {
      if (!document.body) return;
      setTimeout(scanDOM, 500);
      setTimeout(scanDOM, 2000);
      setTimeout(scanDOM, 5000);

      var timer = null;
      new MutationObserver(function() {
        if (timer) return;
        timer = setTimeout(function() { timer = null; scanDOM(); }, 1000);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });

      setInterval(scanDOM, 8000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(setup, 100); });
    } else {
      setTimeout(setup, 100);
    }
  })();

  // ═══════════════════════════════════════════════════
  // ESCUCHAR postMessage de iframes (si somos parent)
  // ═══════════════════════════════════════════════════
  if (!isInIframe) {
    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (data && data.source === 'rollerwin-capture' && typeof data.number === 'number') {
          console.log('[RW] PARENT: recibido ' + data.number + ' de iframe ' + (data.hostname || ''));
        }
      } catch(e) {}
    });
  }

  console.log('[RW] v9.2 MOTOR PRECISO ACTIVO | ' + (isInIframe ? 'IFRAME' : 'PARENT') + ' | ' + hostname);
})();