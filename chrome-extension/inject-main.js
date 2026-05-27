// RollerWin Capture v6.3 - MAIN WORLD DETECTION ENGINE
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
// FIX v6.3: TRIPLE DEDUP contra duplicados + RECOVERY:
//   - _lastSentNumber: bloquea mismo número consecutivo (sobrevive iframe reload)
//   - _DEDUP_WINDOW 15s: cubre ciclo completo de giro
//   - Sync parent↔iframe: el iframe recargado recibe el último número del parent
//   - Modal detect cada 400ms + MutationObserver instantaneo
//   - Boton Jugar cada 400ms
//   - Keep-alive intercept + navigate
//   - Post-load check a los 100ms
//   - Reload solo si sesion expirada + >90s sin capturas (safety net)
(function() {
  'use strict';

  if (window.__rwMainV4) return;
  window.__rwMainV4 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var lastNum = -1;
  var lastTime = 0;
  var sentCount = 0;

  // ═══ DEDUP v6.3: Triple protección contra duplicados ═══
  // Capa 1: _lastSentNumber — si el último número enviado fue X, jamás enviar X
  //         de nuevo hasta que se envíe un número diferente. Esto sobrevive
  //         a recargas del iframe porque cada nuevo contexto hereda el último
  //         número desde postMessage del parent.
  // Capa 2: Map<numero, timestamp> con ventana 15s — cubre todo el ciclo de
  //         un giro (~18s) para capturar detecciones retrasadas.
  // Capa 3: Server dedup (15s + secuencia) es el safety net final.
  // NOTA: Repeticiones legitimas consecutivas (ej: 26, 26) son bloqueadas.
  // Esto es CORRECTO para un sistema de predicción: un duplicado corrompe
  // toda la secuencia, mientras que un número faltante solo afecta 1 predicción.
  var _sentNumbers = {};   // { number: timestamp }
  var _DEDUP_WINDOW = 15000; // 15 segundos (cubre ciclo completo de giro ~18s)
  var _lastSentNumber = -1; // Capa 1: último número enviado por CUALQUIER hook

  function _isDuplicate(n) {
    // CAPA 1: Sequence dedup — jamás enviar el mismo número que el último enviado
    if (n === _lastSentNumber) {
      console.log('[RollerWin] SEQ-DUP: ' + n + ' bloqueado (mismo que último enviado)');
      return true;
    }
    // CAPA 2: Time-based dedup — bloquear si fue enviado en los últimos 15s
    var now = Date.now();
    var lastSent = _sentNumbers[n];
    if (lastSent !== undefined && now - lastSent < _DEDUP_WINDOW) {
      console.log('[RollerWin] TIME-DUP: ' + n + ' bloqueado (' + Math.round(now - lastSent) + 's ago)');
      return true;
    }
    return false;
  }

  function _markSent(n) {
    var now = Date.now();
    _sentNumbers[n] = now;
    _lastSentNumber = n; // Actualizar última número de la secuencia
    // Limpiar entradas viejas cada vez que se envia
    for (var num in _sentNumbers) {
      if (now - _sentNumbers[num] > _DEDUP_WINDOW) {
        delete _sentNumbers[num];
      }
    }
  }

  // Función para sincronizar _lastSentNumber desde el parent (sobrevive recargas de iframe)
  function syncLastNumber(n) {
    if (n >= 0 && n <= 36) {
      _lastSentNumber = n;
      console.log('[RollerWin] SYNC: _lastSentNumber = ' + n + ' (desde parent)');
    }
  }

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

    // DEDUP v6.1: Map de TODOS los numeros recientes (no solo lastNum).
    // Si el numero fue enviado en los ultimos 12s, es el mismo giro → bloquear.
    // Los giros duran ~18s, asi que 12s jamas bloquea repetidos legitimas.
    if (_isDuplicate(n)) {
      console.log('[RollerWin] DEDUP: ' + n + ' bloqueado (' + Math.round(now - _sentNumbers[n]) + 's ago) — ' + source);
      return;
    }

    _markSent(n);
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

    // v6.3: Guardar el último número recibido para sincronizar con iframes recargados
    var _parentLastNumber = -1;

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (data && data.source === 'rollerwin-capture' && typeof data.number === 'number') {
          console.log('[RollerWin] Recibido de iframe:', data.number, '(' + data.hostname + ')');
          _parentLastNumber = data.number; // Guardar para sincronizar iframes recargados
          // El iframe ya envio al servidor, no reenviar
          // Solo actualizar la UI del widget
          try {
            document.dispatchEvent(new CustomEvent('rw-number', {
              detail: { number: data.number, color: data.color }
            }));
          } catch(e) {}
        }
        // v6.3: Sincronizar _lastSentNumber con iframe que se recarga
        if (data && data.source === 'rollerwin-sync' && typeof data.lastNumber === 'number') {
          // El iframe pide sincronización — enviarle el último número
          try {
            window.postMessage({
              source: 'rollerwin-sync-reply',
              lastNumber: _parentLastNumber
            }, '*');
          } catch(e) {}
        }
      } catch(e) {}
    });

    // ╔══════════════════════════════════════════════════════════════════╗
    // ║  v6.2: AUTO-RECOVERY ULTRA-RAPIDO                              ║
    // ║  OBJETIVO: Recovery completo en <8 segundos                     ║
    // ║  (los giros duran ~18s, necesitamos volver antes del próximo)   ║
    // ║                                                                ║
    // ║  Cambios vs v6.1:                                               ║
    // ║  - Modal detect cada 400ms (era 1s) + MutationObserver          ║
    // ║  - Boton Jugar cada 400ms (era 1s)                             ║
    // ║  - Keep-alive 401/403 → navigate en 150ms (era 500ms)          ║
    // ║  - Post-load check a los 100ms (era 500ms)                     ║
    // ║  - Keep-alive cada 45s (era 60s)                               ║
    // ║  - Reload solo si sesion expirada + >90s sin capturas          ║
    // ║  - ELIMINADO: iframe reconnect (reiniciaba mesa con sesion OK)  ║
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
 recoveryTimestamp: _recoveryTimestamp,
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
    // v6.3 FIX: NO resetear estado de recovery durante una recuperación activa
    // Si el iframe envía un número mientras estamos recuperando, no debemos
    // cancelar la recuperación porque el número puede ser viejo (del iframe anterior)
    document.addEventListener('rw-number', function() {
      _lastCaptureTime = Date.now();
      _lastCapturePersisted = _lastCaptureTime;
      // Solo resetear recovery si NO estamos en recovery activo
      if (!_recoveryInProgress) {
        _isRecovering = false;
        _sessionExpired = false;
      }
      _saveState();
    });

    // ════════════════════════════════════════════════════════
    // 1. KEEP-ALIVE + DETECCION DE SESION
    //    v6.3 FIX: Detectar redirect a login (response.redirected + URL check)
    //    Betfury NO devuelve 401/403 — redirige a /login con status 200.
    //    La API fetch sigue redirects por defecto, así que response.redirected=true
    //    y response.url cambia a la URL de login.
    // ════════════════════════════════════════════════════════
    
    // Interceptar TODOS los fetch de la pagina principal para detectar sesion expirada
    var _origFetch = window.fetch;
    if (_origFetch && !_origFetch._rwKeepAlive) {
      _origFetch._rwKeepAlive = true;
      window.fetch = function(input, init) {
        var url = '';
        try { url = typeof input === 'string' ? input : (input && input.url ? input.url : ''); } catch(e) {}
        var promise = _origFetch.apply(this, arguments);
        if (promise && url) {
          promise.then(function(r) {
            // v6.3 FIX: Detectar redirect a login (Betfury redirige, no 401/403)
            if (r.redirected) {
              var respUrl = (r.url || '').toLowerCase();
              if (respUrl.indexOf('login') !== -1 || respUrl.indexOf('signin') !== -1 || respUrl.indexOf('auth') !== -1) {
                console.log('[RollerWin] Fetch REDIRIGIDO a login — SESION EXPIRADA!');
                _sessionExpired = true;
                _saveState();
                handleSessionExpired('fetch-redirect-' + respUrl);
                return;
              }
            }
            if (r.status === 401 || r.status === 403) {
              console.log('[RollerWin] Fetch interceptado ' + r.status + ' — SESION EXPIRADA!');
              _sessionExpired = true;
              _saveState();
              handleSessionExpired('fetch-intercept-' + r.status);
            }
          }).catch(function() {});
        }
        return promise;
      };
    }
    
    // Interceptar XHR tambien
    var _origXHROpen = XMLHttpRequest.prototype.open;
    var _origXHRSend = XMLHttpRequest.prototype.send;
    if (!_origXHRSend._rwKeepAlive) {
      _origXHRSend._rwKeepAlive = true;
      XMLHttpRequest.prototype.open = function(m, u) {
        this._rwUrl = String(u || '');
        return _origXHROpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        var self = this;
        this.addEventListener('load', function() {
          // v6.3 FIX: Detectar redirect via responseURL
          var respUrl = (self.responseURL || '').toLowerCase();
          if (respUrl.indexOf('login') !== -1 || respUrl.indexOf('signin') !== -1) {
            console.log('[RollerWin] XHR REDIRIGIDO a login — SESION EXPIRADA!');
            _sessionExpired = true;
            _saveState();
            handleSessionExpired('xhr-redirect-login');
            return;
          }
          if (self.status === 401 || self.status === 403) {
            console.log('[RollerWin] XHR interceptado ' + self.status + ' — SESION EXPIRADA!');
            _sessionExpired = true;
            _saveState();
            handleSessionExpired('xhr-intercept-' + self.status);
          }
        });
        return _origXHRSend.apply(this, arguments);
      };
    }

    // Keep-alive: fetch a la pagina actual para mantener la cookie activa
    // v6.3 FIX: Usar GET (no HEAD) para poder detectar redirect + contenido HTML de login
    function betfuryKeepAlive() {
      _keepAliveCount++;
      fetch(location.pathname || '/', {
        method: 'GET',
        credentials: 'include',
        redirect: 'follow'
      }).then(function(r) {
        _lastKeepAliveResponse = r.status;
        if (_keepAliveCount % 3 === 0) {
          console.log('[RollerWin] Keep-alive #' + _keepAliveCount + ' HTTP ' + r.status + (r.redirected ? ' (REDIRIGIDO a ' + r.url + ')' : ''));
        }
        // v6.3 FIX: Detectar redirect a login
        if (r.redirected) {
          var respUrl = (r.url || '').toLowerCase();
          if (respUrl.indexOf('login') !== -1 || respUrl.indexOf('signin') !== -1) {
            console.log('[RollerWin] Keep-alive REDIRIGIDO a login — SESION EXPIRADA!');
            _sessionExpired = true;
            _saveState();
            handleSessionExpired('keepalive-redirect');
            return;
          }
        }
        // v6.3 FIX: Detectar si la respuesta es HTML de login (sin redirect)
        // Algunas APIs retornan 200 con HTML de login embebido
        r.clone().text().then(function(text) {
          if (text && text.length < 5000 && text.indexOf('<') !== -1) {
            var textLow = text.toLowerCase();
            if ((textLow.indexOf('login') !== -1 || textLow.indexOf('sign in') !== -1) &&
                textLow.indexOf('password') !== -1) {
              console.log('[RollerWin] Keep-alive devolvió HTML de login — SESION EXPIRADA!');
              _sessionExpired = true;
              _saveState();
              handleSessionExpired('keepalive-html-login');
              return;
            }
          }
        }).catch(function() {});
        if (r.status === 401 || r.status === 403) {
          console.log('[RollerWin] Keep-alive ' + r.status + ' — SESION EXPIRADA!');
          _sessionExpired = true;
          _saveState();
          handleSessionExpired('keepalive-' + r.status);
        }
      }).catch(function(e) {
        console.log('[RollerWin] Keep-alive error:', e.message);
      });
    }
    setTimeout(betfuryKeepAlive, 1500);
    setInterval(betfuryKeepAlive, 30000); // cada 30s

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
    // 3. HANDLE SESSION EXPIRED — Flujo centralizado
    //    1) Click OK en el modal
    //    2) Esperar 500ms
    //    3) Navegar a la mesa de ruleta
    // ════════════════════════════════════════════════════════
    var _recoveryInProgress = false;
    // v6.3 FIX: Persistir recoveryTimestamp en localStorage para evitar loop infinito
    // Si no se persiste, al recargar la página se resetea a 0 y el cooldown de 10s no funciona
    var _recoveryTimestamp = _rwState.recoveryTimestamp || 0;

    function handleSessionExpired(reason) {
      if (_recoveryInProgress) return;
      var now = Date.now();
      // v6.3 FIX: Cooldown persistido — previene loop infinito entre paginas
      if (now - _recoveryTimestamp < 15000) return; // 15s cooldown (persistido en localStorage)
      
      _recoveryInProgress = true;
      _recoveryTimestamp = now;
      _isRecovering = true;
      _sessionExpired = true;
      _recoverCount++;
      _saveState();

      console.log('[RollerWin] RECOVERY #' + _recoverCount + ' iniciado (' + reason + ')');

      // PASO 1: Click OK en el modal si existe
      var clicked = clickAnyButtonByText(['OK', 'Ok', 'ok', 'ACEPTAR', 'Aceptar', 'aceptar', 'VOLVER', 'Volver', 'volver']);
      if (clicked) {
        console.log('[RollerWin] Click OK en modal — esperando 500ms...');
      }

      // PASO 2: Esperar 500ms y navegar
      setTimeout(function() {
        var targetUrl = ROULETTE_URL;
        if (_gameUrl && _gameUrl.indexOf('/casino/games/') !== -1 && _gameUrl.indexOf('roulette') !== -1) {
          targetUrl = _gameUrl;
        }
        console.log('[RollerWin] Navegando a mesa: ' + targetUrl);
        location.href = targetUrl;
      }, clicked ? 500 : 100);

      // PASO 3: Safety timeout — resetear despues de 25s
      // v6.3: Aumentado a 25s. Nota: este codigo es dead despues de location.href
      // (la pagina se descarga antes de que el timeout fuego). Pero sirve
      // por si la navegacion falla o se queda en la misma pagina (SPA).
      setTimeout(function() {
        console.log('[RollerWin] Reset recovery (safety timeout)');
        _recoveryInProgress = false;
        _saveState();
      }, 25000);
    }

    // ════════════════════════════════════════════════════════
    // 4. DETECT AND CLOSE ANY MODAL (sesion + saldo bajo)
    // ════════════════════════════════════════════════════════
    function detectAndCloseAnyModal() {
      // v6.3 FIX: NO bloquear si _recoveryInProgress —
      // necesitamos poder cerrar modales en CUALQUIER momento
      // v6.3 FIX: Selectores ampliados (dialog, section, article, etc.)
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');

      for (var i = 0; i < allEls.length; i++) {
        var txt = (allEls[i].textContent || '');
        var txtLow = txt.toLowerCase();

        // v6.3 FIX: SESIÓN FINALIZADA — case-insensitive para español también
        // Antes: txt.indexOf('SESI') fallaba si Betfury usaba "Sesión finalizada"
        var isExpired = (txtLow.indexOf('sesi') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
                        (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('expired') !== -1 || txtLow.indexOf('ended') !== -1)) ||
                        (txtLow.indexOf('sesión') !== -1 && txtLow.indexOf('finalizada') !== -1);
        if (isExpired) {
          console.log('[RollerWin] SESION FINALIZADA detectada → handleSessionExpired');
          handleSessionExpired('modal-sesion');
          return true;
        }

        // SALDO BAJO → solo cerrar modal, no navegar
        var isLowBalance = (txtLow.indexOf('saldo') !== -1 && txtLow.indexOf('bajo') !== -1) ||
                           (txtLow.indexOf('balance') !== -1 && txtLow.indexOf('low') !== -1) ||
                           (txtLow.indexOf('insufficient') !== -1 && txtLow.indexOf('balance') !== -1);
        if (isLowBalance) {
          if (clickAnyButtonByText(['CERRAR', 'Cerrar', 'cerrar', 'CLOSE', 'Close', 'OK', 'Ok', 'ok'])) {
            console.log('[RollerWin] Modal SALDO BAJO → CERRAR');
            return true;
          }
        }
      }
      return false;
    }

    setInterval(detectAndCloseAnyModal, 400); // v6.2: cada 400ms (era 1s)
    try {
      new MutationObserver(function() { detectAndCloseAnyModal(); }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}

    // ════════════════════════════════════════════════════════
    // 5. CLICK AUTOMÁTICO en botón "Jugar" — SIEMPRE ACTIVO
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
          _playButtonCooldown = Date.now() + 5000; // Cooldown 5s (era 10s)
          _isRecovering = true;
          _saveState();
          return true;
        }
      }
      return false;
    }

    setInterval(checkPlayButton, 400); // v6.2: cada 400ms (era 1s)

    // ════════════════════════════════════════════════════════
    // 6. IFRAME MUERTO: sin capturas >90s → reload COMPLETO
    //    v6.2 FIX: 90s (era 35s que reiniciaba con sesion activa)
    //    ESTO ES ULTIMO RECURSO — solo si el iframe esta completamente muerto.
    //    El recovery normal se activa por: keep-alive 401/403 o modal sesion.
    //    NO debe reiniciar si la sesion esta activa y simplemente no captura.
    // ════════════════════════════════════════════════════════
    setInterval(function() {
      var noCap = Date.now() - _lastCaptureTime;
      var onGame = location.href.indexOf('/casino/games/') !== -1;

      // Solo reload si estamos en juego Y sin capturas >90s Y sesion expirada
      if (onGame && noCap > 90000 && !_recoveryInProgress && (_sessionExpired || _keepAliveCount === 0)) {
        console.log('[RollerWin] Sin capturas ' + Math.round(noCap/1000) + 's + sesion expirada — reload completo...');
        _isRecovering = true;
        _saveState();
        location.reload();
      }
    }, 10000); // check cada 10s

    // ════════════════════════════════════════════════════════
    // 6b. DETECCIÓN AL CARGAR: ya venimos de un recovery?
    //     v6.2: Ejecutar a los 100ms (era 500ms)
    // ════════════════════════════════════════════════════════
    setTimeout(function() {
      if (_isRecovering || _sessionExpired || _recoverCount > 0) {
        console.log('[RollerWin] Post-load: recovering=' + _isRecovering +
          ' expired=' + _sessionExpired + ' count=' + _recoverCount);

        if (location.href.indexOf('/casino/games/') === -1) {
          console.log('[RollerWin] No en pagina de juego — navegando...');
          handleSessionExpired('post-load-redirect');
          return;
        }

        // Click Jugar inmediato + cerrar modales
        console.log('[RollerWin] En pagina de juego — click Jugar + cerrar modales...');
        checkPlayButton();
        detectAndCloseAnyModal();
        
        // Segundo intento mas rapido (v6.2: 600ms era 1500ms)
        setTimeout(function() {
          checkPlayButton();
          detectAndCloseAnyModal();
        }, 600);
        
        // Tercer intento (v6.2: nuevo)
        setTimeout(function() {
          checkPlayButton();
          detectAndCloseAnyModal();
        }, 1200);
      }
    }, 100); // v6.2: ejecutar a los 100ms (era 500ms)

    // ════════════════════════════════════════════════════════
    // 7. VISIBILITY + FOCUS
    // ════════════════════════════════════════════════════════
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        betfuryKeepAlive();
        if (location.href.indexOf('/casino/games/') === -1 && _recoverCount > 0) {
          handleSessionExpired('visibility');
        }
        if (location.href.indexOf('/casino/games/') !== -1) {
          checkPlayButton();
          detectAndCloseAnyModal();
        }
      }
    });

    window.addEventListener('focus', function() {
      betfuryKeepAlive();
      if (location.href.indexOf('/casino/games/') !== -1) {
        checkPlayButton();
        detectAndCloseAnyModal();
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

    console.log('[RollerWin] v6.3 TRIPLE-DEDUP + AUTO-RECOVERY | Mesa:', ROULETTE_URL, '| Count:', _recoverCount);

  }

  // ══════════════════════════════════════
  // ============ IFRAME (Evolution) ======
  // AQUI es donde se detectan los numeros
  // ══════════════════════════════════════
  console.log('[RollerWin] IFRAME detectado:', hostname, '— activando deteccion');

  // v6.3: Solicitar sincronización del último número al parent
  // Esto previene que el DOM Scanner re-envíe el último resultado
  // después de una recarga del iframe
  try {
    window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
    window.addEventListener('message', function syncHandler(e) {
      try {
        if (e.data && e.data.source === 'rollerwin-sync-reply' && typeof e.data.lastNumber === 'number') {
          syncLastNumber(e.data.lastNumber);
          window.removeEventListener('message', syncHandler);
        }
      } catch(err) {}
    });
    // Timeout: si no hay respuesta en 2s, continuar sin sync
    setTimeout(function() {
      window.removeEventListener('message', syncHandler);
    }, 2000);
  } catch(e) {}
  // Re-solicitar sync cada 30s (por si el parent también recarga)
  setInterval(function() {
    try {
      window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
    } catch(e) {}
  }, 30000);

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

    // v6.2 FIX: Track last DOM number to prevent re-sending same number
    // The DOM display shows the same number until the next spin.
    // Without this, the 8s DOM scan interval would re-send the same number.
    var _lastDomNumber = -1;

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
              // SOLO enviar si el numero CAMBIO desde la ultima vez que lo vimos en el DOM
              if (num === _lastDomNumber) return; // Mismo numero, ya fue enviado
              _lastDomNumber = num;
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

  console.log('[RollerWin] v6.2 MOTOR ACTIVO en IFRAME ' + hostname + ' | Cooldown 5s + Extraccion estricta');
})();
