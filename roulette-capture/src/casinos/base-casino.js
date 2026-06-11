// ============================================================
// base-casino.js - Clase base para todos los casinos
// Define la interfaz que cada casino debe implementar
// ============================================================
const { setupNetworkInterception } = require('../capture/ws-interceptor');
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
    this.domScanner = null;
    this.processor = new NumberProcessor(name);
    this.running = false;
    this.recoveryCount = 0;
    this.consecutiveRecoveryFails = 0;
    this.status = 'idle';
    this.url = '';
    this.dynamicUrl = null; // URL override desde el dashboard
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
        // Verificar que hay iframes de juego activos
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

    log.info(this.name, `Iniciando captura...`);
    log.info(this.name, `URL: ${this.getRouletteURL()}`);

    try {
      // 1. Crear nueva pagina
      this.page = await this.context.newPage();

      // 2. Configurar interceptacion de red
      this.domScanner = setupNetworkInterception(
        this.page,
        this.name,
        (number, source) => this._onNumberDetected(number, source)
      );

      // 3. Navegar al casino (implementacion especifica)
      await this.navigate();

      // 4. Esperar a que la mesa cargue
      await this._waitForTable();

      this.status = 'capturing';
      this.recoveryCount = 0;
      this.consecutiveRecoveryFails = 0;
      log.info(this.name, `Captura activa - esperando numeros...`);

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

    try {
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
      }
    } catch (e) {
      // Silencioso
    }

    this.page = null;
    this.domScanner = null;
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

    log.warn(this.name, `Recovery #${this.recoveryCount} - intentando restaurar captura...`);

    try {
      // Cerrar pagina actual si existe
      if (this.page && !this.page.isClosed()) {
        await this.page.close().catch(() => {});
        this.page = null;
      }

      // Esperar antes de reintentar (delay aleatorio para parecer humano)
      await randomDelay(this.config.recoveryMin, this.config.recoveryMax);

      // Si superamos maximos intentos, no seguir
      if (this.consecutiveRecoveryFails > this.config.maxRecovery) {
        log.error(this.name, `Maximos recovery alcanzados (${this.config.maxRecovery}) - necesita rotacion`);
        this.status = 'error';
        return false;
      }

      // Re-navegar
      this.page = await this.context.newPage();
      this.domScanner = setupNetworkInterception(
        this.page,
        this.name,
        (number, source) => this._onNumberDetected(number, source)
      );

      await this.navigate();
      await this._waitForTable();

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
   * Override en subclase para lógica específica
   */
  async _waitForTable() {
    // Esperar generica: esperar que aparezca un iframe
    try {
      await this.page.waitForSelector('iframe', { timeout: 60000 });
      log.info(this.name, 'Iframe de juego detectado');
      // Esperar adicional para que el juego internamente cargue
      await randomDelay(3000, 6000);
    } catch (e) {
      log.warn(this.name, 'Timeout esperando iframe, continuando...');
    }
  }

  /**
   * Callback cuando se detecta un numero
   */
  async _onNumberDetected(number, source) {
    if (!this.running) return;
    await this.processor.process(number, source, (num, color) => this.api.sendNumber(num, color));
  }

  /**
   * Scanner DOM periodico (llamar desde el loop principal)
   */
  async runDOMScan() {
    if (!this.running || !this.domScanner || !this.page || this.page.isClosed()) return null;
    try {
      const number = await this.domScanner.scan();
      if (number !== null) {
        await this._onNumberDetected(number, 'dom-scan');
        return number;
      }
    } catch (e) {
      // Silencioso
    }
    return null;
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
    };
  }
}

module.exports = { BaseCasino };