'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export type CasinoType = 'pinnacle' | 'evolution' | 'bet365'

export interface CasinoNumber {
  number: number
  color: 'red' | 'black' | 'green'
  timestamp: Date
}

export interface CasinoSession {
  sessionId: string
  casino: string
  table: string
  numbers: CasinoNumber[]
  isActive: boolean
}

export interface CasinoStats {
  colors: {
    red: { count: number; percentage: number }
    black: { count: number; percentage: number }
    green: { count: number; percentage: number }
  }
  parity: {
    odd: { count: number; percentage: number }
    even: { count: number; percentage: number }
  }
  range: {
    low: { count: number; percentage: number }
    high: { count: number; percentage: number }
  }
  dozens: {
    '1-12': { count: number; percentage: number }
    '13-24': { count: number; percentage: number }
    '25-36': { count: number; percentage: number }
  }
  columns: {
    col1: { count: number; percentage: number }
    col2: { count: number; percentage: number }
    col3: { count: number; percentage: number }
  }
}

interface UseCasinoConnectionOptions {
  autoConnect?: boolean
  demoMode?: boolean
  demoInterval?: number
}

const CASINO_PORT = 3002

// Predefined roulette numbers by color
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

function getNumberColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

export function useCasinoConnection(options: UseCasinoConnectionOptions = {}) {
  const { autoConnect = false, demoMode = false, demoInterval = 10000 } = options

  const [isConnected, setIsConnected] = useState(false)
  const [currentSession, setCurrentSession] = useState<CasinoSession | null>(null)
  const [numbers, setNumbers] = useState<CasinoNumber[]>([])
  const [stats, setStats] = useState<CasinoStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDemoRunning, setIsDemoRunning] = useState(false)

  const socketRef = useRef<Socket | null>(null)

  // Connect to casino service
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return

    const socketUrl = `/?XTransformPort=${CASINO_PORT}`
    
    socketRef.current = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    })

    socketRef.current.on('connect', () => {
      console.log('🎰 Connected to Casino Service')
      setIsConnected(true)
      setError(null)
    })

    socketRef.current.on('disconnect', () => {
      console.log('🔌 Disconnected from Casino Service')
      setIsConnected(false)
    })

    socketRef.current.on('connect_error', (err) => {
      console.error('Casino connection error:', err)
      setError('No se pudo conectar al servicio del casino')
      setIsConnected(false)
    })

    socketRef.current.on('session-data', (data: CasinoSession) => {
      setCurrentSession(data)
      setNumbers(data.numbers)
    })

    socketRef.current.on('new-number', (data: { 
      sessionId: string
      number: CasinoNumber
      totalNumbers: number 
    }) => {
      setNumbers(prev => [...prev, data.number].slice(-100))
    })

    socketRef.current.on('stats', (data: CasinoStats & { sessionId: string; totalNumbers: number }) => {
      setStats(data)
    })

    return () => {
      socketRef.current?.disconnect()
    }
  }, [])

  // Disconnect from casino service
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
      setCurrentSession(null)
      setNumbers([])
      setStats(null)
    }
  }, [])

  // Join a specific table
  const joinTable = useCallback((casino: CasinoType, table: string) => {
    if (!socketRef.current?.connected) {
      setError('No hay conexión activa')
      return
    }

    socketRef.current.emit('join-table', { casino, table })
  }, [])

  // Leave current table
  const leaveTable = useCallback(() => {
    if (!socketRef.current?.connected || !currentSession) return

    socketRef.current.emit('leave-table', { 
      casino: currentSession.casino, 
      table: currentSession.table 
    })
    setCurrentSession(null)
    setNumbers([])
  }, [currentSession])

  // Input a number manually
  const inputNumber = useCallback((number: number) => {
    if (!socketRef.current?.connected || !currentSession) {
      // If not connected, just add locally
      const newNumber: CasinoNumber = {
        number,
        color: getNumberColor(number),
        timestamp: new Date()
      }
      setNumbers(prev => [...prev, newNumber].slice(-100))
      return
    }

    socketRef.current.emit('input-number', {
      casino: currentSession.casino,
      table: currentSession.table,
      number
    })
  }, [currentSession])

  // Start demo mode
  const startDemo = useCallback((casino: CasinoType = 'pinnacle', table: string = 'live-roulette-1') => {
    if (!socketRef.current?.connected) {
      setError('No hay conexión activa')
      return
    }

    socketRef.current.emit('start-demo', { 
      casino, 
      table, 
      interval: demoInterval 
    })
    setIsDemoRunning(true)
  }, [demoInterval])

  // Stop demo mode
  const stopDemo = useCallback(() => {
    if (!socketRef.current?.connected || !currentSession) return

    socketRef.current.emit('stop-demo', { 
      casino: currentSession.casino, 
      table: currentSession.table 
    })
    setIsDemoRunning(false)
  }, [currentSession])

  // Get statistics
  const getStats = useCallback(() => {
    if (!socketRef.current?.connected || !currentSession) return

    socketRef.current.emit('get-stats', {
      casino: currentSession.casino,
      table: currentSession.table
    })
  }, [currentSession])

  // Auto connect on mount if enabled
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      socketRef.current?.disconnect()
    }
  }, [autoConnect, connect])

  return {
    // State
    isConnected,
    currentSession,
    numbers,
    stats,
    error,
    isDemoRunning,

    // Actions
    connect,
    disconnect,
    joinTable,
    leaveTable,
    inputNumber,
    startDemo,
    stopDemo,
    getStats
  }
}
