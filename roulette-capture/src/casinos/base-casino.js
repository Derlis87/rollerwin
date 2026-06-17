// ============================================================
// base-casino.js v3 - Clase base para todos los casinos
// CAPTURA via CDP Injection (SIN extension)
// ============================================================
// CDP puede inyectar codigo en TODOS los execution contexts,
// incluidos iframes cross-origin (Evolution, Pragmatic, etc).
// Ya no necesita --load-extension.
//
// Flujo:
//   1. Node.js conecta a Chrome via CDP
//   2. Navega al casino, hace login
//   3. CDPInjector inyecta hooks en todos los frames
//   4. Los hooks detectan numeros via WS/Fetch/XHR/DOM
//   5. Los hooks envian numeros via fetch a localhost:19555
//   6. ExtensionBridge recibe y procesa
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
    this._reinjectInterval = null;
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
   * Inicia la captura en este casino
   */
  async start(context) {
    this.context = context;
    this.running = true;
    this.status = 'connecting';

    log.info(this.name, `Iniciando conexion...`);
    log.info(this.name, `URL: ${this.getRouletteURL()}`);
    log.info(this.name, `Captura via CDP Injection (sin extension)`);

    try {
      // 1. Crear nueva pagina
      this.page = await this.context.newPage();

      // 2. Navegar al casino (implementacion especifica)
      await this.navigate();

      // 3. Esperar a que la mesa cargue
      await this._waitForTable();

      // 4. Inyectar codigo de captura via CDP en TODOS los frames
      //    Target.setAutoAttach detecta iframes automaticamente
      //    Network.webSocketFrameReceived como fallback de red
      log.info(this.name, 'Inyectando captura via CDP (Target.setAutoAttach)...');
      await this.cdpInjector.injectInPage(this.page);

      // 5. Re-inyectar cada 20s (los iframes se recargan)
      this._reinjectInterval = setInterval(async () => {
        if (this.running && this.page && !this.page.isClosed()) {
          try {
            await this.cdpInjector.reInject(this.page);
          } catch(e) {}
        }
      }, 20000);

      // 6. Activar grace period
      this._activateGrace(15000);

      this.status = 'capturing';
      this.recoveryCount = 0;
      this.consecutiveRecoveryFails = 0;
      log.info(this.name, `Mesa lista — captura activa via CDP`);
      log.info(this.name, `Esperando numeros (WS/Fetch/XHR/DOM)...`);

      return true;
    } catch (err) {
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

    if (this._reinjectInterval) {
      clearInterval(this._reinjectInterval);
      this._reinjectInterval = null;
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
    this.status = 'recovering';
    this.recoveryCount++;
    this.consecutiveRecoveryFails++;

    log.warn(this.name, `Recovery #${this.recoveryCount} — intentando restaurar...`);

    try {
      if (this._reinjectInterval) {
        clearInterval(this._reinjectInterval);
        this._reinjectInterval = null;
      }

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

      // Re-inyectar CDP
      await this.cdpInjector.injectInPage(this.page);

      this._reinjectInterval = setInterval(async () => {
        if (this.running && this.page && !this.page.isClosed()) {
          try {
            await this.cdpInjector.reInject(this.page);
          } catch(e) {}
        }
      }, 20000);

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
      await randomDelay(3000, 6000);
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
      status: this.status,
      recoveryCount: this.recoveryCount,
      url: this.dynamicUrl || this.getRouletteURL(),
      dynamicUrl: this.dynamicUrl,
      captureMode: 'cdp-injection',
    };
  }
}

module.exports = { BaseCasino };