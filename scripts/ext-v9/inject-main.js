// RollerWin Capture v9.1 — MAIN WORLD DETECTION ENGINE
// Detecta numeros de ruleta en CUALQUIER contexto (parent + iframe)
// Funciona en Betfury y Pinnacle, Evolution y Pragmatic Play.
(function() {
  'use strict';

  if (window.__rwMainV9) return;
  window.__rwMainV9 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  var isInIframe = (window.self !== window.top);
  var hostname = location.hostname || '';

  console.log('[RW] v9.1 CARGADO en ' + (isInIframe ? 'IFRAME' : 'PARENT') + ' | ' + hostname + ' | ' + location.href.substring(0, 80));

  // ═══════════════════════════════════════════════════
  // DEDUP por tiempo: 9s entre envios
  // ═══════════════════════════════════════════════════
  var _lastSentTime = 0;
  var _DEDUP_MS = 9000;
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
      // Aceptar "0" a "36" como strings exactos
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
  function sendNumber(n, source) {
    if (n === null || n < 0 || n > 36) return;
    if (_isDup()) {
      console.log('[RW] DUP: ' + n + ' (' + source + ')');
      return;
    }

    _markSent();
    _sentCount++;
    var color = getColor(n);
    console.log('%c[RW] #' + _sentCount + ': ' + n + ' (' + color + ') — ' + source +
      (isInIframe ? ' [IFRAME ' + hostname + ']' : ' [PARENT ' + hostname + ']'),
      'color: #22c55e; font-weight: bold; font-size: 14px;');

    // Enviar al servidor con reintento
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

    // Notificar al parent si estamos en iframe
    if (isInIframe) {
      try {
        window.parent.postMessage({
          source: 'rollerwin-capture',
          number: n, color: color, hostname: hostname
        }, '*');
      } catch(e) {}
    }

    // Siempre notificar al content script via CustomEvent
    try {
      document.dispatchEvent(new CustomEvent('rw-number', {
        detail: { number: n, color: color }
      }));
    } catch(e) {}
  }

  // ═══════════════════════════════════════════════════
  // EXTRACTORES — procesan datos y buscan numeros
  // ═══════════════════════════════════════════════════

  // Campos JSON que indícan resultado de ruleta
  var RESULT_FIELDS = [
    'number', 'result', 'resultnumber', 'winningnumber', 'win_number',
    'game_number', 'roulette_number', 'ball_number', 'pocket', 'pocket_number',
    'winningpocket', 'pocketid', 'resultid', 'displaynumber',
    'roundresult', 'gameoutcome', 'finalnumber', 'outcome',
    'winningnumberdisplay', 'final_number', 'game_result',
    'round_result', 'game_outcome', 'numberstr', 'numberstring',
    'resultnumber', 'gameresult', 'winner', 'winning', 'betresult',
    'lucky_number', 'selectednumber', 'chosen_number'
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
    if (!obj || typeof obj !== 'object' || depth > 5) return;

    if (Array.isArray(obj)) {
      // Ignorar arrays vacios o muy largos (historial)
      if (obj.length === 0 || obj.length > 5) return;

      var pathLow = path.toLowerCase();
      // Solo procesar arrays en contextos de resultado
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0 ||
          pathLow.indexOf('number') >= 0 || pathLow.indexOf('game') >= 0 ||
          pathLow.indexOf('round') >= 0 || pathLow.indexOf('bet') >= 0) {
        // Tomar ULTIMO elemento (mas reciente)
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

      // Si la key es un campo de resultado, intentar extraer
      if (isResultField(key)) {
        var n = tryNum(val);
        if (n !== null) { sendNumber(n, key + '@' + path); return; }
      }

      // Si el valor es un objeto, bajar un nivel
      if (typeof val === 'object' && val !== null && depth < 5) {
        extractObj(val, depth + 1, path + '.' + key);
      }
    }
  }

  // Regex para texto plano — busca patrones de resultado en strings
  function extractFromText(text, source) {
    if (!text || typeof text !== 'string' || text.length > 500000) return;

    // Patrones especificos de campo JSON (alto confianza)
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
      /"winningPocket"\s*:\s*(\d{1,2})\b/gi,
      /"gameResult"\s*:\s*"?(\d{1,2})\b/gi,
      /"result"\s*:\s*(\d{1,2})\b/gi,
      /"number"\s*:\s*(\d{1,2})\b/gi,
      /"pocket"\s*:\s*(\d{1,2})\b/gi,
      /"outcome"\s*:\s*(\d{1,2})\b/gi
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
  // HOOK WEBSOCKET — fuente principal
  // ═══════════════════════════════════════════════════
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwV9) return;
    OrigWS.__rwV9 = true;

    var ProxyWS = function(url, protocols) {
      console.log('[RW] WS abierto: ' + (url || '').substring(0, 120));
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      // Interceptar TODOS los mensajes del WebSocket
      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;

          // Convertir ArrayBuffer a string si es binario
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) {
              try { data = String.fromCharCode.apply(null, new Uint8Array(data)); } catch(er) { return; }
            } else if (data instanceof Blob) {
              // Blob: leer como texto
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
            // Procesar el payload del evento
            if (typeof evtData === 'object' && evtData !== null) {
              extractObj(evtData, 0, 'sio.' + evtName);
            }
            // Siempre hacer regex en el texto completo del mensaje
            extractFromText(data, 'sio.' + evtName);
          }
        } catch(err) {}
      }

      // JSON puro (empieza con { o [)
      if (data.charAt(0) === '{' || data.charAt(0) === '[') {
        try {
          var parsed = JSON.parse(data);
          extractObj(parsed, 0, 'ws-json');
        } catch(err) {}
        extractFromText(data, 'ws-json');
      }

      // Mensajes que no son JSON ni socket.io pero contienen numeros
      // Buscar patrones como "number:15" o "result=32" etc.
      if (data.charAt(0) !== '{' && data.charAt(0) !== '[' && data.charAt(0) !== '4') {
        extractFromText(data, 'ws-other');
      }
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

      // Procesar URLs que puedan contener resultados de juego
      // Excluir: historial, stats, estado, static assets
      var isRelevant = urlLow.indexOf('result') >= 0 ||
          urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
          urlLow.indexOf('pragmatic') >= 0 || urlLow.indexOf('round') >= 0 ||
          urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('game') >= 0 ||
          urlLow.indexOf('live') >= 0 || urlLow.indexOf('bet') >= 0 ||
          urlLow.indexOf('play') >= 0 || urlLow.indexOf('table') >= 0 ||
          urlLow.indexOf('outcome') >= 0 || urlLow.indexOf('win') >= 0;

      var isExcluded = urlLow.indexOf('history') >= 0 ||
          urlLow.indexOf('state') >= 0 || urlLow.indexOf('stats') >= 0 ||
          urlLow.indexOf('.js') >= 0 || urlLow.indexOf('.css') >= 0 ||
          urlLow.indexOf('.png') >= 0 || urlLow.indexOf('.jpg') >= 0 ||
          urlLow.indexOf('.svg') >= 0 || urlLow.indexOf('.woff') >= 0 ||
          urlLow.indexOf('favicon') >= 0 || urlLow.indexOf('analytics') >= 0 ||
          urlLow.indexOf('tracker') >= 0 || urlLow.indexOf('telemetry') >= 0;

      if (isRelevant && !isExcluded) {
        promise.then(function(r) {
          try {
            r.clone().text().then(function(text) {
              if (text && text.length < 200000) {
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
        var isRelevant = u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 ||
            u.indexOf('evolution') >= 0 || u.indexOf('pragmatic') >= 0 ||
            u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0 ||
            u.indexOf('game') >= 0 || u.indexOf('live') >= 0 ||
            u.indexOf('outcome') >= 0 || u.indexOf('win') >= 0;
        var isExcluded = u.indexOf('history') >= 0 || u.indexOf('state') >= 0 ||
            u.indexOf('stats') >= 0 || u.indexOf('.js') >= 0;
        if (isRelevant && !isExcluded) {
          try {
            var t = self.responseText;
            if (t && t.length < 200000) {
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
  // HOOK postMessage — intercepta mensajes entre ventanas
  // ═══════════════════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwV9) return;
    orig.__rwV9 = true;

    window.postMessage = function(data, origin, transfer) {
      try {
        if (typeof data === 'object' && data !== null) {
          // No procesar nuestros propios mensajes
          if (data.source !== 'rollerwin-capture' && data.source !== 'rollerwin-sync') {
            extractObj(data, 0, 'postMsg-out');
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
      console.log('[RW] SSE abierto: ' + (url || '').substring(0, 100));
      var es = opts ? new Orig(url, opts) : new Orig(url);

      // Escuchar TODOS los eventos (no solo los de la lista)
      var origAdd = es.addEventListener.bind(es);
      var eventTypes = ['result','game','update','roulette','number','outcome','round',
        'message', 'open', 'data', 'state', 'change', 'complete', 'end', 'spin', 'bet'];

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
  // DOM SCANNER — busca resultado actual en pantalla
  // Excluye elementos de historial
  // ═══════════════════════════════════════════════════
  (function() {
    var HISTORY_KW = ['history','past','track','sequence','previous','older',
      'last-result','lastresults','gamehistory','result-history','historyitem',
      'resultshistory','bng','stats','statistics','roadmap','bigroad','beadroad',
      'marker','scoreboard','score'];

    function isHistoryEl(el) {
      if (!el) return false;
      var c = ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-test') || '')).toLowerCase();
      for (var i = 0; i < HISTORY_KW.length; i++) {
        if (c.indexOf(HISTORY_KW[i]) >= 0) return true;
      }
      // Check parents up to 5 levels
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

    // Selectores para resultado ACTUAL (no historial)
    var SELECTORS = [
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
      '[class*="live-result"]',
      // Pragmatic Play specificos
      '[class*="game-result"]',
      '[class*="result-number"]',
      '[class*="winning"]',
      '[class*="last-number"]',
      '[class*="lastnumber"]',
      '[data-number]',
      '[class*="ball-number"]',
      '[class*="pocket-number"]'
    ];

    // Change-detect: enviar si el numero CAMBIO o si lleva >15s visible
    var _lastDomNum = -1;
    var _lastDomTime = 0;
    var _DOM_REPEAT = 15000;

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
              sendNumber(num, 'DOM:' + SELECTORS[i]);
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
        timer = setTimeout(function() { timer = null; scanDOM(); }, 500);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });

      setInterval(scanDOM, 6000);
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
          // El iframe ya envio al servidor. Solo actualizar UI.
          console.log('[RW] PARENT: recibido ' + data.number + ' de iframe ' + (data.hostname || ''));
        }
      } catch(e) {}
    });
  }

  console.log('[RW] v9.1 MOTOR ACTIVO | ' + (isInIframe ? 'IFRAME' : 'PARENT') + ' | ' + hostname);
})();