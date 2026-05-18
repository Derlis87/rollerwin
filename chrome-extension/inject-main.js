// RollerWin Capture v4.0 - MAIN WORLD DETECTION ENGINE
// Este script se inyecta en MUNDO PRINCIPAL (MAIN world) en TODOS los frames
// incluyendo iframes cross-origin de Evolution Gaming
(function() {
  'use strict';

  // Guarda contra doble inyeccion
  if (window.__rwMainV4) return;
  window.__rwMainV4 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var lastNum = -1;
  var lastTime = 0;
  var sentCount = 0;
  var isInIframe = (window.self !== window.top);
  var hostname = location.hostname || '';

  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

  function getColor(n) {
    if (n === 0) return 'green';
    return RED.indexOf(n) >= 0 ? 'red' : 'black';
  }

  // ══════════════════════════════════════
  // ENVIAR numero al servidor RollerWin
  // ══════════════════════════════════════
  function sendNumber(n) {
    var now = Date.now();
    // Anti-duplicado: 3 segundos de cooldown + mismo numero
    if (n === lastNum && now - lastTime < 10000) return;
    if (now - lastTime < 2000) return;

    lastNum = n;
    lastTime = now;
    sentCount++;

    console.log('[RollerWin MAIN] === DETECTADO: ' + n + ' (' + getColor(n) + ') === ' +
      (isInIframe ? '[IFRAME ' + hostname + ']' : '[PARENT]') + ' (#' + sentCount + ')');

    // Enviar al servidor
    try {
      fetch(SERVER + '/api/capture/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: n })
      }).then(function(r) {
        if (r.ok) {
          console.log('[RollerWin MAIN] Enviado a servidor OK:', n);
        } else {
          console.log('[RollerWin MAIN] Error HTTP al enviar:', r.status);
        }
      }).catch(function(e) {
        console.log('[RollerWin MAIN] Error de red al enviar:', e.message);
      });
    } catch(e) {
      console.log('[RollerWin MAIN] Error fetch:', e.message);
    }

    // Notificar al parent (si estamos en iframe)
    if (isInIframe) {
      try {
        window.parent.postMessage({
          source: 'rollerwin-capture',
          number: n,
          color: getColor(n),
          hostname: hostname
        }, '*');
      } catch(e) {}
    } else {
      // En parent, disparar CustomEvent para content.js (ISOLATED world)
      try {
        document.dispatchEvent(new CustomEvent('rw-number', {
          detail: { number: n, color: getColor(n) }
        }));
      } catch(e) {}
    }
  }

  // ══════════════════════════════════════
  // EXTRACCION AGRESIVA de numeros
  // ══════════════════════════════════════
  var GAME_FIELDS = [
    'number','result','resultNumber','winningNumber','win_number','game_number',
    'roulette_number','value','num','n','ball_number','pocket','pocket_number',
    'last_number','lastNumber','current_number','currentNumber','gameResult',
    'game_result','outcome','winningPocket','pocketId','resultId',
    'numberStr','numberString','displayNumber','display_number',
    'roundResult','round_result','gameOutcome','game_outcome',
    'winningNumberDisplay','resultNumber','finalNumber','final_number'
  ];

  function extractDeep(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 8) return;

    if (Array.isArray(obj)) {
      for (var i = 0; i < Math.min(obj.length, 5); i++) {
        var item = obj[i];
        if (typeof item === 'number' && item >= 0 && item <= 36) {
          // Array con numeros directos - probablemente resultados
          sendNumber(item);
          return;
        }
        if (typeof item === 'string') {
          var sn = parseInt(item, 10);
          if (!isNaN(sn) && sn >= 0 && sn <= 36 && item === String(sn)) {
            sendNumber(sn);
            return;
          }
        }
        if (typeof item === 'object' && item !== null) {
          extractDeep(item, depth + 1, path + '[' + i + ']');
        }
      }
      return;
    }

    var keys = Object.keys(obj);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = obj[key];
      var keyLower = key.toLowerCase();
      var currentPath = path + '.' + key;

      // Verificar si el key es un campo de juego conocido
      var isGameField = false;
      for (var g = 0; g < GAME_FIELDS.length; g++) {
        if (keyLower === GAME_FIELDS[g].toLowerCase()) {
          isGameField = true;
          break;
        }
      }

      if (typeof val === 'number') {
        if (val >= 0 && val <= 36 && val === Math.floor(val)) {
          if (isGameField) {
            sendNumber(val);
            return;
          }
          // Log para debug (sin enviar) - detectar posibles fuentes de numeros
          if (depth <= 3) {
            console.log('[RollerWin DEBUG] Numero encontrado (no game-field):', val, 'en', currentPath);
          }
        }
      }

      if (typeof val === 'string') {
        var num = parseInt(val, 10);
        if (!isNaN(num) && num >= 0 && num <= 36 && val === String(num) && val.length <= 2) {
          if (isGameField) {
            sendNumber(num);
            return;
          }
        }
      }

      if (typeof val === 'object' && val !== null) {
        extractDeep(val, depth + 1, currentPath);
      }
    }
  }

  // Buscar numeros en texto plano (regex)
  function tryExtractFromText(text) {
    if (!text || typeof text !== 'string' || text.length > 100000) return;

    var patterns = [
      /"number"\s*:\s*(\d{1,2})/gi,
      /"result"\s*:\s*(\d{1,2})/gi,
      /"resultNumber"\s*:\s*(\d{1,2})/gi,
      /"winningNumber"\s*:\s*(\d{1,2})/gi,
      /"win_number"\s*:\s*(\d{1,2})/gi,
      /"pocket"\s*:\s*(\d{1,2})/gi,
      /"pocket_number"\s*:\s*(\d{1,2})/gi,
      /"ball_number"\s*:\s*(\d{1,2})/gi,
      /"game_number"\s*:\s*(\d{1,2})/gi,
      /"roulette_number"\s*:\s*(\d{1,2})/gi,
      /"finalNumber"\s*:\s*(\d{1,2})/gi,
      /"outcome"\s*:\s*(\d{1,2})/gi,
      /"displayNumber"\s*:\s*(\d{1,2})/gi,
      /"value"\s*:\s*(\d{1,2})/gi
    ];

    for (var i = 0; i < patterns.length; i++) {
      var match;
      patterns[i].lastIndex = 0;
      while ((match = patterns[i].exec(text)) !== null) {
        var n = parseInt(match[1], 10);
        if (n >= 0 && n <= 36) sendNumber(n);
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
      console.log('[RollerWin MAIN] WebSocket creado:', url ? url.substring(0, 80) : 'null');
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;
          if (typeof data !== 'string') {
            // Try ArrayBuffer
            if (data instanceof ArrayBuffer) {
              try {
                data = String.fromCharCode.apply(null, new Uint8Array(data));
              } catch(er) { return; }
            } else {
              return;
            }
          }

          // Socket.io format: 42["event",{...}]  or 43["event",{...}]
          if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
            try {
              var parsed = JSON.parse(data.substring(2));
              if (Array.isArray(parsed) && parsed.length >= 2 && typeof parsed[1] === 'object') {
                console.log('[RollerWin MAIN] Socket.io msg:', parsed[0]);
                extractDeep(parsed[1], 0, 'socketio.' + parsed[0]);
              }
            } catch(err) {}
          }

          // Plain JSON
          if (data.charAt(0) === '{' || data.charAt(0) === '[') {
            try {
              var jsonObj = JSON.parse(data);
              extractDeep(jsonObj, 0, 'ws.json');
            } catch(err) {}
          }

          // Regex search on raw text
          tryExtractFromText(data);

        } catch(err) {}
      });

      return ws;
    };

    // Preserve prototype chain
    ProxyWS.prototype = OrigWS.prototype;
    ProxyWS.CONNECTING = OrigWS.CONNECTING;
    ProxyWS.OPEN = OrigWS.OPEN;
    ProxyWS.CLOSING = OrigWS.CLOSING;
    ProxyWS.CLOSED = OrigWS.CLOSED;

    window.WebSocket = ProxyWS;
    console.log('[RollerWin MAIN] WebSocket hook instalado en', hostname);
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

      // Analizar TODAS las respuestas (no solo las de game/result)
      // Evolution puede usar URLs impredecibles
      promise.then(function(response) {
        try {
          var cloned = response.clone();
          cloned.text().then(function(text) {
            if (text && text.length > 0) {
              tryExtractFromText(text);
              try {
                var json = JSON.parse(text);
                extractDeep(json, 0, 'fetch');
              } catch(e) {}
            }
          }).catch(function() {});
        } catch(e) {}
      }).catch(function() {});

      return promise;
    };

    console.log('[RollerWin MAIN] Fetch hook instalado en', hostname);
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
        try {
          var text = self.responseText;
          if (text) {
            tryExtractFromText(text);
            try {
              var json = JSON.parse(text);
              extractDeep(json, 0, 'xhr');
            } catch(e) {}
          }
        } catch(e) {}
      });
      return origSend.apply(this, arguments);
    };

    console.log('[RollerWin MAIN] XHR hook instalado en', hostname);
  })();

  // ══════════════════════════════════════
  // ESCANEADOR DOM AGRESIVO
  // ══════════════════════════════════════
  (function setupDOMScanner() {
    function scanDOM() {
      // ═══ SELECTORES ESPECIFICOS DE EVOLUTION ═══
      var evoSelectors = [
        // Evolution Gaming especificos
        '[class*="game-history-item"] [class*="value"]',
        '[class*="game-history-item"] [class*="number"]',
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
        '[class*="game-round"] [class*="result"]',
        '[class*="round-result"]',
        '[class*="round-number"]',
        '[class*="history"] [class*="circle"]',
        '[class*="history"] [class*="badge"]',
        '[class*="history"] [class*="item"]',
        '[class*="bng"] [class*="history"] [class*="value"]',
        '[class*="bng"] [class*="result"]',
        // Atributos de data
        '[data-result-number]',
        '[data-number]',
        '[data-winning-number]',
        '[data-game-result]',
        '[data-result]',
        // Genericos comunes
        '.number-display',
        '.result-number',
        '.game-result-number',
        // Evolution iframe interno
        '[class*="video-overlay"] [class*="number"]',
        '[class*="overlay"] [class*="result"]',
        '[class*="stats"] [class*="number"]',
        '[class*="board"] [class*="result"]',
        '[class*="table"] [class*="result"]',
        '[class*="wheel"] [class*="result"]',
        '[class*="spin"] [class*="result"]',
        '[class*="autoplay"] [class*="result"]',
        // Posibles selectores nuevos de Evolution
        '[class*="GameHistory"] [class*="value"]',
        '[class*="GameHistory"] [class*="number"]',
        '[class*="gameHistory"] [class*="value"]',
        '[class*="gameHistory"] [class*="number"]',
        '[class*="HistoryItem"]',
        '[class*="ResultHistory"]',
        '[class*="resultHistory"]',
        // EZugi (parte de Evolution)
        '[class*="ezugi"] [class*="result"]',
        '[class*="ezugi"] [class*="number"]'
      ];

      for (var i = 0; i < evoSelectors.length; i++) {
        try {
          var els = document.querySelectorAll(evoSelectors[i]);
          for (var j = 0; j < Math.min(els.length, 3); j++) {
            var text = (els[j].textContent || '').trim();
            var num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
              console.log('[RollerWin MAIN] DOM match selector:', evoSelectors[i], '=', num);
              sendNumber(num);
              return;
            }
          }
        } catch(e) {}
      }

      // ═══ BUSQUEDA BRUTA: scanear texto en contenedores de juego ═══
      var containers = document.querySelectorAll(
        '[class*="game"], [class*="roulette"], [class*="casino"], ' +
        '[class*="evolution"], [class*="history"], [class*="result"], ' +
        '[class*="lobby"], [class*="bng"], [class*="ezugi"]'
      );

      for (var c = 0; c < containers.length; c++) {
        try {
          var walker = document.createTreeWalker(
            containers[c],
            NodeFilter.SHOW_TEXT,
            null,
            false
          );
          var node;
          while (node = walker.nextNode()) {
            var t = (node.textContent || '').trim();
            if (t.length === 1 || t.length === 2) {
              var n = parseInt(t, 10);
              if (!isNaN(n) && n >= 0 && n <= 36 && t === String(n)) {
                var parent = node.parentElement;
                if (!parent) continue;
                // Verificar que es un nodo hoja (no hay elementos hijos)
                if (parent.children.length > 1) continue;
                // Excluir clases que no son de resultado
                var cls = (parent.className || '').toLowerCase() + ' ' + (parent.id || '').toLowerCase();
                if (cls.indexOf('balance') >= 0 || cls.indexOf('wallet') >= 0 ||
                    cls.indexOf('timer') >= 0 || cls.indexOf('countdown') >= 0 ||
                    cls.indexOf('player') >= 0 || cls.indexOf('chat') >= 0 ||
                    cls.indexOf('limit') >= 0 || cls.indexOf('min') >= 0 ||
                    cls.indexOf('max') >= 0 || cls.indexOf('stake') >= 0 ||
                    cls.indexOf('total') >= 0 || cls.indexOf('amount') >= 0 ||
                    cls.indexOf('payout') >= 0 || cls.indexOf('multiplier') >= 0 ||
                    cls.indexOf('level') >= 0 || cls.indexOf('rank') >= 0 ||
                    cls.indexOf('vip') >= 0 || cls.indexOf('bonus') >= 0 ||
                    cls.indexOf('free') >= 0 || cls.indexOf('spin') >= 0 ||
                    cls.indexOf('bet') >= 0 || cls.indexOf('chip') >= 0) {
                  continue;
                }
                console.log('[RollerWin MAIN] DOM brute force:', n, 'in', cls.substring(0, 50));
                sendNumber(n);
                return;
              }
            }
          }
        } catch(e) {}
      }
    }

    function setup() {
      if (!document.body) return;

      // Scan inicial
      setTimeout(scanDOM, 1000);
      setTimeout(scanDOM, 3000);

      // MutationObserver para cambios en el DOM
      var timer = null;
      new MutationObserver(function(mutations) {
        if (timer) return;
        timer = setTimeout(function() {
          timer = null;
          scanDOM();
        }, 500);
      }).observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });

      // Scan periodico como respaldo (cada 3 segundos)
      setInterval(scanDOM, 3000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(setup, 100);
      });
    } else {
      setTimeout(setup, 100);
    }
  })();

  // ══════════════════════════════════════
  // INTERCEPTAR postMessage (Evolution usa postMessage entre frames)
  // ══════════════════════════════════════
  (function hookPostMessage() {
    var origPostMessage = window.postMessage;
    if (origPostMessage.__rwV4Hooked) return;
    origPostMessage.__rwV4Hooked = true;

    window.postMessage = function(data, targetOrigin, transfer) {
      try {
        var str = typeof data === 'string' ? data : JSON.stringify(data);
        tryExtractFromText(str);
        if (typeof data === 'object' && data !== null) {
          extractDeep(data, 0, 'postMessage');
        }
      } catch(e) {}
      return origPostMessage.call(window, data, targetOrigin, transfer);
    };

    // Escuchar mensajes entrantes
    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'string') {
          tryExtractFromText(data);
        } else if (typeof data === 'object' && data !== null) {
          extractDeep(data, 0, 'onmessage');
        }
      } catch(e) {}
    });

    console.log('[RollerWin MAIN] postMessage hook instalado en', hostname);
  })();

  // ══════════════════════════════════════
  // HOOK EventSource (SSE - Server Sent Events)
  // ══════════════════════════════════════
  (function hookEventSource() {
    if (typeof window.EventSource === 'undefined') return;
    var OrigES = window.EventSource;
    if (OrigES.__rwV4Hooked) return;
    OrigES.__rwV4Hooked = true;

    var ProxyES = function(url, opts) {
      console.log('[RollerWin MAIN] EventSource creado:', url ? url.substring(0, 80) : 'null');
      var es = opts ? new OrigES(url, opts) : new OrigES(url);

      es.addEventListener('message', function(e) {
        try {
          var data = e.data;
          if (typeof data === 'string') {
            tryExtractFromText(data);
            try { extractDeep(JSON.parse(data), 0, 'sse'); } catch(err) {}
          }
        } catch(err) {}
      });

      // Algunos proveedores usan eventos con nombre
      var origAddListener = es.addEventListener.bind(es);
      var eventTypes = ['result', 'game', 'update', 'roulette', 'number', 'outcome', 'round'];
      eventTypes.forEach(function(evtType) {
        origAddListener(evtType, function(e) {
          try {
            var data = e.data;
            if (typeof data === 'string') {
              tryExtractFromText(data);
              try { extractDeep(JSON.parse(data), 0, 'sse.' + evtType); } catch(err) {}
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
    console.log('[RollerWin MAIN] EventSource hook instalado en', hostname);
  })();

  console.log('[RollerWin MAIN] v4.0 MOTOR DE DETECCION activo en ' + hostname + ' ' +
    (isInIframe ? '[IFRAME]' : '[PARENT]'));

})();
