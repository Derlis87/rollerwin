import { Server } from 'socket.io'
import express from 'express'
import { createServer } from 'http'
import puppeteer, { Browser, Page } from 'puppeteer'

const PORT = 3004
const REST_PORT = 3005

// Roulette numbers configuration
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

function getNumberColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

// Casino-specific selectors for detecting roulette numbers
const CASINO_SELECTORS: Record<string, {
  numberSelector: string
  historySelector: string
  iframeSelector?: string
  waitForSelector: string
}> = {
  betfury: {
    numberSelector: '.roulette-history-number, .game-history-item, [class*="history"] [class*="number"], .board-number, [data-number]',
    historySelector: '.roulette-history, .game-history, [class*="history-list"], [class*="recent-results"]',
    iframeSelector: 'iframe[src*="evolution"], iframe[src*="game"], iframe[src*="provider"]',
    waitForSelector: 'iframe, .game-container'
  },
  evolution: {
    numberSelector: '.last-results-number, .game-result, [class*="resultNumber"], [class*="winning-number"]',
    historySelector: '.last-results-container, [class*="history"], [class*="results"]',
    waitForSelector: '.game-wrapper'
  },
  pinnacle: {
    numberSelector: '.game-result-number, .roulette-result, .last-results-number, [class*="result"]',
    historySelector: '.history-numbers, .last-results, [class*="history"]',
    iframeSelector: 'iframe[src*="evolution"], iframe[src*="game"]',
    waitForSelector: '.game-container, iframe'
  },
  bet365: {
    numberSelector: '.last-result, .roulette-number, [class*="lastNumber"]',
    historySelector: '.history-panel, [class*="history"]',
    iframeSelector: 'iframe',
    waitForSelector: '.game-frame, iframe'
  },
  betway: {
    numberSelector: '.roulette-result, [class*="result"]',
    historySelector: '.history, [class*="history"]',
    iframeSelector: 'iframe',
    waitForSelector: '.game-container'
  },
  '888casino': {
    numberSelector: '.last-number, .result-number',
    historySelector: '.history-container',
    iframeSelector: 'iframe',
    waitForSelector: '.game-wrapper'
  }
}

// Store active capture sessions
interface CaptureSession {
  id: string
  casino: string
  table: string
  url: string
  browser: Browser | null
  page: Page | null
  isActive: boolean
  numbers: Array<{
    number: number
    color: 'red' | 'black' | 'green'
    timestamp: Date
  }>
  lastDetectedNumber: number | null
}

const sessions: Map<string, CaptureSession> = new Map()

// Create Socket.IO server
const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

