/**
 * CaptureBus — In-memory relay for roulette numbers detected by the userscript.
 * Works in single-process dev mode (Next.js dev server keeps everything in memory).
 * 
 * Flow:
 *   1. Userscript (Tampermonkey) POSTs detected numbers → /api/capture/receive
 *   2. receive route pushes the number into this bus
 *   3. Dashboard polls /api/capture/latest every 2 s and gets new numbers
 */

type Listener = (entry: CaptureEntry) => void

export interface CaptureEntry {
  number: number
  color: 'red' | 'black' | 'green'
  timestamp: number
  id: string
}

const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])

function getColor(n: number): CaptureEntry['color'] {
  if (n === 0) return 'green'
  return RED_NUMBERS.has(n) ? 'red' : 'black'
}

class CaptureBus {
  private entries: CaptureEntry[] = []
  private listeners = new Set<Listener>()
  private _lastPolledIndex = 0

  /** Push a new number into the bus */
  push(number: number) {
    if (number < 0 || number > 36) return

    // Avoid duplicates within the last 5 seconds (same spin)
    const recent = this.entries[this.entries.length - 1]
    if (recent && recent.number === number && Date.now() - recent.timestamp < 5000) {
      return
    }

    const entry: CaptureEntry = {
      number,
      color: getColor(number),
      timestamp: Date.now(),
      id: `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    }

    this.entries.push(entry)
    // Keep only last 500
    if (this.entries.length > 500) this.entries = this.entries.slice(-250)

    // Notify listeners
    this.listeners.forEach(fn => fn(entry))
  }

  /** Subscribe to new numbers */
  subscribe(fn: Listener) {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /**
   * Get entries newer than `afterId`.
   * If afterId is empty/undefined, returns empty array (no stale data).
   * If afterId is not found (old session), returns empty array.
   */
  getNew(afterId?: string): CaptureEntry[] {
    if (!afterId) {
      // First poll — return nothing (don't send stale history numbers)
      // The caller will get the afterId from the first empty response
      return []
    }

    const idx = this.entries.findIndex(e => e.id === afterId)
    if (idx === -1) {
      // ID not found (old session or after reset) — return nothing,
      // caller will pick up the next fresh number
      return []
    }

    return this.entries.slice(idx + 1)
  }

  /** Get the latest entry (or null) */
  getLatest(): CaptureEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null
  }

  /** Reset all entries */
  reset() {
    this.entries = []
  }
}

// ── Global singleton (persists across hot-reloads in dev) ──
const g = globalThis as unknown as { __captureBus?: CaptureBus }
export const captureBus: CaptureBus = g.__captureBus ?? new CaptureBus()
if (!g.__captureBus) g.__captureBus = captureBus
