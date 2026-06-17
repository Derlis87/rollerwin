// ============================================================
// inject-main.js - CAPTURA DE RULETA — MAIN WORLD INJECTION
// ============================================================
// Este script se ejecuta DENTRO del contexto JS de cada iframe
// (incluyendo iframes cross-origin como Evolution y Pragmatic).
//
// MODO DIAGNOSTICO: Loguea TODOS los mensajes WS/Fetch/XHR
// para identificar el formato real de los datos.
// ============================================================
(function() {
  'use strict';
  if (window.__rwInjected) return;
  window.__rwInjected = true;

  var hostname = location.hostname || '';
  var isTop = (window === window.top);
  var frameInfo = isTop ? 'TOP' : 'FRAME';
  console.log('%c[RW-INJECT] Motor activo: ' + frameInfo + ' — ' + hostname, 'color: #00ff00; font-weight: bold');

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

  // ═══ DIAGNOSTIC: contador de mensajes ═══
  var diagStats = { ws: 0, fetch: 0, xhr: 0, postMsg: 0, sse: 0 };

  // ═══ ENVIAR numero via postMessage → content.js → background → Node.js ═══
  function sendNumber(n, source) {
    if (n < 0 || n > 36) return;
    if (_isDuplicate(n)) {
      console.log('[RW-INJECT] DEDUP:', n, 'bloqueado —', source);
      return;
    }
    _markSent();
    console.log('%c[RW-INJECT] ✅ RESULTADO: ' + n + ' (' + getColor(n) + ') — ' + source + ' [' + hostname + ']', 'color: #ff0; font-size: 14px; font-weight: bold; background: #000');

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
  // DIAGNOSTIC: Loguear TODOS los mensajes WS sin filtro
  // ══════════════════════════════════════
  function diagLogWS(data, wsUrl, direction) {
    diagStats.ws++;
    var msgNum = diagStats.ws;

    // Determinar tipo de datos
    var dataType = 'text';
    var preview = '';
    var size = 0;

    if (typeof data === 'string') {
      dataType = 'string';
      size = data.length;
      preview = data.length > 300 ? data.substring(0, 300) + '...[' + data.length + ' chars]' : data;
    } else if (data instanceof ArrayBuffer) {
      dataType = 'ArrayBuffer';
      size = data.byteLength;
      // Mostrar primeros bytes como hex
      var bytes = new Uint8Array(data);
      var hex = [];
      var ascii = [];
      var showBytes = Math.min(bytes.length, 64);
      for (var i = 0; i < showBytes; i++) {
        hex.push(('0' + bytes[i].toString(16)).slice(-2));
        ascii.push(bytes[i] >= 32 && bytes[i] < 127 ? String.fromCharCode(bytes[i]) : '.');
      }
      preview = 'HEX: ' + hex.join(' ') + '\nASCII: ' + ascii.join('');
      if (bytes.length > 64) preview += '\n...[' + bytes.length + ' bytes total]';

      // Intentar decodificar como UTF-8
      try {
        var decoded = new TextDecoder('utf-8').decode(bytes);
        if (decoded && decoded.length > 2) {
          preview += '\nUTF8: ' + (decoded.length > 200 ? decoded.substring(0, 200) + '...' : decoded);
        }
      } catch(e) {}
    } else if (data instanceof Blob) {
      dataType = 'Blob';
      size = data.size;
      preview = 'Blob(' + data.size + ' bytes, type: ' + (data.type || 'unknown') + ')';
    } else {
      dataType = typeof data;
      preview = String(data).substring(0, 200);
    }

    console.log(
      '%c[RW-DIAG-WS #' + msgNum + '] ' + direction + ' | ' + dataType + ' | ' + size + ' bytes',
      'color: #0af; font-weight: bold',
      '\n  URL: ' + (wsUrl || '').substring(0, 120),
      '\n  ' + preview.replace(/\n/g, '\n  ')
    );

    // Si parece JSON legible, parsearlo y mostrar estructura
    if (dataType === 'string' && (data.charAt(0) === '{' || data.charAt(0) === '[')) {
      try {
        var parsed = JSON.parse(data);
        var structure = describeStructure(parsed, 0);
        console.log('%c[RW-DIAG-WS #' + msgNum + '] ESTRUCTURA:', 'color: #0af', structure);
      } catch(e) {
        // No es JSON valido
      }
    }
  }

  // Describir la estructura de un objeto JSON (para diagnostico)
  function describeStructure(obj, depth) {
    if (!obj || depth > 3) return String(obj);
    if (typeof obj !== 'object') return typeof obj + ': ' + String(obj).substring(0, 50);
    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return '[' + obj.length + ' items] ' + describeStructure(obj[0], depth + 1);
    }
    var keys = Object.keys(obj);
    var parts = [];
    for (var i = 0; i < Math.min(keys.length, 15); i++) {
      var v = obj[keys[i]];
      var type = Array.isArray(v) ? 'Array[' + v.length + ']' : typeof v;
      parts.push(keys[i] + ': ' + type);
    }
    return '{' + parts.join(', ') + '}';
  }

  // ══════════════════════════════════════
  // HOOK WEBSOCKET — Con logging diagnostico completo
  // ══════════════════════════════════════
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwHooked) return;
    OrigWS.__rwHooked = true;

    var ProxyWS = function(url, protocols) {
      var shortUrl = (url || '').substring(0, 100);
      console.log('%c[RW-INJECT] 🔌 WS conectado: ' + shortUrl, 'color: #f0f; font-weight: bold');

      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;

          // === DIAGNOSTIC: Loguear ANTES de cualquier procesamiento ===
          diagLogWS(data, url, 'RECV');

          // === PROCESAMIENTO: intentar extraer numero ===
          var processData = data;

          // Manejar ArrayBuffer (Pragmatic envia binario)
          if (typeof processData !== 'string') {
            if (processData instanceof ArrayBuffer) {
              try {
                processData = new TextDecoder('utf-8').decode(new Uint8Array(processData));
              } catch(er) {
                try {
                  processData = String.fromCharCode.apply(null, new Uint8Array(processData));
                } catch(er2) { return; }
              }
            } else if (processData instanceof Blob) {
              var reader = new FileReader();
              reader.onload = function() {
                try {
                  var arr = new Uint8Array(reader.result);
                  var text = new TextDecoder('utf-8').decode(arr);
                  _processWSText(text, url);
                } catch(err) {}
              };
              reader.readAsArrayBuffer(processData);
              return;
            } else {
              return;
            }
          }

          _processWSText(processData, url);
        } catch(err) {}
      });

      // Loguear mensajes enviados
      var origSend = ws.send;
      ws.send = function(data) {
        diagLogWS(data, url, 'SEND');
        return origSend.apply(ws, arguments);
      };

      ws.addEventListener('close', function(e) {
        console.log('[RW-INJECT] WS cerrado:', shortUrl, 'code:', e.code);
      });

      ws.addEventListener('error', function(e) {
        console.log('[RW-INJECT] WS error:', shortUrl);
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

  // ══════════════════════════════════════
  // HOOK FETCH — Con diagnostico
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

      // Loguear fetch a URLs relevantes
      if (urlLow.indexOf('result') >= 0 || urlLow.indexOf('roulette') >= 0 ||
          urlLow.indexOf('evolution') >= 0 || urlLow.indexOf('round') >= 0 ||
          urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('game') >= 0 ||
          urlLow.indexOf('pragmatic') >= 0 || urlLow.indexOf('state') >= 0 ||
          urlLow.indexOf('update') >= 0 || urlLow.indexOf('event') >= 0 ||
          urlLow.indexOf('history') >= 0 || urlLow.indexOf('bet') >= 0) {

        diagStats.fetch++;
        console.log('%c[RW-DIAG-FETCH #' + diagStats.fetch + '] ' + (init?.method || 'GET') + ' ' + url.substring(0, 120), 'color: #f80; font-weight: bold');

        promise.then(function(r) {
          try {
            r.clone().text().then(function(text) {
              if (text) {
                // DIAGNOSTIC: mostrar preview
                console.log('%c[RW-DIAG-FETCH #' + diagStats.fetch + '] RESPONSE (' + text.length + ' chars):', 'color: #f80', text.substring(0, 500));

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
  // HOOK XHR — Con diagnostico
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
            u.indexOf('update') >= 0 || u.indexOf('event') >= 0 ||
            u.indexOf('history') >= 0 || u.indexOf('bet') >= 0) {
          try {
            var t = self.responseText;
            if (t) {
              diagStats.xhr++;
              console.log('%c[RW-DIAG-XHR #' + diagStats.xhr + '] ' + self._rwUrl.substring(0, 120), 'color: #f80', t.substring(0, 500));

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
  // HOOK postMessage (incoming)
  // ══════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwHooked) return;
    orig.__rwHooked = true;

    window.postMessage = function(data, origin, transfer) {
      try {
        if (typeof data === 'object' && data !== null) {
          diagStats.postMsg++;
          // Solo loguear postMessages que parezcan de juego
          var d = JSON.stringify(data);
          if (d && (d.indexOf('result') >= 0 || d.indexOf('number') >= 0 ||
              d.indexOf('winning') >= 0 || d.indexOf('game') >= 0 ||
              d.indexOf('roulette') >= 0 || d.indexOf('round') >= 0 ||
              d.indexOf('pocket') >= 0 || d.indexOf('spin') >= 0 ||
              d.indexOf('bet') >= 0)) {
            console.log('%c[RW-DIAG-POSTMSG-OUT]', 'color: #a0f', data);
          }
          extractObj(data, 0, 'postMsg-out');
        }
      } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null && !data.__rwCapture) {
          var d = JSON.stringify(data);
          if (d && (d.indexOf('result') >= 0 || d.indexOf('number') >= 0 ||
              d.indexOf('winning') >= 0 || d.indexOf('game') >= 0 ||
              d.indexOf('roulette') >= 0 || d.indexOf('round') >= 0 ||
              d.indexOf('pocket') >= 0 || d.indexOf('spin') >= 0 ||
              d.indexOf('bet') >= 0)) {
            console.log('%c[RW-DIAG-POSTMSG-IN] from ' + (event.origin || '?'), 'color: #a0f', data);
          }
          extractObj(data, 0, 'postMsg-in');
        }
      } catch(e) {}
    });
  })();

  // ══════════════════════════════════════
  // HOOK EventSource (SSE)
  // ══════════════════════════════════════
  (function() {
    var OrigES = window.EventSource;
    if (!OrigES || OrigES.__rwHooked) return;
    OrigES.__rwHooked = true;

    var ProxyES = function(url, opts) {
      console.log('%c[RW-INJECT] SSE conectado: ' + (url || '').substring(0, 80), 'color: #f0f');
      var es = opts ? new OrigES(url, opts) : new OrigES(url);

      es.addEventListener('message', function(e) {
        try {
          diagStats.sse++;
          if (e.data && typeof e.data === 'string') {
            console.log('%c[RW-DIAG-SSE #' + diagStats.sse + ']', 'color: #f0f', e.data.substring(0, 500));
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
  // DOM SCANNER mejorado
  // ══════════════════════════════════════
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

  // ══════════════════════════════════════
  // RESUMEN DIAGNOSTICO cada 30 segundos
  // ══════════════════════════════════════
  setInterval(function() {
    if (diagStats.ws > 0 || diagStats.fetch > 0 || diagStats.xhr > 0 || diagStats.sse > 0) {
      console.log(
        '%c[RW-DIAG] Stats: WS=' + diagStats.ws + ' Fetch=' + diagStats.fetch +
        ' XHR=' + diagStats.xhr + ' SSE=' + diagStats.sse + ' PostMsg=' + diagStats.postMsg +
        ' | ' + frameInfo + ' @ ' + hostname,
        'color: #ff0; font-weight: bold'
      );
    }
  }, 30000);

  console.log('%c[RW-INJECT] Todos los hooks activos en: ' + hostname + ' (' + frameInfo + ')', 'color: #00ff00; font-weight: bold');
})();