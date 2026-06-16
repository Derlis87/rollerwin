// ============================================================
// betfury.js - Modulo especifico para BetFury
// Soporta login automatico con credenciales del .env
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

  /**
   * Login automatico en BetFury
   */
  async _login() {
    const email = this.config.BETFURY_EMAIL;
    const password = this.config.BETFURY_PASSWORD;

    if (!email || !password) {
      log.info(this.name, 'No hay credenciales de BetFury en .env - se necesita login manual');
      return false;
    }

    log.info(this.name, 'Intentando login automatico en BetFury...');

    try {
      // Ir a la pagina de login
      await this.page.goto('https://betfury.com/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Esperar que el formulario cargue (SPA de React)
      log.info(this.name, 'Esperando formulario de login...');

      let formReady = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        await randomDelay(1000, 2000);

        // Verificar si ya estamos logueados
        const currentUrl = this.page.url();
        if (!currentUrl.includes('login') && !currentUrl.includes('auth')) {
          log.info(this.name, 'Ya logueado en BetFury (redireccion detectada)');
          return true;
        }

        // Buscar inputs visibles
        try {
          const hasInputs = await this.page.evaluate(() => {
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
              const rect = input.getBoundingClientRect();
              if (rect.width > 20 && rect.height > 10 &&
                  window.getComputedStyle(input).display !== 'none' &&
                  window.getComputedStyle(input).visibility !== 'hidden') {
                return true;
              }
            }
            return false;
          });
          if (hasInputs) {
            formReady = true;
            log.info(this.name, 'Formulario de login detectado');
            break;
          }
        } catch (e) { /* seguir */ }
      }

      if (!formReady) {
        log.warn(this.name, 'Formulario de login no cargo a tiempo');
        return false;
      }

      // Selectores para el campo de email
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="correo" i]',
        'input[placeholder*="E-mail" i]',
        'input[data-testid*="email" i]',
        'input[id*="email" i]',
      ];

      // Selectores para el campo de password
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[data-testid*="password" i]',
        'input[id*="password" i]',
      ];

      // Buscar campo de email
      let emailField = null;
      for (const sel of emailSelectors) {
        try {
          emailField = await this.page.$(sel);
          if (emailField) {
            const isVisible = await emailField.isVisible().catch(() => false);
            if (isVisible) {
              log.info(this.name, `Campo email encontrado: ${sel}`);
              break;
            }
            emailField = null;
          }
        } catch (e) { /* seguir */ }
      }

      if (!emailField) {
        log.warn(this.name, 'No se encontro campo de email');
        return false;
      }

      await emailField.click();
      await humanPause(500, 1000);
      await emailField.fill('');
      await this.page.keyboard.type(email, { delay: 50 + Math.random() * 80 });
      await humanPause(800, 1500);

      // Buscar campo de password
      let passwordField = null;
      for (const sel of passwordSelectors) {
        try {
          passwordField = await this.page.$(sel);
          if (passwordField) {
            const isVisible = await passwordField.isVisible().catch(() => false);
            if (isVisible) {
              log.info(this.name, `Campo password encontrado: ${sel}`);
              break;
            }
            passwordField = null;
          }
        } catch (e) { /* seguir */ }
      }

      if (!passwordField) {
        log.warn(this.name, 'No se encontro campo de password');
        return false;
      }

      await passwordField.click();
      await humanPause(300, 700);
      await passwordField.fill('');
      await this.page.keyboard.type(password, { delay: 30 + Math.random() * 60 });
      await humanPause(1000, 2000);

      // Buscar boton de login
      const loginButtonSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Iniciar sesion")',
        'button:has-text("Entrar")',
        'button:has-text("Acceder")',
        'input[type="submit"]',
        'form button[type="submit"]',
        '[class*="login"] button',
        '[class*="auth"] button',
      ];

      let loginButton = null;
      for (const sel of loginButtonSelectors) {
        try {
          loginButton = await this.page.$(sel);
          if (loginButton) {
            const isVisible = await loginButton.isVisible().catch(() => false);
            if (isVisible) {
              log.info(this.name, `Boton login encontrado: ${sel}`);
              break;
            }
            loginButton = null;
          }
        } catch (e) { /* seguir */ }
      }

      if (!loginButton) {
        log.warn(this.name, 'No se encontro boton de login - intentando con Enter');
        await this.page.keyboard.press('Enter');
      } else {
        await loginButton.click();
      }

      log.info(this.name, 'Login enviado, esperando respuesta...');
      await randomDelay(3000, 5000);

      // Verificar resultado
      const afterUrl = this.page.url();
      if (afterUrl.includes('login') || afterUrl.includes('auth')) {
        try {
          const errorMsg = await this.page.evaluate(() => {
            const els = document.querySelectorAll('[class*="error"], [class*="alert"], [role="alert"]');
            for (const el of els) {
              const text = el.textContent?.trim();
              if (text && text.length > 0 && text.length < 200) return text;
            }
            return null;
          });
          if (errorMsg) {
            log.error(this.name, `Error de login: ${errorMsg}`);
          } else {
            log.warn(this.name, 'Login parece haber fallado - sigue en pagina de login');
          }
        } catch (e) { /* ok */ }
        return false;
      }

      log.info(this.name, 'Login automatico exitoso en BetFury!');
      await randomDelay(2000, 3000);
      return true;

    } catch (err) {
      log.error(this.name, `Error en login automatico: ${err.message}`);
      return false;
    }
  }

  /**
   * Verifica si ya estamos logueados
   */
  async _isLoggedIn() {
    try {
      await this.page.goto('https://betfury.com/casino', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('auth')) {
        log.info(this.name, 'No logueado - redirigido a login');
        return false;
      }

      // Verificar que no hay formulario de login visible
      try {
        const hasLogin = await this.page.evaluate(() => {
          return !!document.querySelector('input[type="password"]');
        });
        if (hasLogin) {
          log.info(this.name, 'Formulario de login visible - no logueado');
          return false;
        }
      } catch (e) { /* ok */ }

      log.info(this.name, 'Sesion de BetFury activa');
      return true;
    } catch (err) {
      log.debug(this.name, `Error verificando sesion: ${err.message}`);
      return false;
    }
  }

  async navigate() {
    const url = this.getRouletteURL();
    log.info(this.name, 'Navegando a BetFury...');

    // Ir a la home primero para cookies
    await this.page.goto('https://betfury.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await randomDelay(2000, 4000);
    await humanPause(1000, 3000);

    // Aceptar cookies si aparece
    try {
      const cookieSelectors = [
        'button:has-text("Accept")',
        'button:has-text("Aceptar")',
        'button:has-text("I agree")',
        'button:has-text("OK")',
        '[class*="cookie"] button',
        '[class*="consent"] button',
      ];
      for (const sel of cookieSelectors) {
        try {
          const btn = await this.page.$(sel);
          if (btn) {
            await btn.click();
            log.info(this.name, 'Cookies aceptadas');
            await randomDelay(500, 1000);
            break;
          }
        } catch (e) { /* seguir */ }
      }
    } catch (e) { /* no cookies dialog */ }

    // === LOGIN ===
    let loggedIn = await this._isLoggedIn();

    if (!loggedIn) {
      log.info(this.name, 'No hay sesion activa, intentando login...');
      loggedIn = await this._login();
    }

    if (!loggedIn) {
      const hasCredentials = this.config.BETFURY_EMAIL && this.config.BETFURY_PASSWORD;
      if (hasCredentials) {
        log.warn(this.name, 'Login automatico fallo - abriendo pagina de login');
        await this.page.goto('https://betfury.com/login', {
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        });
      }

      log.warn(this.name, '');
      log.warn(this.name, '  ========================================');
      log.warn(this.name, '  LOGUEATE MANUALMENTE EN EL NAVEGADOR');
      log.warn(this.name, '  El capturador esperara hasta que lo hagas');
      log.warn(this.name, '  ========================================');
      log.warn(this.name, '');

      // Esperar login manual (max 3 minutos)
      const maxWait = 180000;
      const checkInterval = 3000;
      let waited = 0;

      while (waited < maxWait) {
        await randomDelay(checkInterval - 500, checkInterval + 500);
        waited += checkInterval;

        const currentUrl = this.page.url();
        if (!currentUrl.includes('login') && !currentUrl.includes('auth')) {
          log.info(this.name, 'Login manual detectado - continuando...');
          loggedIn = true;
          break;
        }
      }

      if (!loggedIn) {
        log.error(this.name, 'Timeout esperando login manual');
        return;
      }
    }

    // Navegar a la mesa de ruleta
    log.info(this.name, `Abriendo mesa: ${url}`);
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await humanPause(2000, 4000);
  }

  async _waitForTable() {
    log.info(this.name, 'Esperando que la mesa de BetFury cargue...');

    try {
      await this.page.waitForSelector('iframe', { timeout: 90000 });
      log.info(this.name, 'Iframe detectado, esperando que el juego cargue internamente...');
      await randomDelay(5000, 10000);

      try {
        await lookAtRouletteTable(this.page);
      } catch (e) {
        log.warn(this.name, `Error en lookAtRouletteTable: ${e.message}`);
      }

      // Verificar actividad
      let wsConnected = false;
      for (let i = 0; i < 10; i++) {
        await randomDelay(2000, 3000);
        try {
          const hasWS = await this.page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            return iframes.length > 0;
          });
          if (hasWS) {
            wsConnected = true;
            break;
          }
        } catch (e) { /* seguir */ }
      }

      if (wsConnected) {
        log.info(this.name, 'Mesa de BetFury lista y activa');
      } else {
        log.warn(this.name, 'No se confirmo conexion, pero continuando...');
      }
    } catch (e) {
      log.warn(this.name, `Timeout esperando mesa: ${e.message}`);
    }
  }

  /**
   * Verifica si la sesion sigue activa
   */
  async isTableAlive() {
    if (!this.page || this.page.isClosed()) return false;
    try {
      const currentUrl = this.page.url();
      if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
        log.warn(this.name, 'Redirigido a login - sesion expirada');
        return false;
      }

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