console.log(`Roulette Capturer Service running on port ${PORT}`)

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`)

  // Start capturing from a casino
  socket.on('start-capture', async (data: { casino: string; table: string; url: string }) => {
    const { casino, table, url } = data
    const sessionId = `${casino}-${table}-${Date.now()}`

    console.log(`Starting capture for ${casino} - ${table} at ${url}`)

    // Create session
    const session: CaptureSession = {
      id: sessionId,
      casino,
      table,
      url,
      browser: null,
      page: null,
      isActive: true,
      numbers: [],
      lastDetectedNumber: null
    }

    sessions.set(sessionId, session)
    socket.join(sessionId)

    try {
      // Launch browser
      const browser = await puppeteer.launch({
        headless: false,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1600,1000'
        ],
        defaultViewport: null
      })

      session.browser = browser

      // Create new page
      const page = await browser.newPage()
      session.page = page

      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')

      // Navigate to casino
      console.log(`Navigating to: ${url}`)
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })

      // Emit ready state
      socket.emit('capture-ready', {
        sessionId,
        casino,
        table,
        url,
        message: 'Browser opened. Navigate to the roulette table if not already there.'
      })

      // Start monitoring for numbers
      startNumberDetection(session, socket)

    } catch (error) {
      console.error('Capture error:', error)
      socket.emit('capture-error', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Stop capturing
  socket.on('stop-capture', async (data: { sessionId: string }) => {
    const { sessionId } = data
    const session = sessions.get(sessionId)

    if (session) {
      session.isActive = false

      if (session.browser) {
        await session.browser.close()
      }

      sessions.delete(sessionId)
      console.log(`Stopped capture: ${sessionId}`)
    }

    socket.emit('capture-stopped', { sessionId })
  })

  // Manual number input (for testing or when auto-detection fails)
  socket.on('input-number', (data: { sessionId: string; number: number }) => {
    const { sessionId, number } = data
    const session = sessions.get(sessionId)

    if (session && number >= 0 && number <= 36) {
      const newNumber = {
        number,
        color: getNumberColor(number),
        timestamp: new Date()
      }

      session.numbers.push(newNumber)

      io.to(sessionId).emit('number-detected', {
        sessionId,
        number: newNumber,
        totalNumbers: session.numbers.length
      })
    }
  })

  socket.on('disconnect', async () => {
    console.log(`Client disconnected: ${socket.id}`)

    // Clean up sessions for this socket
    for (const [sessionId, session] of sessions) {
      if (session.isActive && session.browser) {
        session.isActive = false
        await session.browser.close()
        sessions.delete(sessionId)
      }
    }
  })
})

// Number detection loop
async function startNumberDetection(session: CaptureSession, socket: any) {
  const selectors = CASINO_SELECTORS[session.casino] || CASINO_SELECTORS.betfury

  console.log(`Starting number detection for ${session.id}`)

  const detectNumber = async () => {
    if (!session.isActive || !session.page) return

    try {
      // Get all frames (main page + iframes)
      const frames = session.page.frames()

      let detectedNumber: number | null = null

      for (const frame of frames) {
        if (detectedNumber !== null) break

        try {
          const number = await frame.evaluate(() => {
            // Comprehensive list of selectors to try
            const selectorList = [
              // Betfury / Evolution
              '.roulette-history-number',
              '.game-history-item',
              '.history-item',
              '.last-results-number',
              '.game-result-number',
              '.winning-number',
              '.result-number-display',
              '[data-number]',
              '[class*="history"] [class*="number"]',
              '[class*="result"] [class*="number"]',
              // Generic
              '.last-result',
              '.roulette-result',
              '.result-number',
              '[class*="lastNumber"]',
              '[class*="resultNumber"]',
              '.history-item:first-child',
              '[class*="recent"] [class*="number"]:first-child',
            ]

            for (const sel of selectorList) {
              try {
                const elements = document.querySelectorAll(sel)
                if (elements.length > 0) {
                  const text = (elements[0].textContent || '').trim()
                  const num = parseInt(text)
                  if (!isNaN(num) && num >= 0 && num <= 36) {
                    return num
                  }
                }
              } catch (e) {
                // Selector might not be valid in this context, skip
              }
            }

            return null
          })

          if (number !== null && number >= 0 && number <= 36) {
            detectedNumber = number
          }
        } catch (e) {
          // Frame might not be accessible
        }
      }

      // If no number found with selectors, try a broader scan on main frame
      if (detectedNumber === null) {
        try {
          detectedNumber = await session.page.mainFrame().evaluate(() => {
            // Look for elements that contain ONLY a number 0-36
            const candidates = document.querySelectorAll('*')
            for (const el of candidates) {
              // Only check leaf-ish elements (small text content)
              const text = (el.textContent || '').trim()
              if (text.length > 0 && text.length <= 3) {
                const num = parseInt(text)
                if (!isNaN(num) && num >= 0 && num <= 36 && String(num) === text) {
                  const style = window.getComputedStyle(el)
                  if (style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.fontSize) >= 10) {
                    return num
                  }
                }
              }
            }
            return null
          })
        } catch (e) {
          // Silently ignore
        }
      }

      if (detectedNumber !== null && detectedNumber !== session.lastDetectedNumber) {
        // New number detected!
        const newNumber = {
          number: detectedNumber,
          color: getNumberColor(detectedNumber),
          timestamp: new Date()
        }

        session.lastDetectedNumber = detectedNumber
        session.numbers.push(newNumber)

        console.log(`Number detected: ${detectedNumber} (${newNumber.color})`)

        io.to(session.id).emit('number-detected', {
          sessionId: session.id,
          number: newNumber,
          totalNumbers: session.numbers.length
        })
      }

    } catch (error) {
      // Page might be navigating or not ready — continue silently
    }

    // Continue detection loop
    if (session.isActive) {
      setTimeout(detectNumber, 1500) // Check every 1.5 seconds
    }
  }

  // Wait for page to be ready before starting detection
  await new Promise(resolve => setTimeout(resolve, 5000))
  detectNumber()
}

// REST API
const app = express()
app.use(express.json())

app.get('/api/sessions', (req, res) => {
  res.json({
    sessions: Array.from(sessions.values()).map(s => ({
      id: s.id,
      casino: s.casino,
      table: s.table,
      isActive: s.isActive,
      numbersCount: s.numbers.length
    }))
  })
})

app.get('/api/session/:sessionId', (req, res) => {
  const session = sessions.get(req.params.sessionId)

  if (!session) {
    return res.json({ error: 'Session not found' })
  }

  res.json({
    id: session.id,
    casino: session.casino,
    table: session.table,
    isActive: session.isActive,
    numbers: session.numbers.slice(-50)
  })
})

const httpServer = createServer(app)
httpServer.listen(REST_PORT, () => {
  console.log(`Roulette Capturer REST API running on port ${REST_PORT}`)
})

console.log(`
Roulette Capturer Service Started
=====================================
WebSocket: port ${PORT}
REST API: port ${REST_PORT}

Supported casinos: betfury, evolution, pinnacle, bet365, betway, 888casino
`)
