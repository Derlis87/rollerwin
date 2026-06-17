// ============================================================
// base-casino.js v3.1.1 - Clase base para todos los casinos
// CDP Injection (SIN extension) — Playwright frames + CDP
// ============================================================
const { NumberProcessor } = require('../capture/number-processor');
const { CDPInjector } = require('../capture/cdp-inject');
const { randomDelay } = require('../utils/helpers');
const log = require('../utils/logger');

class BaseCasino {
  constructor(name, config, apiClient) {
    this.name = name;
    this.config = config;
    this.api = apiClient;
    this.page = null;
    this.context = null;
    this.processor = new NumberProcessor(name);
    this.cdpInjector = new CDPInjector((n, src) => this.onNumberFromExtension(n, src));
    this.running = false;
    this.recoveryCount = 0;
    this.consecutiveRecoveryFails = 0;
    this.status = 'idle';
    this.url = '';
    this.dynamicUrl = null;
    this.graceActive = false;
    this.graceTimeout = null;
  }

  getRouletteURL() {
    if (this.dynamicUrl) return this.dynamicUrl;
    throw new Error('getRouletteURL() debe ser implementado o se debe setear dynamicUrl');
  }

  async navigate() {
    throw new Error('navigate() debe ser implementado por la subclase');
  }

  async isTableAlive() {
    try {
      if (!this.page || this.page.isClosed()) return false;
      return await this.page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        return iframes.length > 0;
      }).catch(() => false);
    } catch (e) {
      return false;
    }
  }

  /**
   * Check si fuimos detenidos durante una operacion async
   */
  _wasStopped() {
    return !this.running;
  }

  /**
   * Inicia la captura en este casino
   */
  async start(context) {
    this.context = context;
    this.running = true;
    this.status = 'connecting';

    log.info(this.name, `Iniciando conexion...`);
    log.info(this.name, `URL: ${this.getRouletteURL()}`);
    log.info(this.name, `CDP Injection v4 (Playwright frames)`);

    try {
      // 1. Crear nueva pagina
      this.page = await this.context.newPage();
      if (this._wasStopped()) { log.warn(this.name, 'Cancelado antes de navegar'); return false; }

      // 2. Navegar al casino (implementacion especifica)
      await this.navigate();
      if (this._wasStopped()) { log.warn(this.name, 'Cancelado durante navegacion'); return false; }

      // 3. Esperar a que la mesa cargue (iframe detectado)
      await this._waitForTable();
      if (this._wasStopped()) { log.warn(this.name, 'Cancelado esperando mesa'); return false; }

      // 4. Esperar que los iframes internos carguen bien
      //    El iframe de Evolution tarda en cargar su JS y conectar WS
      log.info(this.name, 'Esperando 10s a que el juego interne cargue...');
      await randomDelay(8000, 12000);
      if (this._wasStopped()) { log.warn(this.name, 'Cancelado esperando carga del juego'); return false; }

      // 5. Inyectar codigo de captura via CDP en TODOS los frames
      log.info(this.name, 'Inyectando captura via CDP en todos los frames...');
      await this.cdpInjector.injectInPage(this.page);

      // 6. Activar grace period
      this._activateGrace(15000);

      this.status = 'capturing';
      this.recoveryCount = 0;
      this.consecutiveRecoveryFails = 0;
      log.info(this.name, `Mesa lista — captura activa via CDP`);
      log.info(this.name, `Esperando numeros (WS/Fetch/XHR/DOM)...`);

      return true;
    } catch (err) {
      if (this._wasStopped()) {
        log.warn(this.name, `Operacion cancelada: ${err.message}`);
        return false;
      }
      log.error(this.name, `Error iniciando captura: ${err.message}`);
      this.status = 'error';
      return false;
    }
  }

  async stop() {
    this.running = false;
    this.status = 'idle';

    if (this.graceTimeout) {
      clearTimeout(this.graceTimeout);
      this.graceTimeout = null;
    }

    await this.cdpInjector.cleanup();

    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
      }
    } catch (e) {}

    this.page = null;
    this.processor.reset();
    log.info(this.name, 'Captura detenida');
  }

  async recover() {
    if (!this.running) return false;

    this.status = 'recovering';
    this.recoveryCount++;
    this.consecutiveRecoveryFails++;

    log.warn(this.name, `Recovery #${this.recoveryCount} — intentando restaurar...`);

    try {
      await this.cdpInjector.cleanup();

      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
        this.page = null;
      }

      await randomDelay(this.config.recoveryMin, this.config.recoveryMax);

      if (this.consecutiveRecoveryFails > this.config.maxRecovery) {
        log.error(this.name, `Maximos recovery alcanzados (${this.config.maxRecovery})`);
        this.status = 'error';
        return false;
      }

      this.page = await this.context.newPage();
      await this.navigate();
      await this._waitForTable();

      // Esperar y re-inyectar CDP
      log.info(this.name, 'Esperando 8s a que el juego interne cargue...');
      await randomDelay(6000, 10000);

      await this.cdpInjector.injectInPage(this.page);

      this._activateGrace(15000);

      this.status = 'capturing';
      this.consecutiveRecoveryFails = 0;
      log.info(this.name, `Recovery exitoso despues de ${this.recoveryCount} intentos`);
      return true;
    } catch (err) {
      log.error(this.name, `Recovery fallido: ${err.message}`);
      this.status = 'error';
      return false;
    }
  }

  async _waitForTable() {
    try {
      await this.page.waitForSelector('iframe', { timeout: 60000 });
      log.info(this.name, 'Iframe de juego detectado');
    } catch (e) {
      log.warn(this.name, 'Timeout esperando iframe, continuando...');
    }
  }

  /**
   * Callback cuando se detecta un numero (llamado desde ExtensionBridge)
   */
  async onNumberFromExtension(number, source) {
    if (!this.running) return;

    if (this.graceActive) {
      log.debug(this.name, `[GRACE] ${number} bloqueado [${source}]`);
      return;
    }

    await this.processor.process(number, source, (num, color) => this.api.sendNumber(num, color));
  }

  _activateGrace(ms) {
    this.graceActive = true;
    if (this.graceTimeout) clearTimeout(this.graceTimeout);
    this.graceTimeout = setTimeout(() => {
      this.graceActive = false;
      log.info(this.name, '>>> CAPTURA EN VIVO ACTIVADA <<<');
    }, ms);
    log.info(this.name, `Grace period de ${ms}ms activado`);
  }

  async runDOMScan() {
    // No-op — CDP injection maneja el DOM scanning
  }

  getStats() {
    return {
      ...this.processor.getStats(),
      ...this.cdpInjector.getStats(),
      status: this.status,
      recoveryCount: this.recoveryCount,
      url: this.dynamicUrl || this.getRouletteURL(),
      dynamicUrl: this.dynamicUrl,
      captureMode: 'cdp-injection-v4',
    };
  }
}

module.exports = { BaseCasino };