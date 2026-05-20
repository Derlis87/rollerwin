// RollerWin Capture v4.7 - MAIN WORLD DETECTION ENGINE
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

    // ╔═══════════════════════════════════════════════════════════════╗
    // ║  v4.7: ULTRA KEEP-ALIVE + AUTO-RECOVER                        ║
    // ║  Problema: Betfury expira sesión tras ~30 min inactividad.     ║
    // ║  El modal "SESIÓN FINALIZADA" + OK redirige a página principal  ║
    // ║  y hay que buscar la mesa de nuevo manualmente.                 ║
    // ║  Solución: (A) Prevenir caducamiento, (B) Auto-volver a mesa   ║
    // ╚═══════════════════════════════════════════════════════════════╝

    var _sessionLost = false;
    var _gameUrl = location.href; // Guardar URL de la mesa actual
    var _lastCaptureTime = Date.now(); // Último número capturado
    var _keepAliveCount = 0;

    // Guardar la URL del juego cuando cambiamos entre páginas internas del SPA
    var _pushStateOrig = history.pushState;
    var _replaceStateOrig = history.replaceState;
    if (history.pushState) {
      history.pushState = function() {
        var result = _pushStateOrig.apply(this, arguments);
        if (location.href.indexOf('/casino/games/') !== -1 ||
            location.href.indexOf('/casino/live-casino') !== -1) {
          _gameUrl = location.href;
          console.log('[RollerWin] URL de juego guardada:', _gameUrl);
        }
        return result;
      };
    }
    if (history.replaceState) {
      history.replaceState = function() {
        var result = _replaceStateOrig.apply(this, arguments);
        if (location.href.indexOf('/casino/games/') !== -1 ||
            location.href.indexOf('/casino/live-casino') !== -1) {
          _gameUrl = location.href;
          console.log('[RollerWin] URL de juego guardada (replace):', _gameUrl);
        }
        return result;
      };
    }

    // Actualizar _gameUrl periódicamente si estamos en una mesa
    setInterval(function() {
      if (location.href.indexOf('/casino/games/') !== -1 ||
          location.href.indexOf('/casino/live-casino') !== -1) {
        _gameUrl = location.href;
      }
    }, 30000);

    // Recibir timestamp de última captura desde CustomEvent
    document.addEventListener('rw-number', function() {
      _lastCaptureTime = Date.now();
    });

    // ══════════════════════════════════════
    // LAYER 1: KEEP-ALIVE ACTIVO (30s)
    // Dispatch de eventos sintéticos que Betfury reconoce como actividad
    // ══════════════════════════════════════
    var _mouseX = 200, _mouseY = 200;
    function invisibleActivity() {
      _keepAliveCount++;

      // Movimiento de mouse con coordenadas realistas
      _mouseX += (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 15) + 5);
      _mouseY += (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 10) + 5);
      if (_mouseX < 80) _mouseX = 150 + Math.random() * 200;
      if (_mouseX > 900) _mouseX = 400 + Math.random() * 200;
      if (_mouseY < 80) _mouseY = 150 + Math.random() * 150;
      if (_mouseY > 700) _mouseY = 300 + Math.random() * 150;

      // Mousemove sobre el document
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: _mouseX, clientY: _mouseY,
        screenX: _mouseX, screenY: _mouseY,
        movementX: Math.floor(Math.random() * 5) + 1,
        movementY: Math.floor(Math.random() * 5) + 1,
        bubbles: true, cancelable: true, view: window
      }));

      // Mousedown + mouseup en el body (simula actividad de ratón sin hacer click en nada)
      // Esto es clave: algunos frameworks consideran mousedown como actividad real
      document.dispatchEvent(new MouseEvent('mousedown', {
        clientX: _mouseX, clientY: _mouseY,
        button: 0, buttons: 1,
        bubbles: true, cancelable: true, view: window
      }));
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: _mouseX, clientY: _mouseY,
        button: 0, buttons: 0,
        bubbles: true, cancelable: true, view: window
      }));

      // Keypress sutil (NO keydown de control que abre menús)
      // Usamos una tecla segura que no tiene acción en el navegador
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16,
        bubbles: true, cancelable: false
      }));
      document.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Shift', code: 'ShiftLeft', keyCode: 16, which: 16,
        bubbles: true, cancelable: false
      }));

      // Pointer events (modern browsers usan pointer events en vez de mouse)
      try {
        document.dispatchEvent(new PointerEvent('pointermove', {
          clientX: _mouseX, clientY: _mouseY,
          pointerId: 1, pointerType: 'mouse', isPrimary: true,
          bubbles: true, cancelable: true, view: window
        }));
      } catch(e) {}

      // Focus event en window (algunos SPAs lo usan para actividad)
      try { window.dispatchEvent(new Event('focus', { bubbles: false })); } catch(e) {}

      if (_keepAliveCount % 5 === 0) { // Log cada 5 pings (no spam)
        console.log('[RollerWin] Keep-alive #' + _keepAliveCount + ' (' + new Date().toLocaleTimeString() + ')');
      }
    }

    // Primera actividad a los 3s, luego cada 30 segundos
    setTimeout(invisibleActivity, 3000);
    setInterval(invisibleActivity, 30000);

    // ══════════════════════════════════════
    // LAYER 2: JWT REFRESH (90s)
    // Llamadas a API de Betfury para mantener el token vivo
    // ══════════════════════════════════════
    function jwtKeepAlive() {
      var endpoints = [
        '/api/user/session',
        '/api/user/profile',
        '/api/user/balance',
        '/api/user/settings'
      ];
      var ep = endpoints[Math.floor(Math.random() * endpoints.length)];
      fetch(ep, {
        method: 'GET',
        credentials: 'include',
        keepalive: true,
        headers: { 'Accept': 'application/json' }
      }).then(function(r) {
        if (r.status === 401 || r.status === 403) {
          console.log('[RollerWin] JWT expirado (HTTP ' + r.status + ')');
          _sessionLost = true;
        }
      }).catch(function() {});
    }
    setTimeout(jwtKeepAlive, 5000);
    setInterval(jwtKeepAlive, 90000);

    // ══════════════════════════════════════
    // LAYER 3: HOOK TIMERS DE SESIÓN
    // Interceptar timers largos (posibles expiradores de sesión)
    // ══════════════════════════════════════
    var _origSetTimeout = window.setTimeout;
    var _origSetInterval = window.setInterval;
    var _origClearTimeout = window.clearTimeout;
    var _longTimers = [];

    window.setTimeout = function(fn, delay) {
      if (delay && delay >= 600000) { // 10+ min
        var id = _origSetTimeout.call(window, fn, delay);
        _longTimers.push({ id: id, fn: fn, delay: delay });
        console.log('[RollerWin] Timer largo capturado:', Math.round(delay/1000) + 's');
        return id;
      }
      return _origSetTimeout.apply(window, arguments);
    };

    window.setInterval = function(fn, delay) {
      if (delay && delay >= 600000) { // 10+ min
        var id = _origSetInterval.call(window, fn, delay);
        console.log('[RollerWin] Interval largo capturado:', Math.round(delay/1000) + 's');
        return id;
      }
      return _origSetInterval.apply(window, arguments);
    };

    window.clearTimeout = function(id) {
      _longTimers = _longTimers.filter(function(t) { return t.id !== id; });
      return _origClearTimeout.apply(window, arguments);
    };

    // Refrescar timers largos cada 3 minutos
    setInterval(function() {
      if (_longTimers.length === 0) return;
      console.log('[RollerWin] Refrescando ' + _longTimers.length + ' timer(s) de sesión...');
      var refreshed = [];
      _longTimers.forEach(function(timer) {
        _origClearTimeout.call(window, timer.id);
        var newId = _origSetTimeout.call(window, timer.fn, timer.delay);
        refreshed.push({ id: newId, fn: timer.fn, delay: timer.delay });
      });
      _longTimers = refreshed;
    }, 180000);

    // ══════════════════════════════════════
    // LAYER 4: DETECTAR Y MANEJAR MODAL + AUTO-RECOVER
    // PROBLEMA: Click en OK redirige a página principal y se pierde la mesa.
    // SOLUCIÓN: Detectar el modal, guardar URL, y si salimos de la mesa, volver.
    // ══════════════════════════════════════
    var _modalDetected = false;
    var _recoverAttempts = 0;
    var _maxRecoverAttempts = 5;

    function detectSessionModal() {
      if (_modalDetected) return;
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3');

      // Español: "SESIÓN FINALIZADA"
      for (var i = 0; i < allEls.length; i++) {
        var txt = (allEls[i].textContent || '');
        if (txt.indexOf('SESI') !== -1 && txt.indexOf('FINALIZADA') !== -1) {
          console.log('[RollerWin] ⚠️ SESIÓN FINALIZADA detectada!');
          _modalDetected = true;
          _sessionLost = true;

          // Guardar URL del juego ANTES de que nos redirija
          if (location.href.indexOf('/casino/games/') !== -1) {
            _gameUrl = location.href;
            console.log('[RollerWin] URL de mesa guardada para auto-recover:', _gameUrl);
          }

          // NO hacer click en OK — eso redirige a la página principal.
          // En su lugar, intentar quitar el modal del DOM para que no moleste
          try {
            var modal = allEls[i].closest('[class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"], [class*="confirm"]');
            if (modal) {
              modal.style.display = 'none';
              console.log('[RollerWin] Modal ocultado (sin click en OK)');
            }
            // También ocultar overlay oscuro
            var overlays = document.querySelectorAll('[class*="overlay"], [class*="backdrop"]');
            for (var o = 0; o < overlays.length; o++) {
              if (overlays[o].style.display !== 'none') {
                overlays[o].style.display = 'none';
              }
            }
          } catch(e) {}

          // Intentar refrescar la sesión con un fetch inmediato
          jwtKeepAlive();
          invisibleActivity();

          setTimeout(function() { _modalDetected = false; }, 30000);
          return true;
        }
      }

      // Inglés: "session expired" / "session ended"
      for (var i2 = 0; i2 < allEls.length; i2++) {
        var t = ((allEls[i2].textContent || '').toLowerCase());
        if ((t.indexOf('session') !== -1 && t.indexOf('expired') !== -1) ||
            (t.indexOf('session') !== -1 && t.indexOf('ended') !== -1)) {
          console.log('[RollerWin] ⚠️ Session expired (EN) detectado!');
          _modalDetected = true;
          _sessionLost = true;
          _gameUrl = location.href;
          // Mismo manejo: ocultar modal, no hacer click
          try {
            var m = allEls[i2].closest('[class*="modal"], [class*="dialog"], [class*="popup"], [class*="overlay"]');
            if (m) m.style.display = 'none';
          } catch(e) {}
          setTimeout(function() { _modalDetected = false; }, 30000);
          return true;
        }
      }
      return false;
    }

    setInterval(detectSessionModal, 3000);
    try {
      new MutationObserver(function() { detectSessionModal(); }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}

    // ══════════════════════════════════════
    // LAYER 5: AUTO-RECOVER — Si salimos de la mesa, volver automáticamente
    // Monitorea la URL y si ya no estamos en la mesa, redirige de vuelta.
    // ══════════════════════════════════════
    function autoRecover() {
      // Si no tenemos URL de juego guardada, nada que hacer
      if (!_gameUrl || _gameUrl.indexOf('/casino/games/') === -1) return;

      // Si estamos en la mesa, todo bien
      var currentUrl = location.href;
      if (currentUrl.indexOf('/casino/games/') !== -1) {
        // Estamos de vuelta en la mesa, resetear contador
        _recoverAttempts = 0;
        return;
      }

      // Si la sesión no se perdió, no recuperar
      if (!_sessionLost) return;

      // Si ya intentamos demasiadas veces, parar
      if (_recoverAttempts >= _maxRecoverAttempts) {
        console.log('[RollerWin] Auto-recover: max intentos alcanzados (' + _maxRecoverAttempts + ')');
        return;
      }

      // Estamos fuera de la mesa y la sesión se perdió → volver
      _recoverAttempts++;
      console.log('[RollerWin] 🔄 Auto-recover #' + _recoverAttempts + ': volviendo a mesa...');
      console.log('[RollerWin] URL destino:', _gameUrl);

      // Intentar navegar de vuelta usando history.back primero
      // (el modal de sesión podría haber hecho un pushState)
      setTimeout(function() {
        if (location.href.indexOf('/casino/games/') !== -1) return; // Ya volvimos

        // Si history.back no funciona, navegar directamente
        console.log('[RollerWin] Navegando a:', _gameUrl);
        location.href = _gameUrl;
      }, 2000);

      // Darle tiempo y si no funciona, intentar location.href directo
      setTimeout(function() {
        if (location.href.indexOf('/casino/games/') !== -1) return; // Ya volvimos
        console.log('[RollerWin] Reintentando con location.href...');
        location.href = _gameUrl;
      }, 8000);
    }

    // Checkear cada 10 segundos si necesitamos recuperar
    setInterval(autoRecover, 10000);

    // También detectar cuando no hay capturas por mucho tiempo (2+ minutos)
    // Esto puede indicar que el iframe de Evolution se desconectó
    setInterval(function() {
      var noCaptureMs = Date.now() - _lastCaptureTime;
      if (noCaptureMs > 120000 && _gameUrl && _gameUrl.indexOf('/casino/games/') !== -1) {
        console.log('[RollerWin] ⚠️ Sin capturas por ' + Math.round(noCaptureMs/1000) + 's — posible desconexión del iframe');
        // Si no hay capturas, intentar refrescar la página para reconectar
        // Solo si la sesión sigue activa
        if (!_sessionLost) {
          console.log('[RollerWin] Recargando página para reconectar iframe...');
          location.reload();
        }
      }
    }, 60000);

    // ══════════════════════════════════════
    // LAYER 6: VISIBILITY + FOCUS
    // ══════════════════════════════════════
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        invisibleActivity();
        jwtKeepAlive();
        if (_sessionLost) {
          console.log('[RollerWin] Usuario volvió con sesión perdida — intentando recover...');
          setTimeout(autoRecover, 3000);
        }
      }
    });

    // Focus en la ventana (usuario vuelve a la pestaña)
    window.addEventListener('focus', function() {
      invisibleActivity();
    });

    console.log('[RollerWin] v4.7 ULTRA KEEP-ALIVE activo: 6 capas de protección');
    console.log('[RollerWin] Mesa guardada:', _gameUrl);

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

  console.log('[RollerWin] v4.7 MOTOR ACTIVO en IFRAME ' + hostname + ' | Dedup: 5s mismo numero');
})();
