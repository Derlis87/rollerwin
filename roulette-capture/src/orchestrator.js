// ============================================================
// orchestrator.js v3.1 - Orquestador principal (CDP Injection)
// ============================================================
// Consulta pipeline-status de RollerWin para saber si debe capturar.
// La captura REAL la hace CDP Injection en todos los frames —
// el orquestador solo maneja navegacion, login, recovery.
// ============================================================
const { randomDelay } = require('./utils/helpers');
const log = require('./utils/logger');

class Orchestrator {
  constructor(casinos, config, apiClient) {
    this.casinos = casinos;
    this.config = config;
    this.api = apiClient;
    this.running = false;
    this.capturing = false;
    this.context = null;
    this.currentCasino = null;
    this.statusCheckInterval = null;
    this.pipelinePollInterval = null;
    this.statsInterval = null;
    this.sessionStartTime = 0;
    this.lastPipelineTable = '';
    this.lastPipelineCasino = '';
  }

  /**
   * Inicia el orquestador
   */
  async start(context) {
    this.context = context;
    this.running = true;
    this.sessionStartTime = Date.now();

    log.info('orchestrator', 'Sistema iniciado');
    log.info('orchestrator', 'Consultando dashboard cada 5 segundos para Auto Capture');

    // Verificar API de RollerWin
    const apiOk = await this.api.healthCheck();
    if (apiOk) {
      log.info('orchestrator', 'RollerWin API responde correctamente');
    } else {
      log.warn('orchestrator', 'RollerWin API no responde — se auto-iniciara con el primer casino en 15s');
    }

    // Auto-start: si en 15 segundos no hay senal del dashboard, empezar con el primer casino
    this._autoStartTimer = setTimeout(() => {
      if (this.running && !this.capturing) {
        log.info('orchestrator', 'Sin senal del dashboard — auto-iniciando captura...');
        this.capturing = true;
        const firstCasino = this.casinos[0];
        if (firstCasino) {
          this.lastPipelineCasino = firstCasino.name;
          this.lastPipelineTable = firstCasino.getRouletteURL();
          this._startCaptureForTable(firstCasino.name, firstCasino.getRouletteURL());
        }
      }
    }, 15000);

    // Polling del pipeline-status cada 5 segundos
    this.pipelinePollInterval = setInterval(() => {
      if (this.running) this._pollPipelineStatus();
    }, 5000);

    // Health check cada 30 segundos
    this.statusCheckInterval = setInterval(() => {
      if (this.running && this.capturing) this._healthCheck();
    }, 30000);

    // Stats cada 60 segundos
    this.statsInterval = setInterval(() => {
      if (this.running) this._printStats();
    }, 60000);
  }

  /**
   * Consulta /api/capture/pipeline-status
   */
  async _pollPipelineStatus() {
    try {
      const baseUrl = this.config.ROLLERWIN_API_URL.replace('/api/capture/receive', '');
      const resp = await fetch(`${baseUrl}/api/capture/pipeline-status`);
      const data = await resp.json();

      const shouldBeActive = !!data.active;
      const table = data.table || '';
      const casino = data.casino || '';

      if (shouldBeActive && !this.capturing) {
        log.info('orchestrator', '');
        log.info('orchestrator', '>>> AUTO CAPTURE ACTIVADO desde RollerWin <<<');
        log.info('orchestrator', `    Casino: ${casino}`);
        log.info('orchestrator', `    Mesa:   ${table}`);
        log.info('orchestrator', '');

        this.capturing = true;
        this.lastPipelineTable = table;
        this.lastPipelineCasino = casino;

        await this._startCaptureForTable(casino, table);

      } else if (!shouldBeActive && this.capturing) {
        log.info('orchestrator', '>>> AUTO CAPTURE DESACTIVADO desde RollerWin <<<');
        this.capturing = false;
        if (this.currentCasino) {
          await this.currentCasino.stop();
          this.currentCasino = null;
        }

      } else if (shouldBeActive && this.capturing) {
        if (table !== this.lastPipelineTable || casino !== this.lastPipelineCasino) {
          log.info('orchestrator', `Cambio de mesa: ${this.lastPipelineCasino} -> ${casino}`);
          this.lastPipelineTable = table;
          this.lastPipelineCasino = casino;
          if (this.currentCasino) {
            await this.currentCasino.stop();
          }
          await this._startCaptureForTable(casino, table);
        }
      }

    } catch (err) {
      log.debug('orchestrator', `Error consultando pipeline: ${err.message}`);
    }
  }

