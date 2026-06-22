(function() {
  'use strict';
  if (window.__xQ3mP) return;
  window.__xQ3mP = true;

  try { Object.defineProperty(navigator, 'webdriver', { get: function() { return false; } }); } catch(e) {}

  var _SV = 'https://rollerwin3.onrender.com';
  var _lN = -1, _lT = 0, _sC = 0;
  var _lST = 0, _DW = 6000, _sNS = {};
  var _isI = (window.self !== window.top);
  var _hn = location.hostname || '';
  var _RD = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function _gC(n) { return n === 0 ? 'green' : _RD.indexOf(n) >= 0 ? 'red' : 'black'; }

  // ══════════════════════════════════════════════════════════════════
  // v8.3: COMPLETE REWRITE — Fix wrong number detection
  //
  // ROOT CAUSE of v8.2 failure:
  //   1. Parent page ran detection hooks too — caught numbers from
  //      lobby/balance/non-game data
  //   2. _activeTable URL matching was fragile (iframe URLs don't match)
  //   3. No iframe identity — couldn't distinguish game iframe from ads
  //
  // NEW APPROACH:
  //   - ONLY iframes with actual WSS connections run number detection
  //   - Parent page acts ONLY as relay — no detection hooks on parent
  //   - iframe self-identifies as "game" only after confirming WSS to
  //     known game servers (evolution, pragmatic, etc.)
  //   - Much tighter regex: only high-specificity patterns
  //   - Debug info sent to content.js overlay for troubleshooting
  // ══════════════════════════════════════════════════════════════════

  var _isGame = false;     // Only true in iframes with game WSS
  var _wssHosts = [];      // Hostnames of connected WSS servers
  var _activeCasino = '';  // 'betfury' or 'pinnacle' — from parent
  var _dbg = [];           // Debug log for overlay

  function _dbgAdd(msg) {
    var t = new Date().toLocaleTimeString();
    _dbg.push(t + ': ' + msg);
    if (_dbg.length > 8) _dbg.shift();
    try {
      document.dispatchEvent(new CustomEvent('x-dbg', { detail: { log: _dbg.slice() } }));
    } catch(e) {}
    // If iframe, also send debug to parent
    if (_isI) {
      try {
        window.parent.postMessage({ source: 'x-dbg-8f3k', log: _dbg.slice(), hostname: _hn }, '*');
      } catch(e) {}
    }
  }

  function _iD(n) {
    var t = Date.now();
    if (t - _lST < _DW) return true;
    return false;
  }
  function _mS(n) {
    var t = Date.now(); _lST = t; _sNS[n] = t;
    for (var k in _sNS) { if (t - _sNS[k] > _DW + 5000) delete _sNS[k]; }
  }
  function _sLN(n) {
    if (n >= 0 && n <= 36) { _sNS[n] = Date.now(); }
  }

  var _sQ = [], _SQM = 5, _SQW = 8000;
  function _cSD(n) {
    for (var i = 0; i < _sQ.length; i++) {
      if (_sQ[i].n === n && Date.now() - _sQ[i].t < _SQW) return true;
    }
    return false;
  }
  function _aS(n) {
    _sQ.push({ n: n, t: Date.now() });
    if (_sQ.length > _SQM) _sQ.shift();
    _ilCT = Date.now();
    if (_gRA) { _gRA = false; }
  }

  // Send number to server (only called by parent page)
  function _sendToServer(n) {
    try {
      var _ds = function(a) {
        fetch(_SV + '/api/capture/receive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: n })
        }).then(function(r) {
          if (r.ok) {} else if (a < 2) { setTimeout(function() { _ds(a + 1); }, 2000); }
        }).catch(function() { if (a < 2) { setTimeout(function() { _ds(a + 1); }, 2000); } });
      };
      _ds(0);
    } catch(e) {}
  }

  // Core send function
  function _send(n, src) {
    if (n < 0 || n > 36) return;
    if (_iD(n)) return;
    if (_cSD(n)) return;
    _mS(n); _aS(n);
    _lN = n; _lT = Date.now(); _sC++;

    _dbgAdd('DETECTED #' + n + ' [' + src + '] game=' + _isGame);

    if (_isI) {
      // iframe: ALWAYS forward to parent with identity info
      try {
        window.parent.postMessage({
          source: 'x-rc-8f3k',
          number: n,
          color: _gC(n),
          hostname: _hn,
          isGame: _isGame,
          wssHosts: _wssHosts.slice(),
          url: location.href.substring(0, 120)
        }, '*');
      } catch(e) {}
    } else {
      // Parent: update overlay
      try {
        document.dispatchEvent(new CustomEvent('x-d', { detail: { number: n, color: _gC(n) } }));
      } catch(e) {}
      // Parent ALWAYS sends to server (it only receives from game iframes)
      _sendToServer(n);
    }
  }

  // ══════════════════════════════════════════════════════════════
  // GAME WSS HOSTS — Known game server domains
  // ══════════════════════════════════════════════════════════════
  var _KNOWN_GAME_HOSTS = [
    'evolution', 'evolutiongaming', 'evo.com',
    'pragmatic', 'pragmaticplay',
    'ezugi', 'livecasino',
    'netent', 'authentic',
    'playtech', 'microgaming'
  ];

  function _isGameHost(hostname) {
    var h = hostname.toLowerCase();
    for (var i = 0; i < _KNOWN_GAME_HOSTS.length; i++) {
      if (h.indexOf(_KNOWN_GAME_HOSTS[i]) >= 0) return true;
    }
    return false;
  }

  // ══════════════════════════════════════════════════════════════
  // NUMBER DETECTION — Ultra-tight patterns only
  // ══════════════════════════════════════════════════════════════

  // Only these specific JSON field names → roulette result number
  var _RF_HI = [
    'winningnumber', 'winning_number', 'winningpocket', 'winningnumberdisplay',
    'resultnumber', 'result_number', 'ball_number', 'pocket_number',
    'game_result_number', 'finalnumber', 'final_number',
    'displaynumber', 'roulette_number', 'pocketid'
  ];
  var _RF_MD = [
    'roundresult', 'game_result', 'round_result', 'outcome_number',
    'win_number', 'game_number', 'gameoutcome', 'game_outcome'
  ];
  // v8.3: Removed 'result', 'number', 'outcome', 'resultid' from LOW — too generic

  var _RP = {};
  (function() {
    for (var i = 0; i < _RF_HI.length; i++) _RP[_RF_HI[i].replace(/[_\-\s]/g,'')] = 3;
    for (var i = 0; i < _RF_MD.length; i++) _RP[_RF_MD[i].replace(/[_\-\s]/g,'')] = 2;
  })();

  function _tN(v) {
    if (typeof v === 'number' && v >= 0 && v <= 36 && v === Math.floor(v)) return v;
    if (typeof v === 'string') {
      var s = v.trim();
      if ((s.length === 1 || s.length === 2) && s === String(parseInt(s, 10))) {
        var n = parseInt(s, 10);
        if (n >= 0 && n <= 36) return n;
      }
    }
    return null;
  }

  // Object explorer — finds roulette number with priority
  function _eO(obj, d, p) {
    if (!obj || typeof obj !== 'object' || d > 4) return null;
    if (Array.isArray(obj)) {
      // Only check short arrays (not history lists)
      if (obj.length === 0 || obj.length > 3) return null;
      var pl = p.toLowerCase();
      if (pl.indexOf('result') >= 0 || pl.indexOf('winning') >= 0 ||
          pl.indexOf('outcome') >= 0 || pl.indexOf('pocket') >= 0) {
        var last = obj[obj.length - 1];
        var n = _tN(last);
        if (n !== null) return { n: n, p: 2 };
        if (typeof last === 'object') return _eO(last, d + 1, p + '[L]');
      }
      return null;
    }
    var best = null;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = obj[k];
      var kc = k.replace(/[_\-\s]/g, '').toLowerCase();
      var pri = _RP[kc];
      if (pri !== undefined) {
        var n = _tN(v);
        if (n !== null && (!best || pri > best.p)) {
          best = { n: n, p: pri };
        }
      }
      // Recurse into sub-objects (max depth 3)
      if (typeof v === 'object' && v !== null && d < 3) {
        var sub = _eO(v, d + 1, p + '.' + k);
        if (sub && (!best || sub.p > best.p)) {
          best = sub;
        }
      }
    }
    return best;
  }

  // Regex fallback — ONLY high-specificity patterns
  function _eFT(text, src) {
    if (!text || typeof text !== 'string' || text.length > 100000) return;
    var pats = [
      /"winningNumber"\s*:\s*(\d{1,2})\b/gi,
      /"winning_number"\s*:\s*(\d{1,2})\b/gi,
      /"winningPocket"\s*:\s*(\d{1,2})\b/gi,
      /"resultNumber"\s*:\s*(\d{1,2})\b/gi,
      /"result_number"\s*:\s*(\d{1,2})\b/gi,
      /"ball_number"\s*:\s*(\d{1,2})\b/gi,
      /"pocket_number"\s*:\s*(\d{1,2})\b/gi,
      /"roulette_number"\s*:\s*(\d{1,2})\b/gi,
      /"game_result_number"\s*:\s*(\d{1,2})\b/gi,
      /"finalNumber"\s*:\s*(\d{1,2})\b/gi,
      /"displayNumber"\s*:\s*(\d{1,2})\b/gi,
      /"gameResult"\s*:\s*(\d{1,2})\b/gi,
      /"game_result"\s*:\s*(\d{1,2})\b/gi,
      /"round_result"\s*:\s*(\d{1,2})\b/gi
    ];
    for (var i = 0; i < pats.length; i++) {
      var m; pats[i].lastIndex = 0;
      if ((m = pats[i].exec(text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n >= 0 && n <= 36) { _send(n, 'rx@' + src); return; }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════
  // WEBSOCKET HOOK — Tracks game WSS, only processes game frames
  // ══════════════════════════════════════════════════════════════
  (function() {
    var _O = window.WebSocket;
    if (!_O || _O.__xV42) return;
    _O.__xV42 = true;
    var _P = function(url, protos) {
      var ws = protos ? new _O(url, protos) : new _O(url);
      var wsHost = '';
      try { wsHost = new URL(url).hostname; } catch(e) { wsHost = url; }

      // Track WSS host
      if (url.indexOf('wss://') >= 0 || url.indexOf('ws://') >= 0) {
        _wssHosts.push(wsHost);
        if (_wssHosts.length > 5) _wssHosts.shift();
        _dbgAdd('WSS: ' + wsHost.substring(0, 40));

        // If this is a known game host, mark this iframe as a game iframe
        if (_isGameHost(wsHost) && _isI) {
          _isGame = true;
          _dbgAdd('GAME IFRAME detected via WSS');
          // Tell parent this is a game iframe
          try {
            window.parent.postMessage({
              source: 'x-game-id-8f3k',
              isGame: true,
              hostname: _hn,
              wssHost: wsHost
            }, '*');
          } catch(e) {}
        }

        _wsc = false;
        _wrc++;
        setTimeout(function() { if (_gRA) return; _sgr(); }, 1000);
      }

      ws.addEventListener('message', function(e) {
        try {
          var data = e.data;
          _ila = Date.now();
          if (typeof data !== 'string') {
            if (data instanceof ArrayBuffer) {
              try { data = String.fromCharCode.apply(null, new Uint8Array(data)); } catch(er) { return; }
            } else return;
          }

          // Socket.IO format: "42[...]" or "43[...]"
          if (data.charAt(0) === '4' && (data.charAt(1) === '2' || data.charAt(1) === '3')) {
            try {
              var pp = JSON.parse(data.substring(2));
              if (Array.isArray(pp) && pp.length >= 2 && typeof pp[1] === 'object') {
                var ev = String(pp[0] || '');
                // v8.3: Only process SPECIFIC result events — no 'round', 'update', 'bet'
                var isResultEvent = (ev.indexOf('result') >= 0 || ev.indexOf('complete') >= 0 ||
                    ev.indexOf('win') >= 0 || ev.indexOf('spin') >= 0 ||
                    ev.indexOf('end') >= 0 || ev.indexOf('finish') >= 0);
                if (isResultEvent) {
                  var _or = _eO(pp[1], 0, 's.' + ev);
                  if (_or) _send(_or.n, 'o@' + ev);
                  _eFT(data, 's.' + ev);
                }
                // v8.3: Non-result Socket.IO events: SKIP entirely
                // (no fallback regex for 'update', 'new', 'round', 'bet' etc.)
              }
            } catch(err) {}
          }

          // Plain JSON WebSocket messages (common in Evolution)
          if (data.charAt(0) === '{' || data.charAt(0) === '[') {
            try {
              var _or2 = _eO(JSON.parse(data), 0, 'w');
              if (_or2) _send(_or2.n, 'o@w');
              _eFT(data, 'w');
            } catch(err) {}
          }
        } catch(err) {}
      });
      ws.addEventListener('close', function() { _wsc = true; _idn = false; });
      return ws;
    };
    _P.prototype = _O.prototype;
    _P.CONNECTING = _O.CONNECTING; _P.OPEN = _O.OPEN; _P.CLOSING = _O.CLOSING; _P.CLOSED = _O.CLOSED;
    window.WebSocket = _P;
  })();

  // ══════════════════════════════════════════════════════════════
  // FETCH HOOK — Only in iframes, only game-related URLs
  // ══════════════════════════════════════════════════════════════
  (function() {
    var _o = window.fetch;
    if (!_o || _o.__xV42) return;
    _o.__xV42 = true;
    window.fetch = function(input, init) {
      _ila = Date.now();
      var url = '';
      try { url = typeof input === 'string' ? input : (input instanceof Request) ? (input.url || '') : (input && input.url) ? input.url : ''; } catch(e) {}
      var pr = _o.apply(this, arguments);

      // Only scan fetch responses in iframes (parent shouldn't detect numbers)
      if (!_isI) return pr;

      var ul = url.toLowerCase();
      // v8.3: Very strict URL filtering
      var isGameUrl = (ul.indexOf('result') >= 0 || ul.indexOf('roulette') >= 0 ||
          ul.indexOf('evolution') >= 0 || ul.indexOf('round') >= 0 || ul.indexOf('wheel') >= 0);
      var isExcluded = (ul.indexOf('history') >= 0 || ul.indexOf('state') >= 0 ||
          ul.indexOf('stats') >= 0 || ul.indexOf('balance') >= 0 || ul.indexOf('user') >= 0 ||
          ul.indexOf('account') >= 0 || ul.indexOf('wallet') >= 0 || ul.indexOf('bonus') >= 0);

      if (isGameUrl && !isExcluded) {
        pr.then(function(r) {
          try {
            r.clone().text().then(function(t) {
              if (t) {
                try { var _or = _eO(JSON.parse(t), 0, 'f'); if (_or) _send(_or.n, 'o@f'); } catch(e) {}
                _eFT(t, 'f');
              }
            }).catch(function() {});
          } catch(e) {}
        }).catch(function() {});
      }
      return pr;
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // XHR HOOK — Only in iframes, only game-related URLs
  // ══════════════════════════════════════════════════════════════
  (function() {
    var _oo = XMLHttpRequest.prototype.open;
    var _os = XMLHttpRequest.prototype.send;
    if (_os.__xV42) return;
    _os.__xV42 = true;
    XMLHttpRequest.prototype.open = function(m, u) {
      this._xu = String(u || '');
      return _oo.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      var s = this;
      this.addEventListener('load', function() {
        // Only scan in iframes
        if (!_isI) return;
        var u = (s._xu || '').toLowerCase();
        var isGameUrl = (u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 ||
            u.indexOf('evolution') >= 0 || u.indexOf('round') >= 0 || u.indexOf('wheel') >= 0);
        var isExcluded = (u.indexOf('history') >= 0 || u.indexOf('state') >= 0 ||
            u.indexOf('stats') >= 0 || u.indexOf('balance') >= 0 || u.indexOf('user') >= 0 ||
            u.indexOf('account') >= 0 || u.indexOf('wallet') >= 0);
        if (isGameUrl && !isExcluded) {
          try {
            var t = s.responseText;
            if (t) {
              try { var _or = _eO(JSON.parse(t), 0, 'x'); if (_or) _send(_or.n, 'o@x'); } catch(e) {}
              _eFT(t, 'x');
            }
          } catch(e) {}
        }
      });
      return _os.apply(this, arguments);
    };
  })();

  // ══════════════════════════════════════════════════════════════
  // DOM SCANNER — Only in iframes, skip history elements
  // ══════════════════════════════════════════════════════════════
  (function() {
    var HK = ['history','past','track','sequence','previous','older','last-result','lastresults',
      'gamehistory','result-history','historyitem','resultshistory','bng','stats','statistics',
      'roadmap','bigroad','beadroad','marker','recent','stat'];
    var CK = ['winning-number','winningnumber','winning-pocket','winningpocket','result-display',
      'resultdisplay','result-value','resultvalue','current-result','game-number-display',
      'number-display','overlay-result','announced','lastnumber','round-result',
      'roulette-result','live-result','detailed-result'];

    function _iH(el) {
      if (!el) return false;
      var c = ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-test') || '')).toLowerCase();
      for (var i = 0; i < HK.length; i++) { if (c.indexOf(HK[i]) >= 0) return true; }
      var pr = el.parentElement; var d = 0;
      while (pr && d < 5) {
        var pc = ((pr.className || '') + ' ' + (pr.id || '')).toLowerCase();
        for (var i = 0; i < HK.length; i++) { if (pc.indexOf(HK[i]) >= 0) return true; }
        pr = pr.parentElement; d++;
      }
      return false;
    }

    function _iC(el) {
      if (!el) return false;
      var c = ((el.className || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('data-test') || '')).toLowerCase();
      for (var i = 0; i < CK.length; i++) { if (c.indexOf(CK[i]) >= 0) return true; }
      if (el.hasAttribute('data-result-number') || el.hasAttribute('data-winning-number') || el.hasAttribute('data-game-result')) return true;
      return false;
    }

    var SS = [
      '[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]',
      '[class*="result-value"]','[class*="current-result"]','[class*="game-number-display"]',
      '[class*="number-display"]','[data-result-number]','[data-winning-number]',
      '[data-game-result]','[class*="overlay"] [class*="result"]','[class*="announced"]',
      '[class*="round-result"]','[class*="roulette-result"]','[class*="live-result"]'
    ];

    var _ldn = -1, _ldt = 0, _DRL = 15000;

    function scan() {
      // v8.3: Only scan DOM in iframes (parent should NOT scan DOM for numbers)
      if (!_isI) return;

      for (var i = 0; i < SS.length; i++) {
        try {
          var els = document.querySelectorAll(SS[i]);
          for (var j = 0; j < els.length; j++) {
            if (_iH(els[j])) continue;
            if (!_iC(els[j]) && !els[j].hasAttribute('data-result-number') && !els[j].hasAttribute('data-winning-number')) continue;
            var tx = (els[j].textContent || '').trim();
            var n = parseInt(tx, 10);
            if (!isNaN(n) && n >= 0 && n <= 36 && String(n) === tx) {
              var now = Date.now();
              if (n === _ldn && now - _ldt < _DRL) return;
              _ldn = n; _ldt = now;
              _send(n, 'D:' + SS[i]);
              return;
            }
          }
        } catch(e) {}
      }
    }

    function setup() {
      if (!document.body) return;
      setTimeout(scan, 500);
      setTimeout(scan, 2000);
      var tm = null;
      new MutationObserver(function() {
        if (tm) return;
        tm = setTimeout(function() { tm = null; scan(); }, 500);
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
      setInterval(scan, 6000);
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(setup, 100); });
    } else {
      setTimeout(setup, 100);
    }
  })();

  // ══════════════════════════════════════════════════════════════
  // postMessage HOOK — Only in iframes
  // ══════════════════════════════════════════════════════════════
  (function() {
    if (!_isI) return; // v8.3: Parent does NOT hook postMessage for detection
    var _o = window.postMessage;
    if (_o.__xV42) return;
    _o.__xV42 = true;
    window.postMessage = function(data, origin, transfer) {
      try {
        if (typeof data === 'object' && data !== null) {
          var _or = _eO(data, 0, 'po');
          if (_or) _send(_or.n, 'o@po');
        }
      } catch(e) {}
      return _o.call(window, data, origin, transfer);
    };
    window.addEventListener('message', function(ev) {
      try {
        var d = ev.data;
        if (typeof d === 'object' && d !== null) {
          var _or = _eO(d, 0, 'pi');
          if (_or) _send(_or.n, 'o@pi');
        }
      } catch(e) {}
    });
  })();

  // ══════════════════════════════════════════════════════════════
  // EventSource HOOK — Only in iframes
  // ══════════════════════════════════════════════════════════════
  (function() {
    if (!_isI) return; // v8.3: Parent does NOT hook EventSource
    if (typeof window.EventSource === 'undefined') return;
    var _O = window.EventSource;
    if (_O.__xV42) return;
    _O.__xV42 = true;
    var _P = function(url, opts) {
      var es = opts ? new _O(url, opts) : new _O(url);
      var ad = es.addEventListener.bind(es);
      ['result','game','update','roulette','number','outcome','round'].forEach(function(t) {
        ad(t, function(e) {
          try {
            if (typeof e.data === 'string') {
              try { var _or = _eO(JSON.parse(e.data), 0, 'e.' + t); if (_or) _send(_or.n, 'o@e.' + t); } catch(err) {}
              _eFT(e.data, 'e.' + t);
            }
          } catch(err) {}
        });
      });
      return es;
    };
    _P.prototype = _O.prototype;
    _P.CONNECTING = _O.CONNECTING; _P.OPEN = _O.OPEN; _P.CLOSED = _O.CLOSED;
    window.EventSource = _P;
  })();

  // ══════════════════════════════════════════════════════════════
  // Iframe activity tracking (used by gap recovery + dead detection)
  // ══════════════════════════════════════════════════════════════
  var _ila = Date.now();
  var _idn = false;

  // Iframe dead detection
  setInterval(function() {
    if (!_isI) return;
    if (!_idn && Date.now() - _ila > 45000) {
      _idn = true;
      try { window.parent.postMessage({ source: 'x-se-a3p', reason: 'id45' }, '*'); } catch(e) {}
      _sgr();
    }
  }, 10000);

  // ══════════════════════════════════════════════════════════════
  // Gap Recovery — DOM scan after silence (only in iframes)
  // ══════════════════════════════════════════════════════════════
  var _ilCT = Date.now();
  var _gRA = false;
  var _gRT = null;
  var _GT = 22000;
  var _GSI = 3000;
  var _wsc = false;
  var _wrc = 0;

  function _grs() {
    if (!_isI) return; // v8.3: Only gap-recover in iframes
    var sels = [
      '[class*="winning-number"]','[class*="winning-pocket"]','[class*="result-display"]',
      '[class*="result-value"]','[class*="current-result"]','[class*="game-number-display"]',
      '[class*="number-display"]','[data-result-number]','[data-winning-number]',
      '[data-game-result]','[class*="overlay"] [class*="result"]','[class*="announced"]',
      '[class*="round-result"]','[class*="roulette-result"]','[class*="live-result"]',
      '[class*="last-number"]','[class*="lastnumber"]','[class*="game-result"]'
    ];
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = document.querySelectorAll(sels[i]);
        for (var j = 0; j < els.length; j++) {
          var tx = (els[j].textContent || '').trim();
          var n = parseInt(tx, 10);
          if (!isNaN(n) && n >= 0 && n <= 36 && String(n) === tx) {
            _send(n, 'GR:' + sels[i]);
            return true;
          }
        }
      } catch(e) {}
    }
    return false;
  }

  function _sgr() {
    if (_gRA) return;
    _gRA = true;
    _grs();
    _gRT = setInterval(function() {
      if (!_gRA) { clearInterval(_gRT); return; }
      _grs();
    }, _GSI);
  }

  setInterval(function() {
    if (!_isI) return;
    if (!_gRA && Date.now() - _ilCT > _GT) { _sgr(); }
  }, 5000);

  // Sync with parent (iframe → parent dedup sync)
  try {
    var _sh = function(e) {
      try {
        if (e.data && e.data.source === 'x-sy-r7w' && typeof e.data.lastNumber === 'number') {
          _sLN(e.data.lastNumber);
          _aS(e.data.lastNumber);
          window.removeEventListener('message', _sh);
        }
      } catch(err) {}
    };
    window.parent.postMessage({ source: 'x-sy-m2q' }, '*');
    window.addEventListener('message', _sh);
    setTimeout(function() { window.removeEventListener('message', _sh); }, 2000);
  } catch(e) {}
  setInterval(function() {
    try { window.parent.postMessage({ source: 'x-sy-m2q' }, '*'); } catch(e) {}
  }, 30000);

  // ══════════════════════════════════════════════════════════════
  // PARENT PAGE — Relay only, NO detection hooks
  // ══════════════════════════════════════════════════════════════

  if (!_isI) {
    var _pLN = -1;
    // Track which iframes are game iframes
    var _gameFrames = {};  // hostname → { isGame, wssHosts, lastNumber, lastTime }
    var _activeTable = true; // v8.3: Parent ALWAYS relays — filtering is done by iframe identity

    // v8.3: Table config polling — determine which casino is active
    var _activeCasino = '';
    function _checkTable() {
      try {
        fetch(_SV + '/api/capture/table-config', {
          method: 'GET'
        }).then(function(r) { return r.json(); }).then(function(data) {
          if (data && data.selectedTable) {
            var sel = data.selectedTable;
            if (sel.indexOf('pinnacle') >= 0) {
              _activeCasino = 'pinnacle';
            } else if (sel.indexOf('betfury') >= 0) {
              _activeCasino = 'betfury';
            }
            _activeTable = true;
          }
        }).catch(function() {});
      } catch(e) {}
    }
    setTimeout(_checkTable, 1500);
    setInterval(_checkTable, 10000);

    // Listen for messages from iframes
    window.addEventListener('message', function(ev) {
      try {
        var d = ev.data;
        if (!d) return;

        // iframe identified itself as a game iframe
        if (d.source === 'x-game-id-8f3k' && d.isGame) {
          _gameFrames[d.hostname] = {
            isGame: true,
            wssHost: d.wssHost || '',
            lastNumber: -1,
            lastTime: 0
          };
          _dbgAdd('GAME FRAME: ' + (d.hostname || '?') + ' wss=' + (d.wssHost || '?').substring(0, 30));
          return;
        }

        // iframe sent debug info
        if (d.source === 'x-dbg-8f3k' && d.log) {
          _dbg = d.log;
          try {
            document.dispatchEvent(new CustomEvent('x-dbg', { detail: { log: _dbg } }));
          } catch(e) {}
          return;
        }

        // iframe sent a detected number
        if (d.source === 'x-rc-8f3k' && typeof d.number === 'number') {
          var iframeHost = d.hostname || '';
          var iframeWss = (d.wssHosts || [])[0] || '';

          // v8.3: Accept number from iframe if:
          // 1. The iframe connected to a known game WSS host, OR
          // 2. The iframe's hostname matches the active casino domain
          var isFromGame = d.isGame === true;
          var wssIsGame = _isGameHost(iframeWss);
          var hostMatchesCasino = false;
          if (_activeCasino === 'betfury') {
            hostMatchesCasino = (iframeHost.indexOf('betfury') >= 0 || iframeHost.indexOf('evolution') >= 0 || iframeHost.indexOf('pragmatic') >= 0);
          } else if (_activeCasino === 'pinnacle') {
            hostMatchesCasino = (iframeHost.indexOf('pinnacle') >= 0 || iframeHost.indexOf('evolution') >= 0 || iframeHost.indexOf('pragmatic') >= 0);
          }

          // Also accept if iframe has ANY known game provider WSS
          if (!isFromGame && wssIsGame) {
            isFromGame = true;
          }

          if (isFromGame || wssIsGame || hostMatchesCasino) {
            _pLN = d.number;
            try {
              document.dispatchEvent(new CustomEvent('x-d', { detail: { number: d.number, color: d.color } }));
            } catch(e) {}
            // Send to server
            _sendToServer(d.number);
            _dbgAdd('RELAY #' + d.number + ' from ' + iframeHost.substring(0, 25) + ' game=' + isFromGame);
          } else {
            _dbgAdd('BLOCKED #' + d.number + ' from ' + iframeHost.substring(0, 25) + ' (not game)');
          }
          return;
        }

        // Sync request from iframe
        if (d && d.source === 'x-sy-m2q' && typeof d.lastNumber === 'number') {
          try { window.postMessage({ source: 'x-sy-r7w', lastNumber: _pLN }, '*'); } catch(e) {}
        }
      } catch(e) {}
    });

    // ══════════════════════════════════════════════════════════════
    // PARENT: Session management (keep-alive, modals, recovery)
    // ══════════════════════════════════════════════════════════════

    function _getRouletteURL() {
      if (_hn.indexOf('pinnacle') >= 0) {
        return 'https://casino.pinnacle.com/es/live-casino/games/european-roulette/';
      }
      return 'https://betfury.com/es/casino/games/roulette-live-by-evolution';
    }

    function _isGamePage(url) {
      if (!url) url = location.href;
      return url.indexOf('/casino/games/') !== -1 || url.indexOf('/live-casino/games/') !== -1;
    }

    function _getPlayTexts() {
      if (_hn.indexOf('pinnacle') >= 0) {
        return ['play', 'play now', 'spin', 'start', 'jugar'];
      }
      return ['jugar', 'play', 'play now', 'spin', 'start'];
    }

    var _kac = 0, _lct = Date.now(), _lkr = 'pending';
    var _LSK = 'x-v8-rs';
    var _rws = JSON.parse(localStorage.getItem(_LSK) || '{}');
    var _rc = _rws.recoverCount || 0;
    var _ir = !!_rws.isRecovering;
    var _se = !!_rws.sessionExpired;
    var _lcp = _rws.lastCaptureTime || Date.now();

    function _ss() {
      try {
        localStorage.setItem(_LSK, JSON.stringify({
          recoverCount: _rc, isRecovering: _ir, sessionExpired: _se,
          lastCaptureTime: _lcp, gameUrl: _gu, rt: _rt, rip: _rip, ts: Date.now()
        }));
      } catch(e) {}
    }
    _ss();

    var _gu = _rws.gameUrl || location.href;
    var _pso = history.pushState;
    var _rso = history.replaceState;
    if (history.pushState) {
      history.pushState = function() {
        var r = _pso.apply(this, arguments);
        if (_isGamePage()) { _gu = location.href; _ss(); }
        return r;
      };
    }
    if (history.replaceState) {
      history.replaceState = function() {
        var r = _rso.apply(this, arguments);
        if (_isGamePage()) { _gu = location.href; _ss(); }
        return r;
      };
    }
    setInterval(function() {
      if (_isGamePage() && _gu !== location.href) { _gu = location.href; _ss(); }
    }, 10000);

    document.addEventListener('x-d', function() {
      _lct = Date.now(); _lcp = _lct;
      if (!_rip) { _ir = false; _se = false; }
      _ss();
    });

    // Session expired from iframe
    window.addEventListener('message', function(e) {
      try {
        if (e.data && e.data.source === 'x-se-a3p') {
          _se = true; _ss(); _hse(e.data.reason);
        }
      } catch(err) {}
    });

    // Fetch intercept (parent) — session detection ONLY, no number detection
    var _of = window.fetch;
    if (_of && !_of.__xKA) {
      _of.__xKA = true;
      window.fetch = function(input, init) {
        var url = '';
        try { url = typeof input === 'string' ? input : (input && input.url ? input.url : ''); } catch(e) {}
        var pr = _of.apply(this, arguments);
        if (pr && url) {
          pr.then(function(r) {
            if (r.redirected) {
              var ru = (r.url || '').toLowerCase();
              if (ru.indexOf('login') !== -1 || ru.indexOf('signin') !== -1 || ru.indexOf('auth') !== -1) {
                _se = true; _ss(); _hse('fr-' + ru);
              }
            }
            if (r.status === 401 || r.status === 403) { _se = true; _ss(); _hse('fi-' + r.status); }
          }).catch(function() {});
        }
        return pr;
      };
    }

    // XHR intercept (parent) — session detection ONLY
    var _oxo = XMLHttpRequest.prototype.open;
    var _oxs = XMLHttpRequest.prototype.send;
    if (!_oxs.__xKH) {
      _oxs.__xKH = true;
      XMLHttpRequest.prototype.open = function(m, u) { this._xu = String(u || ''); return _oxo.apply(this, arguments); };
      XMLHttpRequest.prototype.send = function() {
        var s = this;
        this.addEventListener('load', function() {
          var ru = (s.responseURL || '').toLowerCase();
          if (ru.indexOf('login') !== -1 || ru.indexOf('signin') !== -1) { _se = true; _ss(); _hse('xr-l'); return; }
          if (s.status === 401 || s.status === 403) { _se = true; _ss(); _hse('xi-' + s.status); }
        });
        return _oxs.apply(this, arguments);
      };
    }

    // Keep-alive
    function _ka() {
      _kac++;
      fetch(location.pathname || '/', { method: 'GET', credentials: 'include', redirect: 'follow' }).then(function(r) {
        _lkr = r.status;
        if (r.redirected) {
          var ru = (r.url || '').toLowerCase();
          if (ru.indexOf('login') !== -1 || ru.indexOf('signin') !== -1) { _se = true; _ss(); _hse('kr'); return; }
        }
        r.clone().text().then(function(txt) {
          if (txt && txt.length < 5000 && txt.indexOf('<') !== -1) {
            var tl = txt.toLowerCase();
            if ((tl.indexOf('login') !== -1 || tl.indexOf('sign in') !== -1) && tl.indexOf('password') !== -1) {
              _se = true; _ss(); _hse('kh');
            }
          }
        }).catch(function() {});
        if (r.status === 401 || r.status === 403) { _se = true; _ss(); _hse('k-' + r.status); }
      }).catch(function() {});
    }
    setTimeout(_ka, 1500);
    setInterval(_ka, 30000);

    // Click button by text
    function _cbt(texts) {
      var sels = 'button, a, [role="button"], div[onclick], span[onclick], [class*="btn"], [class*="button"]';
      var all = document.querySelectorAll(sels);
      for (var i = 0; i < all.length; i++) {
        var bt = (all[i].textContent || '').trim();
        for (var j = 0; j < texts.length; j++) {
          if (bt === texts[j]) { all[i].click(); return true; }
        }
      }
      var all2 = document.querySelectorAll('div, span, a');
      for (var i = 0; i < all2.length; i++) {
        var bt = (all2[i].textContent || '').trim();
        if (bt.length > 0 && bt.length <= 20) {
          var st = window.getComputedStyle(all2[i]);
          if (st.cursor === 'pointer' || all2[i].getAttribute('role') === 'button') {
            for (var j = 0; j < texts.length; j++) {
              if (bt === texts[j]) { all2[i].click(); return true; }
            }
          }
        }
      }
      return false;
    }

    // Handle session expired
    var _rip = !!_rws.rip;
    var _rt = _rws.rt || 0;
    if (_rip && Date.now() - _rt > 60000) { _rip = false; }

    function _hse(reason) {
      if (_rip) return;
      var now = Date.now();
      if (now - _rt < 12000) return;
      _rip = true; _rt = now; _ir = true; _se = true; _rc++; _ss();
      var okTexts = ['OK', 'Ok', 'ok', 'ACEPTAR', 'Aceptar', 'aceptar', 'VOLVER', 'Volver', 'volver', 'INICIAR', 'Iniciar', 'iniciar', 'CONTINUAR', 'Continuar', 'continuar'];
      var ck = _cbt(okTexts);
      setTimeout(function() {
        var tu = _getRouletteURL();
        if (_gu && _isGamePage(_gu) && _gu.indexOf('roulette') !== -1) { tu = _gu; }
        location.replace(tu);
      }, ck ? 500 : 100);
      setTimeout(function() { _rip = false; _ss(); }, 20000);
    }

    // Detect and close modals
    function _dam() {
      var all = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent || '');
        var tl = t.toLowerCase();
        var exp = (tl.indexOf('sesi') !== -1 && tl.indexOf('finalizada') !== -1) ||
                  (tl.indexOf('session') !== -1 && (tl.indexOf('expired') !== -1 || tl.indexOf('ended') !== -1));
        if (exp) { _hse('ms'); return true; }
        var lb = (tl.indexOf('saldo') !== -1 && tl.indexOf('bajo') !== -1) ||
                 (tl.indexOf('balance') !== -1 && tl.indexOf('low') !== -1) ||
                 (tl.indexOf('insufficient') !== -1 && tl.indexOf('balance') !== -1);
        if (lb) { _cbt(['CERRAR', 'Cerrar', 'cerrar', 'CLOSE', 'Close', 'OK', 'Ok', 'ok']); return true; }
      }
      return false;
    }
    setInterval(_dam, 400);
    try { new MutationObserver(function() { _dam(); }).observe(document.body, { childList: true, subtree: true }); } catch(e) {}

    // Check play button
    var _pbc = 0;
    function _cpb() {
      if (_pbc > Date.now()) return false;
      if (!_isGamePage()) return false;
      var btns = document.querySelectorAll('button, a, [role="button"], div[onclick], [class*="btn"], [class*="button"]');
      var ptexts = _getPlayTexts();
      for (var i = 0; i < btns.length; i++) {
        var bt = (btns[i].textContent || '').trim().toLowerCase();
        for (var j = 0; j < ptexts.length; j++) {
          if (bt === ptexts[j]) {
            if (btns[i].getAttribute('target') === '_blank') continue;
            if (btns[i].tagName.toLowerCase() === 'a' && btns[i].getAttribute('target')) continue;
            btns[i].click();
            _pbc = Date.now() + 5000;
            _ir = true; _ss();
            return true;
          }
        }
      }
      return false;
    }
    setInterval(_cpb, 400);

    // Dead iframe reload
    setInterval(function() {
      var nc = Date.now() - _lct;
      if (_isGamePage() && nc > 60000 && !_rip) {
        _ir = true; _se = true; _ss();
        location.reload();
      }
    }, 10000);

    // Post-load recovery
    setTimeout(function() {
      if (_ir || _se || _rc > 0) {
        if (!_isGamePage()) { _hse('plr'); return; }
        _cpb(); _dam();
        setTimeout(function() { _cpb(); _dam(); }, 600);
        setTimeout(function() { _cpb(); _dam(); }, 1200);
      }
    }, 100);

    // Visibility + focus
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden) {
        _ka();
        if (!_isGamePage() && _rc > 0) _hse('vis');
        if (_isGamePage()) { _cpb(); _dam(); }
      }
    });
    window.addEventListener('focus', function() {
      _ka();
      if (_isGamePage()) { _cpb(); _dam(); }
    });

    // Report status to content script overlay
    setInterval(function() {
      try {
        document.dispatchEvent(new CustomEvent('x-s', {
          detail: {
            status: _ir ? 'recovering' : 'alive',
            keepAliveCount: _kac,
            lastResponse: _lkr,
            noCaptureSec: Math.round((Date.now() - _lct) / 1000),
            recoverCount: _rc,
            sessionExpired: _se,
            gameUrl: _gu,
            activeTable: _activeTable,
            activeCasino: _activeCasino,
            gameFrames: Object.keys(_gameFrames).length,
            debug: _dbg.slice()
          }
        }));
      } catch(e) {}
    }, 3000);
  }

  // ══════════════════════════════════════════════════════════════
  // IFRAME: Modal detection
  // ══════════════════════════════════════════════════════════════
  if (_isI) {
    var _imn = false;
    function _dim() {
      var all = document.querySelectorAll('div, p, span, h1, h2, h3, dialog, section, article, main, li, label, td, th');
      for (var i = 0; i < all.length; i++) {
        var t = (all[i].textContent || '').toLowerCase();
        if ((t.indexOf('sesi') !== -1 && t.indexOf('finalizada') !== -1) ||
            (t.indexOf('session') !== -1 && (t.indexOf('ended') !== -1 || t.indexOf('expired') !== -1))) {
          if (!_imn) {
            _imn = true;
            try { window.parent.postMessage({ source: 'x-se-a3p', reason: 'im' }, '*'); } catch(e) {}
          }
          var pr = all[i].closest ? all[i].closest('div, dialog') : null;
          if (pr) {
            var obs = pr.querySelectorAll('button, a, [role="button"], div[onclick], span[onclick]');
            for (var j = 0; j < obs.length; j++) {
              var bt = (obs[j].textContent || '').trim();
              if (bt === 'OK' || bt === 'Ok' || bt === 'ok' || bt === 'ACEPTAR' || bt === 'Aceptar') { obs[j].click(); }
            }
          }
          return true;
        }
      }
      return false;
    }
    setInterval(_dim, 500);
    try { new MutationObserver(function() { _dim(); }).observe(document.body, { childList: true, subtree: true }); } catch(e) {}

    // Iframe fetch hook (session detection ONLY — no number detection from fetch in iframe session check)
    var _iof = window.fetch;
    if (_iof && !_iof.__xIS) {
      _iof.__xIS = true;
      window.fetch = function(input, init) {
        _ila = Date.now();
        var pr = _iof.apply(this, arguments);
        if (pr) {
          pr.then(function(r) {
            if (r.status === 401 || r.status === 403 || r.redirected) {
              var ru = (r.url || '').toLowerCase();
              if (r.status === 401 || r.status === 403 || ru.indexOf('login') !== -1) {
                try { window.parent.postMessage({ source: 'x-se-a3p', reason: 'if-' + r.status }, '*'); } catch(e) {}
              }
            }
          }).catch(function() {});
        }
        return pr;
      };
    }

    // Initial debug message
    _dbgAdd('IFRAME: ' + _hn + ' url=' + location.href.substring(0, 60));
  }

  // Parent initial debug
  if (!_isI) {
    _dbgAdd('PARENT: ' + _hn + ' path=' + location.pathname);
  }
})();