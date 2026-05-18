// RollerWin Capture v4.1 - MAIN WORLD DETECTION ENGINE
// Se inyecta en MUNDO PRINCIPAL en TODOS los frames (incluyendo iframes de Evolution)
// v4.1: Cooldown de 18s, eliminada busqueda bruta, deteccion solo de game-fields
(function() {
  'use strict';

  if (window.__rwMainV4) return;
  window.__rwMainV4 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var lastNum = -1;
  var lastTime = 0;
  var sentCount = 0;
  var isInIframe = (window.self !== window.top);
  var hostname = location.hostname || '';

  // Cooldown: la ruleta Evolution tira cada ~18 segundos
  // Usamos 15s de cooldown para tener margen
  var COOLDOWN_MS = 15000;

  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

  function getColor(n) {
    if (n === 0) return 'green';
    return RED.indexOf(n) >= 0 ? 'red' : 'black';
  }

  // ══════════════════════════════════════
  // ENVIAR numero - con cooldown de 18s
  // ══════════════════════════════════════
  function sendNumber(n, source) {
    if (n < 0 || n > 36) return;

    var now = Date.now();
    // Cooldown estricto: 15 segundos entre numeros
    if (now - lastTime < COOLDOWN_MS) {
      return;
    }

    lastNum = n;
    lastTime = now;
    sentCount++;

    console.log('[RollerWin MAIN] === RESULTADO #' + sentCount + ': ' + n + ' (' + getColor(n) + ') === fuente: ' + source + ' ' +
      (isInIframe ? '[IFRAME ' + hostname + ']' : '[PARENT]'));

    // Enviar al servidor RollerWin
    try {
      fetch(SERVER + '/api/capture/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: n })
      }).then(function(r) {
        if (r.ok) {
          console.log('[RollerWin MAIN] Enviado a servidor OK:', n);
        } else {
          console.log('[RollerWin MAIN] Error HTTP:', r.status);
        }
      }).catch(function(e) {
        console.log('[RollerWin MAIN] Error red:', e.message);
      });
    } catch(e) {}

    // Notificar al parent si estamos en iframe
    if (isInIframe) {
      try {
        window.parent.postMessage({
          source: 'rollerwin-capture',
          number: n,
          color: getColor(n),
          hostname: hostname,
          sentCount: sentCount
        }, '*');
      } catch(e) {}
    } else {
      // CustomEvent para content.js (ISOLATED world)
      try {
        document.dispatchEvent(new CustomEvent('rw-number', {
          detail: { number: n, color: getColor(n), sentCount: sentCount }
        }));
      } catch(e) {}
    }
  }

  // ══════════════════════════════════════
  // EXTRACCION SELECTIVA de numeros
  // Solo campos que son DEFINITIVAMENTE resultados de ruleta
  // ══════════════════════════════════════

  // Campos de alto confianza - solo estos envian numeros
  var HIGH_CONFIDENCE_FIELDS = [
    'number', 'result', 'resultnumber', 'winningnumber', 'win_number',
    'game_number', 'roulette_number', 'ball_number', 'pocket', 'pocket_number',
    'winningpocket', 'pocketid', 'resultid', 'displaynumber',
    'roundresult', 'gameoutcome', 'finalnumber', 'outcome',
    'winningnumberdisplay', 'resultnumber', 'final_number', 'game_result',
    'round_result', 'game_outcome', 'numberstr', 'numberstring'
  ];

  // Campos de confianza media - requieren contexto extra
  var MEDIUM_CONFIDENCE_FIELDS = [
    'value', 'num', 'n', 'resultvalue'
  ];

  function isHighConfidence(key) {
    var k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (var i = 0; i < HIGH_CONFIDENCE_FIELDS.length; i++) {
      if (k === HIGH_CONFIDENCE_FIELDS[i].replace(/[_\-\s]/g, '')) return true;
    }
    return false;
  }

  function isMediumConfidence(key) {
    var k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (var i = 0; i < MEDIUM_CONFIDENCE_FIELDS.length; i++) {
      if (k === MEDIUM_CONFIDENCE_FIELDS[i].replace(/[_\-\s]/g, '')) return true;
    }
    return false;
  }

  // Extraer numero de un valor (number o string)
  function tryParseNum(val) {
    if (typeof val === 'number') {
      if (val >= 0 && val <= 36 && val === Math.floor(val)) return val;
      return null;
    }
    if (typeof val === 'string') {
      var trimmed = val.trim();
      if (trimmed.length === 1 || trimmed.length === 2) {
        var n = parseInt(trimmed, 10);
        if (!isNaN(n) && n >= 0 && n <= 36 && trimmed === String(n)) return n;
      }
    }
    return null;
  }

  function extractObj(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 7) return;

    if (Array.isArray(obj)) {
      // Solo procesar arrays si el path sugiere resultados
      var pathLow = path.toLowerCase();
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('history') >= 0 ||
          pathLow.indexOf('number') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0) {
        // Tomar el PRIMER elemento del array (resultado mas reciente)
        if (obj.length > 0) {
          var first = obj[0];
          var n = tryParseNum(first);
          if (n !== null) {
            sendNumber(n, 'array@' + path);
            return;
          }
          if (typeof first === 'object' && first !== null) {
            extractObj(first, depth + 1, path + '[0]');
          }
        }
      }
      return;
    }

    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj[key];
      var currentPath = path + '.' + key;

      // Alta confianza: enviar inmediatamente
      if (isHighConfidence(key)) {
        var num = tryParseNum(val);
        if (num !== null) {
          sendNumber(num, 'field:' + key + '@' + currentPath);
          return;
        }
      }

      // Confianza media: verificar que es un numero 0-36 y NO un monto
      if (isMediumConfidence(key)) {
        var num2 = tryParseNum(val);
        if (num2 !== null) {
          // Verificar que no es un monto (montos suelen ser > 36)
          // Solo enviar si esta en contexto de juego
          var pathLow2 = currentPath.toLowerCase();
          if (pathLow2.indexOf('game') >= 0 || pathLow2.indexOf('result') >= 0 ||
              pathLow2.indexOf('round') >= 0 || pathLow2.indexOf('roulette') >= 0 ||
              pathLow2.indexOf('wheel') >= 0 || pathLow2.indexOf('spin') >= 0 ||
              pathLow2.indexOf('win') >= 0 || pathLow2.indexOf('outcome') >= 0) {
            sendNumber(num2, 'medium:' + key + '@' + currentPath);
            return;
          }
        }
      }

      // Bajar en el arbol para objetos anidados
      if (typeof val === 'object' && val !== null) {
        extractObj(val, depth + 1, currentPath);
      }
    }
  }

  // Regex selectivo - solo campos de resultado
  function extractFromText(text, source) {
    if (!text || typeof text !== 'string' || text.length > 200000) return;

    // Buscar pares clave-valor JSON de resultado
    // Ejemplo: "resultNumber":17  o  "number": 32
    var strictPatterns = [
      /"resultNumber"\s*:\s*(\d{1,2})/gi,
      /"winningNumber"\s*:\s*(\d{1,2})/gi,
      /"winning_number"\s*:\s*(\d{1,2})/gi,
      /"ball_number"\s*:\s*(\d{1,2})/gi,
      /"pocket_number"\s*:\s*(\d{1,2})/gi,
      /"roulette_number"\s*:\s*(\d{1,2})/gi,
      /"finalNumber"\s*:\s*(\d{1,2})/gi,
      /"game_number"\s*:\s*(\d{1,2})/gi,
      /"displayNumber"\s*:\s*(\d{1,2})/gi,
      /"winningPocket"\s*:\s*(\d{1,2})/gi
    ];

    for (var i = 0; i < strictPatterns.length; i++) {
      var match;
      strictPatterns[i].lastIndex = 0;
      while ((match = strictPatterns[i].exec(text)) !== null) {
        var n = parseInt(match[1], 10);
        if (n >= 0 && n <= 36) {
          sendNumber(n, 'regex:' + match[0].substring(0, 30) + '@' + source);
        }
      }
    }

    // Patrones medios - solo si tienen contexto de juego cerca
    var mediumPatterns = [
      /"(?:number|result|value)"\s*:\s*(\d{1,2})\b/gi
    ];

    for (var j = 0; j < mediumPatterns.length; j++) {
      var match2;
      mediumPatterns[j].lastIndex = 0;
      while ((match2 = mediumPatterns[j].exec(text)) !== null) {
        var n2 = parseInt(match2[1], 10);
        if (n2 >= 0 && n2 <= 36) {
          // Verificar contexto: buscar palabras de juego cerca (100 chars antes/despues)
          var start = Math.max(0, match2.index - 100);
          var end = Math.min(text.length, match2.index + 100);
          var context = text.substring(start, end).toLowerCase();
          if (context.indexOf('roulette') >= 0 || context.indexOf('game') >= 0 ||
              context.indexOf('result') >= 0 || context.indexOf('wheel') >= 0 ||
              context.indexOf('spin') >= 0 || context.indexOf('round') >= 0 ||
              context.indexOf('winning') >= 0 || context.indexOf('pocket') >= 0 ||
              context.indexOf('evolution') >= 0 || context.indexOf('history') >= 0) {
            sendNumber(n2, 'regex+ctx:' + match2[0] + '@' + source);
          }
        }
      }
    }
  }

  // ══════════════════════════════════════
  // HOOK WEBSOCKET
  // ══════════════════════════════════════
  (function hookWebSocket() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwV4Hooked) return;
    OrigWS.__rwV4Hooked = true;

    var ProxyWS = function(url, protocols) {
      var wsUrl = url ? String(url) : '';
      // Solo logear WebSockets que parecen de Evolution/juegos
      if (wsUrl.indexOf('evolution') >= 0 || wsUrl.indexOf('game') >= 0 ||
          wsUrl.indexOf('live') >= 0 || wsUrl.indexOf('ssl') >= 0) {
        console.log('[RollerWin MAIN] WebSocket (posible juego):', wsUrl.substring(0, 100));
      }
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
              var parsed = JSON.parse(data.substring(2));
              if (Array.isArray(parsed) && parsed.length >= 2 && typeof parsed[1] === 'object') {
                var evtName = String(parsed[0] || '');
                // Solo procesar eventos de resultado
                if (evtName.indexOf('result') >= 0 || evtName.indexOf('complete') >= 0 ||
                    evtName.indexOf('win') >= 0 || evtName.indexOf('game') >= 0 ||
                    evtName.indexOf('round') >= 0 || evtName.indexOf('number') >= 0 ||
                    evtName.indexOf('spin') >= 0 || evtName.indexOf('update') >= 0) {
                  extractObj(parsed[1], 0, 'socketio.' + evtName);
                  extractFromText(data, 'socketio.' + evtName);
                }
              }
            } catch(err) {}
          }

          // JSON directo
          if (data.charAt(0) === '{' || data.charAt(0) === '[') {
            try {
              var json = JSON.parse(data);
              extractObj(json, 0, 'ws');
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
    console.log('[RollerWin MAIN] WebSocket hook OK en', hostname);
  })();

  // ══════════════════════════════════════
  // HOOK FETCH
  // ══════════════════════════════════════
  (function hookFetch() {
    var origFetch = window.fetch;
    if (!origFetch || origFetch.__rwV4Hooked) return;
    origFetch.__rwV4Hooked = true;

    window.fetch = function(input, init) {
      var url = '';
      try {
        url = typeof input === 'string' ? input :
              (input instanceof Request) ? (input.url || '') :
              (input && input.url) ? input.url : '';
      } catch(e) {}

      var promise = origFetch.apply(this, arguments);

      // Solo analizar respuestas de URLs que parecen de juego
      var urlLow = url.toLowerCase();
      if (urlLow.indexOf('game') >= 0 || urlLow.indexOf('result') >= 0 ||
          urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
          urlLow.indexOf('history') >= 0 || urlLow.indexOf('live') >= 0 ||
          urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('round') >= 0 ||
          urlLow.indexOf('state') >= 0 || urlLow.indexOf('bet') >= 0) {

        promise.then(function(response) {
          try {
            response.clone().text().then(function(text) {
              if (text && text.length > 0) {
                try { extractObj(JSON.parse(text), 0, 'fetch'); } catch(e) {}
                extractFromText(text, 'fetch');
              }
            }).catch(function() {});
          } catch(e) {}
        }).catch(function() {});
      }

      return promise;
    };

    console.log('[RollerWin MAIN] Fetch hook OK en', hostname);
  })();

  // ══════════════════════════════════════
  // HOOK XHR
  // ══════════════════════════════════════
  (function hookXHR() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwV4Hooked) return;
    origSend.__rwV4Hooked = true;

    XMLHttpRequest.prototype.open = function(method, url) {
      this._rwUrl = String(url || '');
      return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
      var self = this;
      this.addEventListener('load', function() {
        var urlLow = (self._rwUrl || '').toLowerCase();
        if (urlLow.indexOf('game') >= 0 || urlLow.indexOf('result') >= 0 ||
            urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
            urlLow.indexOf('history') >= 0 || urlLow.indexOf('live') >= 0 ||
            urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('round') >= 0 ||
            urlLow.indexOf('state') >= 0 || urlLow.indexOf('bet') >= 0) {
          try {
            var text = self.responseText;
            if (text) {
              try { extractObj(JSON.parse(text), 0, 'xhr'); } catch(e) {}
              extractFromText(text, 'xhr');
            }
          } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };

    console.log('[RollerWin MAIN] XHR hook OK en', hostname);
  })();

  // ══════════════════════════════════════
  // DOM SCANNER - SELECTORES ESPECIFICOS SOLAMENTE
  // Sin busqueda bruta de texto
  // ══════════════════════════════════════
  (function setupDOMScanner() {

    // Clases a excluir (elementos que contienen numeros pero NO son resultados)
    var EXCLUDE_CLASSES = [
      'balance', 'wallet', 'timer', 'countdown', 'player', 'chat', 'limit',
      'min-', 'max-', 'stake', 'total', 'amount', 'payout', 'multiplier',
      'level', 'rank', 'vip', 'bonus', 'free', 'chip', 'currency', 'price',
      'percent', 'ratio', 'day', 'time', 'hour', 'minute', 'second', 'date',
      'year', 'month', 'session', 'id-', 'uid', 'avatar', 'badge-count',
      'notification', 'unread', 'counter', 'index', 'page', 'size', 'length'
    ];

    function isExcluded(el) {
      if (!el) return false;
      var cls = (el.className || '');
      if (typeof cls !== 'string') cls = '';
      var id = (el.id || '');
      var combined = (cls + ' ' + id).toLowerCase();
      for (var i = 0; i < EXCLUDE_CLASSES.length; i++) {
        if (combined.indexOf(EXCLUDE_CLASSES[i]) >= 0) return true;
      }
      return false;
    }

    function isValidResult(el, num) {
      if (!el || num === null) return false;
      // Verificar que no esta excluido
      if (isExcluded(el)) return false;
      if (isExcluded(el.parentElement)) return false;
      // Tiene que ser un nodo hoja o casi hoja (max 1 child)
      if (el.children.length > 2) return false;
      // El texto tiene que ser SOLO el numero
      var text = (el.textContent || '').trim();
      if (text !== String(num)) return false;
      // Tiene que verse como un display de resultado (circulo, badge, item)
      var cls = (el.className || '').toLowerCase();
      var parentCls = el.parentElement ? (el.parentElement.className || '').toLowerCase() : '';
      var combined = cls + ' ' + parentCls;
      // Debe tener al menos una pista de que es resultado/history/numero
      var hasGameHint = combined.indexOf('result') >= 0 || combined.indexOf('history') >= 0 ||
                        combined.indexOf('number') >= 0 || combined.indexOf('winning') >= 0 ||
                        combined.indexOf('pocket') >= 0 || combined.indexOf('roulette') >= 0 ||
                        combined.indexOf('game') >= 0 || combined.indexOf('wheel') >= 0 ||
                        combined.indexOf('outcome') >= 0 || combined.indexOf('badge') >= 0 ||
                        combined.indexOf('circle') >= 0 || combined.indexOf('ball') >= 0 ||
                        combined.indexOf('marker') >= 0 || combined.indexOf('chip-') >= 0 ||
                        combined.indexOf('past') >= 0 || combined.indexOf('stat') >= 0 ||
                        combined.indexOf('sequence') >= 0 || combined.indexOf('track') >= 0;
      return hasGameHint;
    }

    function scanDOM() {
      // ═══ SELECTORES DE ALTA CONFIANZA ═══
      var highConfSelectors = [
        '[class*="game-history"] [class*="value"]',
        '[class*="game-history"] [class*="number"]',
        '[class*="history-item"] [class*="number"]',
        '[class*="history-item"] [class*="value"]',
        '[class*="roulette"] [class*="result"]',
        '[class*="roulette"] [class*="number"]',
        '[class*="roulette"] [class*="winning"]',
        '[class*="evolution"] [class*="result"]',
        '[class*="evolution"] [class*="number"]',
        '[class*="evolution"] [class*="winning"]',
        '[class*="winning-number"]',
        '[class*="winning-pocket"]',
        '[class*="result-number"]',
        '[class*="result-display"]',
        '[class*="result-value"]',
        '[class*="last-result"]',
        '[class*="latest-result"]',
        '[class*="game-number-display"]',
        '[class*="roulette-number"]',
        '[class*="round-result"]',
        '[data-result-number]',
        '[data-winning-number]',
        '[data-game-result]',
        '[class*="wheel"] [class*="result"]',
        '[class*="wheel"] [class*="number"]',
        '[class*="spin"] [class*="result"]',
        '[class*="past"] [class*="number"]',
        '[class*="sequence"] [class*="number"]',
        '[class*="track"] [class*="number"]',
        '[class*="GameHistory"] [class*="value"]',
        '[class*="GameHistory"] [class*="number"]',
        '[class*="gameHistory"] [class*="value"]',
        '[class*="HistoryItem"]',
        '[class*="ResultHistory"]'
      ];

      // Alta confianza: usar estos selectores
      for (var i = 0; i < highConfSelectors.length; i++) {
        try {
          var els = document.querySelectorAll(highConfSelectors[i]);
          for (var j = 0; j < Math.min(els.length, 2); j++) {
            var text = (els[j].textContent || '').trim();
            var num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text && !isExcluded(els[j])) {
              sendNumber(num, 'DOM:' + highConfSelectors[i]);
              return;
            }
          }
        } catch(e) {}
      }

      // ═══ SELECTORES DE BAJA CONFIANZA ═══
      // Solo el PRIMER elemento que coincida y pase validacion estricta
      var lowConfSelectors = [
        '[class*="history"] [class*="circle"]',
        '[class*="history"] [class*="badge"]',
        '[class*="history"] [class*="item"]',
        '[class*="bng"] [class*="value"]',
        '[class*="bng"] [class*="result"]',
        '[class*="bng"] [class*="history"] [class*="value"]',
        '[data-number]',
        '[data-result]',
        '[class*="number-display"]',
        '[class*="result-number"]',
        '[class*="overlay"] [class*="result"]',
        '[class*="stats"] [class*="number"]',
        '[class*="board"] [class*="result"]',
        '[class*="table"] [class*="result"]',
        '[class*="autoplay"] [class*="result"]',
        '[class*="ezugi"] [class*="result"]',
        '[class*="ezugi"] [class*="number"]'
      ];

      for (var k = 0; k < lowConfSelectors.length; k++) {
        try {
          var els2 = document.querySelectorAll(lowConfSelectors[k]);
          for (var l = 0; l < Math.min(els2.length, 1); l++) {
            var text2 = (els2[l].textContent || '').trim();
            var num2 = parseInt(text2, 10);
            if (!isNaN(num2) && num2 >= 0 && num2 <= 36 && String(num2) === text2) {
              if (isValidResult(els2[l], num2)) {
                sendNumber(num2, 'DOM-low:' + lowConfSelectors[k]);
                return;
              }
            }
          }
        } catch(e) {}
      }
    }

    function setup() {
      if (!document.body) return;

      setTimeout(scanDOM, 2000);
      setTimeout(scanDOM, 5000);

      var timer = null;
      new MutationObserver(function() {
        if (timer) return;
        timer = setTimeout(function() {
          timer = null;
          scanDOM();
        }, 1000);
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });

      // Scan periodico cada 5 segundos (no cada 3, para no sobrecargar)
      setInterval(scanDOM, 5000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(setup, 100); });
    } else {
      setTimeout(setup, 100);
    }
  })();

  // ══════════════════════════════════════
  // HOOK postMessage
  // ══════════════════════════════════════
  (function hookPostMessage() {
    var origPostMessage = window.postMessage;
    if (origPostMessage.__rwV4Hooked) return;
    origPostMessage.__rwV4Hooked = true;

    window.postMessage = function(data, targetOrigin, transfer) {
      try {
        if (typeof data === 'object' && data !== null) {
          extractObj(data, 0, 'postMessage-out');
        }
      } catch(e) {}
      return origPostMessage.call(window, data, targetOrigin, transfer);
    };

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null) {
          extractObj(data, 0, 'postMessage-in');
        }
      } catch(e) {}
    });

    console.log('[RollerWin MAIN] postMessage hook OK en', hostname);
  })();

  // ══════════════════════════════════════
  // HOOK EventSource (SSE)
  // ══════════════════════════════════════
  (function hookEventSource() {
    if (typeof window.EventSource === 'undefined') return;
    var OrigES = window.EventSource;
    if (OrigES.__rwV4Hooked) return;
    OrigES.__rwV4Hooked = true;

    var ProxyES = function(url, opts) {
      var es = opts ? new OrigES(url, opts) : new OrigES(url);

      var origAddListener = es.addEventListener.bind(es);
      ['result', 'game', 'update', 'roulette', 'number', 'outcome', 'round'].forEach(function(evtType) {
        origAddListener(evtType, function(e) {
          try {
            if (typeof e.data === 'string') {
              extractFromText(e.data, 'sse.' + evtType);
              try { extractObj(JSON.parse(e.data), 0, 'sse.' + evtType); } catch(err) {}
            }
          } catch(err) {}
        });
      });

      return es;
    };

    ProxyES.prototype = OrigES.prototype;
    ProxyES.CONNECTING = OrigES.CONNECTING;
    ProxyES.OPEN = OrigES.OPEN;
    ProxyES.CLOSED = OrigES.CLOSED;
    window.EventSource = ProxyES;
  })();

  console.log('[RollerWin MAIN] v4.1 activo en ' + hostname + ' ' +
    (isInIframe ? '[IFRAME]' : '[PARENT]') + ' | Cooldown: ' + (COOLDOWN_MS/1000) + 's');

})();
