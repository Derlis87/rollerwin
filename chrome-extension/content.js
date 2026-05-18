// RollerWin Capture - Content Script v3.2
// Se inyecta en betfury.com y en los iframes de Evolution
(function () {
  'use strict'

  if (window.__rwInjected) return
  window.__rwInjected = true

  var isInIframe = (window.self !== window.top)
  var SERVER_URL = 'https://rollerwin3.onrender.com'
  var enabled = true
  var lastNumber = null
  var sentCount = 0
  var errorCount = 0
  var lastSentTime = 0
  var statusEl = null

  var RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]

  function getColor(n) {
    if (n === 0) return 'green'
    return RED_NUMBERS.indexOf(n) >= 0 ? 'red' : 'black'
  }

  function sendToRollerWin(num) {
    var now = Date.now()
    if (now - lastSentTime < 3000) return

    fetch(SERVER_URL.replace(/\/+$/, '') + '/api/capture/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: num })
    }).then(function(resp) {
      if (resp.ok) {
        lastSentTime = now
        sentCount++
        errorCount = 0
        console.log('[RollerWin] ' + num + ' (' + getColor(num) + ') enviado OK - ' + sentCount + ' total')
        if (!isInIframe && statusEl) {
          statusEl.textContent = num + ' (' + getColor(num) + ') enviado OK\n' + sentCount + ' capturados'
        }
      } else {
        errorCount++
        if (!isInIframe && statusEl) statusEl.textContent = 'Error HTTP ' + resp.status
      }
    }).catch(function() {
      errorCount++
      if (!isInIframe && statusEl) statusEl.textContent = 'Error de conexion a servidor'
    })
  }

  function processNumber(num) {
    if (!enabled) return
    if (num < 0 || num > 36) return
    if (num === lastNumber) return

    lastNumber = num
    sendToRollerWin(num)
    console.log('[RollerWin] Detectado: ' + num + ' (' + getColor(num) + ') ' + (isInIframe ? '[IFRAME]' : '[PARENT]'))

    // Actualizar UI
    if (!isInIframe) {
      var circle = document.getElementById('rw-last-num')
      if (circle) {
        circle.textContent = String(num)
        var c = getColor(num)
        circle.style.background = c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : '#1a1a2e'
        circle.style.transform = 'scale(1.3)'
        circle.style.transition = 'transform 0.3s ease'
        setTimeout(function() { circle.style.transform = 'scale(1)' }, 300)
      }
      // Enviar mensaje al background para el popup
      try {
        chrome.runtime.sendMessage({ type: 'number', number: num, color: getColor(num), total: sentCount })
      } catch(e) {}
    }
  }

  // ══════════════════════════════════════
  // Hook WebSocket
  // ══════════════════════════════════════
  function hookWebSocket() {
    var OrigWS = window.WebSocket
    if (OrigWS.__rwHooked) return
    OrigWS.__rwHooked = true

    var ProxyWS = function(url, protocols) {
      var ws = protocols ? new OrigWS(url, protocols) : new OrigWS(url)
      if (typeof url === 'string') {
        ws.addEventListener('message', function(e) {
          try { parseMessage(e.data) } catch(err) {}
        })
      }
      return ws
    }
    ProxyWS.prototype = OrigWS.prototype
    ProxyWS.CONNECTING = OrigWS.CONNECTING
    ProxyWS.OPEN = OrigWS.OPEN
    ProxyWS.CLOSING = OrigWS.CLOSING
    ProxyWS.CLOSED = OrigWS.CLOSED
    window.WebSocket = ProxyWS
  }

  function parseMessage(data) {
    var text = typeof data === 'string' ? data : ''
    if (!text) return

    try {
      // Socket.io format
      if (text.indexOf('42') === 0 || text.indexOf('43') === 0) {
        var p = JSON.parse(text.substring(2))
        if (Array.isArray(p) && p.length >= 2 && typeof p[1] === 'object') extractObj(p[1], 0)
        return
      }
      if (/^\d{1,2}\[/.test(text)) {
        var idx = text.indexOf('[')
        var p2 = JSON.parse(text.substring(idx))
        if (Array.isArray(p2) && p2.length >= 2 && typeof p2[1] === 'object') extractObj(p2[1], 0)
        return
      }
      if (text.charAt(0) === '{' || text.charAt(0) === '[') {
        var p3 = JSON.parse(text)
        if (Array.isArray(p3) && p3.length >= 2 && typeof p3[1] === 'object') extractObj(p3[1], 0)
        else if (typeof p3 === 'object') extractObj(p3, 0)
      }
    } catch(e) {}
  }

  function extractObj(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 6) return

    var fields = ['number','result','resultNumber','winningNumber','win_number','game_number',
      'roulette_number','value','num','n','ball_number','pocket','pocket_number',
      'last_number','lastNumber','current_number','currentNumber','gameResult','game_result']

    for (var i = 0; i < fields.length; i++) {
      if (obj[fields[i]] !== undefined) {
        var v = typeof obj[fields[i]] === 'number' ? obj[fields[i]] : parseInt(obj[fields[i]])
        if (!isNaN(v) && v >= 0 && v <= 36) { processNumber(v); return }
      }
    }

    if (obj.result !== undefined) {
      if (typeof obj.result === 'number' && obj.result >= 0 && obj.result <= 36) { processNumber(obj.result); return }
      if (typeof obj.result === 'object' && obj.result !== null) extractObj(obj.result, depth + 1)
    }
    if (obj.data !== undefined && typeof obj.data === 'object' && obj.data !== null) extractObj(obj.data, depth + 1)

    var arrF = ['results','history','numbers','gameResults']
    for (var j = 0; j < arrF.length; j++) {
      var arr = obj[arrF[j]]
      if (Array.isArray(arr) && arr.length > 0) {
        if (typeof arr[0] === 'number' && arr[0] >= 0 && arr[0] <= 36) { processNumber(arr[0]); return }
        if (typeof arr[0] === 'object') extractObj(arr[0], depth + 1)
      }
    }
    if (obj.game && typeof obj.game === 'object') extractObj(obj.game, depth + 1)
    if (obj.round && typeof obj.round === 'object') extractObj(obj.round, depth + 1)
  }

  // ══════════════════════════════════════
  // Hook XHR
  // ══════════════════════════════════════
  function hookXHR() {
    var origOpen = XMLHttpRequest.prototype.open
    var origSend = XMLHttpRequest.prototype.send
    XMLHttpRequest.prototype.open = function(m, u) { this.__rwUrl = String(u); return origOpen.apply(this, arguments) }
    XMLHttpRequest.prototype.send = function(b) {
      var self = this
      this.addEventListener('load', function() {
        try {
          var u = self.__rwUrl || ''
          if (u.indexOf('game') >= 0 || u.indexOf('result') >= 0 || u.indexOf('roulette') >= 0 || u.indexOf('evolution') >= 0) {
            if (self.responseText && self.responseText.charAt(0) === '{') extractObj(JSON.parse(self.responseText), 0)
          }
        } catch(e) {}
      })
      return origSend.apply(this, arguments)
    }
  }

  // ══════════════════════════════════════
  // Hook Fetch
  // ══════════════════════════════════════
  function hookFetch() {
    var origFetch = window.fetch
    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input : (input instanceof URL) ? input.href : (input && input.url) || ''
      var promise = origFetch.apply(this, arguments)
      if (url.indexOf('game') >= 0 || url.indexOf('result') >= 0 || url.indexOf('roulette') >= 0 || url.indexOf('evolution') >= 0) {
        promise.then(function(r) {
          try {
            r.clone().text().then(function(t) {
              if (t.charAt(0) === '{' || t.charAt(0) === '[') extractObj(JSON.parse(t), 0)
            })
          } catch(e) {}
        }).catch(function() {})
      }
      return promise
    }
  }

  // ══════════════════════════════════════
  // DOM Scanner
  // ══════════════════════════════════════
  var domTimer = null
  function setupDOM() {
    if (!document.body) return
    new MutationObserver(function() {
      if (!enabled || domTimer) return
      domTimer = setTimeout(function() { domTimer = null; scanDOM() }, 500)
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  function scanDOM() {
    var sels = [
      '.game-history-item__value','.game-history__item-value','.game-history-number',
      '[class*="game-history"] [class*="number"]','[class*="game-history"] [class*="value"]',
      '.history-item__number','[class*="roulette"] [class*="result"]','[class*="roulette"] [class*="winning"]',
      '[class*="evolution"] [class*="result"]','[data-result-number]','[data-number]',
      '[class*="bng"] [class*="history"] [class*="value"]','[class*="roulette-number"]',
      '[class*="winning-number"]','[class*="game-number-display"]'
    ]
    for (var i = 0; i < sels.length; i++) {
      try {
        var els = document.querySelectorAll(sels[i])
        for (var j = 0; j < Math.min(els.length, 3); j++) {
          var t = (els[j].textContent || '').trim()
          var n = parseInt(t, 10)
          if (!isNaN(n) && n >= 0 && n <= 36 && String(n) === t) { processNumber(n); return }
        }
      } catch(e) {}
    }
  }

  // ══════════════════════════════════════
  // Floating UI (solo parent, no iframe)
  // ══════════════════════════════════════
  function createUI() {
    if (isInIframe) return
    if (document.getElementById('rw-capture-widget')) return

    var c = document.createElement('div')
    c.id = 'rw-capture-widget'
    c.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;font-family:-apple-system,sans-serif;font-size:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;'

    var sp = document.createElement('div')
    sp.id = 'rw-status-panel'
    sp.style.cssText = 'pointer-events:auto;background:rgba(0,0,0,0.92);border:1px solid #22c55e;border-radius:10px;padding:10px 14px;color:white;max-width:300px;min-width:220px;'
    sp.innerHTML = '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 6px #22c55e;"></div><span style="font-size:11px;font-weight:600;color:#e4e4e7;">RollerWin Capture v3</span></div>'

    statusEl = document.createElement('div')
    statusEl.style.cssText = 'font-size:10px;color:#a1a1aa;white-space:pre-line;line-height:1.5;'
    statusEl.textContent = 'Hooks instalados\nEsperando numeros de Evolution...\n\nServidor: ' + SERVER_URL

    var ln = document.createElement('div')
    ln.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:8px;'
    ln.innerHTML = '<span style="font-size:10px;color:#71717a;">Ultimo:</span><span id="rw-last-num" style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;background:#52525b;">-</span>'

    sp.appendChild(statusEl)
    sp.appendChild(ln)

    var btn = document.createElement('button')
    btn.style.cssText = 'pointer-events:auto;width:44px;height:44px;border-radius:50%;border:2px solid #22c55e;background:#166534;color:white;font-weight:bold;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.5);'
    btn.textContent = 'RW'

    btn.addEventListener('click', function() {
      enabled = !enabled
      btn.style.borderColor = enabled ? '#22c55e' : '#ef4444'
      btn.style.background = enabled ? '#166534' : '#7f1d1d'
      sp.style.display = enabled ? 'block' : 'none'
      sp.style.borderColor = enabled ? '#22c55e' : '#ef4444'
      statusEl.textContent = enabled ? 'Reactivado. Monitoreando...' : 'Pausado'
    })

    c.appendChild(sp)
    c.appendChild(btn)
    document.body.appendChild(c)
  }

  // ══════════════════════════════════════
  // INIT
  // ══════════════════════════════════════
  hookWebSocket()
  hookXHR()
  hookFetch()

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { createUI(); setupDOM() })
  } else {
    createUI(); setupDOM()
  }

  console.log('[RollerWin] Extension v3.2 activa - ' + (isInIframe ? 'IFRAME' : 'PARENT') + ' (' + location.hostname + ')')
})()
