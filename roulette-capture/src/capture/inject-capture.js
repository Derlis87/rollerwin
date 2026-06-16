// ============================================================
// inject-capture.js - Captura via inyección en MAIN world
// ============================================================
// Este script se inyecta DENTRO de cada iframe (via CDP
// Page.addScriptToEvaluateOnNewDocument con worldName: '').
// Funciona EXACTAMENTE igual que chrome.scripting.executeScript
// con world: 'MAIN' — corre en el mismo contexto JS que el juego.
//
// COMUNICACIÓN:
//   iframe → parent: window.parent.postMessage({source:'rw-capture', number:N})
//   Node.js escucha el postMessage en la página principal y extrae el número.
// ============================================================
const fs = require('fs');
const path = require('path');

function getInjectScript() {
  return `(function() {
  'use strict';
  if (window.__rwInjected) return;
  window.__rwInjected = true;

  var hostname = location.hostname || '';
  console.log('[RW-INJECT] Motor de captura activo en:', hostname);

  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function getColor(n) { return n === 0 ? 'green' : RED.indexOf(n) >= 0 ? 'red' : 'black'; }

  // ═══ DEDUP por tiempo global (9s) ═══
  var _lastSentTimestamp = 0;
  var _DEDUP_WINDOW = 9000;

  function _isDuplicate(n) {
    var now = Date.now();
    if (now - _lastSentTimestamp < _DEDUP_WINDOW) return true;
    return false;
  }

  function _markSent(n) { _lastSentTimestamp = Date.now(); }

  // ═══ ENVIAR número al parent via postMessage ═══
  function sendNumber(n, source) {
    if (n < 0 || n > 36) return;
    if (_isDuplicate(n)) {
      console.log('[RW-INJECT] DEDUP:', n, 'bloqueado —', source);
      return;
    }
    _markSent(n);
    console.log('[RW-INJECT] RESULTADO:', n, '(' + getColor(n) + ')', '—', source, '[' + hostname + ']');

    // Enviar al parent (Node.js lo escucha ahí)
    try {
      window.parent.postMessage({
        source: 'rw-capture',
        number: n,
        color: getColor(n),
        hostname: hostname,
        sourceHook: source
      }, '*');
    } catch(e) {}

    // También intentar window.top
    if (window.parent !== window.top) {
      try {
        window.top.postMessage({
          source: 'rw-capture',
          number: n,
          color: getColor(n),
          hostname: hostname,
          sourceHook: source
        }, '*');
      } catch(e) {}
    }
  }

  // ═══ Campos de resultado de ruleta ═══
  var RESULT_FIELDS = [
    'number','result','resultnumber','winningnumber','win_number',
    'game_number','roulette_number','ball_number','pocket','pocket_number',
    'winningpocket','pocketid','resultid','displaynumber',
    'roundresult','gameoutcome','finalnumber','outcome',
    'winningnumberdisplay','resultnumber','final_number','game_result',
    'round_result','game_outcome','numberstr','numberstring',
    'winnum','win_num','result_num','gameresult',
    'resultnumberstr','rouletteresult','resultNumberStr',
    'roulettenumber','winningNumberStr','pocketnumber',
    'gamenumber','roundnumber','betresult','totalresult',
  ];

  function isResultField(key) {
    var k = key.replace(/[_\\-\\s]/g, '').toLowerCase();
    for (var i = 0; i < RESULT_FIELDS.length; i++) {
      if (k === RESULT_FIELDS[i].replace(/[_\\-\\s]/g, '')) return true;
    }
    return false;
  }

  function tryNum(val) {
    if (typeof val === 'number' && val >= 0 && val <= 36 && val === Math.floor(val)) return val;
    if (typeof val === 'string') {
      var s = val.trim();
      if ((s.length === 1 || s.length === 2) && s === String(parseInt(s, 10))) {
        var n = parseInt(s, 10);
        if (n >= 0 && n <= 36) return n;
      }
    }
    return null;
  }

  function extractObj(obj, depth, pathStr) {
    if (!obj || typeof obj !== 'object' || depth > 4) return;
    if (Array.isArray(obj)) {
      if (obj.length === 0 || obj.length > 5) return;
      var pathLow = pathStr.toLowerCase();
      if (pathLow.indexOf('result') >= 0 || pathLow.indexOf('winning') >= 0 ||
          pathLow.indexOf('outcome') >= 0 || pathLow.indexOf('pocket') >= 0) {
        var last = obj[obj.length - 1];
        var n = tryNum(last);
        if (n !== null) { sendNumber(n, 'array@' + pathStr); return; }
        if (typeof last === 'object') extractObj(last, depth + 1, pathStr + '[' + (obj.length-1) + ']');
      }
      return;
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = obj[key];
      if (isResultField(key)) {
        var n = tryNum(val);
        if (n !== null) { sendNumber(n, key + '@' + pathStr); return; }
      }
      if (typeof val === 'object' && val !== null) {
        extractObj(val, depth + 1, pathStr + '.' + key);
      }
    }
  }

  // Regex para texto
  var TEXT_PATTERNS = [
    /"resultNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"winningNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"winning_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"ball_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"pocket_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"roulette_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"finalNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"game_number"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"displayNumber"\\s*:\\s*(\\d{1,2})\\b/gi,
    /"winningPocket"\\s*:\\s*(\\d{1,2})\\b/gi,
  ];

  function extractFromText(text, source) {
    if (!text || typeof text !== 'string' || text.length > 200000) return;
    var lastMatch = null;
    for (var i = 0; i < TEXT_PATTERNS.length; i++) {
      TEXT_PATTERNS[i].lastIndex = 0;
      var m;
      while ((m = TEXT_PATTERNS[i].exec(text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) lastMatch = n;
      }
    }
    if (lastMatch !== null) sendNumber(lastMatch, 'regex@' + source);
  }

  // ══════════════════════════════════════
  // HOOK WEBSOCKET — El más importante
  // ══════════════════════════════════════
  (function() {
    var OrigWS = window.WebSocket;
    if (!OrigWS || OrigWS.__rwInject) return;
    OrigWS.__rwInject = true;

    var ProxyWS = function(url, protocols) {
      console.log('[RW-INJECT] WS conectado:', (url || '').substring(0, 80));
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url);

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) {
              try { data = String.fromCharCode.apply(null, new Uint8Array(data)); } catch(er) { return; }
            } else return;
          }

          // Socket.io: 42["event",{...}]
          if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
            try {
              var p = JSON.parse(data.substring(2));
              if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'object') {
                var evt = String(p[0] || '');
                extractObj(p[1], 0, 'sio.' + evt);
                extractFromText(data, 'sio.' + evt);
              }
            } catch(err) {}
          }

          // JSON directo
          if (data.charAt(0) === '{' || data.charAt(0) === '[') {
            try { extractObj(JSON.parse(data), 0, 'ws'); extractFromText(data, 'ws'); } catch(err) {}
          }
        } catch(err) {}
      });

      return ws;
    };

    ProxyWS.prototype = OrigWS.prototype;
    ProxyWS.CONNECTING = OrigWS.CONNECTING;
    ProxyWS.OPEN = OrigWS.OPEN;
    ProxyWS.CLOSING = OrigWS.CLOSING;
    ProxyWS.CLOSED = OrigWS.CLOSED;
    window.WebSocket = ProxyWS;
  })();

  // ══════════════════════════════════════
  // HOOK FETCH
  // ══════════════════════════════════════
  (function() {
    var origFetch = window.fetch;
    if (!origFetch || origFetch.__rwInject) return;
    origFetch.__rwInject = true;

    window.fetch = function(input, init) {
      var url = '';
      try {
        url = typeof input === 'string' ? input :
              (input instanceof Request) ? (input.url || '') :
              (input && input.url) ? input.url : '';
      } catch(e) {}

      var promise = origFetch.apply(this, arguments);
      var urlLow = url.toLowerCase();

      if (urlLow.indexOf('result') >= 0 ||
          urlLow.indexOf('roulette') >= 0 || urlLow.indexOf('evolution') >= 0 ||
          urlLow.indexOf('round') >= 0 || urlLow.indexOf('wheel') >= 0 ||
          urlLow.indexOf('game') >= 0 || urlLow.indexOf('pragmatic') >= 0) {
        if (urlLow.indexOf('history') >= 0 || urlLow.indexOf('state') >= 0 || urlLow.indexOf('stats') >= 0) {
          return promise;
        }
        promise.then(function(r) {
          try {
            r.clone().text().then(function(text) {
              if (text) { try { extractObj(JSON.parse(text), 0, 'fetch'); } catch(e) {} extractFromText(text, 'fetch'); }
            }).catch(function() {});
          } catch(e) {}
        }).catch(function() {});
      }

      return promise;
    };
  })();

  // ══════════════════════════════════════
  // HOOK XHR
  // ══════════════════════════════════════
  (function() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwInject) return;
    origSend.__rwInject = true;

    XMLHttpRequest.prototype.open = function(m, u) { this._rwUrl = String(u || ''); return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      this.addEventListener('load', function() {
        var u = (self._rwUrl || '').toLowerCase();
        if (u.indexOf('result') >= 0 ||
            u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0 ||
            u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0 ||
            u.indexOf('game') >= 0 || u.indexOf('pragmatic') >= 0) {
          if (u.indexOf('history') >= 0 || u.indexOf('state') >= 0 || u.indexOf('stats') >= 0) return;
          try {
            var t = self.responseText;
            if (t) { try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {} extractFromText(t, 'xhr'); }
          } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // ══════════════════════════════════════
  // HOOK postMessage (outgoing)
  // ══════════════════════════════════════
  (function() {
    var orig = window.postMessage;
    if (orig.__rwInject) return;
    orig.__rwInject = true;

    window.postMessage = function(data, origin, transfer) {
      try { if (typeof data === 'object' && data !== null) extractObj(data, 0, 'postMsg-out'); } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };

    window.addEventListener('message', function(event) {
      try {
        var data = event.data;
        if (typeof data === 'object' && data !== null) extractObj(data, 0, 'postMsg-in');
      } catch(e) {}
    });
  })();

  console.log('[RW-INJECT] Todos los hooks activos en:', hostname);
})();`;
}

module.exports = { getInjectScript };