// ============================================================
// ocr-capture.js v5.0 - Captura de numeros por OCR
// Toma screenshots del area del resultado y extrae el numero
// con Tesseract.js — sin CDP, sin extension, sin WebSocket
// ============================================================
const log = require('../utils/logger');

class OCRCapture {
  /**
   * @param {object} config - Configuracion (OCR_CROP_X, etc.)
   * @param {function} onNumber - Callback async (number) => void
   */
  constructor(config, onNumber) {
    this.config = config;
    this.onNumber = onNumber;
    this.worker = null;
    this.pollTimeout = null;
    this.running = false;
    this.scanning = false; // lock para evitar solapamiento
    this.page = null;

    // Region de escaneo (configurable via .env)
    this.cropX = parseInt(config.OCR_CROP_X, 10) || 0;
    this.cropY = parseInt(config.OCR_CROP_Y, 10) || 50;
    this.cropW = parseInt(config.OCR_CROP_W, 10) || 1920;
    this.cropH = parseInt(config.OCR_CROP_H, 10) || 400;
    this.scanInterval = parseInt(config.OCR_INTERVAL, 10) || 3000;

    // Stats
    this.totalScans = 0;
    this.totalRecognized = 0;
    this.lastNumber = -1;
    this.lastNumberTime = 0;
  }

  /**
   * Inicializa el worker de Tesseract (descarga data si es primera vez)
   */
  async init() {
    log.info('ocr', 'Inicializando motor OCR (Tesseract.js)...');
    log.info('ocr', 'Primera vez puede tardar 30-60s (descarga de idioma)');

    try {
      const Tesseract = require('tesseract.js');
      this.worker = await Tesseract.createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') return;
          const pct = Math.round(m.progress * 100);
          log.debug('ocr', `Tesseract: ${m.status} ${pct}%`);
        },
      });
      log.info('ocr', 'Motor OCR listo ✓');
    } catch (err) {
      log.error('ocr', `Error inicializando Tesseract: ${err.message}`);
      log.error('ocr', 'Asegurate de tener tesseract.js instalado: npm install tesseract.js');
      throw err;
    }
  }

  /**
   * Inicia el escaneo periodico
   */
  start(page) {
    if (this.running) return;
    this.running = true;
    this.page = page;

    log.info('ocr', `Escaneo OCR iniciado cada ${this.scanInterval}ms`);
    log.info('ocr', `Region: x=${this.cropX} y=${this.cropY} w=${this.cropW} h=${this.cropH}`);

    // Primer scan inmediato
    this._poll();
  }

  /**
   * Detiene el escaneo
   */
  stop() {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    this.page = null;
  }

  /**
   * Loop de escaneo con setTimeout (evita solapamiento)
   */
  async _poll() {
    if (!this.running) return;

    await this._scan();

    // Programar proximo scan
    if (this.running) {
      this.pollTimeout = setTimeout(() => this._poll(), this.scanInterval);
    }
  }

  /**
   * Toma screenshot y ejecuta OCR
   */
  async _scan() {
    if (!this.running || !this.page || this.scanning) return;

    // Verificar que la pagina sigue viva
    try {
      if (this.page.isClosed()) {
        log.warn('ocr', 'Pagina cerrada, deteniendo escaneo');
        this.stop();
        return;
      }
    } catch (e) {
      this.stop();
      return;
    }

    this.scanning = true;
    this.totalScans++;

    try {
      // Tomar screenshot de la region del resultado
      const buffer = await this.page.screenshot({
        clip: {
          x: this.cropX,
          y: this.cropY,
          width: this.cropW,
          height: this.cropH,
        },
        type: 'png',
      });

      // Ejecutar OCR (solo digitos)
      const { data: { text } } = await this.worker.recognize(buffer, {
        tessedit_char_whitelist: '0123456789',
        tessedit_pageseg_mode: '7', // Linea de texto unica
      });

      // Buscar numeros validos de ruleta (0-36)
      const numbers = text.match(/\d+/g);
      if (!numbers || numbers.length === 0) {
        this.scanning = false;
        return;
      }

      for (const numStr of numbers) {
        const num = parseInt(numStr, 10);
        if (num < 0 || num > 36) continue;

        this.totalRecognized++;

        // Dedup: mismo numero dentro de 15 segundos = ignorar
        const now = Date.now();
        if (num === this.lastNumber && now - this.lastNumberTime < 15000) {
          this.scanning = false;
          return;
        }

        // Nuevo numero detectado!
        this.lastNumber = num;
        this.lastNumberTime = now;

        log.info('ocr',
          `████ NUMERO ${num} [OCR scan #${this.totalScans}] ` +
          `(reconocidos: ${this.totalRecognized})`
        );

        // Enviar al callback
        try {
          await this.onNumber(num);
        } catch (err) {
          log.error('ocr', `Error en callback: ${err.message}`);
        }

        break; // Solo procesar el primer numero valido
      }
    } catch (err) {
      log.debug('ocr', `Error en scan: ${err.message}`);
    } finally {
      this.scanning = false;
    }
  }

  /**
   * Libera recursos del worker
   */
  async cleanup() {
    this.stop();
    if (this.worker) {
      try {
        await this.worker.terminate();
      } catch (e) { /* ignore */ }
      this.worker = null;
    }
    log.info('ocr', 'Motor OCR cerrado');
  }

  /**
   * Retorna estadisticas
   */
  getStats() {
    return {
      totalScans: this.totalScans,
      totalRecognized: this.totalRecognized,
      lastNumber: this.lastNumber,
      captureMode: 'ocr-v5',
    };
  }
}

module.exports = { OCRCapture };