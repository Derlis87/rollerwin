// ============================================================
// ws-interceptor.js v3.1 - Captura via inyección CDP en iframes
// ============================================================
// ESTRATEGIA:
//   1. Obtener sesión CDP del browser (no de la page)
//   2. Usar Target.setAutoAttach para recibir eventos de NUEVOS iframes
//   3. En cada Target.attachedToTarget:
//      a. Crear sesión CDP dedicada para ese target
//      b. Llamar Page.addScriptToEvaluateOnNewDocument con worldName:''
//      c. Llamar Runtime.runIfWaitingForDebugger para resumir
//   4. Los hooks de WS/Fetch/XHR en el script inyectado envían
//      números via window.parent.postMessage
//   5. Node.js escucha page.on('console') para los logs del script
//      Y también page.evaluate para leer el postMessage
//
// NOTA CRÍTICA: Esto SOLO funciona si Chrome se lanza con:
//   --disable-site-isolation-trials
//   --disable-features=IsolateOrigins,site-per-process
//   Sin estos flags, Chrome separa los iframes en procesos OOPIF
//   y Page.addScriptToEvaluateOnNewDocument NO se ejecuta en ellos.
// ============================================================
const log = require('../utils/logger');
const { getInjectScript } = require('./inject-capture');

function setupNetworkInterception(page, casinoName, onNumberDetected, options = {}) {
  let logTag = casinoName;
  let liveActive = false;
  let liveActiveTime = 0;
  let stopped = false;
  let injectCount = 0;
  let numberCount = 0;
  let _lastNumber = -1;

  const _onNumber = (number, source) => {
    if (stopped) return;
    if (number === _lastNumber) return; // Dedup simple
    _lastNumber = number;
    numberCount++;

    if (!liveActive) {
      log.debug(logTag, `[GRACE] ${number} bloqueado [${source}]`);
      return;
    }
    log.info(logTag, `*** NUMERO CAPTURADO: ${number} [${source}] ***`);
    onNumberDetected(number, source);
  };

  // ========================================
  // MÉTODO 1: Escuchar console.log del script inyectado
  //   El script inyectado hace console.log('[RW-INJECT] RESULTADO: N ...')
  //   Node.js lo captura via page.on('console')
  // ========================================
  page.on('console', (msg) => {
    if (stopped) return;
    const text = msg.text();
    if (!text.includes('[RW-INJECT]')) return;

    // Capturar números del log
    if (text.includes('RESULTADO:')) {
      const match = text.match(/RESULTADO:\s*(\d{1,2})\s/);
      if (match) {
        const n = parseInt(match[1], 10);
        _onNumber(n, 'console-log');
      }
    }
    // Loggear otros eventos
    else if (text.includes('WS conectado:')) {
      log.info(logTag, `  [WS] ${text.split('[RW-INJECT]')[1]?.trim() || ''}`);
    }
    else if (text.includes('DEDUP:')) {
      log.debug(logTag, `  [DEDUP] ${text.split('[RW-INJECT]')[1]?.trim() || ''}`);
    }
    else {
      log.debug(logTag, `  ${text.substring(0, 150)}`);
    }
  });

  // ========================================
  // MÉTODO 2: Escuchar mensajes via postMessage
  //   El script inyectado en los iframes hace:
  //   window.parent.postMessage({source:'rw-capture', number:N}, '*')
  //   Escuchamos esto en la página principal
  // ========================================
  const setupPostMessageListener = async () => {
    try {
      await page.evaluate(() => {
        if (window.__rwListenerAdded) return;
        window.__rwListenerAdded = true;

        // Escuchar postMessage desde iframes
        window.addEventListener('message', function(event) {
          try {
            var data = event.data;
            if (data && data.source === 'rw-capture' && typeof data.number === 'number') {
              // Usar console.log para que Node.js lo capture via page.on('console')
              console.log('[RW-PARENT] NUMBER:' + data.number + ':HOOK:' + (data.sourceHook || '?') + ':HOST:' + (data.hostname || '?'));
            }
          } catch(e) {}
        });

        console.log('[RW-PARENT] Listener de postMessage activo');
      });
      log.info(logTag, 'Listener postMessage configurado en página principal');
    } catch (err) {
      log.warn(logTag, `Error configurando postMessage listener: ${err.message}`);
    }
  };

  // ========================================
  // MÉTODO 3: Escuchar console.log del PARENT listener
  //   (captura los [RW-PARENT] NUMBER:N mensajes)
  // ========================================
  // Ya está cubierto por page.on('console') arriba, pero lo hacemos explícito:
  // Se agrega un segundo listener que capture los mensajes del parent

  // ========================================
  // MÉTODO 4: Inyectar en TODOS los frames via CDP
  //   Usar Target.setAutoAttach para detectar NUEVOS iframes
  //   e inyectar el script de captura en cada uno
  // ========================================
  const setupCDPInjection = async () => {
    try {
      // Obtener sesión CDP del browser (necesitamos nivel browser, no page)
      const browserSession = await page.context().newCDPSession(page);

      // Escuchar consola para mensajes [RW-PARENT]
      browserSession.on('Runtime.consoleAPICalled', (params) => {
        if (stopped) return;
        const text = (params.args || []).map(a => {
          try { return a.value || a.description || ''; }
          catch(e) { return ''; }
        }).join(' ');

        if (text.includes('[RW-PARENT] NUMBER:')) {
          const match = text.match(/NUMBER:(\d{1,2}):HOOK:([^:]+):HOST:([^\s]+)/);
          if (match) {
            const n = parseInt(match[1], 10);
            const hook = match[2] || '?';
            const host = match[3] || '?';
            _onNumber(n, `postMsg-${hook}@${host}`);
          }
        }
      });

      // Habilitar Target events
      // Auto-attach a NUEVOS iframes cuando se creen
      await browserSession.send('Target.setAutoAttach', {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: false,  // IMPORTANTE: false = cada target tiene su propia sesión
      });

      browserSession.on('Target.attachedToTarget', async (event) => {
        if (stopped) return;
        const { targetInfo, sessionId } = event;
        const targetUrl = targetInfo.url || '';
        const targetType = targetInfo.type || '';

        log.info(logTag, `Target: ${targetType} | ${targetUrl.substring(0, 80)}`);

        try {
          // Habilitar Page en ESTE target específico
          await browserSession.send('Page.enable', {}, sessionId);

          // Inyectar el script de captura en MAIN world de ESTE target
          await browserSession.send('Page.addScriptToEvaluateOnNewDocument', {
            source: getInjectScript(),
            worldName: '',       // MAIN world (mismo contexto que el juego)
            runImmediately: true,
          }, sessionId);

          // Habilitar Runtime y Console para ver los logs
          await browserSession.send('Runtime.enable', {}, sessionId);
          await browserSession.send('Console.enable', {}, sessionId);

          // MÉTODO DE RESPALDO: Habilitar Network para capturar WS frames
          // Esto funciona incluso si la inyección del script falla
          await browserSession.send('Network.enable', {}, sessionId);

          // Escuchar WS frames directamente desde CDP
          const wsFrameHandler = (params) => {
            if (stopped) return;
            const payload = params.response && params.response.payloadData;
            if (!payload || typeof payload !== 'string') return;
            if (payload.length < 5) return;

            // Usar la misma lógica de detección que el script inyectado
            try {
              // Evolution: {type:X, args:{recentResults:[["N"],...]}}
              const evoMatch = payload.match(/"recentResults"\s*:\s*\[\s*\[\s*"(\d{1,2})"\s*\]/);
              if (evoMatch) {
                const n = parseInt(evoMatch[1], 10);
                if (n >= 0 && n <= 36) {
                  _onNumber(n, `cdp-ws-recentResults@${targetUrl.substring(0, 30)}`);
                  return;
                }
              }

              // Regex general
              const patterns = [
                /"resultNumber"\s*:\s*(\d{1,2})\b/gi,
                /"winningNumber"\s*:\s*(\d{1,2})\b/gi,
                /"winning_number"\s*:\s*(\d{1,2})\b/gi,
                /"ball_number"\s*:\s*(\d{1,2})\b/gi,
              ];
              let lastMatch = null;
              for (const pat of patterns) {
                pat.lastIndex = 0;
                let m;
                while ((m = pat.exec(payload)) !== null) {
                  const n = parseInt(m[1], 10);
                  if (n >= 0 && n <= 36) lastMatch = n;
                }
              }
              if (lastMatch !== null) {
                _onNumber(lastMatch, `cdp-ws-regex@${targetUrl.substring(0, 30)}`);
              }
            } catch(e) {}
          };

          browserSession.on('Network.webSocketFrameReceived', wsFrameHandler);

          injectCount++;
          log.info(logTag, `✓ Script + Network habilitado en ${targetType} #${injectCount}: ${targetUrl.substring(0, 60)}`);

          // También escuchar console desde ESTE target
          browserSession.on('Runtime.consoleAPICalled', (params) => {
            if (stopped) return;
            const text = (params.args || []).map(a => {
              try { return a.value || a.description || ''; }
              catch(e) { return ''; }
            }).join(' ');

            if (text.includes('[RW-INJECT] RESULTADO:')) {
              const match = text.match(/RESULTADO:\s*(\d{1,2})\s/);
              if (match) {
                const n = parseInt(match[1], 10);
                const hookMatch = text.match(/—\s*(\S+)/);
                const hook = hookMatch ? hookMatch[1] : 'iframe';
                _onNumber(n, hook);
              }
            }
            else if (text.includes('[RW-INJECT] WS conectado:')) {
              log.info(logTag, `  [iframe-WS] ${text.split('WS conectado:')[1]?.trim() || ''}`);
            }
          });

        } catch (err) {
          log.debug(logTag, `Error inyectando en target: ${err.message}`);
        }

        // CRÍTICO: Resumir el target para que el juego cargue
        try {
          await browserSession.send('Runtime.runIfWaitingForDebugger', {}, sessionId);
        } catch (e) {}
      });

      log.info(logTag, 'CDP auto-injection configurada (Target.setAutoAttach)');

    } catch (err) {
      log.warn(logTag, `Error CDP injection: ${err.message}`);
    }
  };

  // ========================================
  // MÉTODO 5: Re-inyección periódica
  //   Escanea frames existentes cada 5s y re-inyecta si es necesario
  // ========================================
  const reinjectInterval = setInterval(async () => {
    if (stopped || !page || page.isClosed()) return;

    try {
      // Verificar frames actuales
      const frames = page.frames();
      for (const frame of frames) {
        const url = frame.url();
        if (!url.includes('evolution') && !url.includes('pragmatic') &&
            !url.includes('everymatrix') && !url.includes('evo-games')) continue;

        try {
          // Intentar inyectar directamente en el frame via evaluate
          // Esto SÓLO funciona si el frame está en el mismo proceso (no OOPIF)
          await frame.evaluate(() => {
            if (window.__rwInjected) return 'already';
            // Si no está inyectado, el script principal lo hará via CDP
            return 'need-inject';
          });
        } catch(e) {
          // Cross-origin — normal, el CDP Target.setAutoAttach lo maneja
        }
      }
    } catch(e) {}
  }, 5000);

  // ========================================
  // MÉTODO 6: Polling del postMessage listener como RESPALDO
  //   Verifica si hay números pendientes en la página principal
  // ========================================
  const pollInterval = setInterval(async () => {
    if (stopped || !page || page.isClosed()) return;
    try {
      const result = await page.evaluate(() => {
        if (window.__rwPendingNumber !== undefined) {
          var n = window.__rwPendingNumber;
          var src = window.__rwPendingSource || 'poll';
          window.__rwPendingNumber = undefined;
          window.__rwPendingSource = undefined;
          return { number: n, source: src };
        }
        return null;
      }).catch(() => null);

      if (result && typeof result.number === 'number') {
        _onNumber(result.number, result.source);
      }
    } catch(e) {}
  }, 3000);

  // ========================================
  // INICIALIZACIÓN
  // ========================================
  log.info(logTag, 'Configurando captura v3.1 (CDP inyección MAIN world)...');

  setupPostMessageListener().catch(e => log.debug(logTag, `postMessage: ${e.message}`));
  setupCDPInjection().catch(e => log.warn(logTag, `CDP setup: ${e.message}`));

  const scanner = {
    activateLiveCapture(graceMs = 0) {
      if (graceMs > 0) {
        log.info(logTag, `Activando captura en ${graceMs}ms (grace)...`);
        setTimeout(() => {
          if (!stopped) {
            liveActive = true;
            liveActiveTime = Date.now();
            log.info(logTag, '>>> CAPTURA EN VIVO ACTIVADA <<<');
          }
        }, graceMs);
      } else {
        liveActive = true;
        liveActiveTime = Date.now();
        log.info(logTag, '>>> CAPTURA EN VIVO ACTIVADA <<<');
      }
    },

    async scan() {
      return null;
    },

    stop() {
      stopped = true;
      liveActive = false;
      if (reinjectInterval) clearInterval(reinjectInterval);
      if (pollInterval) clearInterval(pollInterval);
      log.info(logTag, `Captura detenida. Inyecciones: ${injectCount}, Números: ${numberCount}`);
    },

    getStats() {
      return { injectCount, numberCount, liveActive, liveActiveTime };
    },
  };

  return scanner;
}

module.exports = { setupNetworkInterception };