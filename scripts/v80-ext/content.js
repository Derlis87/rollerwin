(function() {
  'use strict';
  if (window.__xK7cW) return;
  window.__xK7cW = true;

  var _h = location.hostname || '';
  var _sv = 'https://rollerwin3.onrender.com';
  var _cn = _h.indexOf('pinnacle') >= 0 ? 'Pinnacle' : 'Betfury';
  var _sc = 0;
  var _ld = -1;
  var _st = null;
  var _ci = null;
  var _dt = null;
  var _en = true;
  var _ka = { a: true, c: 0, r: 'pending', n: 0, v: false, x: 0, t: false, casino: '', gf: 0, debug: [] };

  var _R = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function _gc(n) { return n === 0 ? 'green' : _R.indexOf(n) >= 0 ? 'red' : 'black'; }

  function _ui(num) {
    if (num === _ld) return;
    _ld = num;
    _sc++;
    if (_ci) {
      _ci.textContent = String(num);
      var c = _gc(num);
      _ci.style.background = c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : '#1a1a2e';
      _ci.style.transform = 'scale(1.3)';
      _ci.style.transition = 'transform 0.3s ease';
      setTimeout(function() { _ci.style.transform = 'scale(1)'; }, 300);
    }
    _rs();
    try { chrome.runtime.sendMessage({ type: 'number', number: num, color: _gc(num), total: _sc }); } catch(e) {}
  }

  function _rs() {
    if (!_st) return;
    var l = [];
    l.push('v8.3 | ' + _cn);
    if (_ka.casino) l.push('Mesa: ' + _ka.casino);
    else l.push('Detectando mesa...');
    if (_ka.gf > 0) l.push('Game frames: ' + _ka.gf);
    l.push('Keep-alive: #' + _ka.c + ' | HTTP: ' + _ka.r);
    if (_ka.v) {
      l.push('RECUPERANDO... (#' + _ka.x + ')');
    } else {
      if (_ka.n > 60) l.push('Sin capturas: ' + _ka.n + 's');
      l.push((_sc > 0 ? _sc + ' capturados' : 'Esperando resultados...') + ' | Recovers: ' + _ka.x);
    }
    // Show last 3 debug lines
    var dbg = _ka.debug || [];
    if (dbg.length > 0) {
      l.push('---');
      var start = Math.max(0, dbg.length - 3);
      for (var i = start; i < dbg.length; i++) {
        l.push(dbg[i].substring(0, 50));
      }
    }
    _st.textContent = l.join('\n');
    if (_dt) {
      var col = !_ka.t ? '#f59e0b' : _ka.v ? '#f59e0b' : (!_ka.a || _ka.r === 401 || _ka.r === 403) ? '#ef4444' : '#22c55e';
      _dt.style.background = col;
      _dt.style.boxShadow = '0 0 6px ' + col;
    }
  }

  window.addEventListener('message', function(e) {
    if (e.data && e.data.source === 'x-rc-8f3k' && typeof e.data.number === 'number') _ui(e.data.number);
  });
  document.addEventListener('x-d', function(e) {
    if (e.detail && typeof e.detail.number === 'number') _ui(e.detail.number);
  });
  document.addEventListener('x-s', function(e) {
    if (e.detail) _ka = {
      a: e.detail.status === 'alive',
      c: e.detail.keepAliveCount || 0,
      r: e.detail.lastResponse || '?',
      n: e.detail.noCaptureSec || 0,
      v: e.detail.status === 'recovering',
      x: e.detail.recoverCount || 0,
      t: !!e.detail.activeTable,
      casino: e.detail.activeCasino || '',
      gf: e.detail.gameFrames || 0,
      debug: e.detail.debug || []
    };
    _rs();
  });

  function _mkUI() {
    if (document.getElementById('x-w')) return;
    var c = document.createElement('div');
    c.id = 'x-w';
    c.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;font-family:-apple-system,sans-serif;font-size:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;';
    var p = document.createElement('div');
    p.style.cssText = 'pointer-events:auto;background:rgba(0,0,0,0.92);border:1px solid #22c55e;border-radius:10px;padding:10px 14px;color:white;max-width:320px;min-width:240px;';
    p.innerHTML = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><div id="x-d2" style="width:8px;height:8px;border-radius:50%;background:#f59e0b;box-shadow:0 0 6px #f59e0b;"></div><span style="font-size:11px;font-weight:600;color:#e4e4e7;">RollerWin v8.3</span><span style="font-size:9px;color:#71717a;margin-left:auto;">' + _cn + '</span></div>';
    _st = document.createElement('div');
    _st.style.cssText = 'font-size:10px;color:#a1a1aa;white-space:pre-line;line-height:1.5;';
    _st.textContent = 'v8.3 | ' + _cn + '\nDetectando mesa...';
    var lr = document.createElement('div');
    lr.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:8px;';
    lr.innerHTML = '<span style="font-size:10px;color:#71717a;">Ultimo:</span><span id="x-n" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;background:#52525b;">-</span>';
    p.appendChild(_st);
    p.appendChild(lr);
    var b = document.createElement('button');
    b.style.cssText = 'pointer-events:auto;width:44px;height:44px;border-radius:50%;border:2px solid #22c55e;background:#166534;color:white;font-weight:bold;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.5);';
    b.textContent = 'RW';
    b.addEventListener('click', function() {
      _en = !_en;
      b.style.borderColor = _en ? '#22c55e' : '#ef4444';
      b.style.background = _en ? '#166534' : '#7f1d1d';
      p.style.display = _en ? 'block' : 'none';
      p.style.borderColor = _en ? '#22c55e' : '#ef4444';
    });
    c.appendChild(p);
    c.appendChild(b);
    document.body.appendChild(c);
    _ci = document.getElementById('x-n');
    _dt = document.getElementById('x-d2');
  }

  function _ri() { try { chrome.runtime.sendMessage({ type: 'forceInject' }); } catch(e) {} }
  if (document.body) { _mkUI(); _ri(); } else { document.addEventListener('DOMContentLoaded', function() { _mkUI(); _ri(); }); }
})();