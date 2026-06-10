// ============================================================
// ws-interceptor.js - Interceptor de WebSocket/Fetch/DOM con Playwright
// Captura numeros de ruleta a nivel de red - mucho mas robusto que extension
// ============================================================
const log = require('../utils/logger');

// --- Campos conocidos donde los casinos envian el resultado ---
const RESULT_FIELDS = [
  'number', 'result', 'resultNumber', 'winningNumber',
  'ball_number', 'pocket_number', 'roulette_number', 'finalNumber',
  'game_number', 'displayNumber', 'winningPocket', 'drawResult',
  'gameResult', 'result_number', 'win_number', 'game_result',
  'rouletteResult', 'rouletteNumber', 'luckyNumber', 'betResult',
];

// --- Regex patterns para extraer de texto crudo ---
const NUMBER_PATTERNS = [
  /"?(?:resultNumber|winningNumber|ball_number|pocket_number|finalNumber|displayNumber|winningPocket|roulette_number|result_number|game_number|game_result)"?\s*[:=]\s*"?(\d{1,2})"?/i,
  /"(?:number|result)"\s*:\s*(\d{1,2})/gi,
  /"value"\s*:\s*(\d{1,2})/gi,
];

/**
 * Extrae un numero de ruleta (0-36) de un objeto JSON recursivamente
 */
function extractFromObject(obj, depth = 0) {
  if (depth > 15 || !obj || typeof obj !== 'object') return null;

  // Si es array, buscar en cada elemento
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = extractFromObject(item, depth + 1);
      if (result !== null) return result;
    }
    return null;
  }

  // Buscar en keys conocidas
  for (const key of Object.keys(obj)) {
    const lowerKey = key.toLowerCase();

    // Match con campos conocidos
    if (RESULT_FIELDS.some(f => lowerKey.includes(f.toLowerCase()))) {
      const val = obj[key];
      if (typeof val === 'number' && val >= 0 && val <= 36 && Number.isInteger(val)) {
        return val;
      }
      // Podria ser string: "15"
      if (typeof val === 'string') {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 36) return parsed;
      }
    }

    // Recursivo en objetos anidados
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      const nested = extractFromObject(obj[key], depth + 1);
      if (nested !== null) return nested;
    }
  }

  return null;
}

/**
 * Extrae un numero de texto crudo usando regex
 */
function extractFromText(text) {
  if (!text || typeof text !== 'string') return null;
  let lastMatch = null;

  for (const pattern of NUMBER_PATTERNS) {
    // Reset lastIndex para regex con 'g' flag
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const num = parseInt(match[1], 10);
      if (num >= 0 && num <= 36) {
        lastMatch = num;
      }
    }
  }

  return lastMatch; // Retorna el ULTIMO match (resultado mas reciente)
}

/**
 * Procesa un mensaje WebSocket/Fetch y retorna un numero 0-36 o null
 */
function extractNumber(messageData) {
  if (!messageData) return null;

  // Si ya es un numero valido
  if (typeof messageData === 'number') {
    return (messageData >= 0 && messageData <= 36) ? messageData : null;
  }

  let text = '';
  if (typeof messageData === 'string') {
    text = messageData;
  } else if (Buffer.isBuffer(messageData)) {
    text = messageData.toString('utf-8');
  } else if (typeof messageData === 'object') {
    text = JSON.stringify(messageData);
  }

  if (!text) return null;

  // 1. Intentar parsear como JSON
  try {
    // Manejar formato Socket.io: "42["event",{...}]"
    if (text.startsWith('42')) {
      const jsonStr = text.slice(2);
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (typeof item === 'object' && item !== null) {
            const fromObj = extractFromObject(item);
            if (fromObj !== null) return fromObj;
          }
        }
      }
    }

    // JSON directo
    const parsed = JSON.parse(text);
    const fromObj = extractFromObject(parsed);
    if (fromObj !== null) return fromObj;
  } catch (e) {
    // No es JSON valido, intentar con regex
  }

  // 2. Regex en texto crudo
  return extractFromText(text);
}

/**
 * Scanner DOM - Busca numeros en el DOM visible (fallback)
 */
