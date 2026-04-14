// ==UserScript==
// @name         RollerWin - Auto Captura Betfury
// @namespace    http://rollerwin.local/
// @version      2.0.0
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

  // ── Config ──────────────────────────────────────────
  const ROLLERWIN_PORT = 3000

  // ── State ───────────────────────────────────────────
  let lastNumber: number | null = GM_getValue('rw_lastNumber', null)
  let sentCount = 0
  let enabled = GM_getValue('rw_enabled', true)
  let statusEl: HTMLDivElement | null = null
  let statusMsg = 'Iniciando...'

  // Roulette number mapping
  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])

  function getColor(n: number): string {
    if (n === 0) return 'green'
    return RED_NUMBERS.has(n) ? 'red' : 'black'
  }

  function updateLastNumberUI(num: number) {
    const circle = document.getElementById('rw-last-num')
    if (circle) {
      circle.textContent = String(num)
      const c = getColor(num)
      circle.style.background = c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : '#1a1a2e'
      circle.style.transform = 'scale(1.3)'
      circle.style.transition = 'transform 0.3s ease'
      setTimeout(() => { circle.style.transform = 'scale(1)' }, 300)
    }
  }

  // ── Helpers ─────────────────────────────────────────

  function setStatus(msg: string) {
    statusMsg = msg
    if (statusEl) statusEl.textContent = msg
  }

  function sendToRollerWin(num: number) {
    const url = `http://localhost:${ROLLERWIN_PORT}/api/capture/receive`
    GM_xmlhttpRequest({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ number: num }),
      onload(resp) {
        if (resp.status >= 200 && resp.status < 300) {
          sentCount++
          setStatus(`Numero ${num} (${getColor(num)}) enviado OK\n${sentCount} total capturados`)
        } else {
          setStatus(`Error HTTP ${resp.status} al enviar ${num}`)
        }
      },
      onerror() {
        setStatus('Error de conexion a RollerWin\nVerifica que este corriendo en localhost:' + ROLLERWIN_PORT)
      },
      ontimeout() {
        setStatus('Timeout — RollerWin no responde')
      }
    })
  }

  function processNumber(num: number) {
    if (!enabled) return
    if (num < 0 || num > 36) return
    if (num === lastNumber) return

    lastNumber = num
    GM_setValue('rw_lastNumber', lastNumber)
    sendToRollerWin(num)
    updateLastNumberUI(num)
    console.log(`[RollerWin] Nuevo numero detectado: ${num} (${getColor(num)})`)
  }

  // ── Strategy 1: Intercept WebSocket messages ────────
  // Betfury uses socket.io which wraps WebSocket. We hook into
  // the native WebSocket to capture game result messages.

  function hookWebSocket() {
    const OrigWebSocket = window.WebSocket
    // Prevent double-hooking
    if ((OrigWebSocket as any).__rwHooked) return
    (OrigWebSocket as any).__rwHooked = true

    const ProxiedWebSocket = function (this: WebSocket, url: string, protocols?: string | string[]) {
      const ws = protocols ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url)

      // Only intercept Betfury's socket.io WebSocket
      if (url.includes('betfury')) {
        ws.addEventListener('message', (event: MessageEvent) => {
          try {
            parseSocketMessage(event.data)
          } catch (e) {
            // Not JSON or parse error — ignore
          }
        })
      }

      return ws
    } as any

    // Copy static properties
    ProxiedWebSocket.prototype = OrigWebSocket.prototype
    ProxiedWebSocket.CONNECTING = OrigWebSocket.CONNECTING
    ProxiedWebSocket.OPEN = OrigWebSocket.OPEN
    ProxiedWebSocket.CLOSING = OrigWebSocket.CLOSING
    ProxiedWebSocket.CLOSED = OrigWebSocket.CLOSED

    ;(ProxiedWebSocket as any).__rwHooked = true
    window.WebSocket = ProxiedWebSocket as any

    console.log('[RollerWin] WebSocket hook installed')
    setStatus('WebSocket hook instalado\nEsperando actividad de juego...')
  }

  /**
   * Parse socket.io / raw WebSocket messages looking for roulette numbers.
   * Socket.io messages can be:
   *   - String: "42[\"event_name\",{\"data\":...}]"  (socket.io v4 engine format)
   *   - Binary ArrayBuffer (skip)
   *   - Plain JSON
   */
  function parseSocketMessage(data: any) {
    let text: string = ''

    if (typeof data === 'string') {
      text = data
    } else if (data instanceof Blob) {
      return // Binary data, skip
    } else if (data instanceof ArrayBuffer) {
      return // Binary data, skip
    } else {
      text = String(data)
    }

    // ── Socket.io v4 engine format: "42[\"event\",{...}]" ──
    // The prefix "42" means: socket.io packet type 4 (message) + engine packet type 2 (event)
    if (text.startsWith('42') || text.startsWith('43')) {
      try {
        const jsonStr = text.slice(2)
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed) && parsed.length >= 2) {
          const eventName = parsed[0] as string
          const payload = parsed[1]

          // Check for game result events
          if (typeof eventName === 'string') {
            extractFromEvent(eventName, payload)
          }
        }
      } catch {
        // Not valid JSON after prefix removal
      }
      return
    }

    // ── Socket.io v4 long polling format: numeric prefix ──
    if (/^\d{1,2}\[/.test(text)) {
      try {
        const idx = text.indexOf('[')
        const jsonStr = text.slice(idx)
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed) && parsed.length >= 2) {
          extractFromEvent(String(parsed[0]), parsed[1])
        }
      } catch {
        // Not parseable
      }
      return
    }

    // ── Plain JSON ──
    if (text.startsWith('{') || text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) {
          // Could be a socket.io event array
          if (parsed.length >= 2) {
            extractFromEvent(String(parsed[0]), parsed[1])
          }
        } else if (typeof parsed === 'object') {
          extractFromObject(parsed)
        }
      } catch {
        // Not JSON
      }
    }
  }

  /** Extract roulette number from a named event + payload */
  function extractFromEvent(eventName: string, payload: any) {
    // Log events that might contain game data (for debugging)
    const gameKeywords = [
      'result', 'game_result', 'roulette', 'number', 'spin',
      'round_result', 'round_end', 'bet_result', 'win',
      'game_end', 'history', 'gameFinish', 'roundComplete',
      'gameState', 'game_state', 'update', 'live'
    ]

    const eventLower = eventName.toLowerCase()
    const isGameEvent = gameKeywords.some(kw => eventLower.includes(kw))

    if (isGameEvent) {
      console.log(`[RollerWin] Game event: ${eventName}`, payload)
    }

    // Try to extract number from payload
    if (payload && typeof payload === 'object') {
      extractFromObject(payload)
    }
  }

  /** Deep scan an object for roulette numbers */
  function extractFromObject(obj: any, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 6) return

    // Direct number fields
    const numberFields = [
      'number', 'result', 'resultNumber', 'winningNumber',
      'win_number', 'game_number', 'roulette_number', 'value',
      'num', 'n', 'ball_number', 'pocket', 'pocket_number',
      'last_number', 'lastNumber', 'current_number', 'currentNumber'
    ]

    for (const field of numberFields) {
      if (obj[field] !== undefined) {
        const val = typeof obj[field] === 'number' ? obj[field] : parseInt(obj[field])
        if (!isNaN(val) && val >= 0 && val <= 36) {
          processNumber(val)
          return
        }
      }
    }

    // Look for a "number" inside nested "result" objects
    if (obj.result !== undefined) {
      if (typeof obj.result === 'number') {
        const val = obj.result
        if (val >= 0 && val <= 36) {
          processNumber(val)
          return
        }
      } else if (typeof obj.result === 'object' && obj.result !== null) {
        extractFromObject(obj.result, depth + 1)
      }
    }

    // Look for number in "data" wrapper
    if (obj.data !== undefined && typeof obj.data === 'object' && obj.data !== null) {
      extractFromObject(obj.data, depth + 1)
    }

    // Look for "results" array (history)
    if (Array.isArray(obj.results) || Array.isArray(obj.history) || Array.isArray(obj.numbers)) {
      const arr = obj.results || obj.history || obj.numbers
      if (arr.length > 0) {
        const first = arr[0]
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

    // Scan all number-valued keys (last resort, only on first level)
    if (depth < 2) {
      for (const key of Object.keys(obj)) {
        const val = obj[key]
        if (typeof val === 'number' && val >= 0 && val <= 36 && val === Math.floor(val)) {
          // Only process if the key name suggests it's a game result
          const keyLower = key.toLowerCase()
          if (keyLower.includes('num') || keyLower.includes('result') || keyLower.includes('win') || keyLower.includes('ball') || keyLower.includes('pocket')) {
            processNumber(val)
            return
          }
        }
        // Recurse into nested objects that might contain results
        if (typeof val === 'object' && val !== null && !Array.isArray(val) && depth < 1) {
          const keys = Object.keys(val)
          if (keys.length > 0 && keys.length < 20) {
            extractFromObject(val, depth + 1)
          }
        }
      }
    }
  }

  // ── Strategy 2: DOM MutationObserver (for same-origin content) ──
  // This catches numbers displayed in Betfury's own UI (not inside iframes)

  function setupDOMObserver() {
    const observer = new MutationObserver(() => {
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
    // Betfury-specific selectors for their own UI elements
    const selectors = [
      // Betfury game history bar (same-origin, outside iframe)
      '.game-history-item__value',
      '.game-history__item-value',
      '.game-history-number',
      '[class*="game-history"] [class*="number"]',
      '[class*="game-history"] [class*="value"]',
      '.history-item__number',
      '[class*="history"] [class*="item"]',
      // Betfury bet result notification
      '[class*="bet-result"] [class*="number"]',
      '[class*="result-popup"] [class*="number"]',
      // Generic but useful
      '.last-result',
      '.current-number',
    ]

    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel)
        for (const el of els) {
          const text = (el.textContent || '').trim()
          const num = parseInt(text, 10)
          if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
            processNumber(num)
            return // Found a number, stop
          }
        }
      } catch (_) {}
    }
  }

  // ── Strategy 3: Intercept XMLHttpRequest for REST APIs ──
  // Some casinos send game results via REST endpoints

  function hookXHR() {
    const origOpen = XMLHttpRequest.prototype.open
    const origSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
      (this as any).__rwUrl = String(url)
      return origOpen.call(this, method, url, ...args)
    }

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      this.addEventListener('load', () => {
        try {
          const url = (this as any).__rwUrl || ''
          const responseText = this.responseText

          if (url.includes('game') || url.includes('result') || url.includes('history') || url.includes('roulette') || url.includes('round')) {
            if (responseText && responseText.startsWith('{')) {
              const parsed = JSON.parse(responseText)
              extractFromObject(parsed)
            }
          }
        } catch (_) {}
      })

      return origSend.call(this, body)
    }
  }

  // ── Strategy 4: Intercept fetch() ──────────────────
  function hookFetch() {
    const origFetch = window.fetch

    window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url || ''

      const promise = origFetch.call(this, input, init)

      if (url.includes('game') || url.includes('result') || url.includes('history') || url.includes('roulette') || url.includes('round')) {
        promise.then(async (response) => {
          try {
            const clone = response.clone()
            const text = await clone.text()
            if (text.startsWith('{') || text.startsWith('[')) {
              const parsed = JSON.parse(text)
              extractFromObject(parsed)
            }
          } catch (_) {}
        }).catch(() => {})
      }

      return promise
    }
  }

  // ── Floating toggle UI ──────────────────────────────
  function createUI() {
    const container = document.createElement('div')
    container.id = 'rw-capture-widget'
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      pointer-events: none;
    `

    // Status panel
    const statusPanel = document.createElement('div')
    statusPanel.style.cssText = `
      pointer-events: auto;
      background: rgba(0,0,0,0.92);
      border: 1px solid ${enabled ? '#22c55e' : '#ef4444'};
      border-radius: 10px;
      padding: 10px 14px;
      color: white;
      max-width: 300px;
      min-width: 200px;
      display: ${enabled ? 'block' : 'none'};
    `

    const header = document.createElement('div')
    header.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;'
    header.innerHTML = `
      <div style="width:8px;height:8px;border-radius:50%;background:${enabled ? '#22c55e' : '#ef4444'};${enabled ? 'box-shadow:0 0 6px #22c55e;' : ''}"></div>
      <span style="font-size:11px;font-weight:600;color:#e4e4e7;">RollerWin Captura</span>
    `

    statusEl = document.createElement('div')
    statusEl.style.cssText = 'font-size:10px;color:#a1a1aa;white-space:pre-line;line-height:1.5;'
    statusEl.textContent = statusMsg

    // Last number display
    const lastNumEl = document.createElement('div')
    lastNumEl.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;gap:8px;'

    const lastNumLabel = document.createElement('span')
    lastNumLabel.style.cssText = 'font-size:10px;color:#71717a;'
    lastNumLabel.textContent = 'Ultimo:'

    const lastNumCircle = document.createElement('span')
    lastNumCircle.id = 'rw-last-num'
    lastNumCircle.style.cssText = `
      width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:13px;font-weight:700;color:white;background:#52525b;
    `
    lastNumCircle.textContent = lastNumber !== null ? String(lastNumber) : '-'

    if (lastNumber !== null) {
      const c = getColor(lastNumber)
      lastNumCircle.style.background = c === 'red' ? '#dc2626' : c === 'green' ? '#16a34a' : '#1a1a2e'
    }

    lastNumEl.appendChild(lastNumLabel)
    lastNumEl.appendChild(lastNumCircle)

    statusPanel.appendChild(header)
    statusPanel.appendChild(statusEl)
    statusPanel.appendChild(lastNumEl)

    // Toggle button
    const toggleBtn = document.createElement('button')
    toggleBtn.style.cssText = `
      pointer-events: auto;
      width: 44px; height: 44px;
      border-radius: 50%;
      border: 2px solid ${enabled ? '#22c55e' : '#ef4444'};
      background: ${enabled ? '#166534' : '#7f1d1d'};
      color: white;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      transition: all 0.2s;
    `
    toggleBtn.textContent = 'RW'

    container.appendChild(statusPanel)
    container.appendChild(toggleBtn)
    document.body.appendChild(container)

    toggleBtn.addEventListener('click', () => {
      enabled = !enabled
      GM_setValue('rw_enabled', enabled)

      toggleBtn.style.borderColor = enabled ? '#22c55e' : '#ef4444'
      toggleBtn.style.background = enabled ? '#166534' : '#7f1d1d'
      statusPanel.style.display = enabled ? 'block' : 'none'
      statusPanel.style.borderColor = enabled ? '#22c55e' : '#ef4444'
      header.querySelector('div')!.setAttribute('style',
        `width:8px;height:8px;border-radius:50%;background:${enabled ? '#22c55e' : '#ef4444'};${enabled ? 'box-shadow:0 0 6px #22c55e;' : ''}`
      )

      if (enabled) {
        setStatus('Reactivado. Monitoreando...')
      } else {
        setStatus('Pausado')
      }
    })
  }

  // ── Init ────────────────────────────────────────────
  function init() {
    console.log('[RollerWin] Auto Captura v2.0 iniciado')
    console.log('[RollerWin] Dominio:', location.hostname)
    console.log('[RollerWin] Habilitado:', enabled)

    // Install hooks BEFORE page loads (we use @run-at document-start)
    hookWebSocket()
    hookXHR()
    hookFetch()

    // Create UI after DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        createUI()
        setupDOMObserver()
        setStatus(`Hooks instalados en ${location.hostname}\nAbre la mesa de ruleta y los numeros se capturaran automaticamente`)
      })
    } else {
      createUI()
      setupDOMObserver()
      setStatus(`Hooks instalados en ${location.hostname}\nAbre la mesa de ruleta y los numeros se capturaran automaticamente`)
    }
  }

  init()
})()
