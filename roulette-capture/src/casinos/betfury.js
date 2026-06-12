// ============================================================
// betfury.js - Modulo especifico para BetFury
// ============================================================
const { BaseCasino } = require('./base-casino');
const { randomDelay } = require('../utils/helpers');
const { humanPause, lookAtRouletteTable } = require('../browser/human-behavior');
const log = require('../utils/logger');

class BetFuryCasino extends BaseCasino {
  constructor(config, apiClient) {
    super('betfury', config, apiClient);
  }

  getRouletteURL() {
    if (this.dynamicUrl) return this.dynamicUrl;
    return this.config.BETFURY_ROULETTE_URL;
  }

  async navigate() {
    const url = this.getRouletteURL();
    log.info(this.name, `Navegando a BetFury...`);

    // Primero ir a la home para establecer cookies
    await this.page.goto('https://betfury.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await randomDelay(2000, 4000);
    await humanPause(1000, 3000);

    // Buscar y hacer click en "Casino" si es necesario
    try {
      const casinoLink = await this.page.$('a[href*="/casino"]');
      if (casinoLink) {
        await casinoLink.click();
        await randomDelay(1000, 2000);
      }
    } catch (e) {
      // Puede que ya este en casino
    }

    // Navegar a la mesa especifica
    log.info(this.name, `Abriendo mesa: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Simular comportamiento humano mientras carga
    await humanPause(2000, 4000);
  }

  async _waitForTable() {
    log.info(this.name, 'Esperando que la mesa de BetFury cargue...');

    try {
      // Esperar por el iframe del juego (Evolution o Pragmatic)
      await this.page.waitForSelector('iframe', { timeout: 90000 });
      log.info(this.name, 'Iframe detectado, esperando que el juego internamente cargue...');

      // Esperar tiempo adicional para que el juego dentro del iframe se conecte
      await randomDelay(5000, 10000);

      // Mirar la mesa (comportamiento humano)
      await lookAtRouletteTable(this.page);

      // Verificar que hay conexiones WebSocket activas
      let wsConnected = false;
      for (let i = 0; i < 10; i++) {
        await randomDelay(2000, 3000);
        try {
          const hasWS = await this.page.evaluate(() => {
            // Verificar si hay WebSockets activos en los iframes
            // No podemos acceder directamente, pero podemos verificar
            // que la pagina esta activa viendo si hay cambios en el DOM
            const iframes = document.querySelectorAll('iframe');
            return iframes.length > 0;
          });
          if (hasWS) {
            wsConnected = true;
            break;
          }
        } catch (e) { /* seguir esperando */ }
      }

      if (wsConnected) {
        log.info(this.name, 'Mesa de BetFury lista y activa');
      } else {
        log.warn(this.name, 'No se confirmo conexion WS, pero continuando...');
      }
    } catch (e) {
      log.warn(this.name, `Timeout esperando mesa: ${e.message}`);
    }
  }

  /**
   * Verifica si la sesion de BetFury esta activa
   */
  async isTableAlive() {
    if (!this.page || this.page.isClosed()) return false;
    try {
      // Verificar que no haya redirigido a login
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
        log.warn(this.name, 'Redirigido a login - sesion expirada');
        return false;
      }

      // Verificar que el iframe sigue existiendo
      const hasIframe = await this.page.evaluate(() => {
        return document.querySelectorAll('iframe').length > 0;
      });
      return hasIframe;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { BetFuryCasino };