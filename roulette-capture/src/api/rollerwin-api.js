// ============================================================
// rollerwin-api.js - Cliente HTTP para enviar numeros a RollerWin
// ============================================================
const log = require('../utils/logger');

class RollerWinAPI {
  constructor(apiUrl) {
    this.apiUrl = apiUrl;
    this.totalSent = 0;
    this.totalErrors = 0;
    this.consecutiveErrors = 0;
    this.lastErrorTime = 0;
  }

  /**
   * Envia un numero capturado al dashboard de RollerWin
   */
  async sendNumber(number, color) {
    const maxRetries = 3;
    const retryDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ number }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          this.totalSent++;
          this.consecutiveErrors = 0;
          return true;
        }

        // Server error, reintentar
        log.warn('api', `HTTP ${response.status} para numero ${number} (intento ${attempt}/${maxRetries})`);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay));
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          log.warn('api', `Timeout enviando ${number} (intento ${attempt}/${maxRetries})`);
        } else {
          log.warn('api', `Error de red enviando ${number}: ${err.message}`);
        }
        this.totalErrors++;
        this.consecutiveErrors++;
        this.lastErrorTime = Date.now();

        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, retryDelay));
        }
      }
    }

    log.error('api', `Fallo definitivo enviando numero ${number} despues de ${maxRetries} intentos`);
    return false;
  }

  /**
   * Verifica que la API esta respondiendo
   */
  async healthCheck() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      // Hacer un GET al endpoint base de la API
      const baseUrl = this.apiUrl.replace('/api/capture/receive', '/api/');
      const response = await fetch(baseUrl, {
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Retorna estadisticas del API
   */
  getStats() {
    return {
      totalSent: this.totalSent,
      totalErrors: this.totalErrors,
      consecutiveErrors: this.consecutiveErrors,
      apiUrl: this.apiUrl,
    };
  }
}

module.exports = { RollerWinAPI };