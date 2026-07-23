// RollerWin Capture v10.0 - MAIN WORLD DETECTION ENGINE
// Motor basado en v7.6 PROBADO Y FUNCIONAL
// v10.0: Agregado filtro de 4 mesas autorizadas
//
// ARQUITECTURA CLAVE (porque v7.6 funcionaba y v9.x no):
// - Los numeros se detectan DENTRO del IFRAME (donde corre Evolution/Pragmatic)
// - El parent page SOLO recibe via postMessage desde iframes (NO captura directamente)
// - Hooks de WS/Fetch/XHR/DOM SOLO se activan en iframes
// - El parent SOLO hace: keep-alive, recovery, modal detection
(function() {
  'use strict';

  if (window.__rwMainV10) return;
  window.__rwMainV10 = true;

  var SERVER = 'https://rollerwin3.onrender.com';

  // v10.0: 4 mesas autorizadas
  var ALLOWED_TABLES = [
    'betfury.com/es/casino/games/roulette-azure-by-pragmatic-play',
    'betfury.com/es/casino/games/roulette-live-by-evolution',
    'casino.pinnacle.com/es/live-casino/games/roulette-azure/',
    'casino.pinnacle.com/es/live-casino/games/european-roulette/'
  ];

  // Verificar si la TAB actual (parent) es una pagina de ruleta autorizada
  function isAllowedTable() {
    try {
      var tabUrl = (window.top !== window.self)
        ? (document.referrer || '')
        : location.href;
      // Para iframes, no podemos acceder a la URL del parent directamente
      // El filtro se aplica en el parent. En iframes, siempre activamos deteccion.
      if (window.top !== window.self) return true;
      // Permitir cualquier pagina de ruleta en los dominios autorizados
      if (tabUrl.indexOf('roulette') >= 0 && (
          tabUrl.indexOf('betfury.com') >= 0 ||
          tabUrl.indexOf('betfury.io') >= 0 ||
          tabUrl.indexOf('pinnacle.com') >= 0
      )) return true;
      return false;
    } catch(e) {
      // Cross-origin: estamos en iframe, activar deteccion
      return true;
    }
  }

  // Si NO es una mesa autorizada y NO es iframe, no hacer nada
  if (!isAllowedTable() && window.top === window.self) {
    console.log('[RollerWin] v10.0: Tab no es mesa autorizada, omitiendo');
    return;
  }

  var lastNum = -1;
  var lastTime = 0;
  var sentCount = 0;

  // ═══ DEDUP por TIEMPO — 100% fiel a la secuencia real ═══
  var _lastSentTimestamp = 0;
  var _DEDUP_WINDOW = 9000;  // 9s
  var _sentNumbersSet = {};

  function _isDuplicate(n) {
    var now = Date.now();
    if (now - _lastSentTimestamp < _DEDUP_WINDOW) {
      console.log('[RollerWin] DUP: ' + n + ' bloqueado (ultimo envio hace ' + Math.round(now - _lastSentTimestamp) + 's)');
      return true;
    }
    return false;
  }

  function _markSent(n) {
    var now = Date.now();
    _lastSentTimestamp = now;
    _sentNumbersSet[n] = now;
    for (var num in _sentNumbersSet) {
      if (now - _sentNumbersSet[num] > _DEDUP_WINDOW + 5000) {
        delete _sentNumbersSet[num];
      }
    }
  }

  // Sincronizar desde el parent (sobrevive recargas de iframe)
  // v7.6 FIX: NO setear _lastSentTimestamp!
  function syncLastNumber(n) {
    if (n >= 0 && n <= 36) {
      _sentNumbersSet[n] = Date.now();
      console.log('[RollerWin] SYNC: numero ' + n + ' marcado como enviado');
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

    if (_isDuplicate(n)) {
      console.log('[RollerWin] DEDUP: ' + n + ' bloqueado — ' + source);
      return;
    }

    // DEDUP por SECUENCIA — previene re-envio post-recovery
    if (typeof _checkSequenceDup === 'function' && _checkSequenceDup(n)) {
      console.log('[RollerWin] DEDUP-SEQ: ' + n + ' bloqueado (en secuencia) — ' + source);
      return;
    }

    _markSent(n);
    if (typeof _addSequence === 'function') _addSequence(n);
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

    var _parentLastNumber = -1;

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (data && data.source === 'rollerwin-capture' && typeof data.number === 'number') {
          console.log('[RollerWin] Recibido de iframe:', data.number, '(' + data.hostname + ')');
          _parentLastNumber = data.number;
          try {
            document.dispatchEvent(new CustomEvent('rw-number', {
              detail: { number: data.number, color: data.color }
            }));
          } catch(e) {}
        }
        // Sincronizar con iframe que se recarga
        if (data && data.source === 'rollerwin-sync' && typeof data.lastNumber === 'number') {
          try {
            window.postMessage({
              source: 'rollerwin-sync-reply',
              lastNumber: _parentLastNumber
            }, '*');
          } catch(e) {}
        }
      } catch(e) {}
    });

    // v6.2: AUTO-RECOVERY
    var _keepAliveCount = 0;
    var _lastCaptureTime = Date.now();
    var _lastKeepAliveResponse = 'pending';

    // v10.0: URL de la mesa actual para recovery
    var ROULETTE_URL = 'https://betfury.com/es/casino/games/roulette-live-by-evolution';
    var _isPinnacle = (location.hostname || '').indexOf('pinnacle') >= 0;
    if (_isPinnacle) {
      ROULETTE_URL = 'https://casino.pinnacle.com/es/live-casino/games/european-roulette/';
    }

    // Determinar mesa actual segun la URL
    var _currentUrl = location.href;
    for (var _t = 0; _t < ALLOWED_TABLES.length; _t++) {
      if (_currentUrl.indexOf(ALLOWED_TABLES[_t]) >= 0) {
        ROULETTE_URL = 'https://' + ALLOWED_TABLES[_t];
        if (ROULETTE_URL.charAt(ROULETTE_URL.length - 1) !== '/' && ALLOWED_TABLES[_t].charAt(ALLOWED_TABLES[_t].length - 1) === '/') {
          ROULETTE_URL += '/';
        }
        break;
      }
    }

    function isGamePage(url) {
      if (!url) url = location.href;
      return url.indexOf('/casino/games/') !== -1 || url.indexOf('/live-casino/games/') !== -1;
    }

    // ═══ PERSISTENCIA en localStorage ═══
    var RW_LS_KEY = 'rollerwin_recovery_v10';
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
          recoveryInProgress: _recoveryInProgress,
          timestamp: Date.now()
        }));
      } catch(e) {}
    }
    _saveState();

    var _gameUrl = _rwState.gameUrl || location.href;
    var _pushStateOrig = history.pushState;
    var _replaceStateOrig = history.replaceState;
    if (history.pushState) {
      history.pushState = function() {
        var result = _pushStateOrig.apply(this, arguments);
        if (isGamePage()) { _gameUrl = location.href; _saveState(); }
        return result;
      };
    }
    if (history.replaceState) {
      history.replaceState = function() {
        var result = _replaceStateOrig.apply(this, arguments);
        if (isGamePage()) { _gameUrl = location.href; _saveState(); }
        return result;
      };
    }
    setInterval(function() {
      if (isGamePage() && _gameUrl !== location.href) {
        _gameUrl = location.href;
        _saveState();
      }
    }, 10000);

    document.addEventListener('rw-number', function() {
      _lastCaptureTime = Date.now();
      _lastCapturePersisted = _lastCaptureTime;
      if (!_recoveryInProgress) {
        _isRecovering = false;
        _sessionExpired = false;
      }
      _saveState();
    });

    // Escuchar postMessage del iframe para sesion expirada
    window.addEventListener('message', function(e) {
      try {
        if (e.data && e.data.source === 'rollerwin-session-expired') {
          console.log('[RollerWin] IFRAME notifico sesion expirada: ' + e.data.reason);
          _sessionExpired = true;
          _saveState();
          handleSessionExpired(e.data.reason);
        }
      } catch(err) {}
    });

    // ═══ 1. KEEP-ALIVE + DETECCION DE SESION ═══
    var _origFetch = window.fetch;
    if (_origFetch && !_origFetch._rwKeepAlive) {
      _origFetch._rwKeepAlive = true;
      window.fetch = function(input, init) {
        var url = '';
        try { url = typeof input === 'string' ? input : (input && input.url ? input.url : ''); } catch(e) {}
        var promise = _origFetch.apply(this, arguments);
        if (promise && url) {
          promise.then(function(r) {
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
        r.clone().text().then(function(text) {
          if (text && text.length < 5000 && text.indexOf('<') !== -1) {
            var textLow = text.toLowerCase();
            if ((textLow.indexOf('login') !== -1 || textLow.indexOf('sign in') !== -1) &&
                textLow.indexOf('password') !== -1) {
              console.log('[RollerWin] Keep-alive devolvio HTML de login — SESION EXPIRADA!');
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
    setInterval(betfuryKeepAlive, 30000);

    // ═══ 2. BUSQUEDA AMPLIA de botones ═══
    function clickAnyButtonByText(texts) {
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

    // ═══ 3. HANDLE SESSION EXPIRED ═══
    var _recoveryInProgress = !!_rwState.recoveryInProgress;
    var _recoveryTimestamp = _rwState.recoveryTimestamp || 0;
    if (_recoveryInProgress && Date.now() - _recoveryTimestamp > 60000) {
      console.log('[RollerWin] Reset recovery bloqueado >60s');
      _recoveryInProgress = false;
    }

    function handleSessionExpired(reason) {
      if (_recoveryInProgress) return;
      var now = Date.now();
      if (now - _recoveryTimestamp < 12000) return;

      _recoveryInProgress = true;
      _recoveryTimestamp = now;
      _isRecovering = true;
      _sessionExpired = true;
      _recoverCount++;
      _saveState();

      console.log('[RollerWin] RECOVERY #' + _recoverCount + ' iniciado (' + reason + ')');

      var clicked = clickAnyButtonByText(['OK', 'Ok', 'ok', 'ACEPTAR', 'Aceptar', 'aceptar', 'VOLVER', 'Volver', 'volver', 'VUELVA', 'Vuelva', 'volvera', 'INICIAR', 'Iniciar', 'iniciar', 'CONTINUAR', 'Continuar', 'continuar']);
      if (clicked) {
        console.log('[RollerWin] Click OK en modal — esperando 500ms...');
      }

      setTimeout(function() {
        var targetUrl = ROULETTE_URL;
        if (_gameUrl) {
          // Verificar que _gameUrl es una mesa autorizada
          var gameUrlAllowed = false;
          for (var i = 0; i < ALLOWED_TABLES.length; i++) {
            if (_gameUrl.indexOf(ALLOWED_TABLES[i]) >= 0) {
              gameUrlAllowed = true;
              break;
            }
          }
          if (gameUrlAllowed) targetUrl = _gameUrl;
        }
        console.log('[RollerWin] Navegando a mesa (same tab): ' + targetUrl);
        location.replace(targetUrl);
      }, clicked ? 500 : 100);

      setTimeout(function() {
        console.log('[RollerWin] Reset recovery (safety timeout 20s)');
        _recoveryInProgress = false;
        _saveState();
      }, 20000);
    }

    // ═══ 4. DETECT AND CLOSE ANY MODAL ═══
    function detectAndCloseAnyModal() {
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');

      for (var i = 0; i < allEls.length; i++) {
        var txt = (allEls[i].textContent || '');
        var txtLow = txt.toLowerCase();

        var isExpired = (txtLow.indexOf('sesi') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
                        (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('expired') !== -1 || txtLow.indexOf('ended') !== -1)) ||
                        (txtLow.indexOf('sesión') !== -1 && txtLow.indexOf('finalizada') !== -1);
        if (isExpired) {
          console.log('[RollerWin] SESION FINALIZADA detectada');
          handleSessionExpired('modal-sesion');
          return true;
        }

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

    setInterval(detectAndCloseAnyModal, 400);
    try {
      new MutationObserver(function() { detectAndCloseAnyModal(); }).observe(document.body, { childList: true, subtree: true });
    } catch(e) {}

    // ═══ 5. CLICK AUTOMATICO "Jugar" ═══
    var _playButtonCooldown = 0;

    function checkPlayButton() {
      if (_playButtonCooldown > Date.now()) return false;
      var onGamePage = isGamePage();
      if (!onGamePage) return false;

      var btns = document.querySelectorAll('button, a, [role="button"], div[onclick], [class*="btn"], [class*="button"]');
      for (var i = 0; i < btns.length; i++) {
        var bt = (btns[i].textContent || '').trim().toLowerCase();
        if (bt === 'jugar' || bt === 'play' || bt === 'play now' || bt === 'spin' || bt === 'start') {
          if (btns[i].getAttribute('target') === '_blank') continue;
          if (btns[i].tagName.toLowerCase() === 'a' && btns[i].getAttribute('target')) continue;
          console.log('[RollerWin] Boton JUGAR encontrado [' + btns[i].tagName.toLowerCase() + '] — click!');
          btns[i].click();
          _playButtonCooldown = Date.now() + 5000;
          _isRecovering = true;
          _saveState();
          return true;
        }
      }
      return false;
    }

    setInterval(checkPlayButton, 400);

    // ═══ 6. IFRAME MUERTO: sin capturas >60s → reload ═══
    setInterval(function() {
      var noCap = Date.now() - _lastCaptureTime;
      var onGame = isGamePage();

      if (onGame && noCap > 60000 && !_recoveryInProgress) {
        console.log('[RollerWin] Sin capturas ' + Math.round(noCap/1000) + 's — iframe muerto, reload completo...');
        _isRecovering = true;
        _sessionExpired = true;
        _saveState();
        location.reload();
      }
    }, 10000);

    // ═══ 6b. DETECCION AL CARGAR ═══
    setTimeout(function() {
      if (_isRecovering || _sessionExpired || _recoverCount > 0) {
        console.log('[RollerWin] Post-load: recovering=' + _isRecovering +
          ' expired=' + _sessionExpired + ' count=' + _recoverCount);

        if (!isGamePage()) {
          console.log('[RollerWin] No en pagina de juego — navegando...');
          handleSessionExpired('post-load-redirect');
          return;
        }

        checkPlayButton();
        detectAndCloseAnyModal();

        setTimeout(function() {
          checkPlayButton();
          detectAndCloseAnyModal();
        }, 600);

        setTimeout(function() {
          checkPlayButton();
          detectAndCloseAnyModal();
        }, 1200);
      }
    }, 100);

    // ═══ 7. VISIBILITY + FOCUS ═══
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        betfuryKeepAlive();
        if (!isGamePage() && _recoverCount > 0) {
          handleSessionExpired('visibility');
        }
        if (isGamePage()) {
          checkPlayButton();
          detectAndCloseAnyModal();
        }
      }
    });

    window.addEventListener('focus', function() {
      betfuryKeepAlive();
      if (isGamePage()) {
        checkPlayButton();
        detectAndCloseAnyModal();
      }
    });

    // ═══ 8. REPORTAR estado al content script ═══
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

    console.log('[RollerWin] v10.0 PARENT activo | Mesa:', ROULETTE_URL, '| Recovers:', _recoverCount);

  // ══════════════════════════════════════
  // ============ IFRAME (donde se detectan los numeros) ======
  // ══════════════════════════════════════
  } else {
    console.log('[RollerWin] IFRAME detectado:', hostname, '— activando deteccion v10.0');

    // Detectar modal de sesion dentro del iframe
    var _iframeModalNotified = false;
    function detectIframeModal() {
      var allEls = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');
      for (var i = 0; i < allEls.length; i++) {
        var txt = (allEls[i].textContent || '');
        var txtLow = txt.toLowerCase();
        if ((txtLow.indexOf('sesi') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
            (txtLow.indexOf('sesión') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
            (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('ended') !== -1 || txtLow.indexOf('expired') !== -1))) {
          if (!_iframeModalNotified) {
            _iframeModalNotified = true;
            console.log('[RollerWin] IFRAME: SESION FINALIZADA → notificando parent');
            try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-modal-detected' }, '*'); } catch(e) {}
          }
          var okBtns = allEls[i].closest('div, dialog') ? allEls[i].closest('div, dialog').querySelectorAll('button, a, [role="button"], div[onclick], span[onclick]') : [];
          for (var j = 0; j < okBtns.length; j++) {
            var bt = (okBtns[j].textContent || '').trim();
            if (bt === 'OK' || bt === 'Ok' || bt === 'ok' || bt === 'ACEPTAR' || bt === 'Aceptar') {
              console.log('[RollerWin] IFRAME: Click OK en modal sesion');
              okBtns[j].click();
            }
          }
          return true;
        }
      }
      return false;
    }
    setInterval(detectIframeModal, 500);
    try { new MutationObserver(function() { detectIframeModal(); }).observe(document.body, { childList: true, subtree: true }); } catch(e) {}

    // Detectar si el iframe pierde conexion
    var _iframeLastActivity = Date.now();
    var _iframeDeadNotified = false;

    // Hook fetch dentro del iframe para detectar sesion expirada
    var _ifOrigFetch = window.fetch;
    if (_ifOrigFetch && !_ifOrigFetch._rwIframeSess) {
      _ifOrigFetch._rwIframeSess = true;
      window.fetch = function(input, init) {
        _iframeLastActivity = Date.now();
        var promise = _ifOrigFetch.apply(this, arguments);
        if (promise) {
          promise.then(function(r) {
            if (r.status === 401 || r.status === 403 || r.redirected) {
              var respUrl = (r.url || '').toLowerCase();
              if (r.status === 401 || r.status === 403 || respUrl.indexOf('login') !== -1) {
                console.log('[RollerWin] IFRAME: Fetch sesion expirada ' + r.status);
                try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-fetch-' + r.status }, '*'); } catch(e) {}
              }
            }
          }).catch(function() {});
        }
        return promise;
      };
    }

    // Notificar parent si el iframe esta muerto (>45s sin actividad)
    setInterval(function() {
      if (!_iframeDeadNotified && Date.now() - _iframeLastActivity > 45000) {
        _iframeDeadNotified = true;
        console.log('[RollerWin] IFRAME: Sin actividad >45s → notificando parent + Gap Recovery');
        try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-dead-45s' }, '*'); } catch(e) {}
        startGapRecovery();
      }
    }, 10000);

    // GAP RECOVERY SCANNER
    var _iframeLastCaptureTime = Date.now();
    var _gapRecoveryActive = false;
    var _gapRecoveryTimer = null;
    var _GAP_THRESHOLD = 22000;
    var _GAP_SCAN_INTERVAL = 3000;

    var _wsWasClosed = false;
    var _wsReconnectCount = 0;

    // Dedup por SECUENCIA — previene re-envio post-recovery
    var _sentSequence = [];
    var _SEQUENCE_MAX = 5;
    var _SEQUENCE_WINDOW = 10000;

    function _checkSequenceDup(n) {
      for (var i = 0; i < _sentSequence.length; i++) {
        if (_sentSequence[i].number === n) {
          if (Date.now() - _sentSequence[i].timestamp < _SEQUENCE_WINDOW) {
            return true;
          }
        }
      }
      return false;
    }

    function _addSequence(n) {
      _sentSequence.push({ number: n, timestamp: Date.now() });
      if (_sentSequence.length > _SEQUENCE_MAX) _sentSequence.shift();
      _iframeLastCaptureTime = Date.now();
      if (_gapRecoveryActive) {
        _gapRecoveryActive = false;
        console.log('[RollerWin] GAP RECOVERY: numero capturado, desactivando scanner');
      }
    }

    function _gapRecoveryScan() {
      var gapSelectors = [
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
        '[class*="last-number"]',
        '[class*="lastnumber"]',
        '[class*="game-result"]'
      ];

      for (var i = 0; i < gapSelectors.length; i++) {
        try {
          var els = document.querySelectorAll(gapSelectors[i]);
          for (var j = 0; j < els.length; j++) {
            var text = (els[j].textContent || '').trim();
            var num = parseInt(text, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
              console.log('[RollerWin] GAP RECOVERY: numero ' + num + ' encontrado en DOM (' + gapSelectors[i] + ')');
              sendToServer(num, 'GAP-RECOVERY:' + gapSelectors[i]);
              return true;
            }
          }
        } catch(e) {}
      }
      return false;
    }

    function startGapRecovery() {
      if (_gapRecoveryActive) return;
      _gapRecoveryActive = true;
      console.log('[RollerWin] GAP RECOVERY: activado');
      _gapRecoveryScan();
      _gapRecoveryTimer = setInterval(function() {
        if (!_gapRecoveryActive) {
          clearInterval(_gapRecoveryTimer);
          return;
        }
        _gapRecoveryScan();
      }, _GAP_SCAN_INTERVAL);
    }

    setInterval(function() {
      if (!_gapRecoveryActive && Date.now() - _iframeLastCaptureTime > _GAP_THRESHOLD) {
        startGapRecovery();
      }
    }, 5000);

    // Solicitar sincronizacion del ultimo numero al parent
    try {
      var _syncHandler = function(e) {
        try {
          if (e.data && e.data.source === 'rollerwin-sync-reply' && typeof e.data.lastNumber === 'number') {
            syncLastNumber(e.data.lastNumber);
            _addSequence(e.data.lastNumber);
            window.removeEventListener('message', _syncHandler);
          }
        } catch(err) {}
      };
      window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
      window.addEventListener('message', _syncHandler);
      setTimeout(function() {
        window.removeEventListener('message', _syncHandler);
      }, 2000);
    } catch(e) {}
    setInterval(function() {
      try {
        window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
      } catch(e) {}
    }, 30000);

    // ═══ EXTRACCION DE NUMEROS ═══
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
        if (obj.length === 0) return;
        if (obj.length > 5) return; // Historial > 5, ignorar

        var pathLow = path.toLowerCase();
        if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('winning') >= 0 ||
            pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0) {
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
      if (lastMatch !== null) sendToServer(lastMatch, 'regex-last@' + source);
    }

    // ═══ HOOK WEBSOCKET (solo en iframes) ═══
    (function() {
      var OrigWS = window.WebSocket;
      if (!OrigWS || OrigWS.__rwV10) return;
      OrigWS.__rwV10 = true;

      var ProxyWS = function(url, protocols) {
        console.log('[RollerWin] WS en iframe:', (url || '').substring(0, 80));
        var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

        if (_wsWasClosed) {
          _wsReconnectCount++;
          console.log('[RollerWin] WS RECONNECT #' + _wsReconnectCount + ' — Gap Recovery');
          _wsWasClosed = false;
          setTimeout(function() {
            startGapRecovery();
          }, 1000);
        }

        ws.addEventListener('message', function(e) {
          try {
            var data = e.data;
            _iframeLastActivity = Date.now();
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
                      evt.indexOf('win') >= 0 ||
                      evt.indexOf('round') >= 0 || evt.indexOf('spin') >= 0 ||
                      evt.indexOf('game') >= 0 || evt.indexOf('end') >= 0 ||
                      evt.indexOf('finish') >= 0 || evt.indexOf('update') >= 0 ||
                      evt.indexOf('new') >= 0 || evt.indexOf('bet') >= 0) {
                    extractObj(p[1], 0, 'sio.' + evt);
                    extractFromText(data, 'sio.' + evt);
                  } else {
                    extractFromText(data, 'sio-fallback.' + evt);
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

        ws.addEventListener('close', function(e) {
          console.log('[RollerWin] WS CERRADO (code:' + e.code + ')');
          _wsWasClosed = true;
          _iframeDeadNotified = false;
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

    // ═══ HOOK FETCH (solo en iframes) ═══
    (function() {
      var origFetch = window.fetch;
      if (!origFetch || origFetch.__rwV10) return;
      origFetch.__rwV10 = true;

      window.fetch = function(input, init) {
        var url = '';
        try {
          url = typeof input === 'string' ? input :
                (input instanceof Request) ? (input.url || '') :
                (input && input.url) ? input.url : '';
        } catch(e) {}

        var promise = origFetch.apply(this, arguments);

        var urlLow = url.toLowerCase();
        if (urlLow.indexOf('result') >= 0 ||
            urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
            urlLow.indexOf('round') >= 0 || urlLow.indexOf('wheel') >= 0) {
          if (urlLow.indexOf('history') >= 0 || urlLow.indexOf('state') >= 0 || urlLow.indexOf('stats') >= 0) {
            return promise;
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

    // ═══ HOOK XHR (solo en iframes) ═══
    (function() {
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      if (origSend.__rwV10) return;
      origSend.__rwV10 = true;

      XMLHttpRequest.prototype.open = function(m, u) { this._rwUrl = String(u || ''); return origOpen.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function() {
        var self = this;
        this.addEventListener('load', function() {
          var u = (self._rwUrl || '').toLowerCase();
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

    // ═══ DOM SCANNER v5.0 — ULTRA ESTRICTO ═══
    (function() {
      var HISTORY_KEYWORDS = ['history','past','track','sequence','previous','older','last-result',
        'lastresults','gamehistory','result-history','historyitem','resultshistory',
        'bng','stats','statistics','roadmap','bigroad','beadroad','marker'];

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
        if (el.hasAttribute('data-result-number') || el.hasAttribute('data-winning-number') ||
            el.hasAttribute('data-game-result')) return true;
        return false;
      }

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

      var _lastDomNumber = -1;
      var _lastDomNumberTime = 0;
      var _DOM_REPEAT_LIMIT = 15000;

      function scanDOM() {
        for (var i = 0; i < STRICT_SELECTORS.length; i++) {
          try {
            var els = document.querySelectorAll(STRICT_SELECTORS[i]);
            for (var j = 0; j < els.length; j++) {
              if (isHistoryElement(els[j])) continue;
              if (!isCurrentElement(els[j]) && !els[j].hasAttribute('data-result-number') &&
                  !els[j].hasAttribute('data-winning-number')) continue;

              var text = (els[j].textContent || '').trim();
              var num = parseInt(text, 10);
              if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
                var now = Date.now();
                if (num === _lastDomNumber && now - _lastDomNumberTime < _DOM_REPEAT_LIMIT) return;
                _lastDomNumber = num;
                _lastDomNumberTime = now;
                sendToServer(num, 'DOM:' + STRICT_SELECTORS[i]);
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

    // ═══ HOOK postMessage (solo en iframes) ═══
    (function() {
      var orig = window.postMessage;
      if (orig.__rwV10) return;
      orig.__rwV10 = true;

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

    // ═══ HOOK EventSource (solo en iframes) ═══
    (function() {
      if (typeof window.EventSource === 'undefined') return;
      var Orig = window.EventSource;
      if (Orig.__rwV10) return;
      Orig.__rwV10 = true;

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

    console.log('[RollerWin] v10.0 MOTOR ACTIVO en IFRAME ' + hostname + ' | Dedup 9s + SEQ 10s + GapRecovery');
  }
})();