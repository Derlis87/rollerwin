'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import type { CaptureEntry } from '@/lib/capture-bus'

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

const POLL_INTERVAL_MS = 2000

/**
 * useRouletteCapturer — polls /api/capture/latest for new numbers.
 * 
 * No external Socket.IO service needed. The Tampermonkey userscript
 * posts detected numbers to /api/capture/receive, and this hook
 * picks them up by polling.
 */
export function useRouletteCapturer(options: UseRouletteCapturerOptions = {}) {
  const { onNumberDetected, onCaptureError } = options

  const [isActive, setIsActive] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalCaptured, setTotalCaptured] = useState(0)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastIdRef = useRef<string>('')
  const onNumberDetectedRef = useRef(onNumberDetected)
  const onCaptureErrorRef = useRef(onCaptureError)

  useEffect(() => { onNumberDetectedRef.current = onNumberDetected }, [onNumberDetected])
  useEffect(() => { onCaptureErrorRef.current = onCaptureError }, [onCaptureError])

  // Poll for new numbers
  const startPolling = useCallback(() => {
    if (pollRef.current) return

    setIsConnected(true)
    setIsCapturing(true)
    setError(null)

    const poll = async () => {
      try {
        const url = `/api/capture/latest?afterId=${encodeURIComponent(lastIdRef.current)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data = await res.json()
        const entries: CaptureEntry[] = data.entries ?? []

        if (entries.length > 0) {
          setTotalCaptured(prev => prev + entries.length)
          // Update last seen ID
          lastIdRef.current = entries[entries.length - 1].id

          for (const entry of entries) {
            onNumberDetectedRef.current?.({
              number: entry.number,
              color: entry.color,
              timestamp: new Date(entry.timestamp)
            })
          }
        }
      } catch (err) {
        // Only report real errors, not network blips during dev
        const msg = err instanceof Error ? err.message : 'Poll error'
        console.warn('[AutoCapture] Poll error:', msg)
        // Don't set error state for transient failures
      }
    }

    // Poll immediately, then on interval
    poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }, [])

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setIsConnected(false)
    setIsCapturing(false)
  }, [])

  // ── Public API (kept compatible with old interface) ──

  /** Connect + start polling */
  const connect = useCallback(() => {
    startPolling()
  }, [startPolling])

  /** Disconnect + stop polling */
  const disconnect = useCallback(() => {
    stopPolling()
    lastIdRef.current = ''
    setTotalCaptured(0)
    setError(null)
  }, [stopPolling])

  /** Start capture (alias for connect in new architecture) */
  const startCapture = useCallback((_casino?: string, _table?: string, _url?: string) => {
    startPolling()
  }, [startPolling])

  /** Stop capture (alias for disconnect) */
  const stopCapture = useCallback(() => {
    stopPolling()
  }, [stopPolling])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  return {
    // State
    isConnected,
    isCapturing,
    currentSession: null as CaptureSession | null,
    numbers: [] as CapturedNumber[],
    error,
    totalCaptured,

    // Actions
    connect,
    disconnect,
    startCapture,
    stopCapture,
  }
}
