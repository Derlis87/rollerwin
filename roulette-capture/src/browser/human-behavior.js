// ============================================================
// human-behavior.js - Simulacion de comportamiento humano
// Movimientos de mouse, scrolls, clicks aleatorios, pausas
// ============================================================
const { randInt, randomDelay, generateMousePath } = require('../utils/helpers');
const log = require('../utils/logger');

let mouseSimulator = null;
let scrollSimulator = null;
let clickSimulator = null;
let running = false;
let activePage = null; // Track which page we're simulating on

/**
 * Inicia la simulacion de comportamiento humano en la pagina
 * Se ejecuta en paralelo a la captura de numeros
 */
function startHumanBehavior(page, config) {
  // Si la pagina cambio, detener simulacion anterior y reiniciar
  if (activePage !== page) {
    stopHumanBehavior();
  }
  if (running) return;
  if (!page || page.isClosed()) return;

  running = true;
  activePage = page;

  // Obtener viewport real de la pagina
  const vpSize = page.viewportSize();
  let viewport = vpSize ? { width: vpSize.width, height: vpSize.height } : { width: 1920, height: 1080 };

  // --- SIMULADOR DE MOUSE ---
  mouseSimulator = setInterval(async () => {
    if (!running) return;
    try {
      if (!page || page.isClosed()) { stopHumanBehavior(); return; }
      if (Math.random() > config.humanProbability) return;

      // Generar coordenadas destino dentro del viewport (con margen)
      const margin = 50;
      const targetX = randInt(margin, viewport.width - margin);
      const targetY = randInt(margin, viewport.height - margin);

      // Obtener posicion actual del mouse
      let currentX = viewport.width / 2;
      let currentY = viewport.height / 2;
      try {
        const pos = await page.evaluate(() => {
          // No hay API directa para posicion del mouse, usamos centro como default
          return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        });
        currentX = pos.x;
        currentY = pos.y;
      } catch (e) { /* usar default */ }

      // Generar path con curva bezier (movimiento natural)
      const steps = randInt(10, 30);
      const path = generateMousePath(currentX, currentY, targetX, targetY, steps);

      // Mover mouse paso a paso con delays variables
      for (let i = 0; i < path.length; i++) {
        if (!running) break;
        await page.mouse.move(path[i].x, path[i].y, {
          steps: 1,
        });
        // Delay entre puntos: mas lento en el medio (aceleracion/deceleracion)
        const progress = i / path.length;
        const speedFactor = Math.sin(progress * Math.PI); // 0 al inicio/final, 1 en medio
        const stepDelay = randInt(2, 8) + Math.round(speedFactor * 12);
        await new Promise(r => setTimeout(r, stepDelay));
      }

      log.debug('human', `Mouse movido a (${targetX}, ${targetY})`);
    } catch (e) {
      // Silencioso - no interrumpir la captura por errores de mouse
    }
  }, 1000); // Evaluar cada segundo

  // --- SIMULADOR DE SCROLL ---
  scrollSimulator = setInterval(async () => {
    if (!running) return;
    try {
      if (!page || page.isClosed()) { stopHumanBehavior(); return; }
      await randomDelay(config.scrollMin, config.scrollMax);
      if (!running) return;

      const direction = Math.random() > 0.5 ? 1 : -1;
      const amount = randInt(50, 300);
      const steps = randInt(3, 8);
      const stepSize = Math.round(amount / steps);

      for (let i = 0; i < steps; i++) {
        if (!running) break;
        await page.mouse.wheel(0, direction * stepSize);
        await randomDelay(30, 80);
      }

      log.debug('human', `Scroll ${direction > 0 ? 'abajo' : 'arriba'} ${amount}px`);
    } catch (e) {
      // Silencioso
    }
  }, 5000);

  // --- SIMULADOR DE CLICKS ALEATORIOS ---
  // Clicks en areas seguras (no en botones de apuesta ni links peligrosos)
  clickSimulator = setInterval(async () => {
    if (!running) return;
    try {
      if (!page || page.isClosed()) { stopHumanBehavior(); return; }
      await randomDelay(config.clickMin, config.clickMax);
      if (!running) return;

      // Click en un area "segura" - margenes de la pagina o fondo
      const safeAreas = [
        // Click en el margen izquierdo
        () => page.mouse.click(randInt(10, 100), randInt(200, viewport.height - 200)),
        // Click en el margen derecho
        () => page.mouse.click(viewport.width - randInt(10, 100), randInt(200, viewport.height - 200)),
        // Click en el area superior (header)
        () => page.mouse.click(randInt(200, viewport.width - 200), randInt(10, 80)),
        // Click en area vacia del medio (si la hay)
        async () => {
          const clickX = randInt(200, viewport.width - 200);
          const clickY = randInt(100, viewport.height - 200);
          await page.mouse.click(clickX, clickY);
        },
      ];

      const areaIdx = randInt(0, safeAreas.length - 1);
      await safeAreas[areaIdx]();
      log.debug('human', 'Click aleatorio en area segura');
    } catch (e) {
      // Silencioso - si el click falla no pasa nada
    }
  }, 10000);

  log.info('human', 'Comportamiento humano iniciado (mouse, scroll, clicks)');
}

/**
 * Detiene toda simulacion de comportamiento humano
 */
function stopHumanBehavior() {
  running = false;
  activePage = null;
  if (mouseSimulator) { clearInterval(mouseSimulator); mouseSimulator = null; }
  if (scrollSimulator) { clearInterval(scrollSimulator); scrollSimulator = null; }
  if (clickSimulator) { clearInterval(clickSimulator); clickSimulator = null; }
  log.info('human', 'Comportamiento humano detenido');
}

/**
 * Simula una "pausa humana" - mirar la pantalla sin hacer nada
 * Se usa entre acciones importantes para parecer natural
 */
async function humanPause(minMs = 2000, maxMs = 8000) {
  const duration = randInt(minMs, maxMs);
  log.debug('human', `Pausa humana de ${duration}ms`);
  await randomDelay(minMs, maxMs);
}

/**
 * Simula la accion de "mirar la ruleta" - mover el mouse al centro del iframe
 * donde estaria la mesa de juego
 */
async function lookAtRouletteTable(page) {
  try {
    const viewport = page.viewportSize();
    // Mover al centro de la pagina donde suele estar la mesa
    const centerX = Math.round(viewport.width * 0.5);
    const centerY = Math.round(viewport.height * 0.45);

    const path = generateMousePath(
      viewport.width / 2, viewport.height / 2,
      centerX, centerY,
      randInt(8, 15)
    );

    for (const point of path) {
      await page.mouse.move(point.x, point.y, { steps: 1 });
      await new Promise(r => setTimeout(r, randInt(5, 15)));
    }
  } catch (e) {
    // Silencioso
  }
}

module.exports = {
  startHumanBehavior,
  stopHumanBehavior,
  humanPause,
  lookAtRouletteTable,
};