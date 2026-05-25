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

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, writeFileSync as writeAtomic } from 'fs'
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

// ── IN-MEMORY DEDUP CACHE ──
// This is the PRIMARY dedup mechanism. It survives within the process lifetime
// and eliminates race conditions because it's synchronous (no I/O needed).
// Map<number, lastTimestamp>
const _dedupCache = new Map<number, number>()
const DEDUP_WINDOW_MS = 15000 // 15 seconds — covers one full roulette spin (~18s) with margin

function isDuplicate(number: number): boolean {
  const lastSeen = _dedupCache.get(number)
  if (lastSeen !== undefined) {
    const elapsed = Date.now() - lastSeen
    if (elapsed < DEDUP_WINDOW_MS) {
      return true // Duplicate within 15s
    }
  }
  return false
}

function markSeen(number: number): void {
  _dedupCache.set(number, Date.now())
  // Cleanup old entries every 100 calls to prevent memory leak
  if (_dedupCache.size > 100) {
    const now = Date.now()
    for (const [key, ts] of _dedupCache) {
      if (now - ts > DEDUP_WINDOW_MS * 2) _dedupCache.delete(key)
    }
  }
}

// ── Public API ──

/** Push a new number */
export function pushCapture(number: number) {
  if (number < 0 || number > 36) return

  // PRIMARY: In-memory dedup (O(1), no I/O, no race condition)
  if (isDuplicate(number)) {
    return
  }

  // SECONDARY: File-based dedup as fallback (for cross-process safety)
  const entries = readEntries()
  const now = Date.now()
  const checkCount = Math.min(entries.length, 5)
  for (let i = entries.length - checkCount; i < entries.length; i++) {
    if (entries[i].number === number && now - entries[i].timestamp < DEDUP_WINDOW_MS) {
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
