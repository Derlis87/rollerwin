// RollerWin Capture v4.6 - MAIN WORLD DETECTION ENGINE
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

    // ── v4.6: DEEP SESSION KEEP-ALIVE ──
    // Betfury NO cuenta fetch como actividad. Cuenta mousemove/keydown/touch.
    // Solución: dispatchear eventos INVISIBLES que reinician el contador de Betfury
    // SIN tocar ningún elemento (no clicks, no scrolls, no botones).

    var _sessionLost = false;

    // ── 1) INVISIBLE USER ACTIVITY: reinicia el contador de Betfury ──
    // mousemove en document es invisible (no mueve cursor real, no toca elementos)
    // pero Betfury lo detecta como actividad del usuario
    var _mouseX = 100, _mouseY = 100;
    function invisibleActivity() {
      // Movimiento sutil de mouse (simula que el usuario mueve el ratón)
      _mouseX += (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
      _mouseY += (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1);
      // Mantener dentro de rangos normales
      if (_mouseX < 50) _mouseX = 200;
      if (_mouseX > 800) _mouseX = 400;
      if (_mouseY < 50) _mouseY = 200;
      if (_mouseY > 600) _mouseY = 300;

      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: _mouseX,
        clientY: _mouseY,
        screenX: _mouseX,
        screenY: _mouseY,
        movementX: 1,
        movementY: 1,
        bubbles: true,
        cancelable: true,
        view: window
      }));

      // También un keydown sutil (Shift o Ctrl) — NO Alt (abre menú), NO Tab (cambia foco)
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Shift',
        code: 'ShiftLeft',
        keyCode: 16,
        which: 16,
        bubbles: true,
        cancelable: false // no cancelable para que el navegador no haga nada
      }));
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Shift',
        code: 'ShiftLeft',
        keyCode: 16,
        which: 16,
        bubbles: true,
        cancelable: false
      }));

      // Touch event para dispositivos móviles
      try {
        var touch = new TouchEvent('touchstart', {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 0, target: document.body, clientX: _mouseX, clientY: _mouseY })]
        });
        document.dispatchEvent(touch);
      } catch(e) {}

      // Scroll event muy sutil (1px que se revierte) — solo para el event listener
      // Usamos WheelEvent que no mueve la página realmente
      try {
        document.dispatchEvent(new WheelEvent('wheel', {
          deltaX: 0, deltaY: 0, deltaZ: 0,
          bubbles: true,
          cancelable: true
        }));
      } catch(e) {}

      console.log('[RollerWin] Activity ping (' + new Date().toLocaleTimeString() + ')');
    }

    // Cada 60 segundos (1 minuto) — agresivo pero seguro
    setTimeout(invisibleActivity, 5000);
    setInterval(invisibleActivity, 60000);

    // ── 2) FETCH SILENCIOSO al servidor cada 90s (mantiene JWT vivo) ──
    function silentKeepAlive() {
      var endpoints = ['/api/user/session', '/api/user/profile', '/api/user/balance'];
      var ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      fetch(ep, { method: 'GET', credentials: 'include', keepalive: true }).catch(function() {});
    }
    setTimeout(silentKeepAlive, 8000);
    setInterval(silentKeepAlive, 90000);

    // ── 3) HOOK setTimeout/setInterval para interceptar timers de sesión ──
    // Betfury probablemente usa un timer largo (15-30 min) para checkear inactividad.
    // Lo interceptamos y lo reiniciamos periódicamente.
    var _origSetTimeout = window.setTimeout;
    var _origClearTimeout = window.clearTimeout;
    var _longTimers = []; // timers de 10+ minutos (posibles timers de sesión)

    window.setTimeout = function(fn, delay) {
      if (delay && delay >= 600000) { // 10+ minutos = posible timer de sesión
        var id = _origSetTimeout.call(window, fn, delay);
        _longTimers.push({ id: id, fn: fn, delay: delay });
        console.log('[RollerWin] Timer largo interceptado:', Math.round(delay/1000), 's');
        return id;
      }
      return _origSetTimeout.apply(window, arguments);
    };

    window.clearTimeout = function(id) {
      _longTimers = _longTimers.filter(function(t) { return t.id !== id; });
      return _origClearTimeout.apply(window, arguments);
    };

    // Cada 5 minutos, reiniciar todos los timers largos (extiende la sesión)
    setInterval(function() {
      if (_longTimers.length === 0) return;
      console.log('[RollerWin] Refrescando', _longTimers.length, 'timer(s) de sesión...');
      var refreshed = [];
      _longTimers.forEach(function(timer) {
        _origClearTimeout.call(window, timer.id);
        var newId = _origSetTimeout.call(window, timer.fn, timer.delay);
        refreshed.push({ id: newId, fn: timer.fn, delay: timer.delay });
      });
      _longTimers = refreshed;
    }, 300000);

    // ── 4) AUTO-CLOSE MODAL "SESIÓN FINALIZADA" ──
    var _modalClosed = false;

    function checkAndCloseModal() {
      if (_modalClosed) return false;
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3');
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var txt = el.textContent || '';
        if (txt.indexOf('SESIÓN') !== -1 && txt.indexOf('FINALIZADA') !== -1) {
          console.log('[RollerWin] Modal SESIÓN FINALIZADA — cerrando...');
          _modalClosed = true;
          _sessionLost = true;
          // Buscar botón OK/Aceptar
          var modal = el.closest('[class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"], [class*="confirm"]');
          var btns = modal ? modal.querySelectorAll('button') : document.querySelectorAll('button');
          for (var j = 0; j < btns.length; j++) {
            var bt = (btns[j].textContent || '').trim();
            if (bt === 'OK' || bt === 'Ok' || bt === 'ok' || bt === 'Aceptar') {
              btns[j].click();
              console.log('[RollerWin] Boton "' + bt + '" clickeado');
              break;
            }
          }
          setTimeout(function() { _modalClosed = false; }, 60000);
          return true;
        }
      }
      // Inglés
      for (var i2 = 0; i2 < allEls.length; i2++) {
        var t = ((allEls[i2].textContent || '')).toLowerCase();
        if ((t.indexOf('session') !== -1 && t.indexOf('expired') !== -1) ||
            (t.indexOf('session') !== -1 && t.indexOf('ended') !== -1)) {
          var allBtns = document.querySelectorAll('button');
          for (var b = 0; b < allBtns.length; b++) {
            if ((allBtns[b].textContent || '').trim() === 'OK') { allBtns[b].click(); break; }
          }
          _sessionLost = true;
          return true;
        }
      }
      return false;
    }

    setInterval(checkAndCloseModal, 3000);
    try {
      new MutationObserver(function() { checkAndCloseModal(); }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}
    setTimeout(checkAndCloseModal, 5000);

    // ── 5) Cuando el usuario vuelve a la pestaña ──
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        invisibleActivity(); // Reset inmediato
        silentKeepAlive();
        if (_sessionLost) {
          _sessionLost = false;
          _modalClosed = false;
        }
      }
    });

    console.log('[RollerWin] Keep-alive v4.6: invisible activity every 60s + timer hook + fetch + modal close');

    return; // NADA MAS en el parent page
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

  console.log('[RollerWin] v4.6 MOTOR ACTIVO en IFRAME ' + hostname + ' | Dedup: 5s mismo numero');
})();
