// ============================================================
// stake.js - Modulo especifico para Stake
// ============================================================
const { BaseCasino } = require('./base-casino');
const { randomDelay, humanPause, lookAtRouletteTable } = require('../browser/human-behavior');
const log = require('../utils/logger');

class StakeCasino extends BaseCasino {
  constructor(config, apiClient) {
    super('stake', config, apiClient);
  }

  getRouletteURL() {
    return this.config.STAKE_ROULETTE_URL;
  }

  async navigate() {
    const url = this.getRouletteURL();
    log.info(this.name, `Navegando a Stake...`);

    // Stake a veces necesita aceptar cookies o pasar un splash screen
    await this.page.goto('https://stake.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await randomDelay(2000, 4000);

    // Manejar dialogo de cookies si aparece
    try {
      const acceptBtn = await this.page.$('button:has-text("Accept"), button:has-text("Aceptar"), [data-testid="accept-cookies"]');
      if (acceptBtn) {
        await acceptBtn.click();
        log.info(this.name, 'Cookies aceptadas');
        await randomDelay(1000, 2000);
      }
    } catch (e) {
      // No hay dialogo de cookies
    }

    // Manejar geo-restriccion / VPN check
    try {
      const continueBtn = await this.page.$('button:has-text("Continue"), button:has-text("Continuar")');
      if (continueBtn) {
        await continueBtn.click();
        log.info(this.name, 'Dialogo de verificacion pasado');
        await randomDelay(1000, 2000);
      }
    } catch (e) { /* no hay dialogo */ }

    await humanPause(1000, 3000);

    // Navegar a la mesa de roulette
    log.info(this.name, `Abriendo mesa: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Comportamiento humano mientras carga
    await humanPause(2000, 4000);
  }

  async _waitForTable() {
    log.info(this.name, 'Esperando que la mesa de Stake cargue...');

    try {
      // Stake usa un contenedor de juego que puede ser iframe o div
      // Esperar el contenedor del juego
      try {
        await this.page.waitForSelector('iframe, [class*="game-iframe"], [class*="casino-game"], #game-container', {
          timeout: 90000,
        });
        log.info(this.name, 'Contenedor de juego detectado');
      } catch (e) {
        log.warn(this.name, 'Timeout esperando contenedor de juego, verificando estado...');
      }

      // Esperar que el juego internamente cargue
      await randomDelay(5000, 10000);

      // Mirar la mesa
      await lookAtRouletteTable(this.page);

      // Verificar que la pagina esta activa
      let active = false;
      for (let i = 0; i < 10; i++) {
        await randomDelay(2000, 3000);
        try {
          const gameActive = await this.page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            const gameContainers = document.querySelectorAll('[class*="game"], [id*="game"]');
            return iframes.length > 0 || gameContainers.length > 0;
          });
          if (gameActive) {
            active = true;
            break;
          }
        } catch (e) { /* seguir */ }
      }

      if (active) {
        log.info(this.name, 'Mesa de Stake lista y activa');
      } else {
        log.warn(this.name, 'No se confirmo actividad del juego, pero continuando...');
      }
    } catch (e) {
      log.warn(this.name, `Timeout esperando mesa: ${e.message}`);
    }
  }

  /**
   * Verifica si la sesion de Stake esta activa
   */
  async isTableAlive() {
    if (!this.page || this.page.isClosed()) return false;
    try {
      const currentUrl = this.page.url();

      // Stake redirige a login si la sesion expira
      if (currentUrl.includes('/login') || currentUrl.includes('/register')) {
        log.warn(this.name, 'Redirigido a login - sesion expirada');
        return false;
      }

      // Verificar que el juego sigue cargado
      const hasGame = await this.page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        const gameContainers = document.querySelectorAll('[class*="game-iframe"], [id*="game-container"]');
        return iframes.length > 0 || gameContainers.length > 0;
      });
      return hasGame;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { StakeCasino };