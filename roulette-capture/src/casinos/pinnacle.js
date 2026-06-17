// ============================================================
// pinnacle.js - Modulo especifico para Pinnacle
// Pinnacle usa Evolution Gaming para live casino
// Soporta login automatico con credenciales del .env
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
    // Priorizar la URL dinamica que viene del dashboard de RollerWin
    if (this.dynamicUrl) return this.dynamicUrl;
    return this.config.PINNACLE_ROULETTE_URL;
  }

  /**
   * Login automatico en Pinnacle
   * Pinnacle usa un formulario de login con email y password
   */
  async _login() {
    const email = this.config.PINNACLE_EMAIL;
    const password = this.config.PINNACLE_PASSWORD;

    if (!email || !password) {
      log.info(this.name, 'No hay credenciales de Pinnacle en .env - se necesita login manual');
      return false;
    }

    log.info(this.name, 'Intentando login automatico...');

    try {
      // Safety: verificar que la pagina sigue viva
      if (!this.page || this.page.isClosed() || this._wasStopped()) {
        log.warn(this.name, 'Pagina cerrada antes de login');
        return false;
      }

      // Navegar a la pagina de login de Pinnacle
      log.info(this.name, 'Navegando a pagina de login...');
      await this.page.goto('https://www.pinnacle.com/es/login', {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      });

      // Esperar que la SPA de Pinnacle renderice los campos de login
      // Pinnacle puede tardar varios segundos en cargar el formulario
      log.info(this.name, 'Esperando que el formulario de login cargue...');
      
      let formReady = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        await randomDelay(1000, 2000);
        
        // Verificar si ya estamos logueados (la URL cambio)
        const checkUrl = this.page.url();
        if (!checkUrl.includes('login') && !checkUrl.includes('authenticate')) {
          log.info(this.name, 'Ya se esta logueado en Pinnacle (redireccion)');
          return true;
        }

        // Verificar si hay algun input visible en la pagina
        try {
          const hasInputs = await this.page.evaluate(() => {
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
              const rect = input.getBoundingClientRect();
              // Al menos 20x10 pixeles y visible
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
        log.warn(this.name, 'El formulario de login no cargo a tiempo - login manual necesario');
        return false;
      }

      // Buscar el campo de email/usuario
      // Pinnacle usa diferentes selectores segun la version de la UI
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[name="username"]',
        'input[placeholder*="correo" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="usuario" i]',
        'input[placeholder*="user" i]',
        'input[data-testid="login-username"]',
        'input[id*="email" i]',
        'input[id*="username" i]',
        '#username',
        '#email',
      ];

      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[data-testid="login-password"]',
        'input[id*="password" i]',
        '#password',
      ];

      // Buscar y llenar email
      let emailField = null;
      for (const sel of emailSelectors) {
        try {
          emailField = await this.page.$(sel);
          if (emailField) {
            const isVisible = await emailField.isVisible().catch(() => false);
            if (isVisible) {
              log.info(this.name, `Campo de email encontrado: ${sel}`);
              break;
            }
            emailField = null;
          }
        } catch (e) { /* seguir */ }
      }

      if (!emailField) {
        log.warn(this.name, 'No se encontro el campo de email - login manual necesario');
        return false;
      }

      // Click en el campo primero (comportamiento humano)
      await emailField.click();
      await humanPause(500, 1000);

      // Limpiar y escribir email con delay entre teclas
      await emailField.fill('');
      await this.page.keyboard.type(email, { delay: 50 + Math.random() * 80 });
      await humanPause(800, 1500);

      // Buscar y llenar password
      let passwordField = null;
      for (const sel of passwordSelectors) {
        try {
          passwordField = await this.page.$(sel);
          if (passwordField) {
            const isVisible = await passwordField.isVisible().catch(() => false);
            if (isVisible) {
              log.info(this.name, `Campo de password encontrado: ${sel}`);
              break;
            }
            passwordField = null;
          }
        } catch (e) { /* seguir */ }
      }

      if (!passwordField) {
        log.warn(this.name, 'No se encontro el campo de password - login manual necesario');
        return false;
      }

      await passwordField.click();
      await humanPause(300, 700);

      await passwordField.fill('');
      await this.page.keyboard.type(password, { delay: 30 + Math.random() * 60 });
      await humanPause(1000, 2000);

      // Buscar y click en el boton de login/submit
      const loginButtonSelectors = [
        'button[type="submit"]',
        'button[data-testid="login-submit"]',
        'button:has-text("Log in")',
        'button:has-text("Login")',
        'button:has-text("Sign in")',
        'button:has-text("Iniciar sesion")',
        'button:has-text("Ingresar")',
        'button:has-text("Entrar")',
        'input[type="submit"]',
        '[class*="login"] button[type="submit"]',
        'form button[type="submit"]',
      ];

      let loginButton = null;
      for (const sel of loginButtonSelectors) {
        try {
          loginButton = await this.page.$(sel);
          if (loginButton) {
            const isVisible = await loginButton.isVisible().catch(() => false);
            if (isVisible) {
              log.info(this.name, `Boton de login encontrado: ${sel}`);
              break;
            }
            loginButton = null;
          }
        } catch (e) { /* seguir */ }
      }

      if (!loginButton) {
        log.warn(this.name, 'No se encontro el boton de login - intentando con Enter');
        await this.page.keyboard.press('Enter');
      } else {
        await loginButton.click();
      }

      // Esperar a que el login procese
      log.info(this.name, 'Login enviado, esperando respuesta...');
      await randomDelay(3000, 5000);

      // Verificar si el login fue exitoso
      const afterLoginUrl = this.page.url();
      if (afterLoginUrl.includes('login') || afterLoginUrl.includes('authenticate')) {
        // Verificar si hay mensaje de error
        try {
          const errorMsg = await this.page.evaluate(() => {
            const errorEls = document.querySelectorAll(
              '[class*="error"], [class*="alert"], [class*="message"], [role="alert"]'
            );
            for (const el of errorEls) {
              const text = el.textContent?.trim();
              if (text && text.length > 0 && text.length < 200) return text;
            }
            return null;
          });
          if (errorMsg) {
            log.error(this.name, `Error de login: ${errorMsg}`);
          } else {
            log.warn(this.name, 'Login parece haber fallado - pagina sigue en login');
          }
        } catch (e) { /* ok */ }

        return false;
      }

      // Verificar que no haya redirigido a una pagina de error
      if (afterLoginUrl.includes('error') || afterLoginUrl.includes('denied')) {
        log.error(this.name, `Login redirigio a pagina de error: ${afterLoginUrl}`);
        return false;
      }

      log.info(this.name, 'Login automatico exitoso!');
      await randomDelay(2000, 3000);
      return true;

    } catch (err) {
      log.error(this.name, `Error en login automatico: ${err.message}`);
      return false;
    }
  }

  /**
   * Verifica si ya estamos logueados en el casino (no solo en el sitio principal)
   */
  async _isLoggedIn() {
    try {
      // Intentar navegar a una pagina del casino para verificar sesion real
      const response = await this.page.goto('https://casino.pinnacle.com/es/live-casino/', {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      });

      const currentUrl = this.page.url();

      // Si redirige a login o authenticate, no estamos logueados en el casino
      if (currentUrl.includes('login') || currentUrl.includes('authenticate')) {
        log.info(this.name, 'No logueado en casino - redirigido a login');
        return false;
      }

      // Si estamos en el casino, verificar que no hay pantalla de login embebida
      try {
        const hasLoginForm = await this.page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="password"]');
          const loginButtons = document.querySelectorAll('button');
          for (const btn of loginButtons) {
            const text = (btn.textContent || '').toLowerCase();
            if (text.includes('log in') || text.includes('login') || text.includes('sign in') || text.includes('ingresar')) {
              return true;
            }
          }
          return inputs.length > 0;
        });
        if (hasLoginForm) {
          log.info(this.name, 'Formulario de login detectado en la pagina del casino');
          return false;
        }
      } catch (e) { /* ok */ }

      log.info(this.name, 'Sesion de Pinnacle activa en el casino');
      return true;
    } catch (err) {
      log.debug(this.name, `Error verificando sesion: ${err.message}`);
      return false;
    }
  }

  async navigate() {
    const url = this.getRouletteURL();
    log.info(this.name, 'Navegando a Pinnacle...');

    // Safety check
    if (!this.page || this.page.isClosed() || this._wasStopped()) {
      log.warn(this.name, 'Pagina no disponible para navegar');
      return;
    }

    // Ir a la home principal primero para establecer cookies
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

    // === LOGIN ===
    // 1. Verificar si ya hay sesion activa (cookies guardadas)
    //    (solo si seguimos running)
    let loggedIn = false;
    if (!this._wasStopped()) {
      loggedIn = await this._isLoggedIn();
    }

    // 2. Si no, intentar login automatico con credenciales del .env
    if (!loggedIn && !this._wasStopped()) {
      log.info(this.name, 'No hay sesion activa, intentando login...');
      loggedIn = await this._login();
    }

    // 3. Si no se pudo logear automaticamente, esperar login manual
    if (!loggedIn) {
      const hasCredentials = this.config.PINNACLE_EMAIL && this.config.PINNACLE_PASSWORD;
      if (hasCredentials) {
        log.warn(this.name, 'Login automatico fallo - abriendo pagina de login para login manual');
        await this.page.goto('https://www.pinnacle.com/es/login', {
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

      // Esperar hasta que el usuario se loguee (maximo 3 minutos)
      const maxWait = 180000; // 3 minutos
      const checkInterval = 3000;
      let waited = 0;

      while (waited < maxWait) {
        await randomDelay(checkInterval - 500, checkInterval + 500);
        waited += checkInterval;

        // Verificar si ya se loguearon (la URL cambio de login)
        const currentUrl = this.page.url();
        if (!currentUrl.includes('login') && !currentUrl.includes('authenticate')) {
          log.info(this.name, 'Login manual detectado - continuando...');
          loggedIn = true;
          break;
        }
      }

      if (!loggedIn) {
        log.error(this.name, 'Timeout esperando login manual - no se pudo conectar');
        return;
      }
    }

    // Navegar directamente a la mesa de ruleta
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