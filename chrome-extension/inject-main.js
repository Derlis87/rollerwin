// RollerWin Capture v6.0 - MAIN WORLD DETECTION ENGINE
// SOLO detecta numeros desde iframes (donde corre Evolution)
// El parent page SOLO retransmite lo que llega via postMessage desde iframes
// FIX v5.0: DOM Scanner capturaba numeros del historial (circulos viejos)
// FIX v5.1: extractObj toma ULTIMO elemento, regex ultimo match, excluye URLs historial
// FIX v5.2: Buffer GLOBAL eliminado — bloqueaba repeticiones legitimas de ruleta
// FIX v6.0: AUTO-RECOVERY COMPLETO reescrito:
//   - Persistencia en localStorage (sobrevive recargas de pagina)
//   - Busqueda de botones ampliada (div/span/a/button, no solo button)
//   - Deteccion de sesion expirada via keep-alive 401/403
//   - checkPlayButton SIEMPRE activo (no depende de _recovering)
//   - Click OK primero, esperar cierre, luego navegar
//   - Deteccion de pagina "Jugar" sin depender de estado
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

    // Cooldown: evitar multiples detecciones del MISMO giro.
    // 5s es suficiente: WS/Fetch/XHR/DOM detectan el mismo numero casi al mismo tiempo.
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
    // ║  v6.0: AUTO-RECOVERY COMPLETO                                  ║
    // ║                                                                ║
    // ║  Cuando Betfury muestra "SESIÓN FINALIZADA":                   ║
    // ║  1. Click OK para cerrar el modal (busca button/div/span/a)     ║
    // ║  2. Esperar 1.5s para que el modal se cierre                   ║
    // ║  3. Navegar a la mesa de ruleta                                ║
    // ║  4. Si hay botón "Jugar" → click automático                   ║
    // ║  5. El iframe carga y captura resume                           ║
    // ║                                                                ║
    // ║  Estado persistido en localStorage (sobrevive recargas)         ║
    // ║  Keep-alive detecta 401/403 = sesión expirada                  ║
    // ║  checkPlayButton SIEMPRE activo (no depende de estado)          ║
    // ╚══════════════════════════════════════════════════════════════════╝

    var _keepAliveCount = 0;
    var _lastCaptureTime = Date.now();
    var _lastKeepAliveResponse = 'pending';

    // URL directa de la mesa de Evolution Live Roulette
    var ROULETTE_URL = 'https://betfury.com/es/casino/games/roulette-live-by-evolution';

    // ═══ PERSISTENCIA en localStorage ═══
    // El estado de recovery sobrevive recargas de pagina
    var RW_LS_KEY = 'rollerwin_recovery_v6';
    var _rwState = JSON.parse(localStorage.getItem(RW_LS_KEY) || '{}');
    var _recoverCount = _rwState.recoverCount || 0;
    var _isRecovering = !!_rwState.isRecovering;
    var _sessionExpired = !!_rwState.sessionExpired;
    var _lastCapturePersisted = _rwState.lastCaptureTime || Date.now();

    function _saveState() {
      try {
        localStorage.setItem(RW_LS_KEY, JSON.stringify({
          recoverCount: _recoverCount,
          isRecovering: _isRecovering,
          sessionExpired: _sessionExpired,
          lastCaptureTime: _lastCapturePersisted,
          gameUrl: _gameUrl,
          timestamp: Date.now()
        }));
      } catch(e) {}
    }
    _saveState();

    // Guardar la URL de la mesa actual
    var _gameUrl = _rwState.gameUrl || location.href;
    var _pushStateOrig = history.pushState;
    var _replaceStateOrig = history.replaceState;
    if (history.pushState) {
      history.pushState = function() {
        var result = _pushStateOrig.apply(this, arguments);
        if (location.href.indexOf('/casino/games/') !== -1) { _gameUrl = location.href; _saveState(); }
        return result;
      };
    }
    if (history.replaceState) {
      history.replaceState = function() {
        var result = _replaceStateOrig.apply(this, arguments);
        if (location.href.indexOf('/casino/games/') !== -1) { _gameUrl = location.href; _saveState(); }
        return result;
      };
    }
    setInterval(function() {
      if (location.href.indexOf('/casino/games/') !== -1 && _gameUrl !== location.href) {
        _gameUrl = location.href;
        _saveState();
      }
    }, 10000);

    // Recibir timestamp de última captura
    document.addEventListener('rw-number', function() {
      _lastCaptureTime = Date.now();
      _lastCapturePersisted = _lastCaptureTime;
      _isRecovering = false;
      _sessionExpired = false;
      _saveState();
    });

    // ════════════════════════════════════════════════════════
    // 1. KEEP-ALIVE: Fetch reales + deteccion de sesion expirada
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
        // DETECTAR sesion expirada por keep-alive (401/403)
        if (r.status === 401 || r.status === 403) {
          console.log('[RollerWin] Keep-alive ' + r.status + ' — SESION EXPIRADA detectada via API!');
          _sessionExpired = true;
          _saveState();
          // Forzar recovery inmediato
          setTimeout(function() { triggerFullRecovery('keepalive-' + r.status); }, 500);
        }
      }).catch(function() {});
    }
    setTimeout(betfuryKeepAlive, 3000);
    setInterval(betfuryKeepAlive, 300000); // cada 5 min
    setInterval(betfuryKeepAlive, 120000); // tambien cada 2 min (mas agresivo)

    // ════════════════════════════════════════════════════════
    // 2. BUSQUEDA AMPLIA de botones (button/div/span/a)
    // ════════════════════════════════════════════════════════
    function clickAnyButtonByText(texts) {
      // Buscar en TODOS los elementos clicables, no solo <button>
      var selectors = 'button, a, [role="button"], div[onclick], span[onclick], [class*="btn"], [class*="button"]';
      var allBtns = document.querySelectorAll(selectors);
      for (var i = 0; i < allBtns.length; i++) {
        var el = allBtns[i];
        var bt = (el.textContent || '').trim();
        for (var j = 0; j < texts.length; j++) {
          if (bt === texts[j]) {
            console.log('[RollerWin] Click boton [' + el.tagName.toLowerCase() + ']: "' + bt + '"');
            el.click();
            return true;
          }
        }
      }
      // Fallback: buscar elementos con texto exacto que tengan cursor pointer
      var allEls = document.querySelectorAll('div, span, a');
      for (var i = 0; i < allEls.length; i++) {
        var el = allEls[i];
        var bt = (el.textContent || '').trim();
        if (bt.length > 0 && bt.length <= 20) {
          var style = window.getComputedStyle(el);
          if (style.cursor === 'pointer' || el.getAttribute('role') === 'button') {
            for (var j = 0; j < texts.length; j++) {
              if (bt === texts[j]) {
                console.log('[RollerWin] Click fallback [' + el.tagName.toLowerCase() + ']: "' + bt + '"');
                el.click();
                return true;
              }
            }
          }
        }
      }
      return false;
    }

    // ════════════════════════════════════════════════════════
    // 3. FULL RECOVERY: Detectar + OK + Esperar + Navegar
    // ════════════════════════════════════════════════════════
    var _recoveryInProgress = false;

    function triggerFullRecovery(reason) {
      if (_recoveryInProgress) return;
      _recoveryInProgress = true;
      _isRecovering = true;
      _recoverCount++;
      _saveState();

      console.log('[RollerWin] FULL RECOVERY #' + _recoverCount + ' (razon: ' + reason + ')');

      // PASO 1: Buscar y cerrar modal de sesion expirada
      var foundModal = false;
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3');
      for (var i = 0; i < allEls.length; i++) {
        var txt = (allEls[i].textContent || '');
        var txtLow = txt.toLowerCase();
        var isExpired = (txt.indexOf('SESI') !== -1 && txt.indexOf('FINALIZADA') !== -1) ||
                        (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('expired') !== -1 || txtLow.indexOf('ended') !== -1));
        if (isExpired) {
          foundModal = true;
          console.log('[RollerWin] Modal sesion expirada detectado');
          break;
        }
      }

      if (foundModal) {
        // Click en OK con busqueda amplia
        var okClicked = clickAnyButtonByText(['OK', 'Ok', 'ok', 'Aceptar', 'Accept', 'ACEPTAR']);
        console.log('[RollerWin] Click OK: ' + (okClicked ? 'EXITOSO' : 'NO ENCONTRADO'));

        // Esperar 1.5s para que el modal se cierre ANTES de navegar
        setTimeout(function() {
          navigateToGame(reason);
        }, 1500);
      } else {
        // No hay modal visible pero la sesion expiro — navegar directo
        console.log('[RollerWin] Sin modal visible — navegando directo...');
        navigateToGame(reason);
      }
    }

    function navigateToGame(reason) {
      var targetUrl = ROULETTE_URL;
      if (_gameUrl && _gameUrl.indexOf('/casino/games/') !== -1 && _gameUrl.indexOf('roulette') !== -1) {
        targetUrl = _gameUrl;
      }

      console.log('[RollerWin] Navegando a mesa: ' + targetUrl + ' (razon: ' + reason + ')');
      _recoveryInProgress = false;
      location.href = targetUrl;
    }

    // Detector de modal cada 2s
    function detectExpiredModal() {
      if (_recoveryInProgress) return false;
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3');
      for (var i = 0; i < allEls.length; i++) {
        var txt = (allEls[i].textContent || '');
        var txtLow = txt.toLowerCase();
        var isExpired = (txt.indexOf('SESI') !== -1 && txt.indexOf('FINALIZADA') !== -1) ||
                        (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('expired') !== -1 || txtLow.indexOf('ended') !== -1));
        if (isExpired) {
          triggerFullRecovery('modal-detect');
          return true;
        }
      }
      return false;
    }

    setInterval(detectExpiredModal, 2000);
    try {
      new MutationObserver(function() { detectExpiredModal(); }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}

    // ════════════════════════════════════════════════════════
    // 4. CLICK AUTOMÁTICO en botón "Jugar" — SIEMPRE ACTIVO
    // Ya NO depende de _isRecovering. Siempre busca el boton
    // "Jugar" cuando estamos en la pagina del juego (preview)
    // ════════════════════════════════════════════════════════
    var _playButtonCooldown = 0;

    function checkPlayButton() {
      if (_playButtonCooldown > Date.now()) return false;
      var onGamePage = location.href.indexOf('/casino/games/') !== -1;
      if (!onGamePage) return false;

      // Buscar boton Jugar/Play en TODOS los elementos clicables
      var btns = document.querySelectorAll('button, a, [role="button"], div[onclick], [class*="btn"], [class*="button"]');
      for (var i = 0; i < btns.length; i++) {
        var bt = (btns[i].textContent || '').trim().toLowerCase();
        if (bt === 'jugar' || bt === 'play' || bt === 'play now' || bt === 'spin' || bt === 'start') {
          console.log('[RollerWin] Boton JUGAR encontrado [' + btns[i].tagName.toLowerCase() + '] — click!');
          btns[i].click();
          _playButtonCooldown = Date.now() + 10000; // Cooldown 10s para no hacer click repetido
          _isRecovering = true;
          _saveState();
          return true;
        }
      }
      return false;
    }

    setInterval(checkPlayButton, 2000);

    // ════════════════════════════════════════════════════════
    // 5. IFRAME MUERTO: sin capturas >60s → reload
    // ════════════════════════════════════════════════════════
    setInterval(function() {
      var noCap = Date.now() - _lastCaptureTime;
      var onGame = location.href.indexOf('/casino/games/') !== -1;

      // Si estamos en la pagina del juego y no hay capturas en 60s
      if (onGame && noCap > 60000 && !_recoveryInProgress) {
        console.log('[RollerWin] Sin capturas ' + Math.round(noCap/1000) + 's — reload...');
        _isRecovering = true;
        _saveState();
        location.reload();
      }
    }, 15000);

    // ════════════════════════════════════════════════════════
    // 6. DETECCIÓN AL CARGAR: ya venimos de un recovery?
    // ════════════════════════════════════════════════════════
    setTimeout(function() {
      // Si venimos de un recovery y estamos en la pagina del juego
      if (_isRecovering || _sessionExpired || _recoverCount > 0) {
        console.log('[RollerWin] Post-load check: recovering=' + _isRecovering +
          ' expired=' + _sessionExpired + ' count=' + _recoverCount);

        // Si NO estamos en la pagina de juego → ir a la mesa
        if (location.href.indexOf('/casino/games/') === -1) {
          console.log('[RollerWin] No en pagina de juego — navegando a mesa...');
          setTimeout(function() { navigateToGame('post-load-redirect'); }, 1000);
          return;
        }

        // Si estamos en la pagina de juego pero no hay iframe de Evolution
        setTimeout(function() {
          var iframes = document.querySelectorAll('iframe');
          var hasEvolution = false;
          for (var i = 0; i < iframes.length; i++) {
            if (iframes[i].src && (iframes[i].src.indexOf('evolution') !== -1 ||
                iframes[i].src.indexOf('livecasino') !== -1)) {
              hasEvolution = true;
              break;
            }
          }
          if (!hasEvolution) {
            console.log('[RollerWin] Sin iframe Evolution — buscando boton Jugar...');
            checkPlayButton();
          } else {
            console.log('[RollerWin] Iframe Evolution detectado — captura deberia reanudarse');
            _isRecovering = false;
            _sessionExpired = false;
            _saveState();
          }
        }, 3000); // Esperar 3s a que cargue el iframe
      }
    }, 1000);

    // ════════════════════════════════════════════════════════
    // 7. VISIBILITY + FOCUS
    // ════════════════════════════════════════════════════════
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        betfuryKeepAlive();
        // Si no estamos en la pagina de juego pero ya tuvimos capturas antes
        if (location.href.indexOf('/casino/games/') === -1 && _recoverCount > 0) {
          console.log('[RollerWin] Tab visible, no en juego — volviendo a mesa...');
          navigateToGame('visibility');
        }
        // Si estamos en la pagina de juego, verificar que el iframe este vivo
        if (location.href.indexOf('/casino/games/') !== -1) {
          setTimeout(checkPlayButton, 1000);
        }
      }
    });

    window.addEventListener('focus', function() {
      betfuryKeepAlive();
      // Verificar boton Jugar cuando el tab recibe foco
      if (location.href.indexOf('/casino/games/') !== -1) {
        setTimeout(checkPlayButton, 500);
      }
    });

    // ════════════════════════════════════════════════════════
    // 8. REPORTAR estado al content script
    // ════════════════════════════════════════════════════════
    setInterval(function() {
      try {
        document.dispatchEvent(new CustomEvent('rw-status', {
          detail: {
            status: _isRecovering ? 'recovering' : 'alive',
            keepAliveCount: _keepAliveCount,
            lastResponse: _lastKeepAliveResponse,
            noCaptureSec: Math.round((Date.now() - _lastCaptureTime) / 1000),
            recoverCount: _recoverCount,
            sessionExpired: _sessionExpired,
            gameUrl: _gameUrl
          }
        }));
      } catch(e) {}
    }, 10000);

    console.log('[RollerWin] v6.0 AUTO-RECOVERY | Mesa:', ROULETTE_URL, '| RecoverCount:', _recoverCount);

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
    if (!obj || typeof obj !== 'object' || depth > 4) return;

    if (Array.isArray(obj)) {
      // FIX v5.0.1: Solo procesar arrays que representen UN resultado (length 1)
      // o tomar el ULTIMO elemento (mas reciente, no el mas viejo como antes).
      // Ignorar arrays largos que son claramente historial (length > 5).
      if (obj.length === 0) return;
      if (obj.length > 5) return; // Historial = mas de 5 resultados, ignorar

      var pathLow = path.toLowerCase();
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0) {
        // Tomar el ULTIMO elemento (resultado mas reciente)
        var last = obj[obj.length - 1];
        var n = tryNum(last);
        if (n !== null) { sendToServer(n, 'array@' + path); return; }
        if (typeof last === 'object') extractObj(last, depth + 1, path + '[' + (obj.length-1) + ']');
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
  // FIX v5.0.1: Solo tomar el ULTIMO match (resultado mas reciente, no historial)
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
      var m; patterns[i].lastIndex = 0;
      while ((m = patterns[i].exec(text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) lastMatch = n;
      }
    }
    // Solo enviar el ULTIMO match encontrado (resultado mas reciente)
    if (lastMatch !== null) sendToServer(lastMatch, 'regex-last@' + source);
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
                // FIX v5.0.1: Solo eventos de resultado NUEVO, no updates/states con historial
                if (evt.indexOf('result') >= 0 || evt.indexOf('complete') >= 0 ||
                    evt.indexOf('win') >= 0 ||
                    evt.indexOf('round') >= 0 || evt.indexOf('spin') >= 0) {
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
      // FIX v5.0.1: Excluir URLs de historial y estado — solo procesar resultados
      if (urlLow.indexOf('result') >= 0 ||
          urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
          urlLow.indexOf('round') >= 0 || urlLow.indexOf('wheel') >= 0) {
        // EXCLUIR: URLs que contienen history o state (son datos historicos, no resultado actual)
        if (urlLow.indexOf('history') >= 0 || urlLow.indexOf('state') >= 0 || urlLow.indexOf('stats') >= 0) {
          return promise; // No procesar — es historial
        }

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
        // FIX v5.0.1: Excluir historial y estado
        if (u.indexOf('result') >= 0 ||
            u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0 ||
            u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0) {
          if (u.indexOf('history') >= 0 || u.indexOf('state') >= 0 || u.indexOf('stats') >= 0) return;
          try {
            var t = self.responseText;
            if (t) { try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {} extractFromText(t, 'xhr'); }
          } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // ══════════════════════════════════════════════════════
  // DOM SCANNER v5.0 — ULTRA ESTRICTO
  // ════════════════════════════════════════════════════════
  // PROBLEMA V4.9: Los selectores de history/past/track/circle capturaban
  // numeros VIEJOS del display de Evolution, no el resultado actual.
  // SOLUCION: Solo buscar el resultado ACTUAL mostrado en pantalla,
  // nunca historial. + buffer de ultimos 15 numeros para rechazar repetidos.
  // ════════════════════════════════════════════════════════
  (function() {
    // Palabras clave que indican HISTORIAL — NUNCA capturar de estos elementos
    var HISTORY_KEYWORDS = ['history','past','track','sequence','previous','older','last-result',
      'lastresults','gamehistory','result-history','historyitem','resultshistory',
      'bng','stats','statistics','roadmap','bigroad','beadroad','marker'];

    // Palabras clave que indican el RESULTADO ACTUAL — SOLO capturar de estos
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
      // Tambien excluir elementos dentro de un contenedor de historial
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

    function isCurrentElement(el) {
      if (!el) return false;
      var c = ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-test') || '')).toLowerCase();
      for (var i = 0; i < CURRENT_KEYWORDS.length; i++) {
        if (c.indexOf(CURRENT_KEYWORDS[i]) >= 0) return true;
      }
      // data attributes especificos de resultado actual
      if (el.hasAttribute('data-result-number') || el.hasAttribute('data-winning-number') ||
          el.hasAttribute('data-game-result')) return true;
      return false;
    }

    // Solo selectores que apuntan al RESULTADO ACTUAL, nunca historial
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

    function scanDOM() {
      for (var i = 0; i < STRICT_SELECTORS.length; i++) {
        try {
          var els = document.querySelectorAll(STRICT_SELECTORS[i]);
          for (var j = 0; j < els.length; j++) {
            // DOBLE FILTRO: debe ser un elemento de resultado actual Y no estar en historial
            if (isHistoryElement(els[j])) continue;
            if (!isCurrentElement(els[j]) && !els[j].hasAttribute('data-result-number') &&
                !els[j].hasAttribute('data-winning-number')) continue;

            var text = (els[j].textContent || '').trim();
            var num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
              sendToServer(num, 'DOM-v5:' + STRICT_SELECTORS[i]);
              return; // Solo capturar el primer match valido
            }
          }
        } catch(e) {}
      }
    }

    function setup() {
      if (!document.body) return;
      // Escaneo inicial retrasado
      setTimeout(scanDOM, 3000);

      // MutationObserver con debounce de 2s (menos agresivo que v4.9)
      var timer = null;
      new MutationObserver(function() {
        if (timer) return;
        timer = setTimeout(function() { timer = null; scanDOM(); }, 2000);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });

      // Scan periodico cada 8s (era 5s en v4.9)
      setInterval(scanDOM, 8000);
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

  console.log('[RollerWin] v6.0 MOTOR ACTIVO en IFRAME ' + hostname + ' | Cooldown 5s + Extraccion estricta');
})();
