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

  // Use refs for callbacks to prevent stale closures and unnecessary reconnections
  const onNumberDetectedRef = useRef(onNumberDetected)
  const onCaptureReadyRef = useRef(onCaptureReady)
  const onCaptureErrorRef = useRef(onCaptureError)

  useEffect(() => { onNumberDetectedRef.current = onNumberDetected }, [onNumberDetected])
  useEffect(() => { onCaptureReadyRef.current = onCaptureReady }, [onCaptureReady])
  useEffect(() => { onCaptureErrorRef.current = onCaptureError }, [onCaptureError])

  // Connect to capturer service
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return

    // Direct connection to the capturer service
    const socketUrl = `http://localhost:${CAPTURER_PORT}`

    const socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    })

    socket.on('connect', () => {
      console.log('Connected to Roulette Capturer')
      setIsConnected(true)
      setError(null)
    })

    socket.on('disconnect', () => {
      console.log('Disconnected from Roulette Capturer')
      setIsConnected(false)
      setIsCapturing(false)
    })

    socket.on('connect_error', (err) => {
      console.error('Capturer connection error:', err.message)
      setError('No se pudo conectar al servicio de captura (puerto ' + CAPTURER_PORT + ')')
      setIsConnected(false)
    })

    socket.on('capture-ready', (data: CaptureSession) => {
      console.log('Capture ready:', data.id)
      setCurrentSession(data)
      setIsCapturing(true)
      onCaptureReadyRef.current?.(data)
    })

    socket.on('number-detected', (data: {
      sessionId: string
      number: CapturedNumber
      totalNumbers: number
    }) => {
      setNumbers(prev => [...prev, data.number].slice(-100))
      onNumberDetectedRef.current?.(data.number)
    })

    socket.on('capture-error', (data: { error: string }) => {
      console.error('Capture error:', data.error)
      setError(data.error)
      setIsCapturing(false)
      onCaptureErrorRef.current?.(data.error)
    })

    socket.on('capture-stopped', () => {
      setIsCapturing(false)
      setCurrentSession(null)
    })

    socketRef.current = socket
  }, []) // Stable — no dependencies due to refs

  // Disconnect
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
      setIsConnected(false)
      setIsCapturing(false)
      setCurrentSession(null)
      setNumbers([])
      setError(null)
    }
  }, [])

  // Start capture
  const startCapture = useCallback((casino: string, table: string, url: string) => {
    if (!socketRef.current?.connected) {
      setError('No hay conexion al servicio de captura')
      return
    }
    setError(null)
    socketRef.current.emit('start-capture', { casino, table, url })
  }, [])

  // Stop capture
  const stopCapture = useCallback(() => {
    if (!socketRef.current?.connected) return
    if (currentSession) {
      socketRef.current.emit('stop-capture', { sessionId: currentSession.id })
    }
    setIsCapturing(false)
    setCurrentSession(null)
  }, [currentSession])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

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

    // Setters
    setNumbers
  }
}
