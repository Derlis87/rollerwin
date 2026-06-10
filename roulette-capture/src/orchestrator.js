// ============================================================
// orchestrator.js - Orquestador principal
// Maneja la rotacion entre casinos, monitoreo y recovery
// ============================================================
const { randomDelay, randInt } = require('./utils/helpers');
const log = require('./utils/logger');

class Orchestrator {
  constructor(casinos, config, apiClient) {
    this.casinos = casinos; // Array de instancias de casino
    this.config = config;
    this.api = apiClient;
    this.currentIndex = 0;
    this.running = false;
    this.context = null; // Playwright BrowserContext
    this.browser = null;
    this.currentCasino = null;
    this.statusCheckInterval = null;
    this.domScanInterval = null;
    this.rotationTimeout = null;
    this.statsInterval = null;
    this.totalNumbersAllCasinos = 0;
    this.sessionStartTime = 0;
  }

  /**
   * Inicia el orquestador con un BrowserContext compartido
   */
  async start(context) {
    this.context = context;
    this.running = true;
    this.sessionStartTime = Date.now();

    log.info('orchestrator',
      `Iniciando con ${this.casinos.length} casino(s): ${this.casinos.map(c => c.name).join(', ')}`
    );

    // Verificar API de RollerWin
    const apiOk = await this.api.healthCheck();
    if (apiOk) {
      log.info('orchestrator', 'RollerWin API responde correctamente');
    } else {
      log.warn('orchestrator', 'RollerWin API no responde - los numeros se seguiran intentando enviar');
    }

    // Iniciar con el primer casino
    await this._startCurrentCasino();

    // Monitoreo de salud (cada 15 segundos)
    this.statusCheckInterval = setInterval(() => {
      if (this.running) this._healthCheck();
    }, 15000);

    // DOM Scanner periodico (cada 10 segundos, como fallback)
    this.domScanInterval = setInterval(() => {
      if (this.running && this.currentCasino) {
        this.currentCasino.runDOMScan().catch(() => {});
      }
    }, 10000);

    // Stats cada 60 segundos
    this.statsInterval = setInterval(() => {
      if (this.running) this._printStats();
    }, 60000);

    // Programar rotacion
    this._scheduleRotation();
  }

  /**
   * Inicia el casino actual
   */
  async _startCurrentCasino() {
    const casino = this.casinos[this.currentIndex];
    this.currentCasino = casino;

    log.info('orchestrator', `>>> Activando casino: ${casino.name.toUpperCase()}`);
    log.info('orchestrator', `    URL: ${casino.getRouletteURL()}`);

    const success = await casino.start(this.context);
    if (!success) {
      log.error('orchestrator', `Fallo al iniciar ${casino.name}, intentando recovery...`);
      const recovered = await casino.recover();
      if (!recovered) {
        log.error('orchestrator', `Recovery fallo para ${casino.name}, rotando...`);
        await this._rotateToNext('startup-fail');
      }
    }
  }

  /**
   * Monitoreo de salud del casino actual
   */
  async _healthCheck() {
    if (!this.currentCasino || !this.running) return;

    const stats = this.currentCasino.getStats();
    const secondsSinceCapture = stats.secondsSinceCapture;

    // Log de status cada chequeo
    log.debug('orchestrator',
      `[${this.currentCasino.name}] status=${stats.status} | ` +
      `sinCaptura=${secondsSinceCapture}s | ` +
      `enviados=${stats.totalSent} | ` +
      `recovery=${stats.recoveryCount}`
    );

    // Si no hay capturas en mucho tiempo, intentar acciones
    if (secondsSinceCapture > this.config.noSpinTimeout) {
      log.warn('orchestrator',
        `Sin capturas por ${secondsSinceCapture}s en ${this.currentCasino.name} - iniciando recovery`
      );
      await this._attemptRecovery();
    }
  }

  /**
   * Intenta recuperar el casino actual
   */
  async _attemptRecovery() {
    if (!this.currentCasino) return;

    const alive = await this.currentCasino.isTableAlive();
    if (!alive) {
      log.warn('orchestrator', `Mesa ${this.currentCasino.name} no esta viva, haciendo recovery...`);
    } else {
      log.warn('orchestrator', `Mesa viva pero sin capturas, haciendo recovery de todas formas...`);
    }

    const recovered = await this.currentCasino.recover();
    if (!recovered) {
      log.error('orchestrator', `Recovery fallo para ${this.currentCasino.name}, rotando al siguiente casino...`);
      await this._rotateToNext('recovery-fail');
    }
  }

