// RollerWin Capture v10.0 — IFRAME-FIRST ARCHITECTURE (restored from v7.6)
// ═══════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE:
//   PARENT: NO number detection. Only receives numbers from iframes via
//           postMessage, relays to content.js widget, handles session recovery.
//   IFRAME: ALL number detection happens here (WS + Fetch + XHR + PM + SSE + DOM).
//           This is the v7.6 proven approach that worked correctly.
//
// SUPPORTED TABLES (only captures from these):
//   1. betfury.com/.../roulette-live-by-evolution
//   2. betfury.com/.../roulette-azure-by-pragmatic-play
//   3. casino.pinnacle.com/.../roulette-azure/
//   4. casino.pinnacle.com/.../european-roulette/
//
// WHY v8-v9.x FAILED: They added a "change-detection engine" in the PARENT
// that parsed the parent WebSocket for roulette history arrays. The parent WS
// carries multi-game data (bingo, crash, etc.) with unpredictable array
// ordering, causing wrong number captures. v10.0 removes that entirely.
// ═══════════════════════════════════════════════════════════════════════════════
(function() {
  'use strict';
  if (window.__rwMainV100) return;
  window.__rwMainV100 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  var isInIframe = (window.self !== window.top);
  var hostname = location.hostname || '';

  console.log('%c[RW] v10.0 ' + (isInIframe ? 'IFRAME' : 'PARENT') + ' | ' + hostname,
    'color:#22c55e;font-weight:bold;font-size:14px;background:#000;padding:2px 6px;border-radius:4px;');

  var lastNum = -1;
  var lastTime = 0;
  var sentCount = 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // DEDUP: Time-based (9s) + Sequence-based (10s)
  // Time dedup: blocks multiple hooks detecting the SAME spin
  // Sequence dedup: blocks re-sends after iframe reload/recovery
  // ═══════════════════════════════════════════════════════════════════════════
  var _lastSentTimestamp = 0;
  var _DEDUP_WINDOW = 9000;
  var _sentSequence = [];
  var _SEQUENCE_MAX = 5;
  var _SEQUENCE_WINDOW = 10000;

  function _isDuplicate(n) {
    if (Date.now() - _lastSentTimestamp < _DEDUP_WINDOW) return true;
    return false;
  }

  function _checkSequenceDup(n) {
    for (var i = 0; i < _sentSequence.length; i++) {
      if (_sentSequence[i].number === n && Date.now() - _sentSequence[i].timestamp < _SEQUENCE_WINDOW) {
        return true;
      }
    }
    return false;
  }

  function _markSent(n) {
    var now = Date.now();
    _lastSentTimestamp = now;
    lastNum = n;
    lastTime = now;
    _sentSequence.push({ number: n, timestamp: now });
    if (_sentSequence.length > _SEQUENCE_MAX) _sentSequence.shift();
  }

  function syncLastNumber(n) {
    if (n >= 0 && n <= 36) {
      _sentSequence.push({ number: n, timestamp: Date.now() });
      if (_sentSequence.length > _SEQUENCE_MAX) _sentSequence.shift();
      console.log('[RW] SYNC: numero ' + n + ' marcado como enviado');
    }
  }

  function getColor(n) {
    if (n === 0) return 'green';
    return RED.indexOf(n) >= 0 ? 'red' : 'black';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEND TO SERVER
  // ═══════════════════════════════════════════════════════════════════════════
  function sendToServer(n, source) {
    if (n < 0 || n > 36) return;
    if (_isDuplicate(n)) return;
    if (_checkSequenceDup(n)) return;

    _markSent(n);
    sentCount++;

    console.log('%c[RW] RESULTADO #' + sentCount + ': ' + n + ' (' + getColor(n) + ') — ' + source +
      (isInIframe ? ' [IFRAME ' + hostname + ']' : ' [PARENT]'),
      'color:#22c55e;font-weight:bold;font-size:14px;');

    (function doSend(attempt) {
      fetch(SERVER + '/api/capture/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: n })
      }).then(function(r) {
        if (r.ok) console.log('[RW] Enviado OK:', n);
        else if (attempt < 2) setTimeout(function() { doSend(attempt + 1); }, 2000);
      }).catch(function() {
        if (attempt < 2) setTimeout(function() { doSend(attempt + 1); }, 2000);
      });
    })(0);

    // Notify parent if in iframe
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
      // CustomEvent for content.js (ISOLATED world)
      try {
        document.dispatchEvent(new CustomEvent('rw-number', {
          detail: { number: n, color: getColor(n) }
        }));
      } catch(e) {}
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ALLOWED TABLES — only capture from these 4 specific URLs
  // ═══════════════════════════════════════════════════════════════════════════
  var ALLOWED_TABLES = [
    'roulette-live-by-evolution',
    'roulette-azure-by-pragmatic-play',
    'roulette-azure/',
    'european-roulette/'
  ];

  function isAllowedTable(url) {
    if (!url) return false;
    var u = url.toLowerCase();
    for (var i = 0; i < ALLOWED_TABLES.length; i++) {
      if (u.indexOf(ALLOWED_TABLES[i]) !== -1) return true;
    }
    return false;
  }

  function isBetfury() {
    return hostname.indexOf('betfury.com') >= 0 || hostname.indexOf('betfury.io') >= 0;
  }

  function isPinnacle() {
    return hostname.indexOf('pinnacle.com') >= 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ==================== PARENT PAGE ====================
  // NO number detection. Only receives from iframes + handles recovery.
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isInIframe) {
    var _isAllowed = isAllowedTable(location.href);

    if (!_isAllowed) {
      console.log('[RW] v10.0 PARENT — URL no permitida, solo escuchando iframes: ' + location.href.substring(0, 80));
      // Still listen for postMessage from iframes (in case of navigation)
      window.addEventListener('message', function(e) {
        try {
          var d = e.data;
          if (d && d.source === 'rollerwin-capture' && typeof d.number === 'number') {
            document.dispatchEvent(new CustomEvent('rw-number', {
              detail: { number: d.number, color: d.color }
            }));
          }
          if (d && d.source === 'rollerwin-sync') {
            try { window.postMessage({ source: 'rollerwin-sync-reply', lastNumber: lastNum }, '*'); } catch(ex) {}
          }
        } catch(ex) {}
      });
      return;
    }

    console.log('%c[RW] v10.0 PARENT — MESA PERMITIDA | ' + location.href.substring(0, 80),
      'color:#22c55e;font-weight:bold;font-size:13px;background:#000;padding:4px 8px;border-radius:4px;');

    var _parentLastNumber = -1;
    var _keepAliveCount = 0;
    var _lastCaptureTime = Date.now();
    var _lastKeepAliveResponse = 'pending';
    var _isBetfury = isBetfury();
    var _isPinn = isPinnacle();

    // ─── Receive numbers from iframes ───
    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (data && data.source === 'rollerwin-capture' && typeof data.number === 'number') {
          console.log('[RW] Recibido de iframe:', data.number, '(' + (data.hostname || '') + ')');
          _parentLastNumber = data.number;
          _lastCaptureTime = Date.now();
          try {
            document.dispatchEvent(new CustomEvent('rw-number', {
              detail: { number: data.number, color: data.color }
            }));
          } catch(e) {}
        }
        if (data && data.source === 'rollerwin-sync' && typeof data.lastNumber === 'number') {
          try {
            window.postMessage({
              source: 'rollerwin-sync-reply',
              lastNumber: _parentLastNumber
            }, '*');
          } catch(e) {}
        }
        if (data && data.source === 'rollerwin-session-expired' && !_isPinn) {
          console.log('[RW] IFRAME notifico sesion expirada:', data.reason);
          handleSessionExpired(data.reason);
        }
      } catch(e) {}
    });

    // ─── Track capture time ───
    document.addEventListener('rw-number', function() {
      _lastCaptureTime = Date.now();
      if (!_recoveryInProgress) {
        _isRecovering = false;
        _sessionExpired = false;
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // SESSION RECOVERY — Only for Betfury (Pinnacle doesn't need it)
    // ═══════════════════════════════════════════════════════════════════════════
    if (_isBetfury) {
      var RW_LS_KEY = 'rollerwin_recovery_v10';
      var _rwState = JSON.parse(localStorage.getItem(RW_LS_KEY) || '{}');
      var _recoverCount = _rwState.recoverCount || 0;
      var _isRecovering = !!_rwState.isRecovering;
      var _sessionExpired = !!_rwState.sessionExpired;
      var _gameUrl = _rwState.gameUrl || location.href;
      var _recoveryInProgress = !!_rwState.recoveryInProgress;
      var _recoveryTimestamp = _rwState.recoveryTimestamp || 0;

      // Safety reset if recovery stuck >60s
      if (_recoveryInProgress && Date.now() - _recoveryTimestamp > 60000) {
        console.log('[RW] Reset recovery bloqueado >60s');
        _recoveryInProgress = false;
      }

      function _saveState() {
        try {
          localStorage.setItem(RW_LS_KEY, JSON.stringify({
            recoverCount: _recoverCount,
            isRecovering: _isRecovering,
            sessionExpired: _sessionExpired,
            gameUrl: _gameUrl,
            recoveryTimestamp: _recoveryTimestamp,
            recoveryInProgress: _recoveryInProgress,
            timestamp: Date.now()
          }));
        } catch(e) {}
      }
      _saveState();

      // Track current game URL
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

      // ─── Keep-alive + Session Detection ───
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
                  console.log('[RW] Fetch REDIRIGIDO a login — SESION EXPIRADA');
                  _sessionExpired = true;
                  _saveState();
                  handleSessionExpired('fetch-redirect');
                }
              }
              if (r.status === 401 || r.status === 403) {
                console.log('[RW] Fetch ' + r.status + ' — SESION EXPIRADA');
                _sessionExpired = true;
                _saveState();
                handleSessionExpired('fetch-' + r.status);
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
              console.log('[RW] XHR REDIRIGIDO a login — SESION EXPIRADA');
              _sessionExpired = true;
              _saveState();
              handleSessionExpired('xhr-redirect-login');
              return;
            }
            if (self.status === 401 || self.status === 403) {
              console.log('[RW] XHR ' + self.status + ' — SESION EXPIRADA');
              _sessionExpired = true;
              _saveState();
              handleSessionExpired('xhr-' + self.status);
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
          if (r.redirected) {
            var respUrl = (r.url || '').toLowerCase();
            if (respUrl.indexOf('login') !== -1 || respUrl.indexOf('signin') !== -1) {
              _sessionExpired = true;
              _saveState();
              handleSessionExpired('keepalive-redirect');
              return;
            }
          }
          r.clone().text().then(function(text) {
            if (text && text.length < 5000 && text.indexOf('<') !== -1) {
              var textLow = text.toLowerCase();
              if ((textLow.indexOf('login') !== -1 || textLow.indexOf('sign in') !== -1) && textLow.indexOf('password') !== -1) {
                _sessionExpired = true;
                _saveState();
                handleSessionExpired('keepalive-html-login');
              }
            }
          }).catch(function() {});
          if (r.status === 401 || r.status === 403) {
            _sessionExpired = true;
            _saveState();
            handleSessionExpired('keepalive-' + r.status);
          }
        }).catch(function() {});
      }
      setTimeout(betfuryKeepAlive, 1500);
      setInterval(betfuryKeepAlive, 30000);

      // ─── Button clicking ───
      function clickAnyButtonByText(texts) {
        var selectors = 'button, a, [role="button"], div[onclick], span[onclick], [class*="btn"], [class*="button"]';
        var allBtns = document.querySelectorAll(selectors);
        for (var i = 0; i < allBtns.length; i++) {
          var bt = (allBtns[i].textContent || '').trim();
          for (var j = 0; j < texts.length; j++) {
            if (bt === texts[j]) {
              console.log('[RW] Click boton: "' + bt + '"');
              allBtns[i].click();
              return true;
            }
          }
        }
        return false;
      }

      // ─── Handle Session Expired ───
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

        console.log('[RW] RECOVERY #' + _recoverCount + ' iniciado (' + reason + ')');

        var clicked = clickAnyButtonByText(['OK', 'Ok', 'ok', 'ACEPTAR', 'Aceptar', 'aceptar', 'VOLVER', 'Volver', 'volver', 'CONTINUAR', 'Continuar', 'continuar']);

        setTimeout(function() {
          var targetUrl = _gameUrl;
          if (targetUrl && targetUrl.indexOf('/casino/games/') !== -1 && isAllowedTable(targetUrl)) {
            console.log('[RW] Navegando a mesa:', targetUrl);
            location.replace(targetUrl);
          }
        }, clicked ? 500 : 100);

        setTimeout(function() {
          _recoveryInProgress = false;
          _saveState();
        }, 20000);
      }

      // ─── Modal detection ───
      function detectAndCloseAnyModal() {
        var allEls = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');
        for (var i = 0; i < allEls.length; i++) {
          var txtLow = (allEls[i].textContent || '').toLowerCase();
          var isExpired = (txtLow.indexOf('sesi') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
                          (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('expired') !== -1 || txtLow.indexOf('ended') !== -1));
          if (isExpired) {
            handleSessionExpired('modal-sesion');
            return true;
          }
          var isLowBalance = (txtLow.indexOf('saldo') !== -1 && txtLow.indexOf('bajo') !== -1) ||
                             (txtLow.indexOf('balance') !== -1 && txtLow.indexOf('low') !== -1);
          if (isLowBalance) {
            clickAnyButtonByText(['CERRAR', 'Cerrar', 'cerrar', 'CLOSE', 'Close', 'OK', 'Ok', 'ok']);
          }
        }
        return false;
      }
      setInterval(detectAndCloseAnyModal, 400);
      try { new MutationObserver(function() { detectAndCloseAnyModal(); }).observe(document.body, { childList: true, subtree: true }); } catch(e) {}

      // ─── Play button clicking ───
      var _playButtonCooldown = 0;
      function checkPlayButton() {
        if (_playButtonCooldown > Date.now()) return false;
        if (location.href.indexOf('/casino/games/') === -1) return false;
        var btns = document.querySelectorAll('button, a, [role="button"], div[onclick], [class*="btn"], [class*="button"]');
        for (var i = 0; i < btns.length; i++) {
          var bt = (btns[i].textContent || '').trim().toLowerCase();
          if (bt === 'jugar' || bt === 'play' || bt === 'play now' || bt === 'spin' || bt === 'start') {
            if (btns[i].getAttribute('target') === '_blank') continue;
            if (btns[i].tagName.toLowerCase() === 'a' && btns[i].getAttribute('target')) continue;
            console.log('[RW] Boton JUGAR — click!');
            btns[i].click();
            _playButtonCooldown = Date.now() + 5000;
            return true;
          }
        }
        return false;
      }
      setInterval(checkPlayButton, 400);

      // ─── Reload if no captures (iframe dead) ───
      setInterval(function() {
        var noCap = Date.now() - _lastCaptureTime;
        var onGame = location.href.indexOf('/casino/games/') !== -1;
        if (onGame && noCap > 60000 && !_recoveryInProgress) {
          console.log('[RW] Sin capturas ' + Math.round(noCap/1000) + 's — reload...');
          _isRecovering = true;
          _sessionExpired = true;
          _saveState();
          location.reload();
        }
      }, 10000);

      // ─── Post-load recovery check ───
      setTimeout(function() {
        if (_isRecovering || _sessionExpired || _recoverCount > 0) {
          if (location.href.indexOf('/casino/games/') === -1) {
            handleSessionExpired('post-load-redirect');
            return;
          }
          checkPlayButton();
          detectAndCloseAnyModal();
          setTimeout(function() { checkPlayButton(); detectAndCloseAnyModal(); }, 600);
          setTimeout(function() { checkPlayButton(); detectAndCloseAnyModal(); }, 1200);
        }
      }, 100);

      // ─── Visibility + Focus ───
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          betfuryKeepAlive();
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

      // ─── Status reporting ───
      setInterval(function() {
        try {
          document.dispatchEvent(new CustomEvent('rw-status', {
            detail: {
              status: _isRecovering ? 'recovering' : 'alive',
              keepAliveCount: _keepAliveCount,
              lastResponse: _lastKeepAliveResponse,
              noCaptureSec: Math.round((Date.now() - _lastCaptureTime) / 1000),
              recoverCount: _recoverCount
            }
          }));
        } catch(e) {}
      }, 10000);

      console.log('[RW] v10.0 PARENT — Betfury recovery activo | Mesa:', _gameUrl.substring(0, 60));
    }

    // Pinnacle parent: simpler, no recovery needed
    if (_isPinn) {
      console.log('[RW] v10.0 PARENT — Pinnacle (sin recovery) | Esperando numeros de iframe');
    }

    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ==================== IFRAME — ALL DETECTION HERE ====================
  // This is the v7.6 proven detection engine.
  // Hooks: WS + Fetch + XHR + postMessage + EventSource + DOM Scanner
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('%c[RW] v10.0 IFRAME MOTOR | ' + hostname,
    'color:#f59e0b;font-weight:bold;font-size:14px;background:#000;padding:2px 6px;border-radius:4px;');

  var _iframeLastCaptureTime = Date.now();
  var _iframeLastActivity = Date.now();
  var _wsWasClosed = false;
  var _iframeDeadNotified = false;
  var _gapRecoveryActive = false;
  var _GAP_THRESHOLD = 22000;

  // ─── IFRAME: Session expired detection ───
  var _iframeModalNotified = false;
  function detectIframeModal() {
    var allEls = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');
    for (var i = 0; i < allEls.length; i++) {
      var txtLow = (allEls[i].textContent || '').toLowerCase();
      if ((txtLow.indexOf('sesi') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
          (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('ended') !== -1 || txtLow.indexOf('expired') !== -1))) {
        if (!_iframeModalNotified) {
          _iframeModalNotified = true;
          try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-modal' }, '*'); } catch(e) {}
        }
        var okBtns = allEls[i].closest && allEls[i].closest('div, dialog') ? allEls[i].closest('div, dialog').querySelectorAll('button, a, [role="button"]') : [];
        for (var j = 0; j < okBtns.length; j++) {
          var bt = (okBtns[j].textContent || '').trim();
          if (bt === 'OK' || bt === 'Ok' || bt === 'ok' || bt === 'ACEPTAR' || bt === 'Aceptar') okBtns[j].click();
        }
        return true;
      }
    }
    return false;
  }
  setInterval(detectIframeModal, 500);
  try { new MutationObserver(function() { detectIframeModal(); }).observe(document.body, { childList: true, subtree: true }); } catch(e) {}

  // ─── IFRAME: Fetch hook for session detection ───
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
              try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-fetch-' + r.status }, '*'); } catch(e) {}
            }
          }
        }).catch(function() {});
      }
      return promise;
    };
  }

  // ─── IFRAME: Dead detection ───
  setInterval(function() {
    if (!_iframeDeadNotified && Date.now() - _iframeLastActivity > 45000) {
      _iframeDeadNotified = true;
      console.log('[RW] IFRAME: Sin actividad >45s → Gap Recovery');
      try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-dead-45s' }, '*'); } catch(e) {}
      startGapRecovery();
    }
  }, 10000);

  // ─── IFRAME: Gap Recovery ───
  function _gapRecoveryScan() {
    var sels = [
      '[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]',
      '[class*="result-value"]','[class*="current-result"]','[class*="number-display"]',
      '[data-result-number]','[data-winning-number]','[data-game-result]',
      '[class*="overlay"] [class*="result"]','[class*="announced"]','[class*="round-result"]',
      '[class*="roulette-result"]','[class*="live-result"]','[class*="last-number"]',
      '[class*="lastnumber"]','[class*="game-result"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = document.querySelectorAll(sels[i]);
        for (var j = 0; j < els.length; j++) {
          var t = (els[j].textContent || '').trim();
          var num = parseInt(t, 10);
          if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === t) {
            console.log('[RW] GAP RECOVERY: ' + num + ' via DOM (' + sels[i] + ')');
            sendToServer(num, 'GAP:' + sels[i]);
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
    _gapRecoveryScan();
    var t = setInterval(function() {
      if (!_gapRecoveryActive) { clearInterval(t); return; }
      _gapRecoveryScan();
    }, 3000);
  }

  // Override sendToServer to update capture time and deactivate gap recovery
  var _origSendToServer = sendToServer;
  sendToServer = function(n, source) {
    _origSendToServer(n, source);
    _iframeLastCaptureTime = Date.now();
    if (_gapRecoveryActive) {
      _gapRecoveryActive = false;
      console.log('[RW] Gap Recovery desactivado (numero capturado)');
    }
  };

  setInterval(function() {
    if (!_gapRecoveryActive && Date.now() - _iframeLastCaptureTime > _GAP_THRESHOLD) {
      startGapRecovery();
    }
  }, 5000);

  // ─── IFRAME: Sync with parent ───
  try {
    var _syncHandler = function(e) {
      try {
        if (e.data && e.data.source === 'rollerwin-sync-reply' && typeof e.data.lastNumber === 'number') {
          syncLastNumber(e.data.lastNumber);
          _sentSequence.push({ number: e.data.lastNumber, timestamp: Date.now() });
          if (_sentSequence.length > _SEQUENCE_MAX) _sentSequence.shift();
          window.removeEventListener('message', _syncHandler);
        }
      } catch(err) {}
    };
    window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
    window.addEventListener('message', _syncHandler);
    setTimeout(function() { window.removeEventListener('message', _syncHandler); }, 2000);
  } catch(e) {}
  setInterval(function() {
    try { window.parent.postMessage({ source: 'rollerwin-sync' }, '*'); } catch(e) {}
  }, 30000);

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTRACTION FUNCTIONS (v7.6 proven)
  // ═══════════════════════════════════════════════════════════════════════════
  var RESULT_FIELDS = [
    'winningnumber','winning_number','winningpocket','winning_pocket',
    'resultnumber','result_number','displaynumber','display_number',
    'roulette_number','ball_number','pocket_number',
    'pocketid','finalnumber','final_number','winningnumberdisplay',
    'numberstr','numberstring','game_number','announced_number',
    'resultid','roundresult','gameoutcome','outcome',
    'game_result','round_result','game_outcome'
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
      if (s.length >= 1 && s.length <= 2 && s === String(parseInt(s, 10))) {
        var n = parseInt(s, 10);
        if (n >= 0 && n <= 36) return n;
      }
    }
    return null;
  }

  // Extract from objects: takes LAST element of small arrays, ignores large arrays (history)
  function extractObj(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 4) return;
    if (Array.isArray(obj)) {
      if (obj.length === 0 || obj.length > 5) return; // >5 = history, ignore
      var pl = path.toLowerCase();
      if (pl.indexOf('result') >= 0 || pl.indexOf('winning') >= 0 || pl.indexOf('outcome') >= 0 ||
          pl.indexOf('pocket') >= 0 || pl.indexOf('number') >= 0 || pl.indexOf('history') >= 0 ||
          pl.indexOf('last') >= 0) {
        var last = obj[obj.length - 1]; // Take LAST element (most recent)
        var n = tryNum(last);
        if (n !== null) { sendToServer(n, 'array@' + path); return; }
        if (typeof last === 'object') extractObj(last, depth + 1, path + '[-1]');
      }
      return;
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i], val = obj[key];
      if (isResultField(key)) {
        var n = tryNum(val);
        if (n !== null) { sendToServer(n, key + '@' + path); return; }
      }
      if (typeof val === 'object' && val !== null) extractObj(val, depth + 1, path + '.' + key);
    }
  }

  // Extract from text: regex for specific field names, takes LAST match
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
      /"displayNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winningPocket"\s*:\s*(\d{1,2})\b/gi,
      /"announced_number"\s*:\s*(\d{1,2})\b/gi,
      /"game_number"\s*:\s*(\d{1,2})\b/gi
    ];
    var lastMatch = null;
    for (var i = 0; i < patterns.length; i++) {
      var m; patterns[i].lastIndex = 0;
      while ((m = patterns[i].exec(text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) lastMatch = n;
      }
    }
    if (lastMatch !== null) sendToServer(lastMatch, 'regex@' + source);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOOK WEBSOCKET (iframe)
  // ═══════════════════════════════════════════════════════════════════════════
  (function() {
    var Orig = window.WebSocket;
    if (!Orig || Orig.__rwV100) return;
    Orig.__rwV100 = true;

    var WSProxy = function(url, protos) {
      console.log('[RW] IFRAME WS: ' + (url || '').substring(0, 120));
      var ws = protos ? new Orig(url, protos) : new Orig(url);

      if (_wsWasClosed) {
        _wsWasClosed = false;
        _iframeDeadNotified = false;
        setTimeout(startGapRecovery, 1000);
      }

      ws.addEventListener('message', function(e) {
        try {
          _iframeLastActivity = Date.now();
          var data = e.data;
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) { try { data = String.fromCharCode.apply(null, new Uint8Array(data)); } catch(er) { return; } }
            else return;
          }

          // Socket.io: 42["event",{...}]
          if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
            try {
              var p = JSON.parse(data.substring(2));
              if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'object') {
                var evt = String(p[0] || '');
                // v6.5: Process ALL socket.io events (fallback regex for all others)
                if (evt.indexOf('result') >= 0 || evt.indexOf('complete') >= 0 ||
                    evt.indexOf('win') >= 0 || evt.indexOf('round') >= 0 ||
                    evt.indexOf('spin') >= 0 || evt.indexOf('game') >= 0 ||
                    evt.indexOf('end') >= 0 || evt.indexOf('finish') >= 0 ||
                    evt.indexOf('update') >= 0 || evt.indexOf('new') >= 0 ||
                    evt.indexOf('bet') >= 0 || evt.indexOf('state') >= 0) {
                  extractObj(p[1], 0, 'sio.' + evt);
                  extractFromText(data, 'sio.' + evt);
                } else {
                  // Fallback: regex on all other events
                  extractFromText(data, 'sio-fb.' + evt);
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
        console.log('[RW] IFRAME WS cerrado (code:' + e.code + ')');
        _wsWasClosed = true;
        _iframeDeadNotified = false;
      });

      ws.addEventListener('open', function() { console.log('[RW] IFRAME WS ABIERTO'); });
      return ws;
    };

    WSProxy.prototype = Orig.prototype;
    WSProxy.CONNECTING = Orig.CONNECTING; WSProxy.OPEN = Orig.OPEN;
    WSProxy.CLOSING = Orig.CLOSING; WSProxy.CLOSED = Orig.CLOSED;
    window.WebSocket = WSProxy;
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // HOOK FETCH (iframe)
  // ═══════════════════════════════════════════════════════════════════════════
  (function() {
    var orig = window.fetch;
    if (!orig || orig.__rwV100) return;
    orig.__rwV100 = true;

    window.fetch = function(input, init) {
      _iframeLastActivity = Date.now();
      var url = '';
      try { url = typeof input === 'string' ? input : (input instanceof Request ? (input.url || '') : (input && input.url ? input.url : '')); } catch(e) {}
      var ul = url.toLowerCase();
      if ((ul.indexOf('result') >= 0 || ul.indexOf('roulette') >= 0 || ul.indexOf('evolution') >= 0 || ul.indexOf('round') >= 0 || ul.indexOf('wheel') >= 0 || ul.indexOf('game') >= 0 || ul.indexOf('spin') >= 0 || ul.indexOf('bet') >= 0 || ul.indexOf('play') >= 0) && ul.indexOf('.css') < 0 && ul.indexOf('.js') < 0 && ul.indexOf('.png') < 0) {
        // Exclude history/state URLs (historical data, not current result)
        if (ul.indexOf('history') < 0 && ul.indexOf('state') < 0 && ul.indexOf('stats') < 0) {
          var promise = orig.apply(this, arguments);
          promise.then(function(r) {
            try { r.clone().text().then(function(text) { if (text && text.length < 200000) { try { extractObj(JSON.parse(text), 0, 'fetch'); } catch(e) {} extractFromText(text, 'fetch'); } }).catch(function() {}); } catch(e) {}
          }).catch(function() {});
          return promise;
        }
      }
      return orig.apply(this, arguments);
    };
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // HOOK XHR (iframe)
  // ═══════════════════════════════════════════════════════════════════════════
  (function() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwV100) return;
    origSend.__rwV100 = true;

    XMLHttpRequest.prototype.open = function(m, u) { this._rwUrl = String(u || ''); return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      this.addEventListener('load', function() {
        var u = (self._rwUrl || '').toLowerCase();
        if ((u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0 || u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0 || u.indexOf('game') >= 0) && u.indexOf('.css') < 0 && u.indexOf('.js') < 0) {
          if (u.indexOf('history') < 0 && u.indexOf('state') < 0 && u.indexOf('stats') < 0) {
            try { var t = self.responseText; if (t) { try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {} extractFromText(t, 'xhr'); } } catch(e) {}
          }
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // HOOK postMessage (iframe)
  // ═══════════════════════════════════════════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwV100) return;
    orig.__rwV100 = true;

    window.postMessage = function(data, origin, transfer) {
      try {
        if (typeof data === 'object' && data !== null &&
            data.source !== 'rollerwin-capture' && data.source !== 'rollerwin-sync' &&
            data.source !== 'rollerwin-sync-reply' && data.source !== 'rollerwin-session-expired') {
          extractObj(data, 0, 'pm-out');
        }
      } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };

    window.addEventListener('message', function(e) {
      try {
        var d = e.data;
        if (typeof d === 'object' && d !== null &&
            d.source !== 'rollerwin-capture' && d.source !== 'rollerwin-sync' &&
            d.source !== 'rollerwin-sync-reply' && d.source !== 'rollerwin-session-expired') {
          extractObj(d, 0, 'pm-in');
        }
      } catch(e) {}
    });
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // HOOK EventSource (iframe)
  // ═══════════════════════════════════════════════════════════════════════════
  (function() {
    if (typeof window.EventSource === 'undefined') return;
    var Orig = window.EventSource;
    if (Orig.__rwV100) return;
    Orig.__rwV100 = true;

    var ESProxy = function(url, opts) {
      var es = opts ? new Orig(url, opts) : new Orig(url);
      var add = es.addEventListener.bind(es);
      ['result','game','update','roulette','number','outcome','round','spin','complete','message'].forEach(function(t) {
        add(t, function(e) {
          try {
            if (typeof e.data === 'string') {
              extractFromText(e.data, 'sse.' + t);
              try { extractObj(JSON.parse(e.data), 0, 'sse.' + t); } catch(er) {}
            }
          } catch(er) {}
        });
      });
      return es;
    };

    ESProxy.prototype = Orig.prototype;
    ESProxy.CONNECTING = Orig.CONNECTING; ESProxy.OPEN = Orig.OPEN; ESProxy.CLOSED = Orig.CLOSED;
    window.EventSource = ESProxy;
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // DOM SCANNER — ULTRA STRICT (v7.6 proven)
  // Only scans for CURRENT result, NEVER history
  // ═══════════════════════════════════════════════════════════════════════════
  (function() {
    var HKW = ['history','past','track','sequence','previous','older','last-result','lastresults',
      'gamehistory','result-history','historyitem','resultshistory',
      'bng','stats','statistics','roadmap','bigroad','beadroad','marker','recent','last'];
    var CKW = ['winning-number','winningnumber','winning-pocket','winningpocket',
      'result-display','resultdisplay','result-value','resultvalue','current-result',
      'game-number-display','number-display','overlay-result','announced','lastnumber',
      'round-result','roulette-result','live-result','detailed-result'];

    function isHist(el) {
      if (!el) return false;
      var c = ((el.className||'') + ' ' + (el.id||'') + ' ' + (el.getAttribute('data-test')||'')).toLowerCase();
      for (var i = 0; i < HKW.length; i++) { if (c.indexOf(HKW[i]) >= 0) return true; }
      var p = el.parentElement, d = 0;
      while (p && d < 5) {
        var pc = ((p.className||'') + ' ' + (p.id||'')).toLowerCase();
        for (var i = 0; i < HKW.length; i++) { if (pc.indexOf(HKW[i]) >= 0) return true; }
        p = p.parentElement; d++;
      }
      return false;
    }

    function isCurr(el) {
      if (!el) return false;
      var c = ((el.className||'') + ' ' + (el.id||'') + ' ' + (el.getAttribute('data-test')||'')).toLowerCase();
      for (var i = 0; i < CKW.length; i++) { if (c.indexOf(CKW[i]) >= 0) return true; }
      return el.hasAttribute('data-result-number') || el.hasAttribute('data-winning-number') || el.hasAttribute('data-game-result');
    }

    var SELS = [
      '[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]',
      '[class*="result-value"]','[class*="current-result"]','[class*="game-number-display"]',
      '[class*="number-display"]','[data-result-number]','[data-winning-number]','[data-game-result]',
      '[class*="overlay"] [class*="result"]','[class*="announced"]','[class*="round-result"]',
      '[class*="roulette-result"]','[class*="live-result"]','[class*="last-number"]',
      '[class*="lastnumber"]','[class*="game-result"]'
    ];

    // Change-detect: same number >15s = new spin
    var _lastDomNumber = -1;
    var _lastDomNumberTime = 0;
    var _DOM_REPEAT_LIMIT = 15000;

    function scanDOM() {
      for (var i = 0; i < SELS.length; i++) {
        try {
          var els = document.querySelectorAll(SELS[i]);
          for (var j = 0; j < els.length; j++) {
            if (isHist(els[j])) continue;
            if (!isCurr(els[j]) && !els[j].hasAttribute('data-result-number') && !els[j].hasAttribute('data-winning-number')) continue;
            var t = (els[j].textContent || '').trim();
            var num = parseInt(t, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === t) {
              var now = Date.now();
              if (num === _lastDomNumber && now - _lastDomNumberTime < _DOM_REPEAT_LIMIT) return;
              _lastDomNumber = num;
              _lastDomNumberTime = now;
              sendToServer(num, 'DOM:' + SELS[i]);
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

  console.log('%c[RW] v10.0 IFRAME MOTOR ACTIVO | ' + hostname + ' | Dedup 9s + SEQ 10s + GapRecovery',
    'color:#22c55e;font-weight:bold;font-size:13px;background:#000;padding:4px 8px;border-radius:4px;');
})();