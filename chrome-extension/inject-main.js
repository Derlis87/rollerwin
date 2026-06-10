// RollerWin Capture v7.7 - MAIN WORLD DETECTION ENGINE
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
// FIX v6.4: DEDUP DEFINITIVO — 100% fiel a la secuencia real:
//   - ELIMINADO _lastSentNumber: bloqueaba repetidos legitimas (ej: 15, 15)
//   - DEDUP por tiempo 9s: bloquea multiples hooks del MISMO giro unicamente
//   - DOM Scanner con change-detect + 15s: mismo numero visible >15s = nuevo giro
//   - Sync parent↔iframe: popula _sentNumbers (no _lastSentNumber)
// FIX v6.5: 3 BUGS DEFINITIVOS:
//   - BUG 1 (Duplicados/Skips): Servidor ELIMINO sequence dedup. Solo dedup por tiempo.
//   - BUG 2 (Skips): WS hook ampliado + fallback extractFromText.
//   - BUG 3 (Session Recovery): _recoveryInProgress PERSISTIDO en localStorage.
// FIX v6.6: IFRAME SESSION RECOVERY — el bug que causaba "Recovers: 0":
//   - El modal "SESIÓN FINALIZADA" aparece DENTRO del iframe (Evolution),
//     NO en el parent. El parent NO puede ver el DOM del iframe.
//   - Antes: parent buscaba modal en su propio DOM → nunca lo encontraba.
//   - Ahora: iframe detecta modal → postMessage al parent → recovery.
//   - Reload si sin capturas >120s sin importar keep-alive (iframe muerto).
//   - iframe tambien detecta fetch 401/403 y notifica al parent.
//   - iframe detecta falta de actividad >90s y notifica al parent.
// FIX v6.7: 3 BUGS CRITICOS:
//   - BUG 1 (Números saltados): DEDUP por VALOR bloqueaba repeticiones legítimas
//     (ej: 15,15). Ahora dedup por TIEMPO GLOBAL: solo bloquea si se envió
//     CUALQUIER número en los últimos 9s, sin importar el valor.
//   - BUG 2 (Nueva pestaña): checkPlayButton clickeaba <a target="_blank">
//     al recuperar sesión. Ahora IGNORA elementos con target="_blank".
//     location.href → location.replace() para forzar misma pestaña.
//   - BUG 3 (Duplicados): syncLastNumber mejorado + dedup global previene
//     re-envío del último número cuando el iframe se recarga.
// FIX v7.6: 4 BUGS CRITICOS DE RECOVERY:
//   - BUG 1 (Número saltado al reiniciar mesa): syncLastNumber seteaba
//     _lastSentTimestamp, bloqueando DEDUP-TIME por 9s. El DOM Scanner
//     no podía capturar el número del gap. Ahora sync NO toca _lastSentTimestamp.
//   - BUG 2 (MutationObserver 2s muy lento): Si un número aparece y cambia
//     en <2s durante restart, se pierde. Reducido a 500ms.
//   - BUG 3 (Sin Gap Recovery): Agregado scanner agresivo cuando hay gap >22s.
//     Escanea DOM cada 3s hasta capturar un número. También se activa
//     al reconectar WS.
//   - BUG 4 (iframe dead 90s muy lento): Reducido a 45s + detección de
//     WS reconnect para escaneo inmediato del DOM.
(function() {
  'use strict';

  if (window.__rwMainV73) return;
  window.__rwMainV73 = true;

  // v7.7 GUARD: Solo ejecutar en betfury.com/betfury.io (parent) O en iframes de
  // proveedores de casino conocidos (Evolution, Pragmatic, etc.).
  // El recovery (location.replace) SOLO corre en el parent (!isInIframe),
  // asi que es seguro permitir iframes de otros dominios.
  var _rwHostname = (location.hostname || '').toLowerCase();
  var _isBetfury = _rwHostname.indexOf('betfury') !== -1;
  var _isGameProvider = _rwHostname.indexOf('evolution') !== -1 ||
    _rwHostname.indexOf('pragmatic') !== -1 ||
    _rwHostname.indexOf('ezugi') !== -1 ||
    _rwHostname.indexOf('softswiss') !== -1;
  // En iframes, permitir cualquier dominio (el parent check protege el recovery)
  var isInIframe = (window.self !== window.top);
  if (!_isBetfury && !isInIframe) {
    console.log('[RollerWin] HOSTNAME NO ES BETFURY Y NO ES IFRAME (' + _rwHostname + ') — script detenido.');
    return;
  }
  console.log('[RollerWin] Hostname OK: ' + _rwHostname + (isInIframe ? ' [IFRAME]' : ' [PARENT]') + (_isGameProvider ? ' [PROVIDER]' : ''));

  var SERVER = 'https://rollerwin3.onrender.com';
  var lastNum = -1;
  var lastTime = 0;
  var sentCount = 0;

  // ═══ DEDUP v6.4: Dedup por TIEMPO — 100% fiel a la secuencia real ═══
  // REGLA: Un numero se envía UNA VEZ por giro, sin importar su valor.
  // Si el mismo numero cae en giros consecutivos (ej: 15, 15), AMBOS se capturan.
  // Solo se bloquea si multiples hooks (WS, Fetch, XHR, DOM) detectan el
  // MISMO giro — dedup por tiempo de 9s cubre esto.
  //
  // Por que 9s? Los giros duran ~18s. El hook mas rapido (WS) detecta al
  // inicio (T=0). El DOM Scanner corre cada 8s, max deteccion del mismo
  // giro es T=8s (8-0=8s < 9s → bloqueado). El proximo giro a T=18s:
  // 18-0=18s > 9s → permitido, incluso si es el mismo numero.
  //
  // DOM Scanner: usa change-detect con limite de 15s. Si el mismo numero
  // lleva >15s visible en pantalla, es un NUEVO giro → permite re-enviar.
  // v6.7 FIX: DEDUP por secuencia, NO por valor.
  // Antes: _sentNumbers = { number: timestamp } — si cae 15,15 legítimos,
  // el segundo 15 se bloqueaba porque el primero estaba en el mapa.
  // Ahora: _lastSentTimestamp global — solo bloquea si CUALQUIER numero fue
  // enviado en los ultimos 9s (independiente del valor). Los giros duran ~18s.
  var _lastSentTimestamp = 0;
  var _DEDUP_WINDOW = 9000;  // 9s
  var _sentNumbersSet = {}; // Set de numeros enviados (para sync, no para dedup)

  function _isDuplicate(n) {
    var now = Date.now();
    // v6.7: Solo dedup por TIEMPO GLOBAL — si se envio CUALQUIER numero
    // en los ultimos 9s, este hook detecta el mismo giro → bloquear.
    // Esto permite repetidos legítimos (15,15) si estan separados >9s.
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
    // Limpiar entradas viejas (+5s de buffer)
    for (var num in _sentNumbersSet) {
      if (now - _sentNumbersSet[num] > _DEDUP_WINDOW + 5000) {
        delete _sentNumbersSet[num];
      }
    }
  }

  // Sincronizar desde el parent (sobrevive recargas de iframe)
  // Popula _sentNumbers para que el iframe recargado no re-envie el ultimo numero
  // v7.6 FIX: NO setear _lastSentTimestamp! Solo poblar _sentNumbersSet y secuencia.
  // Si seteamos _lastSentTimestamp, el DEDUP-TIME bloquea TODAS las capturas por 9s,
  // impidiendo que el DOM Scanner capture el número que apareció durante el gap.
  function syncLastNumber(n) {
    if (n >= 0 && n <= 36) {
      var now = Date.now();
      _sentNumbersSet[n] = now;
      // v7.6: NO tocar _lastSentTimestamp — dejarlo en 0 para que el primer
      // escaneo DOM pueda capturar inmediatamente. DEDUP-SEQ previene re-envío
      // del número sincronizado (misma valor dentro de 10s → bloqueado).
      console.log('[RollerWin] SYNC: numero ' + n + ' marcado como enviado (desde parent, v7.6 sin timestamp)');
    }
  }

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
      console.log('[RollerWin] DEDUP: ' + n + ' bloqueado (ultimo envio hace ' + Math.round(now - _lastSentTimestamp) + 's) — ' + source);
      return;
    }

    // v7.4: DEDUP por SECUENCIA — previene re-envío post-recovery/recarga
    // El iframe se recarga sin estado, _lastSentTimestamp = 0, el DOM Scanner
    // re-lee el número viejo visible. La secuencia sobrevive porque se pobló
    // via sync o ya estaba en memoria antes de la recarga del hook.
    if (typeof _checkSequenceDup === 'function' && _checkSequenceDup(n)) {
      console.log('[RollerWin] DEDUP-SEQ: ' + n + ' bloqueado (en secuencia reciente) — ' + source);
      return;
    }

    _markSent(n);
    // v7.4: Agregar a la secuencia para dedup post-recovery
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

    // v6.4: Guardar el último número recibido para sincronizar con iframes recargados
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
        // v6.4: Sincronizar con iframe que se recarga (popula _sentNumbers)
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

    // v7.6.3: Mesa seleccionable desde popup.html o dashboard de RollerWin
    // 1) Lee del servidor (prioridad máxima — configurado desde el dashboard)
    // 2) Lee de localStorage (configurado desde el popup de la extensión)
    // 3) Default: Evolution Live Roulette
    var RW_TABLES = [
      'https://betfury.com/es/casino/games/roulette-live-by-evolution',
      'https://betfury.com/es/casino/games/roulette-azure-by-pragmatic-play'
    ];
    var _selectedTable = localStorage.getItem('rollerwin_selected_table');
    var ROULETTE_URL = (_selectedTable && RW_TABLES.indexOf(_selectedTable) !== -1) ? _selectedTable : RW_TABLES[0];

    // Leer mesa configurada desde el servidor de RollerWin (dashboard)
    try {
      fetch(SERVER + '/api/capture/table-config').then(function(r) { return r.json(); }).then(function(data) {
        if (data && data.selectedTable && RW_TABLES.indexOf(data.selectedTable) !== -1) {
          ROULETTE_URL = data.selectedTable;
          console.log('[RollerWin] Mesa desde servidor:', ROULETTE_URL);
        }
      }).catch(function() {});
    } catch(e) {}

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
          recoveryInProgress: _recoveryInProgress,
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

    // NOTA v7.7: El manejo de pestañas duplicadas se hace en background.js
    // (chrome.tabs.onCreated) — NO se intercepta nada desde la página.

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

    // v6.6 FIX: Escuchar postMessage del iframe para sesion expirada
    // El iframe NO puede ver el DOM del parent y viceversa.
    // Si el iframe detecta "SESIÓN FINALIZADA" o pierde conexion,
    // envia postMessage al parent para activar recovery.
    window.addEventListener('message', function(e) {
      try {
        if (e.data && e.data.source === 'rollerwin-session-expired') {
          console.log('[RollerWin] IFRAME notifico sesion expirada: ' + e.data.reason);
          _sessionExpired = true;
          _saveState();
          handleSessionExpired(e.data.reason);
        }
        // v7.6.4: iframe-dead NO dispara handleSessionExpired — solo resetea contadores.
        // Evita loop de recovery cuando la captura no funciona (ej: mesa Pragmatic).
        if (e.data && e.data.source === 'rollerwin-iframe-dead') {
          console.log('[RollerWin] IFRAME inactivo: ' + e.data.reason + ' — NO es session expired, solo reset contadores');
          _lastCaptureTime = Date.now();
          _lastCapturePersisted = _lastCaptureTime;
          _saveState();
        }
      } catch(err) {}
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
            // v7.7 FIX: Bloquear window.open DURANTE el click para evitar
            // que BetFury abra nueva pestaña al hacer click en OK/VOLVER
            _safeClick(el);
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
                _safeClick(el);
                return true;
              }
            }
          }
        }
      }
      return false;
    }

    // v7.7: Click seguro — bloquea window.open durante el click y lo restaura despues
    function _safeClick(el) {
      var _realOpen = window.open;
      window.open = function() { return null; };
      try { el.click(); } catch(e) { try { el.click(); } catch(e2) {} }
      window.open = _realOpen;
    }

    // ════════════════════════════════════════════════════════
    // 3. HANDLE SESSION EXPIRED — Flujo centralizado
    //    1) Click OK en el modal
    //    2) Esperar 500ms
    //    3) Navegar a la mesa de ruleta
    // ════════════════════════════════════════════════════════
    // v6.5 FIX: _recoveryInProgress PERSISTIDO en localStorage.
    // Antes era solo `var _recoveryInProgress = false` que se reseteaba al recargar.
    // Esto causaba que al volver de una navegacion, el cooldown no funcionara
    // y se iniciara un loop infinito de recoveries.
    var _recoveryInProgress = !!_rwState.recoveryInProgress;
    // v6.3 FIX: Persistir recoveryTimestamp en localStorage para evitar loop infinito
    var _recoveryTimestamp = _rwState.recoveryTimestamp || 0;
    // v6.5: Safety reset — si recovery lleva >60s activo, forzar reset
    // Esto previene que un recovery fallido quede bloqueado permanentemente
    if (_recoveryInProgress && Date.now() - _recoveryTimestamp > 60000) {
      console.log('[RollerWin] Reset recovery bloqueado >60s');
      _recoveryInProgress = false;
    }

    function handleSessionExpired(reason) {
      if (_recoveryInProgress) return;
      var now = Date.now();
      // v6.5 FIX: Cooldown 12s (era 15s) — respuesta mas rapida
      if (now - _recoveryTimestamp < 12000) return; // 12s cooldown (persistido en localStorage)
      
      _recoveryInProgress = true;
      _recoveryTimestamp = now;
      _isRecovering = true;
      _sessionExpired = true;
      _recoverCount++;
      _saveState();

      console.log('[RollerWin] RECOVERY #' + _recoverCount + ' iniciado (' + reason + ')');

      // PASO 1: Click OK en el modal si existe
      var clicked = clickAnyButtonByText(['OK', 'Ok', 'ok', 'ACEPTAR', 'Aceptar', 'aceptar', 'VOLVER', 'Volver', 'volver', 'VUELVA', 'Vuelva', 'volvera', 'INICIAR', 'Iniciar', 'iniciar', 'CONTINUAR', 'Continuar', 'continuar']);
      if (clicked) {
        console.log('[RollerWin] Click OK en modal — esperando 500ms...');
      }

      // PASO 2: Esperar 500ms y navegar
      // v6.7 FIX: Usar location.replace() en vez de location.href para
      // forzar navegacion en la MISMA pestaña (no abre nueva pestaña)
      setTimeout(function() {
        var targetUrl = ROULETTE_URL;
        if (_gameUrl && _gameUrl.indexOf('/casino/games/') !== -1 && _gameUrl.indexOf('roulette') !== -1) {
          targetUrl = _gameUrl;
        }
        console.log('[RollerWin] Navegando a mesa (same tab): ' + targetUrl);
        location.replace(targetUrl);
      }, clicked ? 500 : 100);

      // PASO 3: Safety timeout — resetear despues de 20s
      // v6.5: Reducido a 20s. El estado se persiste para sobreviver recargas.
      setTimeout(function() {
        console.log('[RollerWin] Reset recovery (safety timeout 20s)');
        _recoveryInProgress = false;
        _saveState();
      }, 20000);
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

    // v6.7 FIX: checkPlayButton NUNCA clickea elementos con target="_blank"
    // Eso causaba que se abriera una nueva pestaña al recuperar la sesion.
    function checkPlayButton() {
      if (_playButtonCooldown > Date.now()) return false;
      var onGamePage = location.href.indexOf('/casino/games/') !== -1;
      if (!onGamePage) return false;

      // Buscar boton Jugar/Play en TODOS los elementos clicables
      var btns = document.querySelectorAll('button, a, [role="button"], div[onclick], [class*="btn"], [class*="button"]');
      for (var i = 0; i < btns.length; i++) {
        var bt = (btns[i].textContent || '').trim().toLowerCase();
        if (bt === 'jugar' || bt === 'play' || bt === 'play now' || bt === 'spin' || bt === 'start') {
          // v6.7: NUNCA clickear si tiene target="_blank" (abriria nueva pestaña)
          if (btns[i].getAttribute('target') === '_blank') {
            console.log('[RollerWin] Boton JUGAR IGNORADO (target=_blank) [' + btns[i].tagName.toLowerCase() + ']');
            continue;
          }
          // v6.7: Si es un <a href> con target diferente, ignorar
          if (btns[i].tagName.toLowerCase() === 'a' && btns[i].getAttribute('target')) {
            console.log('[RollerWin] Boton JUGAR IGNORADO (es link con target) [' + btns[i].tagName.toLowerCase() + ']');
            continue;
          }
          console.log('[RollerWin] Boton JUGAR encontrado [' + btns[i].tagName.toLowerCase() + '] — click!');
          _safeClick(btns[i]);
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
    // 6. IFRAME MUERTO: sin capturas >120s → reload COMPLETO
    //    v7.6.4 FIX: Vuelto a 120s (estaba en 60s que causaba loops).
    //    Si la captura no funciona (ej: mesa Pragmatic con estructura diferente),
    //    60s causaba: reload → sin capturas → 60s → reload → loop infinito.
    //    120s da tiempo al Gap Recovery y evita reinicios innecesarios.
    // ════════════════════════════════════════════════════════
    setInterval(function() {
      var noCap = Date.now() - _lastCaptureTime;
      var onGame = location.href.indexOf('/casino/games/') !== -1;

      // v7.6.4: Reload si estamos en juego Y sin capturas >120s
      if (onGame && noCap > 120000 && !_recoveryInProgress) {
        console.log('[RollerWin] Sin capturas ' + Math.round(noCap/1000) + 's — iframe muerto, reload completo...');
        _isRecovering = true;
        _sessionExpired = true;
        _saveState();
        location.reload(); // reload en la misma pestaña
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

    console.log('[RollerWin] v7.7.0 DUAL-PROVIDER+ANTI-LOOP | Mesa:', ROULETTE_URL, '| Count:', _recoverCount);

  }

  // ══════════════════════════════════════
  // ============ IFRAME (Evolution) ======
  // AQUI es donde se detectan los numeros
  // ══════════════════════════════════════
  console.log('[RollerWin] IFRAME detectado:', hostname, '— activando deteccion');

  // v6.6 FIX: Detectar modal "SESIÓN FINALIZADA" dentro del iframe
  // El parent NO puede ver el DOM del iframe, asi que el iframe debe
  // detectar el modal y notificar al parent via postMessage
  var _iframeModalNotified = false;
  function detectIframeModal() {
    var allEls = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');
    for (var i = 0; i < allEls.length; i++) {
      var txt = (allEls[i].textContent || '');
      var txtLow = txt.toLowerCase();
      // "SESIÓN FINALIZADA" / "session ended" / "session expired"
      if ((txtLow.indexOf('sesi') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
          (txtLow.indexOf('sesión') !== -1 && txtLow.indexOf('finalizada') !== -1) ||
          (txtLow.indexOf('session') !== -1 && (txtLow.indexOf('ended') !== -1 || txtLow.indexOf('expired') !== -1))) {
        if (!_iframeModalNotified) {
          _iframeModalNotified = true;
          console.log('[RollerWin] IFRAME: SESION FINALIZADA detectada → notificando parent');
          try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-modal-detected' }, '*'); } catch(e) {}
        }
        // Intentar click OK dentro del iframe tambien
        var okBtns = allEls[i].closest('div, dialog') ? allEls[i].closest('div, dialog').querySelectorAll('button, a, [role="button"], div[onclick], span[onclick]') : [];
        for (var j = 0; j < okBtns.length; j++) {
          var bt = (okBtns[j].textContent || '').trim();
          if (bt === 'OK' || bt === 'Ok' || bt === 'ok' || bt === 'ACEPTAR' || bt === 'Aceptar') {
            console.log('[RollerWin] IFRAME: Click OK en modal sesion');
            // v7.7: Safe click — bloquear window.open durante el click
            var _rwOpen = window.open;
            window.open = function() { return null; };
            try { okBtns[j].click(); } catch(e) {}
            window.open = _rwOpen;
          }
        }
        return true;
      }
    }
    return false;
  }
  setInterval(detectIframeModal, 500);
  try { new MutationObserver(function() { detectIframeModal(); }).observe(document.body, { childList: true, subtree: true }); } catch(e) {}

  // v6.6 FIX: Detectar si el iframe pierde conexion (no hay eventos WS por >60s)
  var _iframeLastActivity = Date.now();
  var _iframeDeadNotified = false;

  // Hook fetch/XHR dentro del iframe para detectar sesion expirada
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

  // v7.6.4 FIX: Notificar parent si el iframe esta muerto (sin actividad >90s)
  // IMPORTANTE: Usar 'rollerwin-iframe-dead' (NO 'rollerwin-session-expired').
  // Antes se usaba session-expired, lo cual causaba location.replace() en loop
  // infinito cuando la captura no funcionaba (ej: mesa Pragmatic con estructura diferente).
  // Ahora el parent trata iframe-dead como un reload suave, NO como session expirada.
  setInterval(function() {
    if (!_iframeDeadNotified && Date.now() - _iframeLastActivity > 90000) {
      _iframeDeadNotified = true;
      console.log('[RollerWin] IFRAME: Sin actividad >90s → notificando parent (iframe-dead, NO session-expired) + Gap Recovery');
      try { window.parent.postMessage({ source: 'rollerwin-iframe-dead', reason: 'iframe-dead-90s' }, '*'); } catch(e) {}
      // v7.6: También activar Gap Recovery localmente
      startGapRecovery();
    }
  }, 10000); // Check cada 10s

  // v7.6 FIX: GAP RECOVERY SCANNER
  // Cuando hay un gap >22s sin capturas (mas de un giro de 18s), significa que
  // se perdió al menos un número. El Gap Recovery Scanner escanea el DOM de
  // forma agresiva cada 3s hasta capturar el número perdido.
  // También se activa cuando el WebSocket se reconecta.
  var _iframeLastCaptureTime = Date.now();
  var _gapRecoveryActive = false;
  var _gapRecoveryTimer = null;
  var _GAP_THRESHOLD = 22000; // 22s — mas de un giro (18s)
  var _GAP_SCAN_INTERVAL = 3000; // 3s entre escaneos de gap

  // v7.6 FIX: WS Reconnect Detection
  // Trackea cuando un WebSocket se cierra y otro se abre.
  // Al reconectar, escanea el DOM inmediatamente para capturar el resultado perdido.
  var _wsWasClosed = false;
  var _wsReconnectCount = 0;

  // v7.5 FIX: Dedup por SECUENCIA — previene re-envío post-recovery
  // La dedup por tiempo (9s) no basta cuando el iframe se recarga: _lastSentTimestamp
  // se resetea a 0, y el DOM Scanner re-lee el número viejo visible en la mesa.
  // Secuencia guarda los últimos 5 números enviados con timestamp.
  // v7.6: Ventana de 10s — los giros duran ~18s, así que 10s NUNCA
  // bloquea repeticiones legítimas (15,15 consecutivos = 18s > 10s → permitido).
  // Pero SI bloquea re-envíos post-recovery que ocurren en 1-5s.
  // Solo bloquea si el MISMO número está en la secuencia dentro de 10s.
  var _sentSequence = []; // Array de {number, timestamp}
  var _SEQUENCE_MAX = 5;
  var _SEQUENCE_WINDOW = 10000; // 10s — mucho MENOR que duración de giro (18s)

  function _checkSequenceDup(n) {
    for (var i = 0; i < _sentSequence.length; i++) {
      if (_sentSequence[i].number === n) {
        if (Date.now() - _sentSequence[i].timestamp < _SEQUENCE_WINDOW) {
          return true; // Mismo número dentro de 10s → duplicado post-recovery
        }
      }
    }
    return false;
  }

  function _addSequence(n) {
    _sentSequence.push({ number: n, timestamp: Date.now() });
    if (_sentSequence.length > _SEQUENCE_MAX) _sentSequence.shift();
    _iframeLastCaptureTime = Date.now(); // v7.6: Actualizar timestamp de captura
    // v7.6: Si habia un gap recovery activo, desactivarlo (se capturó un número)
    if (_gapRecoveryActive) {
      _gapRecoveryActive = false;
      console.log('[RollerWin] GAP RECOVERY: número capturado, desactivando scanner');
    }
  }

  // v7.6: Función de Gap Recovery — escaneo agresivo del DOM
  // Busca el número visible en el DOM usando selectores más amplios.
  // Se usa cuando hay un gap >22s sin capturas o al reconectar WS.
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
      '[class*="game-result"]',
      // v7.7: Selectores Pragmatic Play
      '[class*="gameResult"]',
      '[class*="resultNumber"]',
      '[class*="winningNumber"]',
      '[class*="pocketNumber"]',
      '[class*="lastResult"]',
      '[class*="winner"]',
      '[class*="winning"]',
      '[class*="game-number"]',
      '[class*="gameNumber"]',
      '[data-result]',
      '[data-number]',
      '[data-value][class*="result"]'
    ];

    for (var i = 0; i < gapSelectors.length; i++) {
      try {
        var els = document.querySelectorAll(gapSelectors[i]);
        for (var j = 0; j < els.length; j++) {
          var text = (els[j].textContent || '').trim();
          var num = parseInt(text, 10);
          if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
            console.log('[RollerWin] GAP RECOVERY: número ' + num + ' encontrado en DOM (' + gapSelectors[i] + ')');
            sendToServer(num, 'GAP-RECOVERY:' + gapSelectors[i]);
            return true;
          }
        }
      } catch(e) {}
    }
    return false;
  }

  // v7.6: Iniciar Gap Recovery Scanner
  function startGapRecovery() {
    if (_gapRecoveryActive) return;
    _gapRecoveryActive = true;
    console.log('[RollerWin] GAP RECOVERY: activado (sin capturas >' + Math.round(_GAP_THRESHOLD/1000) + 's)');
    // Escanear inmediatamente
    _gapRecoveryScan();
    // Escanear cada 3s
    _gapRecoveryTimer = setInterval(function() {
      if (!_gapRecoveryActive) {
        clearInterval(_gapRecoveryTimer);
        return;
      }
      _gapRecoveryScan();
    }, _GAP_SCAN_INTERVAL);
  }

  // v7.6: Checker periódico para activar Gap Recovery
  setInterval(function() {
    if (!_gapRecoveryActive && Date.now() - _iframeLastCaptureTime > _GAP_THRESHOLD) {
      startGapRecovery();
    }
  }, 5000); // Check cada 5s

  // v6.4: Solicitar sincronización del último número al parent
  // Esto previene que cualquier hook re-envíe el último resultado
  // después de una recarga del iframe (popula _sentNumbers)
  try {
    var _syncHandler = function(e) {
      try {
        if (e.data && e.data.source === 'rollerwin-sync-reply' && typeof e.data.lastNumber === 'number') {
          syncLastNumber(e.data.lastNumber);
          // v7.4: Tambien poblar la secuencia para prevenir re-envío post-recarga
          _addSequence(e.data.lastNumber);
          window.removeEventListener('message', _syncHandler);
        }
      } catch(err) {}
    };
    window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
    window.addEventListener('message', _syncHandler);
    // Timeout: si no hay respuesta en 2s, continuar sin sync
    setTimeout(function() {
      window.removeEventListener('message', _syncHandler);
    }, 2000);
  } catch(e) {}
  // Re-solicitar sync cada 30s (por si el parent también recarga)
  setInterval(function() {
    try {
      window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
    } catch(e) {}
  }, 30000);

  // Campos de resultado de ruleta (alta confianza)
  // v7.7: Agregados campos usados por Pragmatic Play y otros proveedores
  var RESULT_FIELDS = [
    'number', 'result', 'resultnumber', 'winningnumber', 'win_number',
    'game_number', 'roulette_number', 'ball_number', 'pocket', 'pocket_number',
    'winningpocket', 'pocketid', 'resultid', 'displaynumber',
    'roundresult', 'gameoutcome', 'finalnumber', 'outcome',
    'winningnumberdisplay', 'resultnumber', 'final_number', 'game_result',
    'round_result', 'game_outcome', 'numberstr', 'numberstring',
    // v7.7: Campos adicionales para Pragmatic Play
    'resultnumber', 'winnum', 'win_num', 'result_num', 'gameresult',
    'resultnumberstr', 'rouletteResult', 'resultNumberStr', 'numberstr',
    'rouletteNumber', 'gameResult', 'winningNumberStr', 'pocketNumber',
    'gameNumber', 'roundNumber', 'betResult', 'totalResult'
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

      // v7.6: WS Reconnect Detection — trackea closes y opens
      if (_wsWasClosed) {
        _wsReconnectCount++;
        console.log('[RollerWin] WS RECONNECT #' + _wsReconnectCount + ' detectado — activando Gap Recovery');
        _wsWasClosed = false;
        // Activar Gap Recovery inmediatamente para capturar el número perdido
        setTimeout(function() {
          startGapRecovery();
        }, 1000); // Esperar 1s a que el WS envie estado actual
      }

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;
          // v7.6: Marcar actividad (para iframe dead detection)
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
                // v6.5 FIX: Procesar TODOS los eventos socket.io, no solo los que
                // contienen 'result/complete/win/round/spin'. Evolution puede cambiar
                // los nombres de eventos. extractObj solo extrae si encuentra campos
                // de resultado (isResultField), y extractFromText busca patterns
                // especificos de ruleta. No hay falsos positivos.
                // FIX: Primero intentar con eventos conocidos (prioridad alta)
                if (evt.indexOf('result') >= 0 || evt.indexOf('complete') >= 0 ||
                    evt.indexOf('win') >= 0 ||
                    evt.indexOf('round') >= 0 || evt.indexOf('spin') >= 0 ||
                    evt.indexOf('game') >= 0 || evt.indexOf('end') >= 0 ||
                    evt.indexOf('finish') >= 0 || evt.indexOf('update') >= 0 ||
                    evt.indexOf('new') >= 0 || evt.indexOf('bet') >= 0) {
                  extractObj(p[1], 0, 'sio.' + evt);
                  extractFromText(data, 'sio.' + evt);
                } else {
                  // v6.5: Fallback — intentar regex en TODOS los demas eventos.
                  // Solo extractFromText (no extractObj) para evitar falsos positivos.
                  // Esto cubre cualquier evento que contenga "resultNumber", etc.
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

      // v7.6: Trackear cuando el WS se cierra para detectar reconnects
      ws.addEventListener('close', function(e) {
        console.log('[RollerWin] WS CERRADO (code:' + e.code + ' reason:' + (e.reason || 'none') + ')');
        _wsWasClosed = true;
        _iframeDeadNotified = false; // Reset para permitir nueva notificación si se reconecta
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
      // v7.7: Keywords expandidas para Pragmatic Play + otros proveedores.
      // Tambien se procesan URLs que contienen 'game' o 'casino' si estamos
      // en un iframe (donde TODA la actividad es relevante para la captura).
      var isGameUrl = urlLow.indexOf('result') >= 0 ||
          urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
          urlLow.indexOf('round') >= 0 || urlLow.indexOf('wheel') >= 0 ||
          urlLow.indexOf('pragmatic') >= 0 || urlLow.indexOf('azure') >= 0 ||
          urlLow.indexOf('game') >= 0 || urlLow.indexOf('casino') >= 0 ||
          urlLow.indexOf('live') >= 0 || urlLow.indexOf('bet') >= 0 ||
          urlLow.indexOf('play') >= 0 || urlLow.indexOf('spin') >= 0;
      if (isGameUrl) {
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
        // v7.7: Keywords expandidas (mismas que fetch hook)
        var isGameUrl = u.indexOf('result') >= 0 ||
            u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0 ||
            u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0 ||
            u.indexOf('pragmatic') >= 0 || u.indexOf('azure') >= 0 ||
            u.indexOf('game') >= 0 || u.indexOf('casino') >= 0 ||
            u.indexOf('live') >= 0 || u.indexOf('bet') >= 0 ||
            u.indexOf('play') >= 0 || u.indexOf('spin') >= 0;
        if (isGameUrl) {
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
      'round-result','roulette-result','live-result','detailed-result',
      // v7.7: Pragmatic Play keywords
      'gameresult','game-result','resultnumber','winningnumber',
      'pocketnumber','lastresult','roundnumber','gamenumber',
      'winner','winning','result-number','number-display'];

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

    // v7.7: Selectores expandidos para Pragmatic Play y otros proveedores
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
      '[class*="live-result"]',
      // v7.7: Selectores para Pragmatic Play
      '[class*="game-result"]',
      '[class*="gameResult"]',
      '[class*="roulette-result"]',
      '[class*="winningNumber"]',
      '[class*="resultNumber"]',
      '[class*="number-display"]',
      '[class*="pocket-number"]',
      '[class*="pocketNumber"]',
      '[class*="last-result"]',
      '[class*="lastResult"]',
      '[class*="round-result"]',
      '[class*="game-number"]',
      '[class*="gameNumber"]',
      // Pragmatic: resultado visible en pantalla
      '[class*="result"] [class*="number"]',
      '[class*="number"] [class*="result"]',
      // Pragmatic: circulo/indicador del numero ganador
      '[class*="winner"]',
      '[class*="winning"]'
    ];

    // v6.4 FIX: Change-detect con limite de tiempo para DOM Scanner
    // El DOM muestra el mismo numero hasta el proximo giro (~18s).
    // Sin esto, el scan cada 8s re-enviaria el mismo numero.
    // REGLA: Si el numero CAMBIO → enviar. Si es el MISMO numero pero lleva
    // >15s visible → es un NUEVO giro → tambien enviar.
    // Esto permite capturar repeticiones legitimas (ej: 15, 15 consecutivos)
    // mientras bloquea re-envios del mismo giro.
    var _lastDomNumber = -1;
    var _lastDomNumberTime = 0;
    var _DOM_REPEAT_LIMIT = 15000; // 15s — si el mismo numero lleva >15s, es nuevo giro

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
              var now = Date.now();
              // Enviar si: numero CAMBIO, o mismo numero visible >15s (nuevo giro)
              if (num === _lastDomNumber && now - _lastDomNumberTime < _DOM_REPEAT_LIMIT) return;
              _lastDomNumber = num;
              _lastDomNumberTime = now;
              sendToServer(num, 'DOM-v6.4:' + STRICT_SELECTORS[i]);
              return; // Solo capturar el primer match valido
            }
          }
        } catch(e) {}
      }
    }

    function setup() {
      if (!document.body) return;
      // v7.6: Escaneo inicial rapido (500ms en vez de 3s)
      // Esto es critico post-recovery: el número del gap puede estar visible
      // inmediatamente al cargar el iframe.
      setTimeout(scanDOM, 500);
      // Segundo escaneo a los 2s (por si el DOM tarda en renderizar)
      setTimeout(scanDOM, 2000);

      // v7.6: MutationObserver con debounce de 500ms (era 2s)
      // 2s era muy lento: si un número aparece y cambia en <2s (common durante
      // restart de mesa), se pierde. 500ms captura cambios rápidos.
      var timer = null;
      new MutationObserver(function() {
        if (timer) return;
        timer = setTimeout(function() { timer = null; scanDOM(); }, 500);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });

      // Scan periodico cada 6s (era 8s)
      setInterval(scanDOM, 6000);
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

  console.log('[RollerWin] v7.7 MOTOR ACTIVO en IFRAME ' + hostname + ' | Dedup 9s + SEQ 10s + Per-Number + GapRecovery');
})();
