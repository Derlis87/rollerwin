// ============================================================
// number-processor.js - Dedicacion, envio a API, y gestion de numeros
// ============================================================
const { getRouletteColor } = require('../utils/helpers');
const log = require('../utils/logger');

class NumberProcessor {
  constructor(casinoName) {
    this.casinoName = casinoName;
    this.lastSentTime = 0;
    this.lastSentNumber = -1;
    this.sentHistory = []; // Ultimos N numeros enviados
    this.totalCaptured = 0;
    this.totalSent = 0;
    this.totalDeduped = 0;
    this.lastCaptureTime = 0;
  }

  /**
   * Procesa un numero capturado: dedupa y envia a la API
   * Retorna true si fue enviado, false si fue dedupeado
   */
  async process(number, source, sendToAPI) {
    if (number === null || number === undefined || number < 0 || number > 36) {
      return false;
    }

    this.totalCaptured++;
    this.lastCaptureTime = Date.now();
    const now = Date.now();

    // --- DEDUP 1: Ventana de tiempo (9 segundos) ---
    // Si ANY numero fue enviado en los ultimos 9s, bloquear
    if (now - this.lastSentTime < 9000) {
      log.debug(this.casinoName, `Dedup tiempo: ${number} (ultimo envio hace ${now - this.lastSentTime}ms)`);
      this.totalDeduped++;
      return false;
    }

    // --- DEDUP 2: Mismo numero en ventana de 10 segundos ---
    for (const entry of this.sentHistory) {
      if (entry.number === number && now - entry.time < 10000) {
        log.debug(this.casinoName, `Dedup secuencia: ${number} (mismo numero en ventana)`);
        this.totalDeduped++;
        return false;
      }
    }

    // --- ENVIAR A API ---
    try {
      const color = getRouletteColor(number);
      await sendToAPI(number, color);

      // Actualizar estado
      this.lastSentTime = now;
      this.lastSentNumber = number;
      this.sentHistory.push({ number, time: now, source });
      // Mantener solo los ultimos 20
      if (this.sentHistory.length > 20) this.sentHistory = this.sentHistory.slice(-20);
      this.totalSent++;

      log.info(this.casinoName,
        `${'█'.repeat(1)} NUMERO ${number} ${color.toUpperCase()} [${source}] ` +
        `| Enviados: ${this.totalSent} | Capturados: ${this.totalCaptured} | Dedup: ${this.totalDeduped}`,
        { color }
      );

      return true;
    } catch (err) {
      log.error(this.casinoName, `Error enviando numero ${number} a API: ${err.message}`);
      return false;
    }
  }

  /**
   * Retorna segundos desde la ultima captura
   */
  getSecondsSinceCapture() {
    if (this.lastCaptureTime === 0) return Infinity;
    return Math.round((Date.now() - this.lastCaptureTime) / 1000);
  }

  /**
   * Retorna segundos desde el ultimo envio
   */
  getSecondsSinceSend() {
    if (this.lastSentTime === 0) return Infinity;
    return Math.round((Date.now() - this.lastSentTime) / 1000);
  }

  /**
   * Resetear estado (para cambio de casino)
   */
  reset() {
    this.lastSentTime = 0;
    this.lastSentNumber = -1;
    this.sentHistory = [];
    this.lastCaptureTime = 0;
  }

  /**
   * Retorna estadisticas
   */
  getStats() {
    return {
      casino: this.casinoName,
      totalCaptured: this.totalCaptured,
      totalSent: this.totalSent,
      totalDeduped: this.totalDeduped,
      secondsSinceCapture: this.getSecondsSinceCapture(),
      lastNumber: this.lastSentNumber,
    };
  }
}

module.exports = { NumberProcessor };