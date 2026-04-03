import { Server } from 'socket.io'

const PORT = 3002

// Roulette numbers configuration
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

function getNumberColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

// Store for active sessions
interface RouletteSession {
  id: string
  casino: string
  table: string
  numbers: Array<{
    number: number
    color: 'red' | 'black' | 'green'
    timestamp: Date
  }>
  isActive: boolean
}

const sessions: Map<string, RouletteSession> = new Map()

// Casino connectors configuration
const CASINO_CONFIGS = {
  pinnacle: {
    name: 'Pinnacle',
    tables: ['live-roulette-1', 'live-roulette-2', 'speed-roulette']
  },
  evolution: {
    name: 'Evolution Gaming',
    tables: ['immersive-roulette', 'lightning-roulette', 'speed-roulette']
  },
  bet365: {
    name: 'Bet365',
    tables: ['european-roulette', 'premium-roulette']
  }
}

// Simulate real casino data (in production, this would connect to actual casino APIs)
function generateRealisticNumber(): number {
  // Simulate realistic distribution with slight bias
  const rand = Math.random()
  
  // 70% chance of following patterns, 30% random
  if (rand < 0.7 && sessions.size > 0) {
    // Get recent numbers from active sessions
    const activeSession = Array.from(sessions.values())[0]
    if (activeSession && activeSession.numbers.length > 5) {
      const lastNumbers = activeSession.numbers.slice(-5).map(n => n.number)
      const lastColor = getNumberColor(lastNumbers[lastNumbers.length - 1])
      
      // Slight tendency to alternate colors
      if (Math.random() < 0.6) {
        if (lastColor === 'red') {
          return BLACK_NUMBERS[Math.floor(Math.random() * BLACK_NUMBERS.length)]
        } else if (lastColor === 'black') {
          return RED_NUMBERS[Math.floor(Math.random() * RED_NUMBERS.length)]
        }
      }
    }
  }
  
  // Generate random number
  return Math.floor(Math.random() * 37)
}

// Create Socket.IO server
const io = new Server(PORT, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

console.log(`🎰 Casino Connector Service running on port ${PORT}`)

io.on('connection', (socket) => {
  console.log(`📡 Client connected: ${socket.id}`)

  // Join a specific casino table
  socket.on('join-table', (data: { casino: string; table: string }) => {
    const { casino, table } = data
    const sessionId = `${casino}-${table}`
    
    // Create or get session
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        id: sessionId,
        casino,
        table,
        numbers: [],
        isActive: true
      })
    }
    
    socket.join(sessionId)
    console.log(`👥 Client ${socket.id} joined ${sessionId}`)
    
    // Send current session data
    const session = sessions.get(sessionId)
    socket.emit('session-data', {
      sessionId,
      casino,
      table,
      numbers: session?.numbers.slice(-50) || [],
      isActive: true
    })
  })

  // Leave a table
  socket.on('leave-table', (data: { casino: string; table: string }) => {
    const sessionId = `${data.casino}-${data.table}`
    socket.leave(sessionId)
    console.log(`👋 Client ${socket.id} left ${sessionId}`)
  })

  // Manual number input (for testing or manual mode)
  socket.on('input-number', (data: { casino: string; table: string; number: number }) => {
    const { casino, table, number } = data
    const sessionId = `${casino}-${table}`
    const session = sessions.get(sessionId)
    
    if (session && number >= 0 && number <= 36) {
      const newNumber = {
        number,
        color: getNumberColor(number),
        timestamp: new Date()
      }
      
      session.numbers.push(newNumber)
      
      // Emit to all clients in this session
      io.to(sessionId).emit('new-number', {
        sessionId,
        number: newNumber,
        totalNumbers: session.numbers.length
      })
    }
  })

  // Start demo mode (auto-generate numbers)
  socket.on('start-demo', (data: { casino: string; table: string; interval?: number }) => {
    const { casino, table, interval = 30000 } = data // Default 30 seconds
    const sessionId = `${casino}-${table}`
    
    // Create session if not exists
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        id: sessionId,
        casino,
        table,
        numbers: [],
        isActive: true
      })
    }
    
    const session = sessions.get(sessionId)!
    session.isActive = true
    
    console.log(`🎬 Demo mode started for ${sessionId} (interval: ${interval}ms)`)
    
    // Generate numbers at interval
    const demoInterval = setInterval(() => {
      const currentSession = sessions.get(sessionId)
      if (!currentSession || !currentSession.isActive) {
        clearInterval(demoInterval)
        return
      }
      
      const number = generateRealisticNumber()
      const newNumber = {
        number,
        color: getNumberColor(number),
        timestamp: new Date()
      }
      
      currentSession.numbers.push(newNumber)
      
      io.to(sessionId).emit('new-number', {
        sessionId,
        number: newNumber,
        totalNumbers: currentSession.numbers.length
      })
      
      console.log(`🎲 ${sessionId}: ${number} (${getNumberColor(number)})`)
    }, interval)
    
    // Store interval for cleanup
    socket.data.demoInterval = demoInterval
  })

  // Stop demo mode
  socket.on('stop-demo', (data: { casino: string; table: string }) => {
    const sessionId = `${data.casino}-${data.table}`
    const session = sessions.get(sessionId)
    
    if (session) {
      session.isActive = false
    }
    
    if (socket.data.demoInterval) {
      clearInterval(socket.data.demoInterval)
    }
    
    console.log(`⏹️ Demo mode stopped for ${sessionId}`)
  })

  // Get statistics for a session
  socket.on('get-stats', (data: { casino: string; table: string }) => {
    const sessionId = `${data.casino}-${data.table}`
    const session = sessions.get(sessionId)
    
    if (!session) {
      socket.emit('stats', { error: 'Session not found' })
      return
    }
    
    const numbers = session.numbers.map(n => n.number)
    const stats = calculateStats(numbers)
    
    socket.emit('stats', {
      sessionId,
      totalNumbers: numbers.length,
      ...stats
    })
  })

  // Disconnect
  socket.on('disconnect', () => {
    if (socket.data.demoInterval) {
      clearInterval(socket.data.demoInterval)
    }
    console.log(`📡 Client disconnected: ${socket.id}`)
  })
})

