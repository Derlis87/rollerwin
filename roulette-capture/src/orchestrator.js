// ============================================================
// orchestrator.js - Orquestador principal
// Consulta pipeline-status de RollerWin para saber si debe capturar
// Solo captura cuando el usuario activa Auto Capture en el dashboard
// ============================================================
const { randomDelay, randInt } = require('./utils/helpers');
const log = require('./utils/logger');

class Orchestrator {
  constructor(casinos, config, apiClient) {
    this.casinos = casinos;
    this.config = config;
    this.api = apiClient;
    this.running = false;
    this.capturing = false; // Solo true cuando auto-capture está activo en RollerWin
    this.context = null;
    this.currentCasino = null;
    this.statusCheckInterval = null;
    this.domScanInterval = null;
    this.statsInterval = null;
    this.pipelinePollInterval = null;
    this.sessionStartTime = 0;
    this.lastPipelineTable = '';
    this.lastPipelineCasino = '';
  }

  /**
   * Inicia el orquestador - NO empieza a capturar, espera señal del dashboard
   */
  async start(context) {
    this.context = context;
    this.running = true;
    this.sessionStartTime = Date.now();

    log.info('orchestrator', 'Sistema iniciado - ESPERANDO que actives Auto Capture en RollerWin');
    log.info('orchestrator', 'El script va a consultar el dashboard cada 5 segundos');

    // Verificar API de RollerWin
    const apiOk = await this.api.healthCheck();
    if (apiOk) {
      log.info('orchestrator', 'RollerWin API responde correctamente');
    } else {
      log.warn('orchestrator', 'RollerWin API no responde - verificando...');
    }

    // Polling del pipeline-status cada 5 segundos
    this.pipelinePollInterval = setInterval(() => {
      if (this.running) this._pollPipelineStatus();
    }, 5000);

    // Health check cada 30 segundos
    this.statusCheckInterval = setInterval(() => {
      if (this.running && this.capturing) this._healthCheck();
    }, 30000);

    // DOM Scanner periodico
    this.domScanInterval = setInterval(() => {
      if (this.running && this.capturing && this.currentCasino) {
        this.currentCasino.runDOMScan().catch(() => {});
      }
    }, 10000);

    // Stats cada 60 segundos
    this.statsInterval = setInterval(() => {
      if (this.running) this._printStats();
    }, 60000);
  }

  /**
   * Consulta /api/capture/pipeline-status para saber si debe capturar
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
        // === ACABAN DE ACTIVAR AUTO CAPTURE ===
        log.info('orchestrator', '');
        log.info('orchestrator', '>>> AUTO CAPTURE ACTIVADO desde RollerWin <<<');
        log.info('orchestrator', `    Casino: ${casino}`);
        log.info('orchestrator', `    Mesa:   ${table}`);
        log.info('orchestrator', '');

        this.capturing = true;
        this.lastPipelineTable = table;
        this.lastPipelineCasino = casino;

        // Iniciar captura en la mesa indicada
        await this._startCaptureForTable(casino, table);

      } else if (!shouldBeActive && this.capturing) {
        // === DESACTIVARON AUTO CAPTURE ===
        log.info('orchestrator', '>>> AUTO CAPTURE DESACTIVADO desde RollerWin <<<');
        this.capturing = false;
        if (this.currentCasino) {
          await this.currentCasino.stop();
          this.currentCasino = null;
        }

      } else if (shouldBeActive && this.capturing) {
        // === SIGUE ACTIVO - verificar si cambiaron de mesa ===
        if (table !== this.lastPipelineTable || casino !== this.lastPipelineCasino) {
          log.info('orchestrator', `Cambio de mesa detectado: ${this.lastPipelineCasino} -> ${casino}`);
          this.lastPipelineTable = table;
          this.lastPipelineCasino = casino;
          if (this.currentCasino) {
            await this.currentCasino.stop();
          }
          await this._startCaptureForTable(casino, table);
        }
      }
      // Si no está activo y no estaba capturando, no hacer nada (esperar)

    } catch (err) {
      log.debug('orchestrator', `Error consultando pipeline: ${err.message}`);
    }
  }

  /**
   * Inicia la captura en la mesa especificada por el dashboard
   */
  async _startCaptureForTable(casinoName, tableUrl) {
    // Buscar el casino adecuado por nombre
    let casino = this.casinos.find(c => c.name === casinoName);

    if (!casino) {
      // Si no matchea por nombre, intentar por URL
      casino = this.casinos.find(c => tableUrl.includes(c.name));
    }

    if (!casino) {
      log.error('orchestrator', `No se encontro modulo para casino: ${casinoName}`);
      log.error('orchestrator', `Casinos disponibles: ${this.casinos.map(c => c.name).join(', ')}`);
      return;
    }

    // Setear la URL dinamica que viene del dashboard
    casino.dynamicUrl = tableUrl;

    this.currentCasino = casino;
    log.info('orchestrator', `>>> Conectando a: ${casino.name.toUpperCase()}`);
    log.info('orchestrator', `    URL: ${tableUrl}`);

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

    // Si nunca se capturo nada, dar tiempo al juego para cargar (no recovery)
    // Un numero de ruleta tarda ~30-60 seg entre giros
    if (secondsSinceCapture === Infinity || secondsSinceCapture === null) {
      log.debug('orchestrator',
        `[${this.currentCasino.name}] Esperando primer captura... (sin timeout)`
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
        log.error('orchestrator', `Recovery fallo - esperando proxima activacion`);
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

    const captureStatus = this.capturing ? 'CAPTURANDO' : 'EN ESPERA (activa Auto Capture en RollerWin)';

    log.info('stats',
      `\n` +
      `  ╔══════════════════════════════════════════════════╗\n` +
      `  ║   ROULETTE CAPTURE SYSTEM - STATS                ║\n` +
      `  ╠══════════════════════════════════════════════════╣\n` +
      `  ║  Uptime:       ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}\n` +
      `  ║  Estado:       ${captureStatus}\n` +
      `  ║  Casino:       ${this.currentCasino?.name.toUpperCase() || 'ninguno'}\n` +
      `  ║  Enviados:     ${totalSent}\n` +
      `  ║  Capturados:   ${totalCaptured}\n` +
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

    if (this.pipelinePollInterval) clearInterval(this.pipelinePollInterval);
    if (this.statusCheckInterval) clearInterval(this.statusCheckInterval);
    if (this.domScanInterval) clearInterval(this.domScanInterval);
    if (this.statsInterval) clearInterval(this.statsInterval);

    for (const casino of this.casinos) {
      await casino.stop();
    }

    log.info('orchestrator', 'Sistema detenido completamente');
    this._printStats();
  }
}

module.exports = { Orchestrator };