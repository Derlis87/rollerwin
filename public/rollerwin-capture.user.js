// ==UserScript==
// @name         RollerWin - Auto Captura Betfury
// @namespace    http://rollerwin.local/
// @version      1.0.0
// @description  Detecta numeros de ruleta en Betfury y los envia automaticamente a RollerWin
// @author       RollerWin
// @match        https://betfury.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict'

  // ── Config ──────────────────────────────────────────
  const POLL_MS = 2000           // Check for new numbers every 2s
  const DASHBOARD_PORT = 3000    // Default Next.js dev port

  // ── State ───────────────────────────────────────────
  let lastNumber = GM_getValue('rw_lastNumber', null)
  let sentCount = 0
  let enabled = GM_getValue('rw_enabled', true)
  let statusEl: HTMLDivElement | null = null

  // ── Helpers ─────────────────────────────────────────

  function log(msg: string) {
    console.log(`[RollerWin] ${msg}`)
    updateStatus(msg)
  }

  function updateStatus(msg: string) {
    if (statusEl) {
      statusEl.textContent = msg
    }
  }

  /** Send number to RollerWin dashboard API */
  function sendNumber(num: number) {
    const url = `http://localhost:${DASHBOARD_PORT}/api/capture/receive`

    GM_xmlhttpRequest({
      method: 'POST',
      url,
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ number: num }),
      onload(resp) {
        if (resp.status >= 200 && resp.status < 300) {
          sentCount++
          log(`Numero ${num} enviado OK (${sentCount} total)`)
        } else {
          log(`Error HTTP ${resp.status} al enviar ${num}`)
        }
      },
      onerror() {
        log('Error de conexion — asegurate de que RollerWin este corriendo en localhost:' + DASHBOARD_PORT)
      },
      ontimeout() {
        log('Timeout — RollerWin no responde')
      }
    })
  }

  /** Try to extract the latest roulette number from the page */
  function detectLatestNumber(): number | null {
    // ── Strategy 1: Known Betfury selectors ──
    const selectors = [
      // Betfury Evolution roulette history
      '.game-history-item__value',
      '.game-history__item-value',
      '.history-number',
      '.roulette-history-number',
      '[class*="game-history"] [class*="value"]',
      '[class*="history"] [class*="number"]',
      // Generic casino selectors
      '[class*="last-result"]',
      '[class*="lastNumber"]',
      '[class*="result-number"]',
      '[class*="winning-number"]',
      '[class*="resultNumber"]',
      '.game-result',
      '[data-number]',
      // Very generic
      '[class*="history"] span:first-child',
      '[class*="history"] div:first-child',
    ]

    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel)
        for (const el of els) {
          const text = (el.textContent || '').trim()
          const num = parseInt(text, 10)
          if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
            return num
          }
        }
      } catch (_) {
        // Skip invalid selectors
      }
    }

    // ── Strategy 2: Look in iframes (Evolution, etc.) ──
    try {
      const frames = document.querySelectorAll('iframe')
      for (const frame of frames) {
        try {
          const doc = (frame as HTMLIFrameElement).contentDocument
          if (!doc) continue

          for (const sel of selectors) {
            try {
              const els = doc.querySelectorAll(sel)
              for (const el of els) {
                const text = (el.textContent || '').trim()
                const num = parseInt(text, 10)
                if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
                  return num
                }
              }
            } catch (_) {}
          }
        } catch (_) {
          // Cross-origin iframe — can't access
        }
      }
    } catch (_) {}

    // ── Strategy 3: MutationObserver — watch for new number-like elements ──
    // (Handled separately below)

    return null
  }

  // ── Main loop ───────────────────────────────────────
  let pollTimer: ReturnType<typeof setInterval> | null = null

  function startPolling() {
    if (pollTimer) return

    log('Iniciando deteccion...')

    // First check immediately
    checkForNewNumber()

    // Then check periodically
    pollTimer = setInterval(checkForNewNumber, POLL_MS)
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    log('Deteccion pausada')
  }

  function checkForNewNumber() {
    if (!enabled) return

    const num = detectLatestNumber()
    if (num !== null && num !== lastNumber) {
      lastNumber = num
      GM_setValue('rw_lastNumber', lastNumber)
      sendNumber(num)
    }
  }

  // ── MutationObserver: catch new numbers inserted into the DOM ──
  function setupMutationObserver() {
    const observer = new MutationObserver(() => {
      if (!enabled) return
      // Debounce: let mutations settle before checking
      setTimeout(checkForNewNumber, 500)
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    })

    log('MutationObserver activo')
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
    `

    // Toggle button
    const toggleBtn = document.createElement('button')
    toggleBtn.textContent = 'RW'
    toggleBtn.style.cssText = `
      width: 40px; height: 40px;
      border-radius: 50%;
      border: 2px solid ${enabled ? '#22c55e' : '#ef4444'};
      background: ${enabled ? '#166534' : '#7f1d1d'};
      color: white;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      transition: all 0.2s;
    `

    const statusPanel = document.createElement('div')
    statusPanel.style.cssText = `
      background: rgba(0,0,0,0.9);
      border: 1px solid ${enabled ? '#22c55e' : '#ef4444'};
      border-radius: 8px;
      padding: 8px 12px;
      color: white;
      max-width: 280px;
      display: ${enabled ? 'block' : 'none'};
    `

    statusEl = document.createElement('div')
    statusEl.style.cssText = 'font-size: 10px; color: #a1a1aa; white-space: pre-line;'
    statusEl.textContent = 'Iniciando...'

    statusPanel.appendChild(statusEl)
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

      if (enabled) {
        startPolling()
      } else {
        stopPolling()
      }
    })
  }

  // ── Init ────────────────────────────────────────────
  function init() {
    log('RollerWin Auto Captura cargado')
    createUI()

    if (enabled) {
      startPolling()
    }

    // Start observing DOM changes after a short delay (let the page load)
    setTimeout(setupMutationObserver, 3000)
  }

  // Wait for page to be ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 1000)
  } else {
    window.addEventListener('load', () => setTimeout(init, 1000))
  }
})()
