// RollerWin Capture v9.3 — Basado en motor v7.6.1 probado
// ARQUITECTURA: PARENT no detecta. IFRAME detecta todo.
// Soporta: Betfury Evolution, Betfury Pragmatic, Pinnacle European, Pinnacle Azure
(function() {
  'use strict';
  if (window.__rwMainV93) return;
  window.__rwMainV93 = true;

  var SERVER = 'https://rollerwin3.onrender.com';
  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  var isInIframe = (window.self !== window.top);
  var hostname = location.hostname || '';

  console.log('[RW] v9.3 en ' + (isInIframe ? 'IFRAME' : 'PARENT') + ' | ' + hostname);

  // ═════════════════════════════════════
  // DEDUP + UTILIDADES (compartido)
  // ═════════════════════════════════════
  var _lastSentTs = 0;
  var _DEDUP_MS = 9000;
  var _seq = [];
  var sentCount = 0;

  function getColor(n) { return n === 0 ? 'green' : RED.indexOf(n) >= 0 ? 'red' : 'black'; }

  function tryNum(val) {
    if (typeof val === 'number' && val >= 0 && val <= 36 && val === Math.floor(val)) return val;
    if (typeof val === 'string') {
      var s = val.trim();
      if (s.length >= 1 && s.length <= 2 && s === String(parseInt(s, 10))) {
        var n = parseInt(s, 10);
        if (n >= 0 && n <= 36) return n;
      }
    }
    return null;
  }

  function _isDup(n) {
    if (Date.now() - _lastSentTs < _DEDUP_MS) return true;
    for (var i = 0; i < _seq.length; i++) {
      if (_seq[i] === n && Date.now() - _seq[i + '_t'] < 10000) return true;
    }
    return false;
  }

  function _markSent(n) {
    _lastSentTs = Date.now();
    // Flat array: [num, timestamp, num, timestamp, ...]
    _seq.push(n); _seq.push(Date.now());
    if (_seq.length > 10) { _seq.shift(); _seq.shift(); }
  }

  function _syncNum(n) {
    if (n >= 0 && n <= 36) { _seq.push(n); _seq.push(Date.now()); if (_seq.length > 10) { _seq.shift(); _seq.shift(); } }
  }

  // ═════════════════════════════════════
  // ENVIAR al servidor
  // ═════════════════════════════════════
  function sendToServer(n, source) {
    if (n < 0 || n > 36 || _isDup(n)) return;
    _markSent(n);
    sentCount++;
    console.log('%c[RW] #' + sentCount + ': ' + n + ' (' + getColor(n) + ') — ' + source +
      (isInIframe ? ' [IFRAME ' + hostname + ']' : ' [PARENT]'),
      'color:#22c55e;font-weight:bold;font-size:14px;');

    (function doSend(attempt) {
      fetch(SERVER + '/api/capture/receive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: n })
      }).then(function(r) {
        if (r.ok) console.log('[RW] OK:', n);
        else if (attempt < 2) setTimeout(function() { doSend(attempt + 1); }, 2000);
      }).catch(function() {
        if (attempt < 2) setTimeout(function() { doSend(attempt + 1); }, 2000);
      });
    })(0);

    if (isInIframe) {
      try { window.parent.postMessage({ source: 'rollerwin-capture', number: n, color: getColor(n), hostname: hostname }, '*'); } catch(e) {}
    }
    try { document.dispatchEvent(new CustomEvent('rw-number', { detail: { number: n, color: getColor(n) } })); } catch(e) {}
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ==================== PARENT PAGE ====================
  // NO detecta numeros. Solo recibe de iframes via postMessage + auto-recovery.
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isInIframe) {
    console.log('[RW] PARENT — esperando numeros de iframes');
    var _parentLast = -1;
    var _lastCapTime = Date.now();
    var _isPinn = hostname.indexOf('pinnacle') >= 0;

    window.addEventListener('message', function(e) {
      try {
        var d = e.data;
        if (d && d.source === 'rollerwin-capture' && typeof d.number === 'number') {
          console.log('[RW] PARENT: ' + d.number + ' de iframe ' + (d.hostname || ''));
          _parentLast = d.number;
          _lastCapTime = Date.now();
          try { document.dispatchEvent(new CustomEvent('rw-number', { detail: { number: d.number, color: d.color } })); } catch(ex) {}
        }
        if (d && d.source === 'rollerwin-sync') {
          try { window.postMessage({ source: 'rollerwin-sync-reply', lastNumber: _parentLast }, '*'); } catch(ex) {}
        }
        if (d && d.source === 'rollerwin-session-expired' && !_isPinn) {
          console.log('[RW] PARENT: session expired — reload en 1s');
          setTimeout(function() { location.reload(); }, 1000);
        }
      } catch(ex) {}
    });

    // Auto-recovery solo Betfury
    if (!_isPinn) {
      var _kaCount = 0;
      function keepAlive() {
        fetch('https://betfury.com/api/keep-alive', { method: 'GET', credentials: 'include' })
          .then(function(r) {
            _kaCount++;
            if (r.status === 401 || r.status === 403) { console.log('[RW] Sesion expirada (KA)'); location.reload(); }
          }).catch(function() {});
      }
      setInterval(keepAlive, 45000);
      setTimeout(keepAlive, 2000);

      setInterval(function() {
        if (Date.now() - _lastCapTime > 90000) { console.log('[RW] Sin capturas >90s — reload'); location.reload(); }
      }, 15000);

      function isGamePage() { return location.href.indexOf('/casino/games/') !== -1; }

      function clickJugar() {
        var btns = document.querySelectorAll('button, a, div[role="button"]');
        for (var i = 0; i < btns.length; i++) {
          var t = (btns[i].textContent || '').trim().toLowerCase();
          if ((t === 'jugar' || t === 'play now' || t === 'play') && !btns[i].getAttribute('target')) {
            btns[i].click(); return true;
          }
        }
        return false;
      }

      function closeModal() {
        var els = document.querySelectorAll('div, dialog, [role="dialog"]');
        for (var i = 0; i < els.length; i++) {
          var txt = (els[i].textContent || '').toLowerCase();
          if (txt.indexOf('sesi') !== -1 && txt.indexOf('finalizada') !== -1) {
            var btns = els[i].querySelectorAll('button, a, [role="button"]');
            for (var j = 0; j < btns.length; j++) {
              var bt = (btns[j].textContent || '').trim();
              if (bt === 'OK' || bt === 'Ok' || bt === 'ACEPTAR' || bt === 'Aceptar') btns[j].click();
            }
          }
        }
      }

      setTimeout(function() { if (isGamePage()) { clickJugar(); closeModal(); } }, 500);
      setTimeout(function() { if (isGamePage()) { clickJugar(); closeModal(); } }, 1500);
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden && isGamePage()) { clickJugar(); closeModal(); }
      });
    }

    console.log('[RW] v9.3 PARENT ACTIVO');
    return; // === FIN PARENT ===
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ==================== IFRAME ====================
  // Motor de deteccion v7.6.1 — AQUI se detectan los numeros
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('[RW] IFRAME — motor de deteccion v9.3 | ' + hostname);

  // Gap Recovery state
  var _iframeLastCap = Date.now();
  var _iframeLastAct = Date.now();
  var _gapActive = false;
  var _GAP_MS = 22000;
  var _wsClosed = false;
  var _isPinnIframe = hostname.indexOf('pinnacle') >= 0 || hostname.indexOf('ignition') >= 0;

  // ═══ EXTRACTORES v7.6.1 ═══
  var RESULT_FIELDS = [
    'number','result','resultnumber','winningnumber','win_number',
    'game_number','roulette_number','ball_number','pocket','pocket_number',
    'winningpocket','pocketid','resultid','displaynumber',
    'roundresult','gameoutcome','finalnumber','outcome',
    'winningnumberdisplay','final_number','game_result',
    'round_result','game_outcome','numberstr','numberstring'
  ];

  function isResultField(key) {
    var k = key.replace(/[_\-\s]/g, '').toLowerCase();
    for (var i = 0; i < RESULT_FIELDS.length; i++) {
      if (k === RESULT_FIELDS[i].replace(/[_\-\s]/g, '')) return true;
    }
    return false;
  }

  function extractObj(obj, depth, path) {
    if (!obj || typeof obj !== 'object' || depth > 4) return;
    if (Array.isArray(obj)) {
      if (obj.length === 0 || obj.length > 5) return;
      var pl = path.toLowerCase();
      if (pl.indexOf('result') >= 0 || pl.indexOf('winning') >= 0 || pl.indexOf('outcome') >= 0 || pl.indexOf('pocket') >= 0) {
        var last = obj[obj.length - 1];
        var n = tryNum(last);
        if (n !== null) { sendToServer(n, 'array@' + path); return; }
        if (typeof last === 'object') extractObj(last, depth + 1, path + '[' + (obj.length - 1) + ']');
      }
      return;
    }
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i], val = obj[key];
      if (isResultField(key)) {
        var n = tryNum(val);
        if (n !== null) { sendToServer(n, key + '@' + path); return; }
      }
      if (typeof val === 'object' && val !== null) extractObj(val, depth + 1, path + '.' + key);
    }
  }

  function extractFromText(text, source) {
    if (!text || typeof text !== 'string' || text.length > 200000) return;
    var pats = [
      /"resultNumber"\s*:\s*(\d{1,2})\b/gi, /"winningNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winning_number"\s*:\s*(\d{1,2})\b/gi, /"ball_number"\s*:\s*(\d{1,2})\b/gi,
      /"pocket_number"\s*:\s*(\d{1,2})\b/gi, /"roulette_number"\s*:\s*(\d{1,2})\b/gi,
      /"finalNumber"\s*:\s*(\d{1,2})\b/gi, /"game_number"\s*:\s*(\d{1,2})\b/gi,
      /"displayNumber"\s*:\s*(\d{1,2})\b/gi, /"winningPocket"\s*:\s*(\d{1,2})\b/gi
    ];
    var last = null;
    for (var i = 0; i < pats.length; i++) {
      var m; pats[i].lastIndex = 0;
      while ((m = pats[i].exec(text)) !== null) { var n = parseInt(m[1], 10); if (n >= 0 && n <= 36) last = n; }
    }
    if (last !== null) sendToServer(last, 'regex@' + source);
  }

  // ═══ GAP RECOVERY (definido antes de usarse) ═══
  function gapRecoveryScan() {
    var sels = [
      '[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]',
      '[class*="result-value"]','[class*="current-result"]','[class*="number-display"]',
      '[data-result-number]','[data-winning-number]','[data-game-result]',
      '[class*="announced"]','[class*="round-result"]','[class*="roulette-result"]',
      '[class*="live-result"]','[class*="last-number"]','[class*="lastnumber"]','[class*="game-result"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = document.querySelectorAll(sels[i]);
        for (var j = 0; j < els.length; j++) {
          var t = (els[j].textContent || '').trim();
          var num = parseInt(t, 10);
          if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === t) {
            console.log('[RW] GAP RECOVERY: ' + num + ' en ' + sels[i]);
            sendToServer(num, 'GAP:' + sels[i]);
            return true;
          }
        }
      } catch(e) {}
    }
    return false;
  }

  function startGapRecovery() {
    if (_gapActive) return;
    _gapActive = true;
    console.log('[RW] GAP RECOVERY activado');
    gapRecoveryScan();
    var t = setInterval(function() { if (!_gapActive) { clearInterval(t); return; } gapRecoveryScan(); }, 3000);
  }

  // Actualizar _iframeLastCap cuando se envia
  var _origSend = sendToServer;
  sendToServer = function(n, source) {
    _origSend(n, source);
    _iframeLastCap = Date.now();
    if (_gapActive) { _gapActive = false; console.log('[RW] GAP RECOVERY desactivado'); }
  };

  // ═══ IFRAME dead detection + sync ═══
  if (!_isPinnIframe) {
    setInterval(function() {
      if (Date.now() - _iframeLastAct > 45000) {
        console.log('[RW] IFRAME: sin actividad >45s');
        try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'iframe-dead' }, '*'); } catch(e) {}
        startGapRecovery();
      }
    }, 10000);
  }

  // Sync ultimo numero con parent
  try {
    var _sh = function(e) {
      try { if (e.data && e.data.source === 'rollerwin-sync-reply' && typeof e.data.lastNumber === 'number') { _syncNum(e.data.lastNumber); window.removeEventListener('message', _sh); } } catch(er) {}
    };
    window.parent.postMessage({ source: 'rollerwin-sync' }, '*');
    window.addEventListener('message', _sh);
    setTimeout(function() { window.removeEventListener('message', _sh); }, 2000);
  } catch(e) {}

  // ═══ HOOK WEBSOCKET (iframe) ═══
  (function() {
    var Orig = window.WebSocket;
    if (!Orig || Orig.__rwV93) return;
    Orig.__rwV93 = true;

    var Proxy = function(url, protos) {
      console.log('[RW] WS: ' + (url || '').substring(0, 100));
      var ws = protos ? new Orig(url, protos) : new Orig(url);

      if (_wsClosed) { _wsClosed = false; console.log('[RW] WS RECONNECT — Gap Recovery'); setTimeout(startGapRecovery, 1000); }

      ws.addEventListener('message', function(e) {
        try {
          _iframeLastAct = Date.now();
          var data = e.data;
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) { try { data = String.fromCharCode.apply(null, new Uint8Array(data)); } catch(er) { return; } }
            else return;
          }

          // Socket.io
          if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
            try {
              var p = JSON.parse(data.substring(2));
              if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'object') {
                var evt = String(p[0] || '');
                if (evt.indexOf('result') >= 0 || evt.indexOf('complete') >= 0 || evt.indexOf('win') >= 0 ||
                    evt.indexOf('round') >= 0 || evt.indexOf('spin') >= 0 || evt.indexOf('game') >= 0 ||
                    evt.indexOf('end') >= 0 || evt.indexOf('finish') >= 0 || evt.indexOf('update') >= 0 ||
                    evt.indexOf('new') >= 0 || evt.indexOf('bet') >= 0) {
                  extractObj(p[1], 0, 'sio.' + evt);
                  extractFromText(data, 'sio.' + evt);
                } else {
                  extractFromText(data, 'sio-fb.' + evt);
                }
              }
            } catch(err) {}
          }

          // JSON
          if (data.charAt(0) === '{' || data.charAt(0) === '[') {
            try { extractObj(JSON.parse(data), 0, 'ws'); extractFromText(data, 'ws'); } catch(err) {}
          }
        } catch(err) {}
      });

      ws.addEventListener('close', function(e) { console.log('[RW] WS cerrado (code:' + e.code + ')'); _wsClosed = true; });
      return ws;
    };

    Proxy.prototype = Orig.prototype;
    Proxy.CONNECTING = Orig.CONNECTING; Proxy.OPEN = Orig.OPEN;
    Proxy.CLOSING = Orig.CLOSING; Proxy.CLOSED = Orig.CLOSED;
    window.WebSocket = Proxy;
  })();

  // ═══ HOOK FETCH (iframe) — 401/403 + resultado ═══
  (function() {
    var orig = window.fetch;
    if (!orig || orig.__rwV93) return;
    orig.__rwV93 = true;

    window.fetch = function(input, init) {
      _iframeLastAct = Date.now();
      var url = '';
      try { url = typeof input === 'string' ? input : (input instanceof Request ? (input.url || '') : (input && input.url ? input.url : '')); } catch(e) {}
      var promise = orig.apply(this, arguments);

      // 401/403 detection
      promise.then(function(r) {
        if (r.status === 401 || r.status === 403) {
          console.log('[RW] IFRAME: fetch ' + r.status);
          try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'fetch-' + r.status }, '*'); } catch(e) {}
        }
      }).catch(function() {});

      // Result extraction
      var ul = url.toLowerCase();
      if ((ul.indexOf('result') >= 0 || ul.indexOf('roulette') >= 0 || ul.indexOf('evolution') >= 0 || ul.indexOf('round') >= 0 || ul.indexOf('wheel') >= 0) &&
          ul.indexOf('history') < 0 && ul.indexOf('state') < 0 && ul.indexOf('stats') < 0) {
        promise.then(function(r) {
          try { r.clone().text().then(function(text) { if (text) { try { extractObj(JSON.parse(text), 0, 'fetch'); } catch(e) {} extractFromText(text, 'fetch'); } }).catch(function() {}); } catch(e) {}
        }).catch(function() {});
      }

      return promise;
    };
  })();

  // ═══ HOOK XHR (iframe) ═══
  (function() {
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    if (origSend.__rwV93) return;
    origSend.__rwV93 = true;

    XMLHttpRequest.prototype.open = function(m, u) { this._rwUrl = String(u || ''); return origOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function() {
      var self = this;
      this.addEventListener('load', function() {
        var u = (self._rwUrl || '').toLowerCase();
        if ((u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0 || u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0) &&
            u.indexOf('history') < 0 && u.indexOf('state') < 0 && u.indexOf('stats') < 0) {
          try { var t = self.responseText; if (t) { try { extractObj(JSON.parse(t), 0, 'xhr'); } catch(e) {} extractFromText(t, 'xhr'); } } catch(e) {}
        }
      });
      return origSend.apply(this, arguments);
    };
  })();

  // ═══ HOOK postMessage (iframe) ═══
  (function() {
    var orig = window.postMessage;
    if (orig.__rwV93) return;
    orig.__rwV93 = true;

    window.postMessage = function(data, origin, transfer) {
      try { if (typeof data === 'object' && data !== null && data.source !== 'rollerwin-capture' && data.source !== 'rollerwin-sync') extractObj(data, 0, 'pm-out'); } catch(e) {}
      return orig.call(window, data, origin, transfer);
    };
    window.addEventListener('message', function(e) {
      try {
        var d = e.data;
        if (typeof d === 'object' && d !== null && d.source !== 'rollerwin-capture' && d.source !== 'rollerwin-sync' && d.source !== 'rollerwin-sync-reply' && d.source !== 'rollerwin-session-expired') extractObj(d, 0, 'pm-in');
      } catch(e) {}
    });
  })();

  // ═══ HOOK EventSource (iframe) ═══
  (function() {
    if (typeof window.EventSource === 'undefined') return;
    var Orig = window.EventSource;
    if (Orig.__rwV93) return;
    Orig.__rwV93 = true;
    var Proxy = function(url, opts) {
      var es = opts ? new Orig(url, opts) : new Orig(url);
      var add = es.addEventListener.bind(es);
      ['result','game','update','roulette','number','outcome','round'].forEach(function(t) {
        add(t, function(e) { try { if (typeof e.data === 'string') { extractFromText(e.data, 'sse.' + t); try { extractObj(JSON.parse(e.data), 0, 'sse.' + t); } catch(er) {} } } catch(er) {} });
      });
      return es;
    };
    Proxy.prototype = Orig.prototype; Proxy.CONNECTING = Orig.CONNECTING; Proxy.OPEN = Orig.OPEN; Proxy.CLOSED = Orig.CLOSED;
    window.EventSource = Proxy;
  })();

  // ═══ DOM SCANNER v7.6 (iframe) ═══
  (function() {
    var HKW = ['history','past','track','sequence','previous','older','last-result','lastresults','gamehistory','result-history','historyitem','resultshistory','bng','stats','statistics','roadmap','bigroad','beadroad','marker','recent','last'];
    var CKW = ['winning-number','winningnumber','winning-pocket','winningpocket','result-display','resultdisplay','result-value','resultvalue','current-result','game-number-display','number-display','overlay-result','announced','lastnumber','round-result','roulette-result','live-result','detailed-result'];

    function isHist(el) {
      if (!el) return false;
      var c = ((el.className||'') + ' ' + (el.id||'') + ' ' + (el.getAttribute('data-test')||'')).toLowerCase();
      for (var i = 0; i < HKW.length; i++) { if (c.indexOf(HKW[i]) >= 0) return true; }
      var p = el.parentElement, d = 0;
      while (p && d < 5) { var pc = ((p.className||'') + ' ' + (p.id||'')).toLowerCase(); for (var i = 0; i < HKW.length; i++) { if (pc.indexOf(HKW[i]) >= 0) return true; } p = p.parentElement; d++; }
      return false;
    }

    function isCurr(el) {
      if (!el) return false;
      var c = ((el.className||'') + ' ' + (el.id||'') + ' ' + (el.getAttribute('data-test')||'')).toLowerCase();
      for (var i = 0; i < CKW.length; i++) { if (c.indexOf(CKW[i]) >= 0) return true; }
      return el.hasAttribute('data-result-number') || el.hasAttribute('data-winning-number') || el.hasAttribute('data-game-result');
    }

    var SELS = [
      '[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]',
      '[class*="result-value"]','[class*="current-result"]','[class*="game-number-display"]',
      '[class*="number-display"]','[data-result-number]','[data-winning-number]','[data-game-result]',
      '[class*="overlay"] [class*="result"]','[class*="announced"]','[class*="round-result"]',
      '[class*="roulette-result"]','[class*="live-result"]','[class*="last-number"]',
      '[class*="lastnumber"]','[class*="game-result"]'
    ];

    var _lastDN = -1, _lastDT = 0, _DOM_REP = 15000;

    function scan() {
      for (var i = 0; i < SELS.length; i++) {
        try {
          var els = document.querySelectorAll(SELS[i]);
          for (var j = 0; j < els.length; j++) {
            if (isHist(els[j])) continue;
            if (!isCurr(els[j]) && !els[j].hasAttribute('data-result-number') && !els[j].hasAttribute('data-winning-number')) continue;
            var t = (els[j].textContent || '').trim();
            var num = parseInt(t, 10);
            if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === t) {
              var now = Date.now();
              if (num === _lastDN && now - _lastDT < _DOM_REP) return;
              _lastDN = num; _lastDT = now;
              sendToServer(num, 'DOM:' + SELS[i]);
              return;
            }
          }
        } catch(e) {}
      }
    }

    function setup() {
      if (!document.body) return;
      setTimeout(scan, 500); setTimeout(scan, 2000);
      var timer = null;
      new MutationObserver(function() { if (timer) return; timer = setTimeout(function() { timer = null; scan(); }, 500); }).observe(document.body, { childList: true, subtree: true, characterData: true });
      setInterval(scan, 6000);
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', function() { setTimeout(setup, 100); }); }
    else { setTimeout(setup, 100); }
  })();

  // Gap checker
  setInterval(function() { if (!_gapActive && Date.now() - _iframeLastCap > _GAP_MS) startGapRecovery(); }, 5000);

  // Modal detection
  (function() {
    var _notified = false;
    function check() {
      var els = document.querySelectorAll('div, p, span, h1, h2, h3, dialog');
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || '').toLowerCase();
        if ((t.indexOf('sesi') !== -1 && t.indexOf('finalizada') !== -1) || (t.indexOf('session') !== -1 && (t.indexOf('ended') !== -1 || t.indexOf('expired') !== -1))) {
          if (!_notified) { _notified = true; try { window.parent.postMessage({ source: 'rollerwin-session-expired', reason: 'modal' }, '*'); } catch(e) {} }
          var btns = els[i].querySelectorAll('button, a, [role="button"]');
          for (var j = 0; j < btns.length; j++) { var bt = (btns[j].textContent || '').trim(); if (bt === 'OK' || bt === 'Ok' || bt === 'ACEPTAR' || bt === 'Aceptar') btns[j].click(); }
          return;
        }
      }
    }
    setInterval(check, 500);
    try { new MutationObserver(function() { check(); }).observe(document.body, { childList: true, subtree: true }); } catch(e) {}
  })();

  console.log('[RW] v9.3 MOTOR IFRAME ACTIVO | ' + hostname + ' | Dedup 9s + SEQ 10s + GapRecovery');
})();