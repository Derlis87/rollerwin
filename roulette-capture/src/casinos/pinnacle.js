// ============================================================
// pinnacle.js - Modulo especifico para Pinnacle
// Pinnacle usa Evolution Gaming para live casino
// La estructura es: home -> casino -> live casino -> roulette
// ============================================================
const { BaseCasino } = require('./base-casino');
const { randomDelay } = require('../utils/helpers');
const { humanPause, lookAtRouletteTable } = require('../browser/human-behavior');
const log = require('../utils/logger');

class PinnacleCasino extends BaseCasino {
  constructor(config, apiClient) {
    super('pinnacle', config, apiClient);
  }

  getRouletteURL() {
    return this.config.PINNACLE_ROULETTE_URL;
  }

  async navigate() {
    const url = this.getRouletteURL();
    log.info(this.name, 'Navegando a Pinnacle...');

    // Las URLs de mesa pueden ser casino.pinnacle.com o www.pinnacle.com
    // Ir a la home principal primero para establecer cookies y sesion
    await this.page.goto('https://www.pinnacle.com/es/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await randomDelay(2000, 4000);
    await humanPause(1000, 3000);

    // Manejar banner de cookies/age verification si aparece
    try {
      const acceptSelectors = [
        'button[data-testid="accept-cookies"]',
        'button:has-text("Accept")',
        'button:has-text("Aceptar")',
        'button:has-text("I agree")',
        'button:has-text("Estoy de acuerdo")',
        '[class*="cookie"] button',
        '[class*="consent"] button',
        '[class*="age-verify"] button',
        'button:has-text("Confirm")',
        'button:has-text("Continuar")',
      ];
      for (const sel of acceptSelectors) {
        try {
          const btn = await this.page.$(sel);
          if (btn) {
            await btn.click();
            log.info(this.name, 'Dialogo de cookies/verificacion aceptado');
            await randomDelay(800, 1500);
            break;
          }
        } catch (e) { /* selector no match, seguir */ }
      }
    } catch (e) { /* no hay dialogo */ }

    await humanPause(1000, 2000);

    // Navegar directamente a la mesa de ruleta
    // Las URLs pueden ser:
    //   https://casino.pinnacle.com/es/live-casino/games/european-roulette/
    //   https://casino.pinnacle.com/es/live-casino/games/roulette-azure/
    log.info(this.name, `Abriendo mesa: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Comportamiento humano mientras carga
    await humanPause(2000, 4000);

    // Cerrar popups que aparezcan despues de la navegacion
    try {
      const popupSelectors = [
        'button[aria-label="Close"]',
        '[class*="modal"] button[class*="close"]',
        '[class*="popup"] button[class*="close"]',
        'button:has-text("Close")',
        'button:has-text("Cerrar")',
      ];
      for (const sel of popupSelectors) {
        try {
          const btn = await this.page.$(sel);
          if (btn) {
            await btn.click();
            log.info(this.name, 'Popup cerrado');
            await randomDelay(500, 1000);
            break;
          }
        } catch (e) { /* no popup */ }
      }
    } catch (e) { /* no popup */ }
  }

  async _waitForTable() {
    log.info(this.name, 'Esperando que la mesa de Pinnacle cargue...');

    // Safety: si la pagina fue cerrada o es null, no intentar nada
    if (!this.page || this.page.isClosed()) {
      log.error(this.name, 'Pagina cerrada o null en _waitForTable - abortando');
      throw new Error('Pagina no disponible');
    }

    try {
      // Pinnacle carga el juego en un iframe de Evolution
      // Esperar por el iframe del proveedor
      try {
        await this.page.waitForSelector('iframe', { timeout: 60000 });
        log.info(this.name, 'Iframe de juego detectado');
      } catch (e) {
        // Verificar si la pagina sigue viva
        if (!this.page || this.page.isClosed()) {
          throw new Error('Pagina se cerro durante la espera');
        }

        // Pinnacle a veces usa un div contenedor en vez de iframe directo
        try {
          const hasGame = await this.page.evaluate(() => {
            const containers = document.querySelectorAll(
              '[class*="game-iframe"], [class*="casino-game"], [id*="game"], ' +
              '[class*="live-game"], [class*="evolution"], [class*="egs"]'
            );
            return containers.length > 0;
          });
          if (hasGame) {
            log.info(this.name, 'Contenedor de juego detectado (no iframe directo)');
          } else {
            log.warn(this.name, 'No se detecto contenedor de juego, esperando adicional...');
            await randomDelay(5000, 10000);
          }
        } catch (evalErr) {
          if (!this.page || this.page.isClosed()) {
            throw new Error('Pagina se cerro durante evaluate');
          }
          log.warn(this.name, `Error evaluando DOM: ${evalErr.message}`);
        }
      }

      // Esperar que el juego internamente cargue y conecte
      await randomDelay(5000, 10000);

      // Mirar la mesa (comportamiento humano)
      try {
        await lookAtRouletteTable(this.page);
      } catch (e) {
        log.warn(this.name, `Error en lookAtRouletteTable: ${e.message}`);
      }

      // Verificar actividad
      let active = false;
      for (let i = 0; i < 10; i++) {
        if (!this.page || this.page.isClosed()) {
          throw new Error('Pagina se cerro durante verificacion de actividad');
        }
        await randomDelay(2000, 3000);
        try {
          const hasGame = await this.page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            const gameContainers = document.querySelectorAll(
              '[class*="game"], [id*="game"], [class*="casino"]'
            );
            return iframes.length > 0 || gameContainers.length > 0;
          });
          if (hasGame) {
            active = true;
            break;
          }
        } catch (e) { /* seguir */ }
      }

      if (active) {
        log.info(this.name, 'Mesa de Pinnacle lista y activa');
      } else {
        log.warn(this.name, 'No se confirmo actividad del juego, pero continuando...');
      }
    } catch (e) {
      log.warn(this.name, `Timeout esperando mesa: ${e.message}`);
      throw e; // Re-lanzar para que el orchestrator sepa que fallo
    }
  }

  /**
   * Verifica si la sesion de Pinnacle sigue activa
   */
  async isTableAlive() {
    if (!this.page || this.page.isClosed()) return false;
    try {
      const currentUrl = this.page.url();

      // Pinnacle redirige a login si la sesion expira
      if (currentUrl.includes('/login') || currentUrl.includes('/authenticate')) {
        log.warn(this.name, 'Redirigido a login - sesion expirada');
        return false;
      }

      // Verificar que no hay pagina de error o mantenimiento
      const hasGame = await this.page.evaluate(() => {
        const iframes = document.querySelectorAll('iframe');
        const gameContainers = document.querySelectorAll(
          '[class*="game-iframe"], [id*="game-container"], [class*="casino-game"]'
        );
        // Verificar que no hay pagina de error
        const errorPage = document.querySelector(
          '[class*="error"], [class*="maintenance"], [class*="unavailable"]'
        );
        return (iframes.length > 0 || gameContainers.length > 0) && !errorPage;
      });
      return hasGame;
    } catch (e) {
      return false;
    }
  }
}

module.exports = { PinnacleCasino };