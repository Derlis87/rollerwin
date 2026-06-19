// ============================================================
// cdp-capture.js v6.0 — Captura por CDP WebSocket interception
// Interceptar WS frames a nivel de red con la misma logica v7.6
// SIN inyeccion de codigo, SIN extension, SIN OCR
// 100% indetectable para el casino
// ============================================================
const log = require('../utils/logger');

class CDPCapture {
  /**
   * @param {object} config
   * @param {function} onNumber - Callback async (number) => void
   */
  constructor(config, onNumber) {
    this.config = config;
    this.onNumber = onNumber;
    this.cdpSession = null;
    this.page = null;
    this.running = false;

    // Dedup — misma logica que extension v7.6
    this._lastSentTimestamp = 0;
    this._DEDUP_WINDOW = 9000; // 9s
    this._sentSequence = [];
    this._SEQUENCE_MAX = 5;
    this._SEQUENCE_WINDOW = 10000; // 10s

    // Stats
    this.totalFrames = 0;
    this.totalParsed = 0;
    this.totalNumbers = 0;
    this.lastNumber = -1;

    // WS tracking
    this._wsConnections = new Map();
    this._wsFrameCount = 0;
  }

  // ══════════════════════════════════════════
  // PARSING LOGIC — Portada de inject-main.js v7.6
  // ══════════════════════════════════════════

  _RESULT_FIELDS = [
    'number', 'result', 'resultnumber', 'winningnumber', 'win_number',
    'game_number', 'roulette_number', 'ball_number', 'pocket', 'pocket_number',
    'winningpocket', 'pocketid', 'resultid', 'displaynumber',
    'roundresult', 'gameoutcome', 'finalnumber', 'outcome',
    'winningnumberdisplay', 'resultnumber', 'final_number', 'game_result',
    'round_result', 'game_outcome', 'numberstr', 'numberstring'
  ];

  _isResultField(key) {
    const k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (let i = 0; i < this._RESULT_FIELDS.length; i++) {
      if (k === this._RESULT_FIELDS[i].replace(/[_\-\s]/g, '')) return true;
    }
    return false;
  }

  _tryNum(val) {
    if (typeof val === 'number' && val >= 0 && val <= 36 && val === Math.floor(val)) return val;
    if (typeof val === 'string') {
      const s = val.trim();
      if ((s.length === 1 || s.length === 2) && s === String(parseInt(s, 10))) {
        const n = parseInt(s, 10);
        if (n >= 0 && n <= 36) return n;
      }
    }
    return null;
  }

  _extractObj(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 4) return;

