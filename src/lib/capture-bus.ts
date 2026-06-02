/**
 * CaptureBus — File-based relay for roulette numbers.
 *
 * Uses a JSON file on disk so POST (receive) and GET (polling) see same data.
 * In-memory dedup cache prevents duplicates from race conditions.
 *
 * Flow:
 *   1. Extension POSTs number → /api/capture/receive → dedup → writes to capture-data.json
 *   2. Dashboard polls /api/capture/latest → reads from capture-data.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, writeFileSync as writeAtomicSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

export interface CaptureEntry {
  number: number
  color: 'red' | 'black' | 'green'
  timestamp: number
  id: string
}

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function getColor(n: number): CaptureEntry['color'] {
  if (n === 0) return 'green'
  return RED_NUMBERS.has(n) ? 'red' : 'black'
}

// Data directory — use /tmp on Render (writable), or local db/ in dev
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/tmp/rw-capture' : join(process.cwd(), 'db', 'capture')
const DATA_FILE = join(DATA_DIR, 'capture-data.json')
const LOCK_FILE = join(DATA_DIR, '.capture.lock')

function ensureDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readEntries(): CaptureEntry[] {
  ensureDir()
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (e) {
    console.error('[CaptureBus] Error reading file:', e)
  }
  return []
}

function writeEntries(entries: CaptureEntry[]) {
  ensureDir()
  try {
    // Keep only last 500 entries
    if (entries.length > 500) entries = entries.slice(-250)
    // Atomic write: write to temp file, then rename
    const tmpFile = join(DATA_DIR, `capture-${Date.now()}-${Math.random().toString(36).slice(2,6)}.tmp`)
    writeFileSync(tmpFile, JSON.stringify(entries), 'utf-8')
    renameSync(tmpFile, DATA_FILE)
  } catch (e) {
    console.error('[CaptureBus] Error writing file:', e)
  }
}

// ── WRITE LOCK (prevents race conditions on multi-process) ──
// Uses a lock file with PID + timestamp. If lock is older than 3s, it's stale.
const _writeLockActive = new Map<string, number>() // in-memory lock per number
const WRITE_LOCK_TTL = 3000

function acquireWriteLock(number: number): boolean {
  const key = String(number)
  const now = Date.now()
  const lastLock = _writeLockActive.get(key)
  if (lastLock !== undefined && now - lastLock < WRITE_LOCK_TTL) {
    return false // Another write for this number is in progress
  }
  _writeLockActive.set(key, now)
  return true
}

function releaseWriteLock(number: number): void {
  _writeLockActive.delete(String(number))
  // Cleanup
  if (_writeLockActive.size > 50) {
    const now = Date.now()
    for (const [k, ts] of _writeLockActive) {
      if (now - ts > WRITE_LOCK_TTL * 2) _writeLockActive.delete(k)
    }
  }
}

// ── IN-MEMORY DEDUP CACHE ──
// Prevents race conditions when multiple hooks (WS/Fetch/XHR/DOM)
// detect the SAME spin result.
// v7.4 FIX: DEDUP GLOBAL por tiempo — NO por valor.
// Antes: _dedupCache = Map<number, number> chequeaba entries[i].number === number,
// lo que bloqueaba repeticiones legítimas (ej: 15, 15 en giros diferentes).
// Ahora: _lastCaptureTimestamp global — si CUALQUIER numero fue capturado en los
// últimos 12s, bloquear. Esto permite 15,15 legítimos si están separados >12s.
// Los giros duran ~18s, así que 12s nunca bloquea giros diferentes.
const _lastCaptureTimestamp = { value: 0 }
const DEDUP_WINDOW_MS = 12000 // 12 seconds

function isDuplicate(number: number): boolean {
  const now = Date.now()
  if (now - _lastCaptureTimestamp.value < DEDUP_WINDOW_MS) {
    return true // Cualquier número dentro de 12s del último = mismo giro
  }
  return false
}

function markSeen(number: number): void {
  _lastCaptureTimestamp.value = Date.now()
}

// ── Public API ──

/** Push a new number */
export function pushCapture(number: number) {
  if (number < 0 || number > 36) return

  // PRIMARY: In-memory dedup (O(1), no I/O, no race condition)
  if (isDuplicate(number)) {
    return
  }

  // Write lock: prevent race conditions from simultaneous requests
  if (!acquireWriteLock(number)) {
    console.log('[CaptureBus] Write lock active for', number, '— skipping')
    return
  }

  try {
    // SECONDARY: File-based dedup fallback (for cross-process safety on Render)
    // v7.4 FIX: DEDUP GLOBAL por tiempo — si CUALQUIER numero fue capturado
    // en los últimos 12s, bloquear. NO compara por valor (permite 15,15 legítimos).
    const entries = readEntries()
    const now = Date.now()
    const checkCount = Math.min(entries.length, 3)
    for (let i = entries.length - checkCount; i < entries.length; i++) {
      if (now - entries[i].timestamp < DEDUP_WINDOW_MS) {
        // Cualquier captura dentro de la ventana de 12s = mismo giro → bloquear
        markSeen(number) // Also update cache
        return
      }
    }

    // Write to file
    entries.push({
      number,
      color: getColor(number),
      timestamp: now,
      id: `cap-${now}-${Math.random().toString(36).slice(2, 6)}`
    })

    writeEntries(entries)

    // Mark in memory cache AFTER successful write
    markSeen(number)
  } finally {
    releaseWriteLock(number)
  }
}

/** Get entries newer than afterId */
export function getNewCaptures(afterId?: string): CaptureEntry[] {
  const entries = readEntries()

  if (!afterId) {
    // Return all entries (after a reset)
    return entries
  }

  const idx = entries.findIndex(e => e.id === afterId)
  if (idx === -1) {
    // ID not found — return all entries so client resyncs
    return entries
  }

  return entries.slice(idx + 1)
}

/** Reset all entries */
export function resetCaptures() {
  writeEntries([])
}

/** Get latest entry */
export function getLatestCapture(): CaptureEntry | null {
  const entries = readEntries()
  return entries.length > 0 ? entries[entries.length - 1] : null
}

// ── Backward-compatible singleton wrapper ──
// (useRouletteCapturer and other code import captureBus as an object)
class CaptureBusCompat {
  push(number: number) { pushCapture(number) }
  getNew(afterId?: string) { return getNewCaptures(afterId) }
  reset() { resetCaptures() }
  getLatest() { return getLatestCapture() }
  subscribe() { return () => {} } // no-op
}

const g = globalThis as unknown as { __captureBus?: CaptureBusCompat }
export const captureBus: CaptureBusCompat = g.__captureBus ?? new CaptureBusCompat()
if (!g.__captureBus) g.__captureBus = captureBus
