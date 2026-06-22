// RollerWin Capture v9.0 — MAIN WORLD DETECTION ENGINE
// Simple y limpio: detecta numeros de ruleta en iframes de Evolution/Pragmatic
// y los envia al servidor RollerWin. Funciona en Betfury y Pinnacle.
(function() {
  'use strict';

  // Evitar doble inyeccion
  if (window.__rwMainV9) return;
  window.__rwMainV9 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  var isInIframe = (window.self !== window.top);
  var hostname = location.hostname || '';

  // ═══════════════════════════════════════════════════
  // DEDUP: solo por tiempo. 9s entre envios.
  // Los giros duran ~18s. 9s permite capturar repetidos legitimos
  // (15,15) pero bloquea multiples hooks del mismo giro.
  // ═══════════════════════════════════════════════════
  var _lastSentTime = 0;
  var _DEDUP_MS = 9000;
  var _sentCount = 0;

  function _isDup(n) {
    if (Date.now() - _lastSentTime < _DEDUP_MS) {
      return true;
    }
    return false;
  }

  function _markSent() {
    _lastSentTime = Date.now();
  }

  function getColor(n) {
    if (n === 0) return 'green';
    return RED.indexOf(n) >= 0 ? 'red' : 'black';
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

  // ═══════════════════════════════════════════════════
  // ENVIAR numero al servidor
  // ═══════════════════════════════════════════════════
  function sendNumber(n, source) {
    if (n < 0 || n > 36) return;
    if (_isDup(n)) {
      console.log('[RW] DUP bloqueado: ' + n + ' (' + source + ')');
      return;
    }

    _markSent();
    _sentCount++;
    var color = getColor(n);
    console.log('[RW] #' + _sentCount + ': ' + n + ' (' + color + ') — ' + source +
      (isInIframe ? ' [IFRAME ' + hostname + ']' : ' [PARENT]'));

    // Enviar al servidor con reintento
    var doSend = function(attempt) {
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
      }).catch(function(e) {
        if (attempt < 2) {
          setTimeout(function() { doSend(attempt + 1); }, 2000);
        }
      });
    };
    doSend(0);

    // Notificar al parent (si estamos en iframe)
    if (isInIframe) {
      try {
        window.parent.postMessage({
          source: 'rollerwin-capture',
          number: n,
          color: color,
          hostname: hostname
        }, '*');
      } catch(e) {}
    } else {
      // CustomEvent para content.js (ISOLATED world)
      try {
        document.dispatchEvent(new CustomEvent('rw-number', {
          detail: { number: n, color: color }
        }));
      } catch(e) {}
    }
  }

  // ═══════════════════════════════════════════════════
  // PARENT PAGE — solo recibe de iframes, no detecta
  // ═══════════════════════════════════════════════════
  if (!isInIframe) {
    console.log('[RW] PARENT page — esperando numeros de iframes');

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (data && data.source === 'rollerwin-capture' && typeof data.number === 'number') {
          console.log('[RW] PARENT: recibido ' + data.number + ' de iframe ' + (data.hostname || ''));
          // El iframe ya envio al servidor. Solo actualizar UI via content.js
          try {
            document.dispatchEvent(new CustomEvent('rw-number', {
              detail: { number: data.number, color: data.color }
            }));
          } catch(e) {}
        }
      } catch(e) {}
    });

    console.log('[RW] v9.0 PARENT listo | ' + hostname);
    return; // NADA MAS en el parent
  }

  // ═══════════════════════════════════════════════════
  // IFRAME — AQUI se detectan los numeros
  // ═══════════════════════════════════════════════════
  console.log('[RW] IFRAME detectado:', hostname, '— activando deteccion');

  // ──── EXTRACTORES ────

  // Campos JSON que son resultado de ruleta
  var RESULT_FIELDS = [
    'number', 'result', 'resultnumber', 'winningnumber', 'win_number',
    'game_number', 'roulette_number', 'ball_number', 'pocket', 'pocket_number',
    'winningpocket', 'pocketid', 'resultid', 'displaynumber',
    'roundresult', 'gameoutcome', 'finalnumber', 'outcome',
    'winningnumberdisplay', 'final_number', 'game_result',
    'round_result', 'game_outcome', 'numberstr', 'numberstring'
  ];

  function isResultField(key) {
    var k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (var i = 0; i < RESULT_FIELDS.length; i++) {
      if (k === RESULT_FIELDS[i].replace(/[_\-\s]/g, '')) return true;
    }
    return false;
  }

  // Extraer numero de un objeto JSON recursivamente
  function extractObj(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 4) return;

    if (Array.isArray(obj)) {
      if (obj.length === 0 || obj.length > 5) return; // Ignorar historial largo

      var pathLow = path.toLowerCase();
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0) {
        // Tomar ULTIMO elemento (resultado mas reciente)
        var last = obj[obj.length - 1];
        var n = tryNum(last);
        if (n !== null) { sendNumber(n, 'array@' + path); return; }
        if (typeof last === 'object') extractObj(last, depth + 1, path + '[]');
      }
      return;
    }

    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj[key];
      if (isResultField(key)) {
        var n = tryNum(val);
        if (n !== null) { sendNumber(n, key + '@' + path); return; }
      }
      if (typeof val === 'object' && val !== null) {
        extractObj(val, depth + 1, path + '.' + key);
      }
    }
  }

  // Regex para texto de red — solo ultimo match
  function extractFromText(text, source) {
    if (!text || typeof text !== 'string' || text.length > 200000) return;
    var patterns = [
      /"resultNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winningNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winning_number"\s*:\s*(\d{1,2})\b/gi,
      /"ball_number"\s*:\s*(\d{1,2})\b/gi,
      /"pocket_number"\s*:\s*(\d{1,2})\b/gi,
      /"roulette_number"\s*:\s*(\d{1,2})\b/gi,
      /"finalNumber"\s*:\s*(\d{1,2})\b/gi,
      /"game_number"\s*:\s*(\d{1,2})\b/gi,
      /"displayNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winningPocket"\s*:\s*(\d{1,2})\b/gi
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
    if (lastMatch !== null) sendNumber(lastMatch, 'regex@' + source);
  }

  // ═══════════════════════════════════════════════════
  // HOOK WEBSOCKET — fuente principal de numeros
  // ═══════════════════════════════════════════════════
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwV9) return;
    OrigWS.__rwV9 = true;

    var ProxyWS = function(url, protocols) {
      console.log('[RW] WS abierto:', (url || '').substring(0, 100));
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) {
              try { data = String.fromCharCode.apply(null, new Uint8Array(data)); } catch(er) { return; }
            } else return;
          }

          // Socket.io: 42["event",{...}]
          if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
            try {
              var p = JSON.parse(data.substring(2));
              if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'object') {
                extractObj(p[1], 0, 'sio.' + p[0]);
                extractFromText(data, 'sio.' + p[0]);
              }
            } catch(err) {}
          }

          // JSON puro
          if (data.charAt(0) === '{' || data.charAt(0) === '[') {
            try {
              extractObj(JSON.parse(data), 0, 'ws');
              extractFromText(data, 'ws');
            } catch(err) {}
          }
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

  // ═══════════════════════════════════════════════════
  // HOOK FETCH
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
      var urlLow = url.toLowerCase();

      // Solo procesar URLs relevantes, excluir historial
      if (urlLow.indexOf('result') >= 0 || urlLow.indexOf('roulette') >= 0 ||
          urlLow.indexOf('evolution') >= 0 || urlLow.indexOf('round') >= 0 ||
          urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('game') >= 0) {
        if (urlLow.indexOf('history') >= 0 || urlLow.indexOf('state') >= 0 ||
            urlLow.indexOf('stats') >= 0) return promise;

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

  // ═══════════════════════════════════════════════════
  // HOOK XHR
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
        if (u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 ||
            u.indexOf('evolution') >= 0 || u.indexOf('round') >= 0 ||
            u.indexOf('wheel') >= 0 || u.indexOf('game') >= 0) {
          if (u.indexOf('history') >= 0 || u.indexOf('state') >= 0 || u.indexOf('stats') >= 0) return;
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

  // ═══════════════════════════════════════════════════
  // HOOK postMessage (dentro del iframe)
  // ═══════════════════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwV9) return;
    orig.__rwV9 = true;

    window.postMessage = function(data, origin, transfer) {
      try { if (typeof data === 'object' && data !== null) extractObj(data, 0, 'postMsg-out'); } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null) {
          // No procesar nuestros propios mensajes
          if (data.source === 'rollerwin-capture' || data.source === 'rollerwin-sync') return;
          extractObj(data, 0, 'postMsg-in');
        }
      } catch(e) {}
    });
  })();

  // ═══════════════════════════════════════════════════
  // HOOK EventSource (SSE)
  // ═══════════════════════════════════════════════════
  (function() {
    if (typeof window.EventSource === 'undefined') return;
    var Orig = window.EventSource;
    if (Orig.__rwV9) return;
    Orig.__rwV9 = true;

    var Proxy = function(url, opts) {
      var es = opts ? new Orig(url, opts) : new Orig(url);
      var add = es.addEventListener.bind(es);
      ['result','game','update','roulette','number','outcome','round'].forEach(function(t) {
        add(t, function(e) {
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
  // DOM SCANNER — busca el resultado actual en pantalla
  // Excluye historial. Solo resultado actual.
  // ═══════════════════════════════════════════════════
  (function() {
    var HISTORY_KEYWORDS = ['history','past','track','sequence','previous','older',
      'last-result','lastresults','gamehistory','result-history','historyitem',
      'resultshistory','bng','stats','statistics','roadmap','bigroad','beadroad','marker'];

    var CURRENT_KEYWORDS = ['winning-number','winningnumber','winning-pocket','winningpocket',
      'result-display','resultdisplay','result-value','resultvalue','current-result',
      'game-number-display','number-display','overlay-result','announced','lastnumber',
      'round-result','roulette-result','live-result','detailed-result'];

    function isHistoryElement(el) {
      if (!el) return false;
      var c = ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-test') || '')).toLowerCase();
      for (var i = 0; i < HISTORY_KEYWORDS.length; i++) {
        if (c.indexOf(HISTORY_KEYWORDS[i]) >= 0) return true;
      }
      var parent = el.parentElement;
      var depth = 0;
      while (parent && depth < 5) {
        var pc = ((parent.className || '') + ' ' + (parent.id || '')).toLowerCase();
        for (var i = 0; i < HISTORY_KEYWORDS.length; i++) {
          if (pc.indexOf(HISTORY_KEYWORDS[i]) >= 0) return true;
        }
        parent = parent.parentElement;
        depth++;
      }
      return false;
    }

    var STRICT_SELECTORS = [
      '[class*="winning-number"]',
      '[class*="winning-pocket"]',
      '[class*="result-display"]',
      '[class*="result-value"]',
      '[class*="current-result"]',
      '[class*="game-number-display"]',
      '[class*="number-display"]',
      '[data-result-number]',
      '[data-winning-number]',
      '[data-game-result]',
      '[class*="overlay"] [class*="result"]',
      '[class*="announced"]',
      '[class*="round-result"]',
      '[class*="roulette-result"]',
      '[class*="live-result"]'
    ];

    // Change-detect: si el numero cambio o lleva >15s visible = nuevo giro
    var _lastDomNum = -1;
    var _lastDomTime = 0;
    var _DOM_REPEAT_LIMIT = 15000;

    function scanDOM() {
      for (var i = 0; i < STRICT_SELECTORS.length; i++) {
        try {
          var els = document.querySelectorAll(STRICT_SELECTORS[i]);
          for (var j = 0; j < els.length; j++) {
            if (isHistoryElement(els[j])) continue;
            var text = (els[j].textContent || '').trim();
            var num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
              var now = Date.now();
              if (num === _lastDomNum && now - _lastDomTime < _DOM_REPEAT_LIMIT) return;
              _lastDomNum = num;
              _lastDomTime = now;
              sendNumber(num, 'DOM:' + STRICT_SELECTORS[i]);
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

      // MutationObserver con debounce 500ms
      var timer = null;
      new MutationObserver(function() {
        if (timer) return;
        timer = setTimeout(function() { timer = null; scanDOM(); }, 500);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });

      // Scan periodico cada 6s
      setInterval(scanDOM, 6000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(setup, 100); });
    } else {
      setTimeout(setup, 100);
    }
  })();

  console.log('[RW] v9.0 MOTOR ACTIVO en IFRAME ' + hostname);
})();