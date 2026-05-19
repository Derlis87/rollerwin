/**
 * CaptureBus — File-based relay for roulette numbers.
 *
 * Uses a JSON file on disk instead of in-memory state so that the POST
 * (receive) route and the GET (polling) route always see the same data,
 * even when Next.js standalone runs them in separate worker threads.
 *
 * Flow:
 *   1. Extension POSTs number → /api/capture/receive → writes to capture-data.json
 *   2. Dashboard polls /api/capture/latest → reads from capture-data.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

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
    writeFileSync(DATA_FILE, JSON.stringify(entries), 'utf-8')
  } catch (e) {
    console.error('[CaptureBus] Error writing file:', e)
  }
}

// ── Public API (stateless — reads/writes file on every call) ──

/** Push a new number */
export function pushCapture(number: number) {
  if (number < 0 || number > 36) return

  const entries = readEntries()

  // Dedup: same number within 8 seconds (giros son ~18s apart, 8s es seguro)
  const recent = entries[entries.length - 1]
  if (recent && recent.number === number && Date.now() - recent.timestamp < 8000) {
    return
  }

  entries.push({
    number,
    color: getColor(number),
    timestamp: Date.now(),
    id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  })

  writeEntries(entries)
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
