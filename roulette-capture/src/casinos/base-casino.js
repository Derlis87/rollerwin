// ============================================================
// base-casino.js v2 - Clase base para todos los casinos
// CAPTURA via Chrome Extension (hybrid approach)
// ============================================================
// La captura de numeros NO se hace via CDP (eso no funciona con OOPIFs).
// En su lugar:
//   1. Chrome se lanza con un extension (--load-extension)
//   2. El extension inyecta codigo en MAIN world de TODOS los frames
//   3. El extension detecta numeros via hooks de WebSocket/Fetch/XHR
//   4. El extension envia numeros via fetch a localhost:19555
//   5. ExtensionBridge (HTTP server en Node.js) los recibe
//
// Esta clase solo maneja: navegacion, login, espera de mesa, recovery
// ============================================================
const { NumberProcessor } = require('../capture/number-processor');
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
    this.running = false;
    this.recoveryCount = 0;
    this.consecutiveRecoveryFails = 0;
    this.status = 'idle';
    this.url = '';
    this.dynamicUrl = null;
    this.graceActive = false;
    this.graceTimeout = null;
  }

  /**
   * URL de la mesa - usa dynamicUrl si fue seteada por el dashboard
   */
  getRouletteURL() {
    if (this.dynamicUrl) return this.dynamicUrl;
    throw new Error('getRouletteURL() debe ser implementado o se debe setear dynamicUrl');
  }

  /**
   * Navega a la pagina del casino y espera a que cargue (override en subclase)
   */
  async navigate() {
    throw new Error('navigate() debe ser implementado por la subclase');
  }

  /**
   * Verifica si la mesa esta activa y el juego esta corriendo
   */
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
   * NOTA: La captura real la hace el Chrome extension.
   * Aqui solo navegamos y esperamos a que la mesa cargue.
   */
  async start(context) {
    this.context = context;
    this.running = true;
    this.status = 'connecting';

    log.info(this.name, `Iniciando conexion...`);
    log.info(this.name, `URL: ${this.getRouletteURL()}`);
    log.info(this.name, `Captura via Chrome Extension (hybrid mode)`);

    try {
      // 1. Crear nueva pagina
      this.page = await this.context.newPage();

      // 2. Navegar al casino (implementacion especifica)
      await this.navigate();

      // 3. Esperar a que la mesa cargue
      await this._waitForTable();

      // 4. Activar grace period (ignorar numeros por 15s para estabilizar)
      this._activateGrace(15000);

      this.status = 'capturing';
      this.recoveryCount = 0;
      this.consecutiveRecoveryFails = 0;
      log.info(this.name, `Mesa lista — captura activa via extension`);
      log.info(this.name, `Esperando numeros del Chrome extension...`);

      return true;
    } catch (err) {
      log.error(this.name, `Error iniciando captura: ${err.message}`);
      this.status = 'error';
      return false;
    }
  }

  /**
   * Detiene la captura y cierra la pagina
   */
  async stop() {
    this.running = false;
    this.status = 'idle';

    if (this.graceTimeout) {
      clearTimeout(this.graceTimeout);
      this.graceTimeout = null;
    }

    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
      }
    } catch (e) {
      // Silencioso
    }

    this.page = null;
    this.processor.reset();
    log.info(this.name, 'Captura detenida');
  }

  /**
   * Intenta recuperar la sesion sin cerrar el navegador completo
   */
  async recover() {
    this.status = 'recovering';
    this.recoveryCount++;
    this.consecutiveRecoveryFails++;

    log.warn(this.name, `Recovery #${this.recoveryCount} — intentando restaurar...`);

    try {
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

      // Re-navegar
      this.page = await this.context.newPage();
      await this.navigate();
      await this._waitForTable();
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

  /**
   * Espera a que la mesa de ruleta este lista
   */
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

    // Grace period: ignorar numeros al inicio
    if (this.graceActive) {
      log.debug(this.name, `[GRACE] ${number} bloqueado [${source}]`);
      return;
    }

    await this.processor.process(number, source, (num, color) => this.api.sendNumber(num, color));
  }

  /**
   * Grace period: ignorar numeros por N ms despues de conectar
   */
  _activateGrace(ms) {
    this.graceActive = true;
    if (this.graceTimeout) clearTimeout(this.graceTimeout);
    this.graceTimeout = setTimeout(() => {
      this.graceActive = false;
      log.info(this.name, '>>> CAPTURA EN VIVO ACTIVADA <<<');
    }, ms);
    log.info(this.name, `Grace period de ${ms}ms activado`);
  }

  /**
   * Scanner DOM periodico — no hace nada en modo extension
   * (el extension ya escanea el DOM internamente)
   */
  async runDOMScan() {
    // No-op en modo extension
  }

  /**
   * Retorna estadisticas actuales
   */
  getStats() {
    return {
      ...this.processor.getStats(),
      status: this.status,
      recoveryCount: this.recoveryCount,
      url: this.dynamicUrl || this.getRouletteURL(),
      dynamicUrl: this.dynamicUrl,
      captureMode: 'extension',
    };
  }
}

module.exports = { BaseCasino };