// Calculate statistics
function calculateStats(numbers: number[]) {
  const nonZero = numbers.filter(n => n !== 0)
  
  let redCount = 0, blackCount = 0, greenCount = 0
  let oddCount = 0, evenCount = 0
  let lowCount = 0, highCount = 0
  let dozen1 = 0, dozen2 = 0, dozen3 = 0
  let column1 = 0, column2 = 0, column3 = 0

  numbers.forEach(num => {
    const color = getNumberColor(num)
    if (color === 'red') redCount++
    else if (color === 'black') blackCount++
    else greenCount++

    if (num !== 0) {
      if (num % 2 === 0) evenCount++
      else oddCount++

      if (num <= 18) lowCount++
      else highCount++

      if (num <= 12) dozen1++
      else if (num <= 24) dozen2++
      else dozen3++

      if (num % 3 === 1) column1++
      else if (num % 3 === 2) column2++
      else column3++
    }
  })

  const total = numbers.length
  const nonZeroTotal = nonZero.length || 1

  return {
    colors: {
      red: { count: redCount, percentage: (redCount / total) * 100 },
      black: { count: blackCount, percentage: (blackCount / total) * 100 },
      green: { count: greenCount, percentage: (greenCount / total) * 100 }
    },
    parity: {
      odd: { count: oddCount, percentage: (oddCount / nonZeroTotal) * 100 },
      even: { count: evenCount, percentage: (evenCount / nonZeroTotal) * 100 }
    },
    range: {
      low: { count: lowCount, percentage: (lowCount / nonZeroTotal) * 100 },
      high: { count: highCount, percentage: (highCount / nonZeroTotal) * 100 }
    },
    dozens: {
      '1-12': { count: dozen1, percentage: (dozen1 / nonZeroTotal) * 100 },
      '13-24': { count: dozen2, percentage: (dozen2 / nonZeroTotal) * 100 },
      '25-36': { count: dozen3, percentage: (dozen3 / nonZeroTotal) * 100 }
    },
    columns: {
      col1: { count: column1, percentage: (column1 / nonZeroTotal) * 100 },
      col2: { count: column2, percentage: (column2 / nonZeroTotal) * 100 },
      col3: { count: column3, percentage: (column3 / nonZeroTotal) * 100 }
    }
  }
}

// REST API endpoints
import { createServer } from 'http'
import express from 'express'

const app = express()
app.use(express.json())

// Get available casinos
app.get('/api/casinos', (req, res) => {
  res.json({
    casinos: Object.entries(CASINO_CONFIGS).map(([id, config]) => ({
      id,
      name: config.name,
      tables: config.tables
    }))
  })
})

// Get session data
app.get('/api/session/:casino/:table', (req, res) => {
  const { casino, table } = req.params
  const sessionId = `${casino}-${table}`
  const session = sessions.get(sessionId)
  
  if (!session) {
    return res.json({ error: 'Session not found', numbers: [] })
  }
  
  res.json({
    sessionId,
    casino: session.casino,
    table: session.table,
    numbers: session.numbers.slice(-100),
    stats: calculateStats(session.numbers.map(n => n.number))
  })
})

// Start REST server on different port
const httpServer = createServer(app)
httpServer.listen(3003, () => {
  console.log(`🌐 Casino REST API running on port 3003`)
})
