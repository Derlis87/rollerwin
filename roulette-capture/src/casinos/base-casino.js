// ============================================================
// base-casino.js v5.0 - Clase base — captura por OCR unicamente
// Tesseract.js screenshots — 100% indetectable para el casino
// ============================================================
const { NumberProcessor } = require('../capture/number-processor');
const { OCRCapture } = require('../capture/ocr-capture');
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

    // OCR capture
    this.ocr = new OCRCapture(config, (num) => this._onOCRNumber(num));

    this.running = false;
    this.recoveryCount = 0;
    this.consecutiveRecoveryFails = 0;
    this.status = 'idle';
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

  _wasStopped() {
    return !this.running;
  }

  /**
   * Inicia la captura: navega al casino y empieza OCR
   */
  async start(context) {
    this.context = context;
    this.running = true;
    this.status = 'connecting';

    log.info(this.name, 'Iniciando conexion...');
    log.info(this.name, `URL: ${this.getRouletteURL()}`);
    log.info(this.name, 'Modo: OCR (Tesseract.js) — indetectable');

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

      // 4. Esperar que el juego interne cargue bien
      log.info(this.name, 'Esperando 10s a que el juego interne cargue...');
      await randomDelay(8000, 12000);
      if (this._wasStopped()) { log.warn(this.name, 'Cancelado esperando carga'); return false; }

      // 5. Iniciar escaneo OCR
      log.info(this.name, 'Iniciando escaneo OCR de la pantalla...');
      this.ocr.start(this.page);

      // 6. Grace period (ignorar numeros de la carga inicial)
      this._activateGrace(15000);

      this.status = 'capturing';
      this.recoveryCount = 0;
      this.consecutiveRecoveryFails = 0;

      log.info(this.name, '>>> CAPTURA OCR ACTIVA — esperando numeros... <<<');

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

    await this.ocr.cleanup();

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
      await this.ocr.cleanup();

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

      log.info(this.name, 'Esperando 8s a que el juego interne cargue...');
      await randomDelay(6000, 10000);

      this.ocr.start(this.page);
      this._activateGrace(15000);

      this.status = 'capturing';
      this.consecutiveRecoveryFails = 0;
      log.info(this.name, `Recovery exitoso`);
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
   * Callback cuando OCR detecta un numero
   */
  async _onOCRNumber(number) {
    if (!this.running) return;

    if (this.graceActive) {
      log.debug(this.name, `[GRACE] ${number} bloqueado`);
      return;
    }

    await this.processor.process(number, 'ocr', (num, color) => this.api.sendNumber(num, color));
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

  getStats() {
    return {
      ...this.processor.getStats(),
      ...this.ocr.getStats(),
      status: this.status,
      recoveryCount: this.recoveryCount,
      url: this.dynamicUrl || this.getRouletteURL(),
      captureMode: 'ocr',
    };
  }
}

module.exports = { BaseCasino };