    if (Array.isArray(obj)) {
      if (obj.length === 0 || obj.length > 5) return;
      const pathLow = path.toLowerCase();
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0) {
        const last = obj[obj.length - 1];
        const n = this._tryNum(last);
        if (n !== null) return n;
        if (typeof last === 'object') return this._extractObj(last, depth + 1, path + '[' + (obj.length-1) + ']');
      }
      return null;
    }

    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const val = obj[key];

      if (this._isResultField(key)) {
        const n = this._tryNum(val);
        if (n !== null) return n;
      }

      if (typeof val === 'object' && val !== null) {
        const found = this._extractObj(val, depth + 1, path + '.' + key);
        if (found !== null) return found;
      }
    }
    return null;
  }

  _extractFromText(text) {
    if (!text || typeof text !== 'string' || text.length > 200000) return null;
    const patterns = [
      /"resultNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winningNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winning_number"\s*:\s*(\d{1,2})\b/gi,
      /"ball_number"\s*:\s*(\d{1,2})\b/gi,
      /"pocket_number"\s*:\s*(\d{1,2})\b/gi,
      /"roulette_number"\s*:\s*(\d{1,2})\b/gi,
      /"finalNumber"\s*:\s*(\d{1,2})\b/gi,
      /"game_number"\s*:\s*(\d{1,2})\b/gi,
      /"displayNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winningPocket"\s*:\s*(\d{1,2})\b/gi
    ];
    let lastMatch = null;
    for (let i = 0; i < patterns.length; i++) {
      let m;
      patterns[i].lastIndex = 0;
      while ((m = patterns[i].exec(text)) !== null) {
        const n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) lastMatch = n;
      }
    }
    return lastMatch;
  }

  // ══════════════════════════════════════════
  // DEDUP — misma logica que extension v7.6
  // ══════════════════════════════════════════

  _isDuplicate(n) {
    const now = Date.now();
    if (now - this._lastSentTimestamp < this._DEDUP_WINDOW) {
      return true;
    }
    return false;
  }

  _checkSequenceDup(n) {
    for (let i = 0; i < this._sentSequence.length; i++) {
      if (this._sentSequence[i].number === n) {
        if (Date.now() - this._sentSequence[i].timestamp < this._SEQUENCE_WINDOW) {
          return true;
        }
      }
    }
    return false;
  }

  _markSent(n) {
    const now = Date.now();
    this._lastSentTimestamp = now;
    this._sentSequence.push({ number: n, timestamp: now });
    if (this._sentSequence.length > this._SEQUENCE_MAX) this._sentSequence.shift();
  }

  // ══════════════════════════════════════════
  // CORE: Procesar un frame de WebSocket
  // ══════════════════════════════════════════

  _processFrame(payloadData, source) {
    if (!payloadData || typeof payloadData !== 'string') return;

    // Socket.io: 42["event",{...}]
    if (payloadData.charAt(0) === '4' && (payloadData.charAt(1) === '2' || payloadData.charAt(1) === '3')) {
      try {
        const p = JSON.parse(payloadData.substring(2));
        if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'object') {
          const evt = String(p[0] || '');
          if (evt.indexOf('result') >= 0 || evt.indexOf('complete') >= 0 ||
              evt.indexOf('win') >= 0 || evt.indexOf('round') >= 0 ||
              evt.indexOf('spin') >= 0 || evt.indexOf('game') >= 0 ||
              evt.indexOf('end') >= 0 || evt.indexOf('finish') >= 0 ||
              evt.indexOf('update') >= 0 || evt.indexOf('new') >= 0 ||
              evt.indexOf('bet') >= 0) {
            this._tryExtractFromParsed(p[1], 'sio.' + evt);
          }
          this._tryExtractFromText(payloadData, 'sio.' + evt);
        }
      } catch (e) { /* not socket.io */ }
    }

    // JSON
    if (payloadData.charAt(0) === '{' || payloadData.charAt(0) === '[') {
      try {
        const parsed = JSON.parse(payloadData);
        this._tryExtractFromParsed(parsed, source);
      } catch (e) { /* not json */ }
      this._tryExtractFromText(payloadData, source);
    }

    // Fallback regex en todo
    this._tryExtractFromText(payloadData, source + '-raw');
  }

  _tryExtractFromParsed(obj, source) {
    const n = this._extractObj(obj, 0, source);
    if (n !== null) {
      this.totalParsed++;
      this._handleNumber(n, source);
    }
  }

  _tryExtractFromText(text, source) {
    const n = this._extractFromText(text);
    if (n !== null) {
      this.totalParsed++;
      this._handleNumber(n, 'regex@' + source);
    }
  }

  async _handleNumber(n, source) {
    if (n < 0 || n > 36) return;
    if (this._isDuplicate(n)) return;
    if (this._checkSequenceDup(n)) return;

    this._markSent(n);
    this.lastNumber = n;
    this.totalNumbers++;

    log.info('cdp',
      `\u2588\u2588\u2588 NUMERO ${n} [CDP frame #${this.totalFrames}] ` +
      `(${source}) (total: ${this.totalNumbers})`
    );

    try {
      await this.onNumber(n);
    } catch (err) {
      log.error('cdp', `Error en callback: ${err.message}`);
    }
  }

  // ══════════════════════════════════════════
  // INICIO / PARADA
  // ══════════════════════════════════════════

  async init() {
    log.info('cdp', 'CDP Capture listo — modo interceptacion de red');
  }

  async start(page) {
    if (this.running) return;
    this.page = page;
    this.running = true;

    log.info('cdp', 'Iniciando captura via CDP WebSocket interception...');
    log.info('cdp', '(Sin inyeccion de codigo — indetectable para el casino)');

    try {
      // Crear sesion CDP para interceptar a nivel de red
      this.cdpSession = await page.context().newCDPSession(page);

      // Habilitar Network domain
      await this.cdpSession.send('Network.enable');

      // Interceptar WebSocket frames
      this.cdpSession.on('Network.webSocketFrameReceived', (params) => {
        if (!this.running) return;
        this.totalFrames++;
        this._wsFrameCount++;

        const payload = params.response && params.response.payloadData;
        if (payload) {
          const wsId = params.requestId;
          const wsUrl = this._wsConnections.get(wsId) || 'unknown';

          // Solo procesar frames de Evolution/game WS (filtrar ruido)
          const urlLower = wsUrl.toLowerCase();
          if (urlLower.includes('evolution') || urlLower.includes('game') ||
              urlLower.includes('live') || urlLower.includes('casino') ||
              urlLower.includes('socket') || urlLower.includes('wss') ||
              urlLower.includes('ws')) {
            this._processFrame(payload, 'ws:' + wsId);
          }
        }
      });

      // Trackear conexiones WS nuevas
      this.cdpSession.on('Network.webSocketCreated', (params) => {
        this._wsConnections.set(params.requestId, params.url || 'unknown');
        log.info('cdp', `WS conectado: ${params.url ? params.url.substring(0, 80) : 'unknown'}`);
      });

      // Trackear cuando se cierra un WS
      this.cdpSession.on('Network.webSocketClosed', (params) => {
        this._wsConnections.delete(params.requestId);
        log.info('cdp', `WS cerrado: ${params.requestId}`);
      });

      // Tambien interceptar fetch responses como backup
      this.cdpSession.on('Network.responseReceived', (params) => {
        if (!this.running) return;
        const url = (params.response && params.response.url) || '';
        const urlLow = url.toLowerCase();
        if ((urlLow.includes('result') || urlLow.includes('roulette') ||
            urlLow.includes('evolution') || urlLow.includes('round') ||
            urlLow.includes('wheel')) &&
            !urlLow.includes('history') && !urlLow.includes('state') &&
            !urlLow.includes('stats')) {
          // Obtener el body de la respuesta
          this._fetchResponseBody(params.requestId, url);
        }
      });

      log.info('cdp', 'CDP Network interception activa — esperando WebSocket frames...');
      log.info('cdp', 'Los numeros se detectaran automaticamente cuando la ruleta gire');

    } catch (err) {
      log.error('cdp', `Error iniciando CDP: ${err.message}`);
      this.running = false;
    }
  }

  async _fetchResponseBody(requestId, url) {
    try {
      const resp = await this.cdpSession.send('Network.getResponseBody', { requestId });
      if (resp && resp.body) {
        this._tryExtractFromParsed(JSON.parse(resp.body), 'fetch:' + url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('/') + 30));
        this._tryExtractFromText(resp.body, 'fetch:' + url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('/') + 30));
      }
    } catch (e) {
      // Silencioso — puede que no tenga body o ya se haya consumido
    }
  }

  stop() {
    this.running = false;
    if (this.cdpSession) {
      try {
        this.cdpSession.detach();
      } catch (e) { /* ignore */ }
      this.cdpSession = null;
    }
    this._wsConnections.clear();
    this.page = null;
    log.info('cdp', 'CDP Capture detenido');
  }

  async cleanup() {
    this.stop();
    log.info('cdp', 'CDP Capture cerrado');
  }

  getStats() {
    return {
      totalFrames: this.totalFrames,
      totalParsed: this.totalParsed,
      totalNumbers: this.totalNumbers,
      lastNumber: this.lastNumber,
      wsConnections: this._wsConnections.size,
      captureMode: 'cdp-v6',
    };
  }
}

module.exports = { CDPCapture };
