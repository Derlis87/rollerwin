// ============================================================
// inject-main.js - CAPTURA DE RULETA — MAIN WORLD INJECTION
// ============================================================
// Este script se ejecuta DENTRO del contexto JS de cada iframe
// (incluyendo iframes cross-origin como Evolution y Pragmatic).
//
// Se inyecta via chrome.scripting.executeScript({world: 'MAIN', allFrames: true})
// que es la UNICA forma de acceder al WebSocket real de los juegos.
//
// COMUNICACION:
//   Este script → window.postMessage → content.js → background.js → fetch → Node.js
// ============================================================
(function() {
  'use strict';
  if (window.__rwInjected) return;
  window.__rwInjected = true;

  var hostname = location.hostname || '';
  console.log('[RW-INJECT] Motor de captura activo en:', hostname);

  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function getColor(n) { return n === 0 ? 'green' : RED.indexOf(n) >= 0 ? 'red' : 'black'; }

  // ═══ DEDUP por tiempo global (9s) ═══
  var _lastSentTimestamp = 0;
  var _DEDUP_WINDOW = 9000;

  function _isDuplicate(n) {
    var now = Date.now();
    if (now - _lastSentTimestamp < _DEDUP_WINDOW) return true;
    return false;
  }

  function _markSent() { _lastSentTimestamp = Date.now(); }

  // ═══ ENVIAR numero via postMessage → content.js → background → Node.js ═══
  function sendNumber(n, source) {
    if (n < 0 || n > 36) return;
    if (_isDuplicate(n)) {
      console.log('[RW-INJECT] DEDUP:', n, 'bloqueado —', source);
      return;
    }
    _markSent();
    console.log('[RW-INJECT] RESULTADO:', n, '(' + getColor(n) + ')', '—', source, '[' + hostname + ']');

    // Enviar via postMessage — content.js lo captura y reenvía al background
    try {
      window.postMessage({
        __rwCapture: true,
        source: 'rw-capture',
        number: n,
        color: getColor(n),
        hostname: hostname,
        sourceHook: source
      }, '*');
    } catch(e) {}

    // También intentar window.parent y window.top
    try { window.parent.postMessage({ __rwCapture: true, source: 'rw-capture', number: n, color: getColor(n), hostname: hostname, sourceHook: source }, '*'); } catch(e) {}
    if (window.parent !== window.top) {
      try { window.top.postMessage({ __rwCapture: true, source: 'rw-capture', number: n, color: getColor(n), hostname: hostname, sourceHook: source }, '*'); } catch(e) {}
    }
  }

  // ═══ Campos de resultado de ruleta ═══
  var RESULT_FIELDS = [
    'number','result','resultnumber','winningnumber','win_number',
    'game_number','roulette_number','ball_number','pocket','pocket_number',
    'winningpocket','pocketid','resultid','displaynumber',
    'roundresult','gameoutcome','finalnumber','outcome',
    'winningnumberdisplay','resultnumber','final_number','game_result',
    'round_result','game_outcome','numberstr','numberstring',
    'winnum','win_num','result_num','gameresult',
    'resultnumberstr','rouletteresult','resultNumberStr',
    'roulettenumber','winningNumberStr','pocketnumber',
    'gamenumber','roundnumber','betresult','totalresult',
  ];

  function isResultField(key) {
    var k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (var i = 0; i < RESULT_FIELDS.length; i++) {
      if (k === RESULT_FIELDS[i].replace(/[_\-\s]/g, '')) return true;
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
        // Buscar numeros dentro del array
        for (var i = 0; i < obj.length; i++) {
          var item = obj[i];
          if (typeof item === 'number' && item >= 0 && item <= 36 && item === Math.floor(item)) {
            sendNumber(item, 'array-item@' + pathStr);
            return;
          }
          if (Array.isArray(item) && item.length > 0) {
            // Array de arrays como recentResults: [["5"],["32"],...]
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
        // También probar el último elemento si es objeto
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
      // Special: recentResults puede tener el numero como string en array
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

  // Regex para texto
  var TEXT_PATTERNS = [
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
    /"result_number"\s*:\s*(\d{1,2})\b/gi,
    /"result"\s*:\s*(\d{1,2})\b/gi,
    /"number"\s*:\s*(\d{1,2})\b/gi,
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

  // ══════════════════════════════════════
  // HOOK WEBSOCKET — El más importante
  // ══════════════════════════════════════
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwHooked) return;
    OrigWS.__rwHooked = true;

    var ProxyWS = function(url, protocols) {
      console.log('[RW-INJECT] WS conectado:', (url || '').substring(0, 100));
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;

          // Manejar ArrayBuffer (Pragmatic envia binario)
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) {
              try {
                // Intentar decodificar como UTF-8
                data = new TextDecoder('utf-8').decode(new Uint8Array(data));
              } catch(er) {
                // Intentar Latin1 como fallback
                try {
                  data = String.fromCharCode.apply(null, new Uint8Array(data));
                } catch(er2) { return; }
              }
            } else if (data instanceof Blob) {
              // Blob: leer como arraybuffer luego como string
              var reader = new FileReader();
              reader.onload = function() {
                try {
                  var arr = new Uint8Array(reader.result);
                  var text = new TextDecoder('utf-8').decode(arr);
                  _processWSText(text, url);
                } catch(err) {}
              };
              reader.readAsArrayBuffer(data);
              return;
            } else {
              return;
            }
          }

          _processWSText(data, url);
        } catch(err) {}
      });

      // Monitorear cierre de conexion
      ws.addEventListener('close', function(e) {
        console.log('[RW-INJECT] WS cerrado:', (url || '').substring(0, 60), 'code:', e.code);
      });

      ws.addEventListener('error', function(e) {
        console.log('[RW-INJECT] WS error:', (url || '').substring(0, 60));
      });

      return ws;
    };

    function _processWSText(data, wsUrl) {
      if (!data || data.length < 3) return;

      // Socket.io: 42["event",{...}] o 420["event",{...}]
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

      // Evolution specific: buscar patrones en texto crudo
      // Evolution a veces envia mensajes grandes con many results
      if (data.indexOf('recentResults') >= 0) {
        extractFromText(data, 'ws-evo-recent');
      }
    }

    // Copiar propiedades estaticas y prototipo
    ProxyWS.prototype = OrigWS.prototype;
    ProxyWS.CONNECTING = OrigWS.CONNECTING;
    ProxyWS.OPEN = OrigWS.OPEN;
    ProxyWS.CLOSING = OrigWS.CLOSING;
    ProxyWS.CLOSED = OrigWS.CLOSED;
    window.WebSocket = ProxyWS;
  })();

  // ══════════════════════════════════════
  // HOOK FETCH
  // ══════════════════════════════════════
  (function() {
    var origFetch = window.fetch;
    if (!origFetch || origFetch.__rwHooked) return;
    origFetch.__rwHooked = true;

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
          urlLow.indexOf('update') >= 0 || urlLow.indexOf('event') >= 0) {
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

  // ══════════════════════════════════════
  // HOOK XHR
  // ══════════════════════════════════════
  (function() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwHooked) return;
    origSend.__rwHooked = true;

    XMLHttpRequest.prototype.open = function(m, u) { this._rwUrl = String(u || ''); return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      this.addEventListener('load', function() {
        var u = (self._rwUrl || '').toLowerCase();
        if (u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 ||
            u.indexOf('evolution') >= 0 || u.indexOf('round') >= 0 ||
            u.indexOf('wheel') >= 0 || u.indexOf('game') >= 0 ||
            u.indexOf('pragmatic') >= 0 || u.indexOf('state') >= 0 ||
            u.indexOf('update') >= 0 || u.indexOf('event') >= 0) {
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

  // ══════════════════════════════════════
  // HOOK postMessage (incoming) — Los iframes se comunican asi
  // ══════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwHooked) return;
    orig.__rwHooked = true;

    window.postMessage = function(data, origin, transfer) {
      try { if (typeof data === 'object' && data !== null) extractObj(data, 0, 'postMsg-out'); } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null && !data.__rwCapture) {
          extractObj(data, 0, 'postMsg-in');
        }
      } catch(e) {}
    });
  })();

  // ══════════════════════════════════════
  // HOOK EventSource (SSE) — Algunos proveedores usan Server-Sent Events
  // ══════════════════════════════════════
  (function() {
    var OrigES = window.EventSource;
    if (!OrigES || OrigES.__rwHooked) return;
    OrigES.__rwHooked = true;

    var ProxyES = function(url, opts) {
      console.log('[RW-INJECT] EventSource conectado:', (url || '').substring(0, 80));
      var es = opts ? new OrigES(url, opts) : new OrigES(url);

      es.addEventListener('message', function(e) {
        try {
          if (e.data && typeof e.data === 'string') {
            try { extractObj(JSON.parse(e.data), 0, 'sse'); } catch(err) {}
            extractFromText(e.data, 'sse');
          }
        } catch(err) {}
      });

      return es;
    };

    ProxyES.prototype = OrigES.prototype;
    ProxyES.CONNECTING = OrigES.CONNECTING;
    ProxyES.OPEN = OrigES.OPEN;
    ProxyES.CLOSED = OrigES.CLOSED;
    window.EventSource = ProxyES;
  })();

  // ══════════════════════════════════════
  // DOM SCANNER con MutationObserver
  // ══════════════════════════════════════
  (function() {
    // Escanear el DOM periódicamente buscando elementos con números de ruleta
    var scanInterval = setInterval(function() {
      try {
        // Buscar elementos comunes que muestran el último número
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

  console.log('[RW-INJECT] Todos los hooks activos en:', hostname);
})();