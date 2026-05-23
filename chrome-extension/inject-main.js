// RollerWin Capture v4.9 - MAIN WORLD DETECTION ENGINE
// SOLO detecta numeros desde iframes (donde corre Evolution)
// El parent page SOLO retransmite lo que llega via postMessage desde iframes
// FIX: dedup por numero anterior previene que historial stale bloquee numeros nuevos
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

  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

  function getColor(n) {
    if (n === 0) return 'green';
    return RED.indexOf(n) >= 0 ? 'red' : 'black';
  }

  // ══════════════════════════════════════
  // ENVIAR numero al servidor RollerWin
  // ══════════════════════════════════════
  function sendToServer(n, source) {
    if (n < 0 || n > 36) return;

    var now = Date.now();

    // 1. Cooldown: evitar multiples detecciones del MISMO giro (~18s entre giros).
    // 5s es suficiente: un numero aparece una vez por giro, y los hooks multiples
    // (WS, Fetch, DOM) lo detectan casi al mismo tiempo.
    if (n === lastNum && now - lastTime < 5000) return;

    lastNum = n;
    lastTime = now;
    sentCount++;

    console.log('[RollerWin] RESULTADO #' + sentCount + ': ' + n + ' (' + getColor(n) + ') — ' + source +
      ' ' + (isInIframe ? '[IFRAME ' + hostname + ']' : '[PARENT]'));

    // Enviar al servidor RollerWin (con reintento)
    try {
      var doSend = function(attempt) {
        fetch(SERVER + '/api/capture/receive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: n })
        }).then(function(r) {
          if (r.ok) {
            console.log('[RollerWin] Servidor OK:', n, '(intentos:', attempt + ')');
          } else if (attempt < 2) {
            console.log('[RollerWin] Reintentando (' + (attempt+1) + ') HTTP', r.status);
            setTimeout(function() { doSend(attempt + 1); }, 2000);
          } else {
            console.log('[RollerWin] Error HTTP tras reintentos:', r.status);
          }
        }).catch(function(e) {
          if (attempt < 2) {
            console.log('[RollerWin] Reintentando (' + (attempt+1) + ') error:', e.message);
            setTimeout(function() { doSend(attempt + 1); }, 2000);
          } else {
            console.log('[RollerWin] Error red tras reintentos:', e.message);
          }
        });
      };
      doSend(0);
    } catch(e) { console.log('[RollerWin] Error fetch:', e.message); }

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
      // CustomEvent para content.js (ISOLATED world)
      try {
        document.dispatchEvent(new CustomEvent('rw-number', {
          detail: { number: n, color: getColor(n) }
        }));
      } catch(e) {}
    }
  }

  // ══════════════════════════════════════
  // ============ PARENT PAGE =============
  // NO detecta numeros directamente.
  // Solo retransmite lo que llega de los iframes via postMessage.
  // ══════════════════════════════════════
  if (!isInIframe) {
    console.log('[RollerWin] PARENT page — esperando numeros de iframes via postMessage');

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (data && data.source === 'rollerwin-capture' && typeof data.number === 'number') {
          console.log('[RollerWin] Recibido de iframe:', data.number, '(' + data.hostname + ')');
          // El iframe ya envio al servidor, no reenviar
          // Solo actualizar la UI del widget
          try {
            document.dispatchEvent(new CustomEvent('rw-number', {
              detail: { number: data.number, color: data.color }
            }));
          } catch(e) {}
        }
      } catch(e) {}
    });

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  v4.9: AUTO-RECOVER INSTANTÁNEO                               ║
    // ║                                                                ║
    // ║  Cuando Betfury muestra "SESIÓN FINALIZADA":                   ║
    // ║  1. Click OK para cerrar el modal                               ║
    // ║  2. Navegar INMEDIATAMENTE a la mesa de ruleta                 ║
    // ║  3. Si hay botón "Jugar" → click automático                   ║
    // ║  4. El iframe carga y captura resume                           ║
    // ║                                                                ║
    // ║  También: keep-alive con fetch reales cada 5 min               ║
    // ║  y detección de iframe muerto (sin capturas >90s)              ║
    // ╚══════════════════════════════════════════════════════════════════╝

    var _keepAliveCount = 0;
    var _lastCaptureTime = Date.now();
    var _recovering = false;
    var _recoverCount = 0;
    var _lastKeepAliveResponse = 'pending';

    // URL directa de la mesa de Evolution Live Roulette
    var ROULETTE_URL = 'https://betfury.com/es/casino/games/roulette-live-by-evolution';

    // Guardar la URL de la mesa actual
    var _gameUrl = location.href;
    var _pushStateOrig = history.pushState;
    var _replaceStateOrig = history.replaceState;
    if (history.pushState) {
      history.pushState = function() {
        var result = _pushStateOrig.apply(this, arguments);
        if (location.href.indexOf('/casino/games/') !== -1) _gameUrl = location.href;
        return result;
      };
    }
    if (history.replaceState) {
      history.replaceState = function() {
        var result = _replaceStateOrig.apply(this, arguments);
        if (location.href.indexOf('/casino/games/') !== -1) _gameUrl = location.href;
        return result;
      };
    }
    setInterval(function() {
      if (location.href.indexOf('/casino/games/') !== -1) _gameUrl = location.href;
    }, 30000);

    // Recibir timestamp de última captura
    document.addEventListener('rw-number', function() {
      _lastCaptureTime = Date.now();
      _recovering = false;
    });

    // ════════════════════════════════════════════════════════
    // 1. KEEP-ALIVE: Fetch reales a API de Betfury cada 5 min
    // ════════════════════════════════════════════════════════
    function betfuryKeepAlive() {
      _keepAliveCount++;
      var endpoints = ['/api/user/balance', '/api/user/profile', '/api/user/session', '/api/user/settings'];
      var ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      fetch(ep, {
        method: 'GET',
        credentials: 'include',
        keepalive: true,
        headers: { 'Accept': 'application/json' }
      }).then(function(r) {
        _lastKeepAliveResponse = r.status;
        if (_keepAliveCount % 3 === 0) {
          console.log('[RollerWin] Keep-alive #' + _keepAliveCount + ' HTTP ' + r.status);
        }
      }).catch(function() {});
    }
    setTimeout(betfuryKeepAlive, 3000);
    setInterval(betfuryKeepAlive, 300000);

    // ════════════════════════════════════════════════════════
    // 2. AUTO-RECOVER: Detectar modal → Click OK → Ir a mesa
    // ════════════════════════════════════════════════════════

    function clickButtonByText(texts) {
      var btns = document.querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        var bt = (btns[i].textContent || '').trim();
        for (var j = 0; j < texts.length; j++) {
          if (bt === texts[j]) {
            btns[i].click();
            console.log('[RollerWin] Click boton: "' + bt + '"');
            return true;
          }
        }
      }
      return false;
    }

    function recoverToGame() {
      if (_recovering) return;
      _recovering = true;
      _recoverCount++;

      var targetUrl = ROULETTE_URL;
      if (_gameUrl && _gameUrl.indexOf('/casino/games/') !== -1 && _gameUrl.indexOf('roulette') !== -1) {
        targetUrl = _gameUrl;
      }

      console.log('[RollerWin] RECOVER #' + _recoverCount + ': → ' + targetUrl);

      setTimeout(function() {
        console.log('[RollerWin] Navegando a mesa...');
        location.href = targetUrl;
      }, 500);
    }

    function detectAndRecover() {
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3');

      for (var i = 0; i < allEls.length; i++) {
        var txt = (allEls[i].textContent || '');
        var txtLow = txt.toLowerCase();

        var isExpired = (txt.indexOf('SESI') !== -1 && txt.indexOf('FINALIZADA') !== -1) ||
                        (txtLow.indexOf('session') !== -1 && txtLow.indexOf('expired') !== -1) ||
                        (txtLow.indexOf('session') !== -1 && txtLow.indexOf('ended') !== -1);

        if (isExpired) {
          console.log('[RollerWin] SESION EXPIRADA — click OK + recover...');
          clickButtonByText(['OK', 'Ok', 'ok', 'Aceptar', 'Accept']);
          recoverToGame();
          return true;
        }
      }
      return false;
    }

    setInterval(detectAndRecover, 2000);
    try {
      new MutationObserver(function() { detectAndRecover(); }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}

    // ════════════════════════════════════════════════════════
    // 3. CLICK AUTOMÁTICO en botón "Jugar"
    // Si cargó el preview del juego en vez del juego real
    // ════════════════════════════════════════════════════════

    function checkPlayButton() {
      if (!_recovering) return;
      var btns = document.querySelectorAll('button, a, [role="button"]');
      for (var i = 0; i < btns.length; i++) {
        var bt = (btns[i].textContent || '').trim().toLowerCase();
        if (bt === 'jugar' || bt === 'play' || bt === 'play now') {
          console.log('[RollerWin] Boton "' + (btns[i].textContent || '').trim() + '" — click!');
          btns[i].click();
          return true;
        }
      }
      return false;
    }

    setInterval(checkPlayButton, 3000);

    // ════════════════════════════════════════════════════════
    // 4. IFRAME MUERTO: sin capturas >90s → reload
    // ════════════════════════════════════════════════════════

    setInterval(function() {
      var noCap = Date.now() - _lastCaptureTime;
      var onGame = location.href.indexOf('/casino/games/') !== -1;

      if (onGame && noCap > 90000 && !_recovering) {
        console.log('[RollerWin] Sin capturas ' + Math.round(noCap/1000) + 's — reload...');
        _recovering = true;
        location.reload();
      }
    }, 30000);

    // ════════════════════════════════════════════════════════
    // 5. VISIBILITY + FOCUS
    // ════════════════════════════════════════════════════════
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        betfuryKeepAlive();
        if (location.href.indexOf('/casino/games/') === -1 && _recoverCount > 0) {
          console.log('[RollerWin] No en juego — volviendo a mesa...');
          recoverToGame();
        }
      }
    });

    window.addEventListener('focus', function() { betfuryKeepAlive(); });

    // ════════════════════════════════════════════════════════
    // 6. REPORTAR estado al content script
    // ════════════════════════════════════════════════════════
    setInterval(function() {
      try {
        document.dispatchEvent(new CustomEvent('rw-status', {
          detail: {
            status: _recovering ? 'recovering' : 'alive',
            keepAliveCount: _keepAliveCount,
            lastResponse: _lastKeepAliveResponse,
            noCaptureSec: Math.round((Date.now() - _lastCaptureTime) / 1000),
            recoverCount: _recoverCount,
            gameUrl: _gameUrl
          }
        }));
      } catch(e) {}
    }, 10000);

    console.log('[RollerWin] v4.9 AUTO-RECOVER | Mesa:', ROULETTE_URL);

  }

  // ══════════════════════════════════════
  // ============ IFRAME (Evolution) ======
  // AQUI es donde se detectan los numeros
  // ══════════════════════════════════════
  console.log('[RollerWin] IFRAME detectado:', hostname, '— activando deteccion');

  // Campos de resultado de ruleta (alta confianza)
  var RESULT_FIELDS = [
    'number', 'result', 'resultnumber', 'winningnumber', 'win_number',
    'game_number', 'roulette_number', 'ball_number', 'pocket', 'pocket_number',
    'winningpocket', 'pocketid', 'resultid', 'displaynumber',
    'roundresult', 'gameoutcome', 'finalnumber', 'outcome',
    'winningnumberdisplay', 'resultnumber', 'final_number', 'game_result',
    'round_result', 'game_outcome', 'numberstr', 'numberstring'
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

  function extractObj(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 6) return;

    if (Array.isArray(obj)) {
      var pathLow = path.toLowerCase();
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('history') >= 0 ||
          pathLow.indexOf('number') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0) {
        if (obj.length > 0) {
          var n = tryNum(obj[0]);
          if (n !== null) { sendToServer(n, 'array@' + path); return; }
          if (typeof obj[0] === 'object') extractObj(obj[0], depth + 1, path + '[0]');
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
        if (n !== null) { sendToServer(n, key + '@' + path); return; }
      }

      if (typeof val === 'object' && val !== null) {
        extractObj(val, depth + 1, path + '.' + key);
      }
    }
  }

  // Regex selectivo para texto de red
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
    for (var i = 0; i < patterns.length; i++) {
      var m; patterns[i].lastIndex = 0;
      while ((m = patterns[i].exec(text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) sendToServer(n, 'regex@' + source);
      }
    }
  }

  // ══════════════════════════════════════
  // HOOK WEBSOCKET (solo en iframes)
  // ══════════════════════════════════════
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwV42) return;
    OrigWS.__rwV42 = true;

    var ProxyWS = function(url, protocols) {
      console.log('[RollerWin] WS en iframe:', (url || '').substring(0, 80));
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
                var evt = String(p[0] || '');
                if (evt.indexOf('result') >= 0 || evt.indexOf('complete') >= 0 ||
                    evt.indexOf('win') >= 0 || evt.indexOf('game') >= 0 ||
                    evt.indexOf('round') >= 0 || evt.indexOf('spin') >= 0 ||
                    evt.indexOf('update') >= 0 || evt.indexOf('number') >= 0) {
                  extractObj(p[1], 0, 'sio.' + evt);
                  extractFromText(data, 'sio.' + evt);
                }
              }
            } catch(err) {}
          }

          // JSON
          if (data.charAt(0) === '{' || data.charAt(0) === '[') {
            try { extractObj(JSON.parse(data), 0, 'ws'); extractFromText(data, 'ws'); } catch(err) {}
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

  // ══════════════════════════════════════
  // HOOK FETCH (solo en iframes)
  // ══════════════════════════════════════
  (function() {
    var origFetch = window.fetch;
    if (!origFetch || origFetch.__rwV42) return;
    origFetch.__rwV42 = true;

    window.fetch = function(input, init) {
      var url = '';
      try {
        url = typeof input === 'string' ? input :
              (input instanceof Request) ? (input.url || '') :
              (input && input.url) ? input.url : '';
      } catch(e) {}

      var promise = origFetch.apply(this, arguments);

      var urlLow = url.toLowerCase();
      if (urlLow.indexOf('game') >= 0 || urlLow.indexOf('result') >= 0 ||
          urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
          urlLow.indexOf('history') >= 0 || urlLow.indexOf('round') >= 0 ||
          urlLow.indexOf('wheel') >= 0 || urlLow.indexOf('state') >= 0) {

        promise.then(function(r) {
          try {
            r.clone().text().then(function(text) {
              if (text) { try { extractObj(JSON.parse(text), 0, 'fetch'); } catch(e) {} extractFromText(text, 'fetch'); }
            }).catch(function() {});
          } catch(e) {}
        }).catch(function() {});
      }

      return promise;
    };
  })();

  // ══════════════════════════════════════
  // HOOK XHR (solo en iframes)
  // ══════════════════════════════════════
  (function() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwV42) return;
    origSend.__rwV42 = true;

    XMLHttpRequest.prototype.open = function(m, u) { this._rwUrl = String(u || ''); return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      this.addEventListener('load', function() {
        var u = (self._rwUrl || '').toLowerCase();
        if (u.indexOf('game') >= 0 || u.indexOf('result') >= 0 ||
            u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0 ||
            u.indexOf('history') >= 0 || u.indexOf('round') >= 0 ||
            u.indexOf('wheel') >= 0 || u.indexOf('state') >= 0) {
          try {
            var t = self.responseText;
            if (t) { try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {} extractFromText(t, 'xhr'); }
          } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // ══════════════════════════════════════
  // DOM SCANNER (solo en iframes)
  // Selectores estrictos de Evolution
  // ══════════════════════════════════════
  (function() {
    var EXCLUDE = ['balance','wallet','timer','countdown','player','chat','limit','min-','max-',
      'stake','total','amount','payout','multiplier','level','rank','vip','bonus','free',
      'chip','currency','price','percent','ratio','time','hour','minute','second','date',
      'session','uid','avatar','notification','unread','counter','index','page','size'];

    function isExcluded(el) {
      if (!el) return false;
      var c = ((el.className || '') + ' ' + (el.id || '')).toLowerCase();
      for (var i = 0; i < EXCLUDE.length; i++) { if (c.indexOf(EXCLUDE[i]) >= 0) return true; }
      return false;
    }

    function scanDOM() {
      var sels = [
        '[class*="game-history"] [class*="value"]',
        '[class*="game-history"] [class*="number"]',
        '[class*="history-item"] [class*="number"]',
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
        '[class*="HistoryItem"]',
        '[class*="ResultHistory"]',
        '[class*="history"] [class*="circle"]',
        '[class*="history"] [class*="badge"]',
        '[class*="bng"] [class*="value"]',
        '[data-number]',
        '[class*="number-display"]',
        '[class*="overlay"] [class*="result"]',
        '[class*="board"] [class*="result"]'
      ];

      for (var i = 0; i < sels.length; i++) {
        try {
          var els = document.querySelectorAll(sels[i]);
          for (var j = 0; j < Math.min(els.length, 2); j++) {
            if (isExcluded(els[j])) continue;
            var text = (els[j].textContent || '').trim();
            var num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
              sendToServer(num, 'DOM:' + sels[i]);
              return;
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
        timer = setTimeout(function() { timer = null; scanDOM(); }, 1000);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });

      setInterval(scanDOM, 5000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(setup, 100); });
    } else {
      setTimeout(setup, 100);
    }
  })();

  // ══════════════════════════════════════
  // HOOK postMessage (solo en iframes)
  // ══════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwV42) return;
    orig.__rwV42 = true;

    window.postMessage = function(data, origin, transfer) {
      try { if (typeof data === 'object' && data !== null) extractObj(data, 0, 'postMsg-out'); } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null) extractObj(data, 0, 'postMsg-in');
      } catch(e) {}
    });
  })();

  // ══════════════════════════════════════
  // HOOK EventSource (solo en iframes)
  // ══════════════════════════════════════
  (function() {
    if (typeof window.EventSource === 'undefined') return;
    var Orig = window.EventSource;
    if (Orig.__rwV42) return;
    Orig.__rwV42 = true;

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

  console.log('[RollerWin] v4.9 MOTOR ACTIVO en IFRAME ' + hostname + ' | Dedup: 5s mismo numero');
})();
