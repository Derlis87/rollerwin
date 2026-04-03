'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

export interface CapturedNumber {
  number: number
  color: 'red' | 'black' | 'green'
  timestamp: Date
}

export interface CaptureSession {
  id: string
  casino: string
  table: string
  url: string
  isActive: boolean
}

interface UseRouletteCapturerOptions {
  onNumberDetected?: (number: CapturedNumber) => void
  onCaptureReady?: (session: CaptureSession) => void
  onCaptureError?: (error: string) => void
}

const CAPTURER_PORT = 3004

export function useRouletteCapturer(options: UseRouletteCapturerOptions = {}) {
  const { onNumberDetected, onCaptureReady, onCaptureError } = options

  const [isConnected, setIsConnected] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [currentSession, setCurrentSession] = useState<CaptureSession | null>(null)
  const [numbers, setNumbers] = useState<CapturedNumber[]>([])
  const [error, setError] = useState<string | null>(null)

  const socketRef = useRef<Socket | null>(null)

  // Connect to capturer service
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return

    const socketUrl = `/?XTransformPort=${CAPTURER_PORT}`
    
    socketRef.current = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling']
    })

    socketRef.current.on('connect', () => {
      console.log('🎥 Connected to Roulette Capturer')
      setIsConnected(true)
      setError(null)
    })

    socketRef.current.on('disconnect', () => {
      console.log('🔌 Disconnected from Roulette Capturer')
      setIsConnected(false)
      setIsCapturing(false)
    })

    socketRef.current.on('connect_error', (err) => {
      console.error('Capturer connection error:', err)
      setError('No se pudo conectar al servicio de captura')
      setIsConnected(false)
    })

    socketRef.current.on('capture-ready', (data: CaptureSession) => {
      console.log('✅ Capture ready:', data)
      setCurrentSession(data)
      setIsCapturing(true)
      onCaptureReady?.(data)
    })

    socketRef.current.on('number-detected', (data: { 
      sessionId: string
      number: CapturedNumber
      totalNumbers: number 
    }) => {
      console.log('🎯 Number detected:', data.number)
      setNumbers(prev => [...prev, data.number].slice(-100))
      onNumberDetected?.(data.number)
    })

    socketRef.current.on('capture-error', (data: { error: string }) => {
      console.error('Capture error:', data.error)
      setError(data.error)
      setIsCapturing(false)
      onCaptureError?.(data.error)
    })

    socketRef.current.on('capture-stopped', () => {
      setIsCapturing(false)
      setCurrentSession(null)
    })

    return () => {
      socketRef.current?.disconnect()
    }
  }, [onNumberDetected, onCaptureReady, onCaptureError])

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
      setIsCapturing(false)
      setCurrentSession(null)
      setNumbers([])
    }
  }, [])

  // Start capture
  const startCapture = useCallback((casino: string, table: string, url: string) => {
    if (!socketRef.current?.connected) {
      setError('No hay conexión al servicio de captura')
      return
    }

    socketRef.current.emit('start-capture', { casino, table, url })
  }, [])

  // Stop capture
  const stopCapture = useCallback(() => {
    if (!socketRef.current?.connected || !currentSession) return

    socketRef.current.emit('stop-capture', { sessionId: currentSession.id })
  }, [currentSession])

  // Manual number input
  const inputNumber = useCallback((number: number) => {
    if (!socketRef.current?.connected || !currentSession) return

    socketRef.current.emit('input-number', { 
      sessionId: currentSession.id, 
      number 
    })
  }, [currentSession])

  return {
    // State
    isConnected,
    isCapturing,
    currentSession,
    numbers,
    error,
    
    // Actions
    connect,
    disconnect,
    startCapture,
    stopCapture,
    inputNumber,
    
    // Setters
    setNumbers
  }
}
