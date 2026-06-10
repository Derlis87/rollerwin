// RollerWin Capture v7.7.0 - Content Script (ISOLATED world, SOLO parent page)
// Crea la UI flotante y recibe numeros via postMessage y CustomEvent
(function() {
  'use strict';
  if (window.__rwContentV4) return;
  window.__rwContentV4 = true;

  var SERVER_URL = 'https://rollerwin3.onrender.com';
  var sentCount = 0;
  var lastDisplayed = -1;
  var statusEl = null;
  var circleEl = null;
  var enabled = true;
  var dotEl = null;

  // Estado del keep-alive (recibido del MAIN world)
  var _kaStatus = { alive: true, count: 0, lastResp: 'pending', noCaptureSec: 0, recovering: false, recoverCount: 0 };

  var RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

  function getColor(n) {
    if (n === 0) return 'green';
    return RED.indexOf(n) >= 0 ? 'red' : 'black';
  }

  function updateUI(num) {
    if (num === lastDisplayed) return;
    lastDisplayed = num;
    sentCount++;

    // Actualizar circulo
    if (circleEl) {
      circleEl.textContent = String(num);
      var c = getColor(num);
      circleEl.style.background = c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : '#1a1a2e';
      circleEl.style.transform = 'scale(1.3)';
      circleEl.style.transition = 'transform 0.3s ease';
      setTimeout(function() { circleEl.style.transform = 'scale(1)'; }, 300);
    }

    // Actualizar estado
    refreshStatus();

    // Enviar al background para badge
    try {
      chrome.runtime.sendMessage({
        type: 'number',
        number: num,
        color: getColor(num),
        total: sentCount
      });
    } catch(e) {}
  }

  // Refrescar el texto de estado con info real
  function refreshStatus() {
    if (!statusEl) return;

    var lines = [];
    lines.push('Motor v7.7.0 | Capture v7.7.0');
    lines.push('Keep-alive: #' + _kaStatus.count + ' | HTTP: ' + _kaStatus.lastResp);

    if (_kaStatus.recovering) {
      lines.push('');
      lines.push('RECUPERANDO... (recover #' + _kaStatus.recoverCount + ')');
      lines.push('Volviendo a mesa de ruleta...');
    } else {
      var noCap = _kaStatus.noCaptureSec;
      if (noCap > 60) {
        lines.push('Sin capturas: ' + noCap + 's');
      }
      if (sentCount > 0) {
        lines.push(sentCount + ' capturados | Recovers: ' + _kaStatus.recoverCount);
      } else {
        lines.push('Esperando resultados del iframe...');
      }
    }

    lines.push('');
    lines.push('Servidor: ' + SERVER_URL);

    statusEl.textContent = lines.join('\n');

    // Cambiar color del dot según estado
    if (dotEl) {
      if (_kaStatus.recovering) {
        dotEl.style.background = '#f59e0b';
        dotEl.style.boxShadow = '0 0 6px #f59e0b';
      } else if (!_kaStatus.alive || _kaStatus.lastResp === 401 || _kaStatus.lastResp === 403) {
        dotEl.style.background = '#ef4444';
        dotEl.style.boxShadow = '0 0 6px #ef4444';
      } else {
        dotEl.style.background = '#22c55e';
        dotEl.style.boxShadow = '0 0 6px #22c55e';
      }
    }
  }

  // ══════════════════════════════════════
  // ESCUCHAR mensajes de MAIN world
  // ══════════════════════════════════════

  // 1. postMessage desde iframes (MAIN world en iframe)
  window.addEventListener('message', function(event) {
    if (event.data && event.data.source === 'rollerwin-capture' && typeof event.data.number === 'number') {
      console.log('[RollerWin] Recibido de iframe:', event.data.number, event.data.hostname);
      updateUI(event.data.number);
    }
  });

  // 2. CustomEvent desde MAIN world en parent (números)
  document.addEventListener('rw-number', function(event) {
    if (event.detail && typeof event.detail.number === 'number') {
      console.log('[RollerWin] Recibido de MAIN parent:', event.detail.number);
      updateUI(event.detail.number);
    }
  });

  // 3. CustomEvent desde MAIN world (estado del keep-alive)
  document.addEventListener('rw-status', function(event) {
    if (event.detail) {
      _kaStatus = {
        alive: event.detail.status === 'alive',
        count: event.detail.keepAliveCount || 0,
        lastResp: event.detail.lastResponse || '?',
        noCaptureSec: event.detail.noCaptureSec || 0,
        recovering: event.detail.status === 'recovering',
        recoverCount: event.detail.recoverCount || 0
      };
      refreshStatus();
    }
  });

  // ══════════════════════════════════════
  // UI FLOTANTE
  // ══════════════════════════════════════
  function createUI() {
    if (document.getElementById('rw-capture-widget')) return;

    var container = document.createElement('div');
    container.id = 'rw-capture-widget';
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;font-family:-apple-system,sans-serif;font-size:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;';

    var panel = document.createElement('div');
    panel.id = 'rw-status-panel';
    panel.style.cssText = 'pointer-events:auto;background:rgba(0,0,0,0.92);border:1px solid #22c55e;border-radius:10px;padding:10px 14px;color:white;max-width:300px;min-width:220px;';
    panel.innerHTML = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
      '<div id="rw-dot" style="width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e;"></div>' +
      '<span style="font-size:11px;font-weight:600;color:#e4e4e7;">RollerWin Capture v7.7.0</span>' +
      '<span style="font-size:9px;color:#71717a;margin-left:auto;">MAIN world</span></div>';

    statusEl = document.createElement('div');
    statusEl.style.cssText = 'font-size:10px;color:#a1a1aa;white-space:pre-line;line-height:1.5;';
    statusEl.textContent = 'Motor v7.7.0 | Capture v7.7.0\n' +
      'Esperando resultados del iframe...\n\n' +
      'Servidor: ' + SERVER_URL;

    var lastRow = document.createElement('div');
    lastRow.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:8px;';
    lastRow.innerHTML = '<span style="font-size:10px;color:#71717a;">Ultimo:</span>' +
      '<span id="rw-last-num" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;background:#52525b;">-</span>';

    panel.appendChild(statusEl);
    panel.appendChild(lastRow);

    var btn = document.createElement('button');
    btn.style.cssText = 'pointer-events:auto;width:44px;height:44px;border-radius:50%;border:2px solid #22c55e;background:#166534;color:white;font-weight:bold;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.5);';
    btn.textContent = 'RW';

    btn.addEventListener('click', function() {
      enabled = !enabled;
      btn.style.borderColor = enabled ? '#22c55e' : '#ef4444';
      btn.style.background = enabled ? '#166534' : '#7f1d1d';
      panel.style.display = enabled ? 'block' : 'none';
      panel.style.borderColor = enabled ? '#22c55e' : '#ef4444';
      if (statusEl) statusEl.textContent = enabled ? 'Reactivado. Monitoreando...' : 'Pausado';
    });

    container.appendChild(panel);
    container.appendChild(btn);
    document.body.appendChild(container);

    circleEl = document.getElementById('rw-last-num');
    dotEl = document.getElementById('rw-dot');
  }

  // ══════════════════════════════════════
  // SOLICITAR inyeccion al background
  // ══════════════════════════════════════
  function requestInjection() {
    try {
      chrome.runtime.sendMessage({ type: 'forceInject' });
    } catch(e) {}
  }

  if (document.body) {
    createUI();
    requestInjection();
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      createUI();
      requestInjection();
    });
  }

  console.log('[RollerWin] Content Script v7.7.0 activo [PARENT]', location.hostname);
})();
