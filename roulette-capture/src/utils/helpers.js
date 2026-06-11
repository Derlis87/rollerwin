// ============================================================
// helpers.js - Utilidades generales
// ============================================================

/**
 * Retorna un numero aleatorio entre min y max (inclusive)
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Retorna un delay aleatorio entre min y max milisegundos
 */
function randomDelay(min, max) {
  return new Promise(resolve => {
    setTimeout(resolve, randInt(min, max));
  });
}

/**
 * Genera un bezier curve point para movimiento de mouse natural
 * Simula aceleracion y desaceleracion humana
 */
function generateMousePath(startX, startY, endX, endY, steps = 20) {
  const points = [];
  // Control points para curva bezier cubica
  const cp1x = startX + (endX - startX) * 0.25 + randInt(-80, 80);
  const cp1y = startY + (endY - startY) * 0.25 + randInt(-80, 80);
  const cp2x = startX + (endX - startX) * 0.75 + randInt(-80, 80);
  const cp2y = startY + (endY - startY) * 0.75 + randInt(-80, 80);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;

    const x = mt3 * startX + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * endX;
    const y = mt3 * startY + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * endY;
    points.push({ x: Math.round(x), y: Math.round(y) });
  }
  return points;
}

/**
 * Resuelve un color de ruleta para un numero dado
 */
function getRouletteColor(number) {
  if (number === 0) return 'green';
  const redNumbers = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  return redNumbers.includes(number) ? 'red' : 'black';
}

/**
 * Genera un ID unico corto
 */
function shortId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = { randInt, randomDelay, generateMousePath, getRouletteColor, shortId };