async function scanDOMForNumbers(page) {
  try {
    const result = await page.evaluate(() => {
      // Selectores donde los casinos muestran el resultado
      const selectors = [
        '[class*="winning-number"]',
        '[class*="result-display"]',
        '[class*="result-number"]',
        '[class*="roulette-result"]',
        '[class*="game-result"]',
        '[data-result-number]',
        '[data-winning-number]',
        '[class*="last-number"]',
        '[class*="current-number"]',
        '[class*="ball-number"]',
        '[class*="pocket"]',
        '.winning-number',
        '.result-number',
        '.game-result',
        '.roulette-number',
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // Obtener texto visible
          const text = el.textContent?.trim() || el.innerText?.trim() || '';
          const num = parseInt(text, 10);
          if (!isNaN(num) && num >= 0 && num <= 36) {
            // Verificar que es visible
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              return { number: num, selector, text };
            }
          }
          // Tambien intentar con data attributes
          const dataNum = el.getAttribute('data-result-number') ||
                         el.getAttribute('data-winning-number') ||
                         el.getAttribute('data-number');
          if (dataNum) {
            const parsed = parseInt(dataNum, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 36) return { number: parsed, selector, text: dataNum };
          }
        }
      }
      return null;
    });
    return result;
  } catch (e) {
    log.debug('interceptor', 'DOM scan error:', e.message);
    return null;
  }
}

/**
 * Configura la interceptacion de red en una pagina de Playwright
 * Retorna un callback que se llama con cada numero detectado
 */
function setupNetworkInterception(page, casinoName, onNumberDetected) {
  const logTag = 'ws-' + casinoName;

  // --- WEBSOCKET INTERCEPTION ---
  // Playwright expone eventos WebSocket a nivel de pagina
  page.on('websocket', (ws) => {
    const url = ws.url();
    log.debug(logTag, `WebSocket conectado: ${url.substring(0, 80)}...`);

    ws.on('framereceived', (frame) => {
      try {
        const payload = frame.payload;
        if (!payload || payload.length < 2) return;

        const number = extractNumber(payload);
        if (number !== null) {
          log.info(logTag, `Numero detectado via WS: ${number}`);
          onNumberDetected(number, 'websocket');
        }
      } catch (e) {
        // Silencioso - frames rotos son normales
      }
    });

    ws.on('close', () => {
      log.debug(logTag, `WebSocket cerrado: ${url.substring(0, 60)}`);
    });

    ws.on('socketerror', (err) => {
      log.warn(logTag, `WebSocket error: ${err}`);
    });
  });

  // --- FETCH/XHR INTERCEPTION ---
  // Interceptamos respuestas de endpoints que contienen resultados
  page.on('response', async (response) => {
    try {
      const url = response.url();
      const urlLower = url.toLowerCase();

      // Filtrar URLs relevantes
      const isRelevant =
        (urlLower.includes('result') || urlLower.includes('roulette') ||
         urlLower.includes('evolution') || urlLower.includes('round') ||
         urlLower.includes('wheel') || urlLower.includes('game')) &&
        !urlLower.includes('history') && !urlLower.includes('state') &&
        !urlLower.includes('stats') && !urlLower.includes('analytics') &&
        !urlLower.includes('config') && !urlLower.includes('asset') &&
        !urlLower.includes('.js') && !urlLower.includes('.css') &&
        !urlLower.includes('.png') && !urlLower.includes('.jpg');

      if (!isRelevant) return;

      const contentType = response.headers()['content-type'] || '';
      if (!contentType.includes('json') && !contentType.includes('text')) return;

      const body = await response.text().catch(() => null);
      if (!body || body.length > 50000) return; // Ignorar respuestas enormes

      const number = extractNumber(body);
      if (number !== null) {
        log.info(logTag, `Numero detectado via Fetch/XHR: ${number} (URL: ${url.substring(0, 80)})`);
        onNumberDetected(number, 'fetch');
      }
    } catch (e) {
      // Silencioso
    }
  });

  // --- DOM SCANNER (fallback periodico) ---
  // Se llama desde el casino module cuando no hay capturas por un tiempo
  const domScanner = {
    lastScanResult: null,
    lastScanTime: 0,
  };

  domScanner.scan = async () => {
    const result = await scanDOMForNumbers(page);
    if (result) {
      // Solo reportar si es diferente al ultimo escaneo (evitar duplicados de DOM)
      if (domScanner.lastScanResult !== result.number || Date.now() - domScanner.lastScanTime > 15000) {
        log.info(logTag, `Numero detectado via DOM: ${result.number} (${result.selector})`);
        domScanner.lastScanResult = result.number;
        domScanner.lastScanTime = Date.now();
        return result.number;
      }
    }
    return null;
  };

  log.info(logTag, 'Interceptacion de red configurada (WebSocket + Fetch + DOM)');
  return domScanner;
}

module.exports = { setupNetworkInterception, extractNumber, extractFromObject, extractFromText, scanDOMForNumbers };