  /**
   * Inicia la captura en la mesa especificada
   */
  async _startCaptureForTable(casinoName, tableUrl) {
    let casino = this.casinos.find(c => c.name === casinoName);
    if (!casino) {
      casino = this.casinos.find(c => tableUrl.includes(c.name));
    }

    if (!casino) {
      log.error('orchestrator', `No se encontro modulo para casino: ${casinoName}`);
      log.error('orchestrator', `Casinos disponibles: ${this.casinos.map(c => c.name).join(', ')}`);
      return;
    }

    casino.dynamicUrl = tableUrl;
    this.currentCasino = casino;

    log.info('orchestrator', `>>> Conectando a: ${casino.name.toUpperCase()}`);
    log.info('orchestrator', `    URL: ${tableUrl}`);
    log.info('orchestrator', `    (Captura via CDP Injection en todos los frames)`);

    const success = await casino.start(this.context);
    if (!success) {
      log.error('orchestrator', `Fallo al iniciar ${casino.name}, intentando recovery...`);
      const recovered = await casino.recover();
      if (!recovered) {
        log.error('orchestrator', `Recovery fallo para ${casino.name}`);
      }
    }
  }

  /**
   * Monitoreo de salud
   */
  async _healthCheck() {
    if (!this.currentCasino || !this.capturing) return;

    const stats = this.currentCasino.getStats();
    const secondsSinceCapture = stats.secondsSinceCapture;

    if (secondsSinceCapture === Infinity || secondsSinceCapture === null) {
      log.debug('orchestrator',
        `[${this.currentCasino.name}] Esperando primer captura...`
      );
      return;
    }

    log.debug('orchestrator',
      `[${this.currentCasino.name}] status=${stats.status} | ` +
      `sinCaptura=${secondsSinceCapture}s | enviados=${stats.totalSent}`
    );

    if (secondsSinceCapture > this.config.noSpinTimeout) {
      log.warn('orchestrator', `Sin capturas por ${secondsSinceCapture}s - recovery...`);
      const alive = await this.currentCasino.isTableAlive();
      if (!alive) {
        log.warn('orchestrator', `Mesa ${this.currentCasino.name} no viva, recuperando...`);
      }
      const recovered = await this.currentCasino.recover();
      if (!recovered) {
        log.error('orchestrator', `Recovery fallo — esperando proxima activacion`);
        this.capturing = false;
      }
    }
  }

  /**
   * Stats
   */
  _printStats() {
    const uptime = Math.round((Date.now() - this.sessionStartTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const mins = Math.floor((uptime % 3600) / 60);
    const secs = uptime % 60;

    const apiStats = this.api.getStats();
    let totalSent = 0;
    let totalCaptured = 0;

    for (const casino of this.casinos) {
      const s = casino.getStats();
      totalSent += s.totalSent;
      totalCaptured += s.totalCaptured;
    }

    // Bridge stats
    const bridgeStats = global.__bridge ? global.__bridge.getStats() : {};
    const bridgeRequests = bridgeStats.requestCount || 0;

    const captureStatus = this.capturing ? 'CAPTURANDO' : 'EN ESPERA (activa Auto Capture en RollerWin)';

    log.info('stats',
      `\n` +
      `  ╔══════════════════════════════════════════════════╗\n` +
      `  ║   ROULETTE CAPTURE SYSTEM v3.1 - STATS          ║\n` +
      `  ╠══════════════════════════════════════════════════╣\n` +
      `  ║  Uptime:       ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}\n` +
      `  ║  Modo:         CDP Injection (sin extension)\n` +
      `  ║  Estado:       ${captureStatus}\n` +
      `  ║  Casino:       ${this.currentCasino?.name.toUpperCase() || 'ninguno'}\n` +
      `  ║  Capturados:   ${totalCaptured}\n` +
      `  ║  Enviados:     ${totalSent}\n` +
      `  ║  Bridge reqs:  ${bridgeRequests}\n` +
      `  ║  API errors:   ${apiStats.totalErrors}\n` +
      `  ╚══════════════════════════════════════════════════╝`
    );
  }

  /**
   * Detener todo
   */
  async stop() {
    this.running = false;
    this.capturing = false;

    if (this._autoStartTimer) clearTimeout(this._autoStartTimer);
    if (this.pipelinePollInterval) clearInterval(this.pipelinePollInterval);
    if (this.statusCheckInterval) clearInterval(this.statusCheckInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);

    for (const casino of this.casinos) {
      await casino.stop();
    }

    log.info('orchestrator', 'Sistema detenido completamente');
    this._printStats();
  }
}

module.exports = { Orchestrator };