  /**
   * Rota al siguiente casino activo
   */
  async _rotateToNext(reason = 'scheduled') {
    if (this.casinos.length === 1) {
      log.warn('orchestrator', 'Solo un casino activo - reiniciando el mismo...');
      await this.currentCasino.stop();
      await this.currentCasino.start(this.context);
      return;
    }

    // Detener casino actual
    if (this.currentCasino) {
      log.info('orchestrator', `Deteniendo ${this.currentCasino.name} (razon: ${reason})`);
      await this.currentCasino.stop();
    }

    // Avanzar al siguiente
    const prevIndex = this.currentIndex;
    let attempts = 0;
    do {
      this.currentIndex = (this.currentIndex + 1) % this.casinos.length;
      attempts++;
      if (attempts > this.casinos.length) {
        log.error('orchestrator', 'Todos los casinos fallaron!');
        // Esperar y reintentar desde el primero
        await randomDelay(30000, 60000);
        this.currentIndex = 0;
        break;
      }
    } while (false); // Rotar siempre al siguiente

    log.info('orchestrator', `Rotacion: ${this.casinos[prevIndex].name} -> ${this.casinos[this.currentIndex].name}`);
    await this._startCurrentCasino();
    this._scheduleRotation();
  }

  /**
   * Programa la proxima rotacion
   */
  _scheduleRotation() {
    if (this.rotationTimeout) clearTimeout(this.rotationTimeout);

    if (this.casinos.length <= 1) return; // No rotar si solo hay un casino

    const intervalMs = randInt(
      this.config.rotationMin * 60 * 1000,
      this.config.rotationMax * 60 * 1000
    );

    const nextRotation = new Date(Date.now() + intervalMs);
    log.info('orchestrator',
      `Proxima rotacion: ${nextRotation.toLocaleTimeString('es-AR', { hour12: false })} ` +
      `(en ${Math.round(intervalMs / 60000)} minutos)`
    );

    this.rotationTimeout = setTimeout(() => {
      if (this.running) {
        log.info('orchestrator', 'Rotacion programada ejecutada');
        this._rotateToNext('scheduled');
      }
    }, intervalMs);
  }

  /**
   * Imprime estadisticas
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

    log.info('stats',
      `\n` +
      `  ╔══════════════════════════════════════════════╗\n` +
      `  ║     ROULETTE CAPTURE SYSTEM - STATS          ║\n` +
      `  ╠══════════════════════════════════════════════╣\n` +
      `  ║  Uptime:        ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}\n` +
      `  ║  Casino actual: ${this.currentCasino?.name.toUpperCase() || 'none'}\n` +
      `  ║  Total enviados a RollerWin: ${totalSent}\n` +
      `  ║  Total capturados:            ${totalCaptured}\n` +
      `  ║  API errors:     ${apiStats.totalErrors}\n` +
      `  ╠══════════════════════════════════════════════╣`
    );

    for (const casino of this.casinos) {
      const s = casino.getStats();
      const statusIcon = s.status === 'capturing' ? '[ON]' : s.status === 'idle' ? '[--]' : '[!!]';
      log.info('stats',
        `  ║  ${statusIcon} ${s.casino.padEnd(10)} | enviados: ${String(s.totalSent).padStart(4)} | ` +
        `ultimo: ${s.lastNumber >= 0 ? s.lastNumber : '-'} | ` +
        `recovery: ${s.recoveryCount} | status: ${s.status}`
      );
    }

    log.info('stats', `  ╚══════════════════════════════════════════════╝`);
  }

  /**
   * Detiene todo
   */
  async stop() {
    this.running = false;

    if (this.statusCheckInterval) clearInterval(this.statusCheckInterval);
    if (this.domScanInterval) clearInterval(this.domScanInterval);
    if (this.rotationTimeout) clearTimeout(this.rotationTimeout);
    if (this.statsInterval) clearInterval(this.statsInterval);

    for (const casino of this.casinos) {
      await casino.stop();
    }

    log.info('orchestrator', 'Sistema detenido completamente');
    this._printStats();
  }
}

module.exports = { Orchestrator };