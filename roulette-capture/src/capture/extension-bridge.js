// ============================================================
// extension-bridge.js - HTTP server que recibe numeros del Chrome Extension
// ============================================================
// El Chrome extension no puede enviar directamente al proceso Node.js.
// Solucion: El extension hace fetch('http://localhost:RW_BRIDGE_PORT/capture')
// y este mini-server HTTP dentro de Node.js recibe el numero.
//
// Flujo:
//   Extension (dentro de iframe, MAIN world) → hook WebSocket → detecta numero
//   → fetch('http://localhost:PORT/capture', {number, source, hostname})
//   → Este server recibe → onNumberDetected callback
// ============================================================

const http = require('http');
const log = require('../utils/logger');

class ExtensionBridge {
  constructor(port = 19555) {
    this.port = port;
    this.server = null;
    this.onNumber = null; // callback: (number, source) => Promise<void>
    this.requestCount = 0;
    this.errorCount = 0;
    this.lastNumberTime = 0;
    this.lastNumber = -1;
  }

  /**
   * Inicia el servidor HTTP para recibir numeros del extension
   */
  start(onNumberCallback) {
    this.onNumber = onNumberCallback;

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this._handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          log.error('bridge', `Puerto ${this.port} ya en uso — cerrando proceso anterior...`);
          reject(new Error(`Puerto ${this.port} en uso`));
        } else {
          log.error('bridge', `Error en server: ${err.message}`);
          reject(err);
        }
      });

      this.server.listen(this.port, '127.0.0.1', () => {
        log.info('bridge', `Servidor de extension escuchando en http://127.0.0.1:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * Maneja requests del extension
   */
  async _handleRequest(req, res) {
    // CORS headers para que el extension pueda hacer fetch
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // GET /ping — health check del extension
    if (req.method === 'GET' && req.url === '/ping') {
      this.requestCount++;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', count: this.requestCount }));
      return;
    }

    // GET /status — para debug
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'running',
        port: this.port,
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        lastNumber: this.lastNumber,
        lastNumberTime: this.lastNumberTime,
        uptime: process.uptime(),
      }));
      return;
    }

    // POST /capture — recibir numero del extension
    if (req.method === 'POST' && req.url === '/capture') {
      this.requestCount++;

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const data = JSON.parse(body);
          const { number, source, hostname, color } = data;

          if (typeof number !== 'number' || number < 0 || number > 36) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid number' }));
            return;
          }

          this.lastNumber = number;
          this.lastNumberTime = Date.now();

          const src = source || hostname || 'extension';
          log.info('bridge', `Numero recibido del extension: ${number} [${src}]`);

          // Enviar al callback (procesador de numeros)
          if (this.onNumber) {
            await this.onNumber(number, `ext-${src}`);
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, number }));
        } catch (err) {
          this.errorCount++;
          log.error('bridge', `Error parseando request: ${err.message} | body: ${body.substring(0, 200)}`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404);
    res.end('Not found');
  }

  /**
   * Detiene el servidor
   */
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      log.info('bridge', 'Servidor detenido');
    }
  }

  getStats() {
    return {
      port: this.port,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      lastNumber: this.lastNumber,
      lastNumberTime: this.lastNumberTime,
    };
  }
}

module.exports = { ExtensionBridge };