// ==UserScript==
// @name         RollerWin - Auto Captura Betfury
// @namespace    http://rollerwin.local/
// @version      2.1.0
// @description  Detecta numeros de ruleta en Betfury interceptando el WebSocket y los envia a RollerWin
// @author       RollerWin
// @match        https://betfury.io/*
// @match        https://betfury.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict'

  var ROLLERWIN_PORT = 3000
  var lastNumber = GM_getValue('rw_lastNumber', null)
  var sentCount = 0
  var enabled = GM_getValue('rw_enabled', true)
  var statusEl = null
  var statusMsg = 'Iniciando...'

  var RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]

  function getColor(n) {
    if (n === 0) return 'green'
    return RED_NUMBERS.indexOf(n) >= 0 ? 'red' : 'black'
  }

  function updateLastNumberUI(num) {
    var circle = document.getElementById('rw-last-num')
    if (circle) {
      circle.textContent = String(num)
      var c = getColor(num)
      circle.style.background = c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : '#1a1a2e'
      circle.style.transform = 'scale(1.3)'
      circle.style.transition = 'transform 0.3s ease'
      setTimeout(function() { circle.style.transform = 'scale(1)' }, 300)
    }
  }

  function setStatus(msg) {
    statusMsg = msg
    if (statusEl) statusEl.textContent = msg
  }

  function sendToRollerWin(num) {
    var url = 'http://localhost:' + ROLLERWIN_PORT + '/api/capture/receive'
    GM_xmlhttpRequest({
      method: 'POST',
      url: url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ number: num }),
      onload: function(resp) {
        if (resp.status >= 200 && resp.status < 300) {
          sentCount++
          setStatus('Numero ' + num + ' (' + getColor(num) + ') enviado OK\n' + sentCount + ' total capturados')
        } else {
          setStatus('Error HTTP ' + resp.status + ' al enviar ' + num)
        }
      },
      onerror: function() {
        setStatus('Error de conexion a RollerWin\nVerifica que este corriendo en localhost:' + ROLLERWIN_PORT)
      },
      ontimeout: function() {
        setStatus('Timeout - RollerWin no responde')
      }
    })
  }

  function processNumber(num) {
    if (!enabled) return
    if (num < 0 || num > 36) return
    if (num === lastNumber) return

    lastNumber = num
    GM_setValue('rw_lastNumber', lastNumber)
    sendToRollerWin(num)
    updateLastNumberUI(num)
    console.log('[RollerWin] Nuevo numero detectado: ' + num + ' (' + getColor(num) + ')')
  }

  // ── Strategy 1: Intercept WebSocket ──
  function hookWebSocket() {
    var OrigWebSocket = window.WebSocket
    if (OrigWebSocket.__rwHooked) return
    OrigWebSocket.__rwHooked = true

    var ProxiedWebSocket = function(url, protocols) {
      var ws = protocols ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url)

      if (typeof url === 'string' && url.indexOf('betfury') >= 0) {
        ws.addEventListener('message', function(event) {
          try {
            parseSocketMessage(event.data)
          } catch (e) {}
        })
      }

      return ws
    }

    ProxiedWebSocket.prototype = OrigWebSocket.prototype
    ProxiedWebSocket.CONNECTING = OrigWebSocket.CONNECTING
    ProxiedWebSocket.OPEN = OrigWebSocket.OPEN
    ProxiedWebSocket.CLOSING = OrigWebSocket.CLOSING
    ProxiedWebSocket.CLOSED = OrigWebSocket.CLOSED
    ProxiedWebSocket.__rwHooked = true

    window.WebSocket = ProxiedWebSocket
    console.log('[RollerWin] WebSocket hook instalado')
    setStatus('WebSocket hook instalado\nEsperando actividad de juego...')
  }

  function parseSocketMessage(data) {
    var text = ''

    if (typeof data === 'string') {
      text = data
    } else if (data instanceof Blob) {
      return
    } else if (data instanceof ArrayBuffer) {
      return
    } else {
      text = String(data)
    }

    // Socket.io v4 format: "42[\"event\",{...}]"
    if (text.indexOf('42') === 0 || text.indexOf('43') === 0) {
      try {
        var jsonStr = text.substring(2)
        var parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed) && parsed.length >= 2) {
          var eventName = String(parsed[0])
          extractFromEvent(eventName, parsed[1])
        }
      } catch (e) {}
      return
    }

    // Socket.io long polling: numeric prefix + JSON array
    if (/^\d{1,2}\[/.test(text)) {
      try {
        var idx = text.indexOf('[')
        var jsonStr2 = text.substring(idx)
        var parsed2 = JSON.parse(jsonStr2)
        if (Array.isArray(parsed2) && parsed2.length >= 2) {
          extractFromEvent(String(parsed2[0]), parsed2[1])
        }
      } catch (e) {}
      return
    }

    // Plain JSON
    if (text.charAt(0) === '{' || text.charAt(0) === '[') {
      try {
        var parsed3 = JSON.parse(text)
        if (Array.isArray(parsed3) && parsed3.length >= 2) {
          extractFromEvent(String(parsed3[0]), parsed3[1])
        } else if (typeof parsed3 === 'object' && parsed3 !== null) {
          extractFromObject(parsed3, 0)
        }
      } catch (e) {}
    }
  }

  function extractFromEvent(eventName, payload) {
    var gameKeywords = [
      'result', 'game_result', 'roulette', 'number', 'spin',
      'round_result', 'round_end', 'bet_result', 'win',
      'game_end', 'history', 'gameFinish', 'roundComplete',
      'gameState', 'game_state', 'update', 'live'
    ]

    var eventLower = eventName.toLowerCase()
    var isGameEvent = false
    for (var i = 0; i < gameKeywords.length; i++) {
      if (eventLower.indexOf(gameKeywords[i]) >= 0) {
        isGameEvent = true
        break
      }
    }

    if (isGameEvent) {
      console.log('[RollerWin] Game event: ' + eventName, payload)
    }

    if (payload && typeof payload === 'object') {
      extractFromObject(payload, 0)
    }
  }

  function extractFromObject(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 6) return

    // Direct number fields
    var numberFields = [
      'number', 'result', 'resultNumber', 'winningNumber',
      'win_number', 'game_number', 'roulette_number', 'value',
      'num', 'n', 'ball_number', 'pocket', 'pocket_number',
      'last_number', 'lastNumber', 'current_number', 'currentNumber'
    ]

    for (var i = 0; i < numberFields.length; i++) {
      var field = numberFields[i]
      if (obj[field] !== undefined) {
        var val = typeof obj[field] === 'number' ? obj[field] : parseInt(obj[field])
        if (!isNaN(val) && val >= 0 && val <= 36) {
          processNumber(val)
          return
        }
      }
    }

    // Look inside nested "result"
    if (obj.result !== undefined) {
      if (typeof obj.result === 'number') {
        if (obj.result >= 0 && obj.result <= 36) {
          processNumber(obj.result)
          return
        }
      } else if (typeof obj.result === 'object' && obj.result !== null) {
        extractFromObject(obj.result, depth + 1)
      }
    }

    // Look inside "data"
    if (obj.data !== undefined && typeof obj.data === 'object' && obj.data !== null) {
      extractFromObject(obj.data, depth + 1)
    }

    // Look for arrays: results, history, numbers
    var arrFields = ['results', 'history', 'numbers']
    for (var j = 0; j < arrFields.length; j++) {
      var arr = obj[arrFields[j]]
      if (Array.isArray(arr) && arr.length > 0) {
        var first = arr[0]
        if (typeof first === 'number' && first >= 0 && first <= 36) {
          processNumber(first)
          return
        }
        if (typeof first === 'object' && first !== null) {
          extractFromObject(first, depth + 1)
        }
      }
    }

    // Look for "game" object
    if (obj.game && typeof obj.game === 'object') {
      extractFromObject(obj.game, depth + 1)
    }

    // Look for "round" object
    if (obj.round && typeof obj.round === 'object') {
      extractFromObject(obj.round, depth + 1)
    }

    // Scan all keys at shallow depth
    if (depth < 2) {
      var keys = Object.keys(obj)
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k]
        var val2 = obj[key]
        if (typeof val2 === 'number' && val2 >= 0 && val2 <= 36 && val2 === Math.floor(val2)) {
          var keyLower = key.toLowerCase()
          if (keyLower.indexOf('num') >= 0 || keyLower.indexOf('result') >= 0 ||
              keyLower.indexOf('win') >= 0 || keyLower.indexOf('ball') >= 0 ||
              keyLower.indexOf('pocket') >= 0) {
            processNumber(val2)
            return
          }
        }
        if (typeof val2 === 'object' && val2 !== null && !Array.isArray(val2) && depth < 1) {
          var subKeys = Object.keys(val2)
          if (subKeys.length > 0 && subKeys.length < 20) {
            extractFromObject(val2, depth + 1)
          }
        }
      }
    }
  }

  // ── Strategy 2: DOM MutationObserver ──
  function setupDOMObserver() {
    var observer = new MutationObserver(function() {
      if (!enabled) return
      setTimeout(scanDOM, 300)
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    })
  }

  function scanDOM() {
    var selectors = [
      '.game-history-item__value',
      '.game-history__item-value',
      '.game-history-number',
      '[class*="game-history"] [class*="number"]',
      '[class*="game-history"] [class*="value"]',
      '.history-item__number',
      '[class*="history"] [class*="item"]',
      '[class*="bet-result"] [class*="number"]',
      '[class*="result-popup"] [class*="number"]',
      '.last-result',
      '.current-number'
    ]

    for (var i = 0; i < selectors.length; i++) {
      try {
        var els = document.querySelectorAll(selectors[i])
        for (var j = 0; j < els.length; j++) {
          var text = (els[j].textContent || '').trim()
          var num = parseInt(text, 10)
          if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
            processNumber(num)
            return
          }
        }
      } catch (e) {}
    }
  }

  // ── Strategy 3: Hook XMLHttpRequest ──
  function hookXHR() {
    var origOpen = XMLHttpRequest.prototype.open
    var origSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function(method, url) {
      this.__rwUrl = String(url)
      return origOpen.apply(this, arguments)
    }

    XMLHttpRequest.prototype.send = function(body) {
      var self = this
      this.addEventListener('load', function() {
        try {
          var url = self.__rwUrl || ''
          var responseText = self.responseText

          if (url.indexOf('game') >= 0 || url.indexOf('result') >= 0 ||
              url.indexOf('history') >= 0 || url.indexOf('roulette') >= 0 ||
              url.indexOf('round') >= 0) {
            if (responseText && responseText.charAt(0) === '{') {
              var parsed = JSON.parse(responseText)
              extractFromObject(parsed, 0)
            }
          }
        } catch (e) {}
      })

      return origSend.apply(this, arguments)
    }
  }

  // ── Strategy 4: Hook fetch ──
  function hookFetch() {
    var origFetch = window.fetch

    window.fetch = function(input, init) {
      var url = typeof input === 'string' ? input :
                (input instanceof URL) ? input.href :
                (input && input.url) ? input.url : ''

      var promise = origFetch.apply(this, arguments)

      if (url.indexOf('game') >= 0 || url.indexOf('result') >= 0 ||
          url.indexOf('history') >= 0 || url.indexOf('roulette') >= 0 ||
          url.indexOf('round') >= 0) {
        promise.then(function(response) {
          try {
            var clone = response.clone()
            clone.text().then(function(text) {
              if (text.charAt(0) === '{' || text.charAt(0) === '[') {
                var parsed = JSON.parse(text)
                extractFromObject(parsed, 0)
              }
            })
          } catch (e) {}
        }).catch(function() {})
      }

      return promise
    }
  }

  // ── Floating UI ──
  function createUI() {
    var container = document.createElement('div')
    container.id = 'rw-capture-widget'
    container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:12px;display:flex;flex-direction:column;align-items:flex-end;gap:6px;pointer-events:none;'

    var statusPanel = document.createElement('div')
    statusPanel.style.cssText = 'pointer-events:auto;background:rgba(0,0,0,0.92);border:1px solid ' + (enabled ? '#22c55e' : '#ef4444') + ';border-radius:10px;padding:10px 14px;color:white;max-width:300px;min-width:200px;display:' + (enabled ? 'block' : 'none') + ';'

    var header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;'
    header.innerHTML = '<div style="width:8px;height:8px;border-radius:50%;background:' + (enabled ? '#22c55e' : '#ef4444') + ';' + (enabled ? 'box-shadow:0 0 6px #22c55e;' : '') + '"></div><span style="font-size:11px;font-weight:600;color:#e4e4e7;">RollerWin Captura</span>'

    statusEl = document.createElement('div')
    statusEl.style.cssText = 'font-size:10px;color:#a1a1aa;white-space:pre-line;line-height:1.5;'
    statusEl.textContent = statusMsg

    var lastNumEl = document.createElement('div')
    lastNumEl.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:8px;'

    var lastNumLabel = document.createElement('span')
    lastNumLabel.style.cssText = 'font-size:10px;color:#71717a;'
    lastNumLabel.textContent = 'Ultimo:'

    var lastNumCircle = document.createElement('span')
    lastNumCircle.id = 'rw-last-num'
    lastNumCircle.style.cssText = 'width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;background:#52525b;'
    lastNumCircle.textContent = lastNumber !== null ? String(lastNumber) : '-'
    if (lastNumber !== null) {
      var c = getColor(lastNumber)
      lastNumCircle.style.background = c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : '#1a1a2e'
    }

    lastNumEl.appendChild(lastNumLabel)
    lastNumEl.appendChild(lastNumCircle)

    statusPanel.appendChild(header)
    statusPanel.appendChild(statusEl)
    statusPanel.appendChild(lastNumEl)

    var toggleBtn = document.createElement('button')
    toggleBtn.style.cssText = 'pointer-events:auto;width:44px;height:44px;border-radius:50%;border:2px solid ' + (enabled ? '#22c55e' : '#ef4444') + ';background:' + (enabled ? '#166534' : '#7f1d1d') + ';color:white;font-weight:bold;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,0.5);transition:all 0.2s;'
    toggleBtn.textContent = 'RW'

    container.appendChild(statusPanel)
    container.appendChild(toggleBtn)
    document.body.appendChild(container)

    toggleBtn.addEventListener('click', function() {
      enabled = !enabled
      GM_setValue('rw_enabled', enabled)
      toggleBtn.style.borderColor = enabled ? '#22c55e' : '#ef4444'
      toggleBtn.style.background = enabled ? '#166534' : '#7f1d1d'
      statusPanel.style.display = enabled ? 'block' : 'none'
      statusPanel.style.borderColor = enabled ? '#22c55e' : '#ef4444'
      if (enabled) {
        setStatus('Reactivado. Monitoreando...')
      } else {
        setStatus('Pausado')
      }
    })
  }

  // ── Init ──
  function init() {
    console.log('[RollerWin] Auto Captura v2.1 iniciado')
    console.log('[RollerWin] Dominio: ' + location.hostname)
    console.log('[RollerWin] Habilitado: ' + enabled)

    hookWebSocket()
    hookXHR()
    hookFetch()

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        createUI()
        setupDOMObserver()
        setStatus('Hooks instalados en ' + location.hostname + '\nAbre la mesa de ruleta y los numeros se capturaran automaticamente')
      })
    } else {
      createUI()
      setupDOMObserver()
      setStatus('Hooks instalados en ' + location.hostname + '\nAbre la mesa de ruleta y los numeros se capturaran automaticamente')
    }
  }

  init()
})()
