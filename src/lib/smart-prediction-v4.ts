/**
 * Smart Prediction Engine v4.3 — Anti-Streak Corrected Edition
 * 
 * Mejoras sobre v4.2:
 *   1. CRITICAL FIX: postStreakAnalysis() ahora calcula la tasa de ruptura CORRECTAMENTE
 *      - v4.2 calculaba: "de rachas que llegaron a N, cuántas rompieron en N?" (MAL)
 *      - v4.3 calcula: "después de N colores consecutivos, qué pasa en el siguiente spin?" (CORRECTO)
 *      - Dato real: streak 4 rompe solo 47.5%, streak 5 solo 45.4% — NO forzar opuesto!
 *   2. Umbral de empuje opuesto subido de 49% a 50%
 *   3. STRONG (streak 4): Modo NEUTRAL cuando breakPct < 50% (sin nudge por defecto)
 *   4. ULTRA (streak 5+): Completamente neutral cuando breakPct < 50% (sin nudge de 5 pts)
 *   5. Análisis pre-racha mejorado con multi-ventana en todos los modos anti-streak
 *   6. Wheel/displacement aceptado en CUALQUIER dirección (no solo cuando coincide con anti-streak)
 *
 * Mejoras sobre v4.0 (heredadas):
 *   - Firma del Croupier, Markov Orden-3, Retroalimentación adaptativa
 *   - Z-score estricto, Saturación de color, Análisis de tripletas
 */

// European roulette wheel layout (clockwise from 0)
const WHEEL_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]

// Pre-computed wheel index lookup: number → position on wheel
const WHEEL_INDEX: Record<number, number> = {}
WHEEL_LAYOUT.forEach((n, i) => { WHEEL_INDEX[n] = i })

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export type BetType = 'color' | 'parity' | 'dozen' | 'column'

export interface PredictionOption {
  value: string
  label: string
  confidence: number
}

export interface SmartPrediction {
  type: BetType
  options: PredictionOption[]
  bestValue: string
  bestConfidence: number
  dealerSignal?: { targetNumber: number; reliability: number }
}

// ── Adaptive weight tracking ──
interface ModuleAccuracy {
  hits: number
  attempts: number
  weight: number
}

type ModuleName = 'freq' | 'markov' | 'streak' | 'momentum' | 'gap' | 'sector' | 'chisq' | 'hotcold' | 'wheel' | 'saturation' | 'triplet' | 'markov3'

const DEFAULT_WEIGHTS: Record<ModuleName, number> = {
  freq: 1.0,
  markov: 2.5,
  markov3: 1.8,
  streak: 2.0,
  momentum: 1.2,
  gap: 1.5,
  sector: 1.0,
  chisq: 1.2,
  hotcold: 1.2,
  wheel: 3.0,
  saturation: 2.5,
  triplet: 1.3,
}

// Global adaptive state (persists across calls)
let accuracyTracker: Record<ModuleName, ModuleAccuracy> = {} as any
function initTracker() {
  for (const key of Object.keys(DEFAULT_WEIGHTS) as ModuleName[]) {
    if (!accuracyTracker[key]) {
      accuracyTracker[key] = { hits: 0, attempts: 0, weight: DEFAULT_WEIGHTS[key] }
    }
  }
}
initTracker()

/** Record which modules contributed to a correct/incorrect prediction */
export function recordPredictionFeedback(correct: boolean, contributingModules: ModuleName[]) {
  for (const mod of contributingModules) {
    if (!accuracyTracker[mod]) {
      accuracyTracker[mod] = { hits: 0, attempts: 0, weight: DEFAULT_WEIGHTS[mod] }
    }
    accuracyTracker[mod].attempts++
    if (correct) accuracyTracker[mod].hits++
    // Adapt weight: boost good modules, reduce bad ones
    const acc = accuracyTracker[mod]
    const hitRate = acc.attempts > 5 ? acc.hits / acc.attempts : 0.5
    const baseWeight = DEFAULT_WEIGHTS[mod]
    // Weight adjusts between 0.3x and 2.0x of default based on accuracy
    acc.weight = baseWeight * Math.max(0.3, Math.min(2.0, hitRate * 2))
  }
}

function getWeight(mod: ModuleName): number {
  return accuracyTracker[mod]?.weight ?? DEFAULT_WEIGHTS[mod]
}

function trackContribution(scores: Record<string, number>, baseScores: Record<string, number>, cats: string[], module: ModuleName): ModuleName[] {
  // Check if this module actually changed the ranking
  let influenced = false
  for (const c of cats) {
    if (Math.abs(scores[c] - baseScores[c]) > 0.01) { influenced = true; break }
  }
  return influenced ? [module] : []
}

// ── Helper: get number color ──
function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

// ── Main prediction function ──
export function generateSmartPrediction(nums: number[], betType: BetType): SmartPrediction {
  if (nums.length < 5) return { type: betType, options: [], bestValue: '', bestConfidence: 50 }

  const nonZero = nums.filter(n => n !== 0)
  const nzTotal = nonZero.length || 1

  // ── MODULE: Multi-window frequency ──
  const multiWindowFreq = (getCat: (n: number) => string | null, cats: string[]) => {
    const windows = [5, 10, 20, 37]
    const scores: Record<string, number> = {}
    cats.forEach(c => scores[c] = 0)
    windows.forEach((w, wi) => {
      const slice = nonZero.slice(-w)
      const sTotal = slice.length || 1
      const expected = (1 / cats.length) * 100
      const weight = [1, 1.5, 2.5, 3][wi]
      const freqs: Record<string, number> = {}
      cats.forEach(c => freqs[c] = 0)
      slice.forEach(n => { const c = getCat(n); if (c) freqs[c]++ })
      cats.forEach(c => { scores[c] += freqs[c] * weight })
      cats.forEach(c => {
        const actual = (freqs[c] / sTotal) * 100
        const deviation = expected - actual
        scores[c] += deviation * weight * 0.6
      })
    })
    return scores
  }

  // ── MODULE: Markov Order-2 ──
  const markovOrder2 = (getCat: (n: number) => string | null, cats: string[]) => {
    const trans: Record<string, Record<string, Record<string, number>>> = {}
    for (let i = 2; i < nonZero.length; i++) {
      const c0 = getCat(nonZero[i - 2]); const c1 = getCat(nonZero[i - 1]); const c2 = getCat(nonZero[i])
      if (c0 && c1 && c2) {
        if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
        trans[c0][c1][c2] = (trans[c0][c1][c2] || 0) + 1
      }
    }
    const scores: Record<string, number> = {}
    cats.forEach(c => scores[c] = 0)
    if (nonZero.length >= 2) {
      const c0 = getCat(nonZero[nonZero.length - 2]); const c1 = getCat(nonZero[nonZero.length - 1])
      if (c0 && c1 && trans[c0] && trans[c0][c1]) {
        const tr = trans[c0][c1]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
        if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
      }
    }
    if (Object.values(scores).every(v => v === 0) && nonZero.length >= 1) {
      const last = getCat(nonZero[nonZero.length - 1])
      const trans1: Record<string, Record<string, number>> = {}
      for (let i = 1; i < nonZero.length; i++) {
        const prev = getCat(nonZero[i - 1]); const curr = getCat(nonZero[i])
        if (prev && curr) { if (!trans1[prev]) trans1[prev] = {}; trans1[prev][curr] = (trans1[prev][curr] || 0) + 1 }
      }
      if (last && trans1[last]) {
        const tr = trans1[last]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
        if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
      }
    }
    return scores
  }

  // ── MODULE: Markov Order-3 (NEW in v4.0) ──
  const markovOrder3 = (getCat: (n: number) => string | null, cats: string[]) => {
    if (nonZero.length < 10) { const s: Record<string, number> = {}; cats.forEach(c => s[c] = 0); return s }
    const trans: Record<string, Record<string, Record<string, Record<string, number>>>> = {}
    for (let i = 3; i < nonZero.length; i++) {
      const c0 = getCat(nonZero[i - 3]); const c1 = getCat(nonZero[i - 2])
      const c2 = getCat(nonZero[i - 1]); const c3 = getCat(nonZero[i])
      if (c0 && c1 && c2 && c3) {
        if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
        if (!trans[c0][c1][c2]) trans[c0][c1][c2] = {}
        trans[c0][c1][c2][c3] = (trans[c0][c1][c2][c3] || 0) + 1
      }
    }
    const scores: Record<string, number> = {}
    cats.forEach(c => scores[c] = 0)
    if (nonZero.length >= 3) {
      const c0 = getCat(nonZero[nonZero.length - 3]); const c1 = getCat(nonZero[nonZero.length - 2])
      const c2 = getCat(nonZero[nonZero.length - 1])
      if (c0 && c1 && c2 && trans[c0] && trans[c0][c1] && trans[c0][c1][c2]) {
        const tr = trans[c0][c1][c2]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
        if (total >= 2) { // Only use if we have enough data (min 2 occurrences)
          cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
        }
      }
    }
    return scores
  }

  // ── MODULE: Streak analysis ──
  const streakAnalysis = (getCat: (n: number) => string | null, cats: string[], streaks: Record<string, number>) => {
    const scores: Record<string, number> = {}; cats.forEach(c => scores[c] = 0)
    let maxStreak = 0; let streakCat: string | null = null
    cats.forEach(c => { if ((streaks[c] || 0) > maxStreak) { maxStreak = streaks[c]; streakCat = c } })
    if (streakCat && maxStreak >= 3) {
      const reversionStrength = Math.min(35, maxStreak * 7) // Increased from 30/6 to 35/7
      cats.forEach(c => { if (c !== streakCat) scores[c] += reversionStrength / (cats.length - 1) })
      scores[streakCat!] -= reversionStrength
    } else if (streakCat && maxStreak === 2) {
      cats.forEach(c => { if (c !== streakCat) scores[c] += 6 }) // Increased from 5
      scores[streakCat!] -= 6
    }
    return scores
  }

  // ── MODULE: Momentum ──
  const momentumAnalysis = (getCat: (n: number) => string | null, cats: string[]): string | null => {
    if (nonZero.length < 8) return null
    const last8 = nonZero.slice(-8).map(n => getCat(n)).filter(Boolean)
    if (last8.length < 6) return null
    const last6 = last8.slice(-6)
    const counts: Record<string, number> = {}
    last6.forEach(c => { if (c) counts[c] = (counts[c] || 0) + 1 })
    let dominant: string | null = null
    cats.forEach(c => { if ((counts[c] || 0) >= 4) dominant = c })
    if (dominant && last8[last8.length - 1] === dominant && last8[last8.length - 2] === dominant) return dominant
    return null
  }

  // ── MODULE: Gap/absence ──
  const gapAnalysis = (getCat: (n: number) => string | null, cats: string[]) => {
    const scores: Record<string, number> = {}; cats.forEach(c => scores[c] = 0)
    const lastSeen: Record<string, number> = {}; cats.forEach(c => lastSeen[c] = -1)
    nonZero.forEach((n, i) => { const c = getCat(n); if (c) lastSeen[c] = i })
    const lastIdx = nonZero.length - 1
    cats.forEach(c => {
      const gap = lastIdx - (lastSeen[c] ?? -1)
      if (gap >= 4) scores[c] += Math.min(25, gap * 4) // Increased from 20/3
      else if (gap >= 2) scores[c] += gap * 2.5 // Increased from 2
    })
    return scores
  }

  // ── MODULE: Sector/wheel pattern ──
  const sectorAnalysis = (getCat: (n: number) => string | null, cats: string[]) => {
    const scores: Record<string, number> = {}; cats.forEach(c => scores[c] = 0)
    if (nonZero.length >= 4) {
      const last4raw = nonZero.slice(-4).map(n => getCat(n))
      const last4 = last4raw.filter((c): c is string => c !== null)
      if (last4.length >= 4) {
        let alternating = true
        for (let i = 1; i < last4.length; i++) { if (last4[i] === last4[i - 1]) { alternating = false; break } }
        if (alternating) { const lastCat = last4[last4.length - 1]; cats.forEach(c => { if (c !== lastCat) scores[c] += 10 }) } // Increased from 8
      }
      if (last4.length >= 4 && last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2]) {
        scores[last4[2]] += 12 // Increased from 10
      }
    }
    return scores
  }

  // ── MODULE: Chi-square ──
  const chiSquareTest = (counts: number[], expected: number) => {
    return counts.reduce((sum, c) => sum + Math.pow(c - expected, 2) / Math.max(1, expected), 0)
  }

  // ── MODULE: Hot/Cold clustering ──
  const hotColdAnalysis = (getCat: (n: number) => string | null, cats: string[]) => {
    const scores: Record<string, number> = {}; cats.forEach(c => scores[c] = 0)
    const recent15 = nonZero.slice(-15)
    const counts: Record<string, number> = {}; cats.forEach(c => counts[c] = 0)
    recent15.forEach(n => { const c = getCat(n); if (c) counts[c]++ })
    cats.forEach(c => {
      const pct = (counts[c] / Math.max(1, recent15.length)) * 100
      if (pct < 20) scores[c] = (20 - pct) * 2.0 // Increased from 1.5
      else if (pct > 45) scores[c] = -(pct - 45) * 1.5 // Increased from 1.0
    })
    return scores
  }

  // ── MODULE: Dealer Signature / Wheel Displacement (NEW in v4.0) ──
  const wheelDisplacement = (getCat: (n: number) => string | null, cats: string[]): { scores: Record<string, number>; signal: { targetNumber: number; reliability: number } | null } => {
    const scores: Record<string, number> = {}; cats.forEach(c => scores[c] = 0)
    let signal: { targetNumber: number; reliability: number } | null = null

    if (nonZero.length < 6) return { scores, signal }

    // Calculate wheel displacements between consecutive spins
    const displacements: number[] = []
    for (let i = 1; i < nonZero.length; i++) {
      const idxPrev = WHEEL_INDEX[nonZero[i - 1]]
      const idxCurr = WHEEL_INDEX[nonZero[i]]
      if (idxPrev !== undefined && idxCurr !== undefined) {
        let diff = idxCurr - idxPrev
        if (diff < 0) diff += 37
        displacements.push(diff)
      }
    }

    if (displacements.length < 3) return { scores, signal }

    // Use last 4 displacements (more data = better variance estimate)
    const lastN = Math.min(5, displacements.length)
    const recent = displacements.slice(-lastN)
    const avgDisp = recent.reduce((a, b) => a + b, 0) / recent.length
    const variance = recent.reduce((a, b) => a + Math.pow(b - avgDisp, 2), 0) / recent.length

    // If variance is low → consistent dealer throw → project next position
    const threshold = 12 // More generous than PRO-ENGINE's 8
    if (variance < threshold) {
      const lastNum = nonZero[nonZero.length - 1]
      const lastIdx = WHEEL_INDEX[lastNum]
      if (lastIdx !== undefined) {
        const projectedIdx = Math.floor((lastIdx + avgDisp) % 37)
        const targetNumber = WHEEL_LAYOUT[projectedIdx]
        const reliability = Math.floor(Math.max(50, 100 - variance * 4))

        signal = { targetNumber, reliability }

        // Map the projected number to its category and boost that category
        const targetCat = getCat(targetNumber)
        if (targetCat) {
          const boost = Math.max(10, (threshold - variance) * 3)
          scores[targetCat] += boost
        }
      }
    }
    return { scores, signal }
  }

  // ── MODULE: Color/Parity Saturation (NEW in v4.0, improved threshold) ──
  const saturationAnalysis = (getCat: (n: number) => string | null, cats: string[]): Record<string, number> => {
    const scores: Record<string, number> = {}; cats.forEach(c => scores[c] = 0)
    if (nonZero.length < 8 || cats.length !== 2) return scores

    const last8 = nonZero.slice(-8).map(n => getCat(n)).filter(Boolean)
    cats.forEach(c => {
      const count = last8.filter(x => x === c).length
      // Trigger at 5+ out of 8 (more sensitive than PRO-ENGINE's 6 of 8)
      if (count >= 5) {
        const opposite = cats.find(x => x !== c)!
        scores[opposite] += (count - 4) * 10 // Stronger signal for higher saturation
        scores[c] -= (count - 4) * 8
      }
    })
    return scores
  }

  // ── MODULE: Triplet Pattern Analysis (NEW in v4.0) ──
  // Detects repeating 3-result patterns (e.g., ABA, AAB, ABC)
  const tripletAnalysis = (getCat: (n: number) => string | null, cats: string[]): Record<string, number> => {
    const scores: Record<string, number> = {}; cats.forEach(c => scores[c] = 0)
    if (nonZero.length < 9) return scores

    const cats_history = nonZero.slice(-9).map(n => getCat(n)).filter(Boolean)
    if (cats_history.length < 6) return scores

    // Look at last 3 results as current triplet
    const last3 = cats_history.slice(-3)
    const pattern = last3.join(',')

    // Search for this pattern earlier in history
    const history = cats_history.slice(0, -3)
    for (let i = 0; i <= history.length - 3; i++) {
      const tri = history.slice(i, i + 3).join(',')
      if (tri === pattern && i + 3 < history.length) {
        // Found the same pattern before → see what came next
        const nextCat = history[i + 3]
        if (nextCat) scores[nextCat] += 15 // Boost the historically-following category
      }
    }
    return scores
  }

  // ── Normalize scores to confidence percentages ──
  // Uses a floor-based shift so that small score differences produce small confidence differences
  // and large score differences produce large confidence differences (proportional, not binary)
  const toConfidence = (scores: Record<string, number>, cats: string[], expectedPct: number) => {
    const minScore = Math.min(...Object.values(scores))
    const FLOOR = 5 // Base floor to prevent extreme amplification of tiny differences
    const shifted: Record<string, number> = {}
    cats.forEach(c => { shifted[c] = Math.max(1, scores[c] - minScore + FLOOR) })
    const totalShifted = cats.reduce((s, c) => s + shifted[c], 0) || 1
    const confs: Record<string, number> = {}
    cats.forEach(c => {
      const weight = shifted[c] / totalShifted
      const maxSpread = cats.length === 2 ? 30 : 22
      const conf = expectedPct + (weight * 2 - 1) * maxSpread
      confs[c] = Math.max(5, Math.min(92, conf))
    })
    const sum = Object.values(confs).reduce((s, v) => s + v, 0) || 1
    cats.forEach(c => { confs[c] = Math.round((confs[c] / sum) * 100) })
    return confs
  }

  // ── Track contributing modules for adaptive feedback ──
  let contributingModules: ModuleName[] = []

  // ═══════════════════════════════════════════
  // COLOR PREDICTION — v4.3 ANTI-STREAK CORRECTED
  // ═══════════════════════════════════════════
  if (betType === 'color') {
    const cats = ['red', 'black']
    const getCat = (n: number) => { const c = getNumberColor(n); return c === 'green' ? null : c }

    // ── Calculate current streak ──
    const streaks: Record<string, number> = {}
    let maxR = 0, maxB = 0
    nonZero.forEach(n => {
      const c = getNumberColor(n)
      if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 } else { maxR = 0; maxB = 0 }
    })
    streaks.red = maxR; streaks.black = maxB
    const currentStreak = Math.max(maxR, maxB)
    const streakColor = maxR > maxB ? 'red' : 'black'
    const oppositeColor = maxR > maxB ? 'black' : 'red'

    // ── v4.3: Post-Streak History Analysis (CORRECTED) ──
    // v4.2 BUG: calculated "fraction of streaks that broke at exactly length N" which
    // inflated breakPct to 84% at streak 3 (real data: 50.2%). This caused the anti-streak
    // to push opposite with massive force when the real data showed no edge.
    //
    // v4.3 FIX: For every window of `currentStreak` consecutive same-color results
    // in history, check what the NEXT spin was. This gives the TRUE conditional probability.
    const postStreakAnalysis = (): { breakPct: number; continuePct: number; avgStreakLen: number } => {
      if (nonZero.length < 10) return { breakPct: 50, continuePct: 50, avgStreakLen: 2.5 }

      const colorHistory = nonZero.map(n => getNumberColor(n)).filter((c): c is 'red' | 'black' => c !== 'green')

      // Calculate average streak length
      const allStreaks: number[] = []
      let sLen = 1
      for (let i = 1; i < colorHistory.length; i++) {
        if (colorHistory[i] === colorHistory[i - 1]) {
          sLen++
        } else {
          allStreaks.push(sLen)
          sLen = 1
        }
      }
      allStreaks.push(sLen)
      const avgStreakLen = allStreaks.length > 0
        ? allStreaks.reduce((a, b) => a + b, 0) / allStreaks.length
        : 2.5

      // v4.3 CORRECT calculation: scan every position where currentStreak consecutive
      // same-color results end, then check what the next spin brought.
      let breaks = 0
      let total = 0
      for (let i = currentStreak; i < colorHistory.length; i++) {
        const lastColor = colorHistory[i - 1]
        let allSame = true
        for (let j = 1; j < currentStreak; j++) {
          if (colorHistory[i - 1 - j] !== lastColor) {
            allSame = false
            break
          }
        }
        if (allSame) {
          total++
          if (colorHistory[i] !== lastColor) {
            breaks++
          }
        }
      }

      if (total >= 5) {
        const breakPct = (breaks / total) * 100
        return {
          breakPct: Math.round(breakPct),
          continuePct: Math.round(100 - breakPct),
          avgStreakLen
        }
      }

      return { breakPct: 50, continuePct: 50, avgStreakLen }
    }

    // ── ANTI-STREAK v4.3: Corrected data-driven 4-level response ──
    // Streak 2: SOFT — modules active but capped + nudge toward opposite
    // Streak 3: MEDIUM — Markov DISABLED, anti-streak only if breakPct >= 50%
    // Streak 4: STRONG — NEUTRAL when breakPct < 50% (real data: 47.5% at streak 4)
    // Streak 5+: ULTRA — NEUTRAL when breakPct < 50% (real data: 45.4% at streak 5)

    const postStreak = postStreakAnalysis()
    const avgBoost = currentStreak > postStreak.avgStreakLen
      ? (currentStreak - postStreak.avgStreakLen) * 10
      : 0

    const antiWheel = wheelDisplacement(getCat, cats)

    // v4.3: Threshold raised from 49% to 50% — only push opposite when REAL data supports it
    // With corrected breakPct, streak 3≈50%, streak 4≈47.5%, streak 5≈45.4%
    const computeAntiStreakForce = (streakLen: number): { force: number; shouldPushOpposite: boolean } => {
      const bp = postStreak.breakPct
      const shouldPushOpposite = bp >= 50
      // Force scales with streak length AND break probability
      const baseForce = streakLen <= 3 ? 35 : 45
      const lengthBonus = Math.max(0, streakLen - 3) * 10
      const probabilityBonus = bp >= 50 ? (bp - 50) * 1.0 : 0
      const force = baseForce + lengthBonus + probabilityBonus + avgBoost
      return { force, shouldPushOpposite }
    }

    // ── v4.3: Pre-streak multi-window frequency (contamination-free) ──
    // Use frequency data from BEFORE the streak started (not contaminated by streak)
    const preStreakFrequency = (streakLen: number): Record<string, number> => {
      const scores: Record<string, number> = { red: 0, black: 0 }
      const beforeStreak = nonZero.slice(0, -(streakLen))
      if (beforeStreak.length < 5) return scores

      const windows = [10, 20]
      const weights = [1.5, 2.5]
      windows.forEach((w, wi) => {
        const slice = beforeStreak.slice(-w)
        const sTotal = slice.length || 1
        const expected = 50 // for 2 categories
        cats.forEach(c => {
          const freq = slice.filter(n => getCat(n) === c).length
          let score = freq * weights[wi]
          const actual = (freq / sTotal) * 100
          score += (expected - actual) * weights[wi] * 0.5
          scores[c] += score
        })
      })
      return scores
    }

    if (currentStreak >= 5) {
      // ═══ v4.3 ULTRA ANTI-STREAK (streak >= 5) ═══
      // CRITICAL FIX: With corrected breakPct, streak 5+ typically shows 45-48% break rate.
      // v4.2 had 46.8% accuracy because it still nudged opposite even when data said don't.
      // v4.3: FULLY NEUTRAL when breakPct < 50% — no nudge at all.
      const { force, shouldPushOpposite } = computeAntiStreakForce(currentStreak)
      const scores: Record<string, number> = { red: 0, black: 0 }
      contributingModules = ['streak']

      if (shouldPushOpposite) {
        scores[oppositeColor] += force
        scores[streakColor] -= force * 0.3
      }
      // v4.3: NO default nudge when neutral — scores stay at 0, filled by pre-streak + wheel

      // v4.3: Wheel signal accepted in ANY direction (not just when matching anti-streak)
      if (antiWheel.signal && antiWheel.signal.targetNumber) {
        const wheelCat = getCat(antiWheel.signal.targetNumber)
        if (wheelCat && antiWheel.signal.reliability > 50) {
          const wheelBonus = Math.min(30, antiWheel.signal.reliability * 0.4)
          scores[wheelCat] += wheelBonus
          contributingModules.push('wheel')
        }
      }

      // v4.3: Pre-streak multi-window frequency (contamination-free)
      const preFreq = preStreakFrequency(currentStreak)
      if (Math.abs(preFreq.red) + Math.abs(preFreq.black) > 0) {
        cats.forEach(c => { scores[c] += preFreq[c] })
        contributingModules.push('freq')
      }

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      return {
        type: 'color',
        options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
        bestValue: sorted[0],
        bestConfidence: Math.round(confs[sorted[0]]),
        dealerSignal: antiWheel.signal || undefined
      }
    }

    if (currentStreak === 4) {
      // ═══ v4.3 STRONG ANTI-STREAK (streak = 4) ═══
      // CRITICAL FIX: Real data shows streak 4 breaks only 47.5% of the time!
      // v4.2 had a 15-point default nudge even when shouldPushOpposite was false.
      // v4.3: FULLY NEUTRAL when breakPct < 50% — rely on pre-streak data + wheel.
      const { force, shouldPushOpposite } = computeAntiStreakForce(4)
      const scores: Record<string, number> = { red: 0, black: 0 }
      contributingModules = ['streak']

      if (shouldPushOpposite) {
        scores[oppositeColor] += force
        scores[streakColor] -= force * 0.5
      }
      // v4.3: NO default 15-point nudge when neutral

      // v4.3: Wheel signal accepted in ANY direction
      if (antiWheel.signal && antiWheel.signal.targetNumber) {
        const wheelCat = getCat(antiWheel.signal.targetNumber)
        if (wheelCat && antiWheel.signal.reliability > 55) {
          const wheelBonus = Math.min(25, antiWheel.signal.reliability * 0.4)
          scores[wheelCat] += wheelBonus
          contributingModules.push('wheel')
        }
      }

      // v4.3: Pre-streak multi-window frequency (contamination-free)
      const preFreq = preStreakFrequency(4)
      if (Math.abs(preFreq.red) + Math.abs(preFreq.black) > 0) {
        cats.forEach(c => { scores[c] += preFreq[c] })
        contributingModules.push('freq')
      }

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      return {
        type: 'color',
        options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
        bestValue: sorted[0],
        bestConfidence: Math.round(confs[sorted[0]]),
        dealerSignal: antiWheel.signal || undefined
      }
    }

    if (currentStreak === 3) {
      // ═══ v4.3 MEDIUM ANTI-STREAK (streak = 3) ═══
      // v4.2 fix preserved: Markov-2/3/Momentum DISABLED (contaminated by streak).
      // v4.3 improvement: With corrected breakPct (~50%), force is now properly calibrated.
      const { force, shouldPushOpposite } = computeAntiStreakForce(3)
      const scores: Record<string, number> = { red: 0, black: 0 }
      contributingModules = ['streak']

      if (shouldPushOpposite) {
        scores[oppositeColor] += force
        scores[streakColor] -= force * 0.5
      }
      // v4.3: When neutral (breakPct < 50%), no anti-streak force applied

      // v4.3: Pre-streak multi-window frequency (contamination-free)
      const preFreq = preStreakFrequency(3)
      if (Math.abs(preFreq.red) + Math.abs(preFreq.black) > 0) {
        cats.forEach(c => { scores[c] += preFreq[c] })
        contributingModules.push('freq')
      }

      // v4.3: Wheel signal accepted in ANY direction
      if (antiWheel.signal && antiWheel.signal.targetNumber) {
        const wheelCat = getCat(antiWheel.signal.targetNumber)
        if (wheelCat && antiWheel.signal.reliability > 60) {
          const wheelBonus = Math.min(20, antiWheel.signal.reliability * 0.35)
          scores[wheelCat] += wheelBonus
          contributingModules.push('wheel')
        }
      }

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      return {
        type: 'color',
        options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
        bestValue: sorted[0],
        bestConfidence: Math.round(confs[sorted[0]]),
        dealerSignal: antiWheel.signal || undefined
      }
    }

    if (currentStreak === 2) {
      // ═══ v4.3 SOFT ANTI-STREAK (streak = 2) ═══
      // Modules active but MARKOV CLAMPED: Markov can push opposite but is
      // CAPPED when pushing toward streak color (prevents contamination)
      const markov = markovOrder2(getCat, cats)
      const markov3 = markovOrder3(getCat, cats)
      const saturation = saturationAnalysis(getCat, cats)
      const streak = streakAnalysis(getCat, cats, streaks)

      const scores: Record<string, number> = {}
      const baseScores: Record<string, number> = {}
      cats.forEach(c => { baseScores[c] = 0; scores[c] = 0 })
      contributingModules = []

      // Simple frequency: raw count of last 10 (NO deviation/mean-reversion)
      const last10 = nonZero.slice(-10)
      const freqs: Record<string, number> = { red: 0, black: 0 }
      last10.forEach(n => { const c = getCat(n); if (c) freqs[c]++ })
      cats.forEach(c => { scores[c] += freqs[c] * 1.5; baseScores[c] += freqs[c] * 1.5 })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'freq'))

      // Markov-2 — v4.2 CLAMPED: contribution toward streak color capped at max 8
      cats.forEach(c => {
        let contribution = markov[c] * getWeight('markov') * 0.15
        if (c === streakColor) contribution = Math.min(contribution, 8)  // HARD CAP
        scores[c] += contribution; baseScores[c] += contribution
      })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov'))

      // Markov-3 — v4.2 CLAMPED: contribution toward streak color capped at max 10
      const m3max2 = Math.max(...Object.values(markov3))
      if (m3max2 > 0) {
        cats.forEach(c => {
          let contribution = markov3[c] * getWeight('markov3') * 0.25
          if (c === streakColor) contribution = Math.min(contribution, 10)  // HARD CAP
          scores[c] += contribution
        })
        contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov3'))
      }

      // Streak — normal
      cats.forEach(c => { scores[c] += streak[c] * getWeight('streak') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'streak'))

      // Momentum — DISABLED during streak (contaminated)

      // Saturation
      const satMax = Math.max(...Object.values(saturation))
      if (satMax > 0) {
        cats.forEach(c => { scores[c] += saturation[c] * getWeight('saturation') })
        contributingModules.push(...trackContribution(scores, baseScores, cats, 'saturation'))
      }

      // Wheel only if agrees with opposite
      const aWheelMax = Math.max(...Object.values(antiWheel.scores))
      if (aWheelMax > 0) {
        cats.forEach(c => {
          if (c === oppositeColor) scores[c] += antiWheel.scores[c] * getWeight('wheel') * 1.3
          else scores[c] += antiWheel.scores[c] * getWeight('wheel') * 0.15
        })
        contributingModules.push('wheel')
      }

      // v4.2: Stronger anti-streak nudge
      scores[oppositeColor] += 30
      scores[streakColor] -= 18

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      return {
        type: 'color',
        options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
        bestValue: sorted[0],
        bestConfidence: Math.round(confs[sorted[0]]),
        dealerSignal: antiWheel.signal || undefined
      }
    }

    // ── NORMAL MODE (streak < 2): use full multi-module analysis ──
    const freq = multiWindowFreq(getCat, cats)
    const markov = markovOrder2(getCat, cats)
    const markov3 = markovOrder3(getCat, cats)
    const saturation = saturationAnalysis(getCat, cats)
    const wheel = wheelDisplacement(getCat, cats)

    const streak = streakAnalysis(getCat, cats, streaks)
    const momentum = momentumAnalysis(getCat, cats)

    // Build composite scores with adaptive weights
    const scores: Record<string, number> = {}
    const baseScores: Record<string, number> = {}
    cats.forEach(c => { baseScores[c] = 0; scores[c] = 0 })

    contributingModules = []

    // Layer 1: Frequency (reduced weight for colors to avoid mean-reversion dominance)
    cats.forEach(c => { scores[c] += freq[c] * getWeight('freq') * 0.5; baseScores[c] += freq[c] * getWeight('freq') * 0.5 })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'freq'))

    // Layer 2: Markov Order-2 (strongest pattern signal)
    cats.forEach(c => { scores[c] += markov[c] * getWeight('markov'); baseScores[c] += markov[c] * getWeight('markov') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov'))

    // Layer 3: Markov Order-3
    const m3max = Math.max(...Object.values(markov3))
    if (m3max > 0) {
      cats.forEach(c => { scores[c] += markov3[c] * getWeight('markov3') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov3'))
    }

    // Layer 4: Streak (soft reversion at streak=1)
    cats.forEach(c => { scores[c] += streak[c] * getWeight('streak') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'streak'))

    // Layer 5: Momentum
    if (momentum) {
      scores[momentum] += 15 * getWeight('momentum')
      contributingModules.push('momentum')
    }

    // Layer 6: Saturation
    const satMax = Math.max(...Object.values(saturation))
    if (satMax > 0) {
      cats.forEach(c => { scores[c] += saturation[c] * getWeight('saturation') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'saturation'))
    }

    // Layer 7: Wheel displacement
    const wheelMax = Math.max(...Object.values(wheel.scores))
    if (wheelMax > 0) {
      cats.forEach(c => { scores[c] += wheel.scores[c] * getWeight('wheel') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'wheel'))
    }

    const confs = toConfidence(scores, cats, 48.6)
    const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
    return {
      type: 'color',
      options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
      bestValue: sorted[0],
      bestConfidence: Math.round(confs[sorted[0]]),
      dealerSignal: wheel.signal || undefined
    }
  }

  // ═══════════════════════════════════════════
  // PARITY PREDICTION
  // ═══════════════════════════════════════════
  if (betType === 'parity') {
    const cats = ['odd', 'even']
    const getCat = (n: number) => n === 0 ? null : (n % 2 === 0 ? 'even' : 'odd')
    const freq = multiWindowFreq(getCat, cats)
    const markov = markovOrder2(getCat, cats)
    const markov3 = markovOrder3(getCat, cats)
    const saturation = saturationAnalysis(getCat, cats)
    const wheel = wheelDisplacement(getCat, cats)

    const streaks: Record<string, number> = {}
    let maxO = 0, maxE = 0
    nonZero.forEach(n => {
      if (n === 0) { maxO = 0; maxE = 0; return }
      if (n % 2 === 1) { maxO++; maxE = 0 } else { maxE++; maxO = 0 }
    })
    streaks.odd = maxO; streaks.even = maxE
    const streak = streakAnalysis(getCat, cats, streaks)
    const momentum = momentumAnalysis(getCat, cats)

    const scores: Record<string, number> = {}
    const baseScores: Record<string, number> = {}
    cats.forEach(c => { baseScores[c] = 0; scores[c] = 0 })
    contributingModules = []

    cats.forEach(c => { scores[c] += freq[c] * getWeight('freq'); baseScores[c] += freq[c] * getWeight('freq') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'freq'))

    cats.forEach(c => { scores[c] += markov[c] * getWeight('markov'); baseScores[c] += markov[c] * getWeight('markov') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov'))

    const m3max = Math.max(...Object.values(markov3))
    if (m3max > 0) {
      cats.forEach(c => { scores[c] += markov3[c] * getWeight('markov3') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov3'))
    }

    cats.forEach(c => { scores[c] += streak[c] * getWeight('streak') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'streak'))

    if (momentum) { scores[momentum] += 15 * getWeight('momentum'); contributingModules.push('momentum') }

    const satMax = Math.max(...Object.values(saturation))
    if (satMax > 0) {
      cats.forEach(c => { scores[c] += saturation[c] * getWeight('saturation') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'saturation'))
    }

    const wheelMax = Math.max(...Object.values(wheel.scores))
    if (wheelMax > 0) {
      cats.forEach(c => { scores[c] += wheel.scores[c] * getWeight('wheel') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'wheel'))
    }

    const confs = toConfidence(scores, cats, 48.6)
    const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
    return {
      type: 'parity',
      options: sorted.map(c => ({ value: c, label: c === 'odd' ? 'Impar' : 'Par', confidence: Math.round(confs[c]) })),
      bestValue: sorted[0],
      bestConfidence: Math.round(confs[sorted[0]]),
      dealerSignal: wheel.signal || undefined
    }
  }

  // ═══════════════════════════════════════════
  // DOZEN PREDICTION
  // ═══════════════════════════════════════════
  if (betType === 'dozen') {
    const cats = ['d1', 'd2', 'd3']
    const getCat = (n: number) => n === 0 ? null : (n <= 12 ? 'd1' : n <= 24 ? 'd2' : 'd3')
    const freq = multiWindowFreq(getCat, cats)
    const markov = markovOrder2(getCat, cats)
    const markov3 = markovOrder3(getCat, cats)
    const gap = gapAnalysis(getCat, cats)
    const sector = sectorAnalysis(getCat, cats)
    const hotcold = hotColdAnalysis(getCat, cats)
    const triplet = tripletAnalysis(getCat, cats)
    const wheel = wheelDisplacement(getCat, cats)

    const streaks: Record<string, number> = {}
    let maxD1 = 0, maxD2 = 0, maxD3 = 0
    nonZero.forEach(n => {
      if (n === 0) { maxD1 = 0; maxD2 = 0; maxD3 = 0; return }
      if (n <= 12) { maxD1++; maxD2 = 0; maxD3 = 0 }
      else if (n <= 24) { maxD2++; maxD1 = 0; maxD3 = 0 }
      else { maxD3++; maxD1 = 0; maxD2 = 0 }
    })
    streaks.d1 = maxD1; streaks.d2 = maxD2; streaks.d3 = maxD3
    const streak = streakAnalysis(getCat, cats, streaks)

    // Chi-square
    const d1Count = nonZero.filter(n => n <= 12).length
    const d2Count = nonZero.filter(n => n > 12 && n <= 24).length
    const d3Count = nonZero.filter(n => n > 24).length
    const expected = nzTotal / 3
    const chi = chiSquareTest([d1Count, d2Count, d3Count], expected)
    const chiScores: Record<string, number> = {}
    if (chi > 4.6) { // More sensitive threshold (was 5.99)
      const counts = [d1Count, d2Count, d3Count]
      cats.forEach((c, i) => {
        if (counts[i] < expected) chiScores[c] = ((expected - counts[i]) / expected) * 18 // Increased from 15
        else chiScores[c] = -((counts[i] - expected) / expected) * 12 // Increased from 10
      })
    } else { cats.forEach(c => chiScores[c] = 0) }

    // Z-score for each dozen
    const zScores: Record<string, number> = {}
    const zProb = 12 / 37
    const zStdDev = Math.sqrt(nzTotal * zProb * (1 - zProb))
    const dCounts = [d1Count, d2Count, d3Count]
    cats.forEach((c, i) => {
      zScores[c] = zStdDev > 0 ? (dCounts[i] - nzTotal * zProb) / zStdDev : 0
    })
    // Boost underrepresented dozens with strong z-score signal
    const zBonusScores: Record<string, number> = {}
    cats.forEach(c => {
      if (zScores[c] < -1.8) zBonusScores[c] = Math.min(20, Math.abs(zScores[c]) * 8) // New: -1.8 threshold
      else zBonusScores[c] = 0
    })

    const scores: Record<string, number> = {}
    const baseScores: Record<string, number> = {}
    cats.forEach(c => { baseScores[c] = 0; scores[c] = 0 })
    contributingModules = []

    const momentum = momentumAnalysis(getCat, cats)

    cats.forEach(c => { scores[c] += freq[c] * getWeight('freq'); baseScores[c] += freq[c] * getWeight('freq') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'freq'))

    cats.forEach(c => { scores[c] += markov[c] * getWeight('markov'); baseScores[c] += markov[c] * getWeight('markov') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov'))

    const m3max = Math.max(...Object.values(markov3))
    if (m3max > 0) {
      cats.forEach(c => { scores[c] += markov3[c] * getWeight('markov3') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov3'))
    }

    cats.forEach(c => { scores[c] += streak[c] * getWeight('streak') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'streak'))

    cats.forEach(c => { scores[c] += gap[c] * getWeight('gap') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'gap'))

    cats.forEach(c => { scores[c] += sector[c] * getWeight('sector') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'sector'))

    cats.forEach(c => { scores[c] += chiScores[c] * getWeight('chisq') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'chisq'))

    cats.forEach(c => { scores[c] += hotcold[c] * getWeight('hotcold') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'hotcold'))

    cats.forEach(c => { scores[c] += zBonusScores[c] * getWeight('chisq') }) // Use chi-sq weight for z-score

    const triMax = Math.max(...Object.values(triplet))
    if (triMax > 0) {
      cats.forEach(c => { scores[c] += triplet[c] * getWeight('triplet') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'triplet'))
    }

    const wheelMax = Math.max(...Object.values(wheel.scores))
    if (wheelMax > 0) {
      cats.forEach(c => { scores[c] += wheel.scores[c] * getWeight('wheel') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'wheel'))
    }

    if (momentum) { scores[momentum] += 10 * getWeight('momentum'); contributingModules.push('momentum') }

    const confs = toConfidence(scores, cats, 32.4) // 12/37 = 32.4%
    const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
    const labels: Record<string, string> = { d1: '1ra Docena (1-12)', d2: '2da Docena (13-24)', d3: '3ra Docena (25-36)' }
    const values: Record<string, string> = { d1: '1-12', d2: '13-24', d3: '25-36' }
    return {
      type: 'dozen',
      options: sorted.map(c => ({ value: values[c], label: labels[c], confidence: Math.round(confs[c]) })),
      bestValue: values[sorted[0]],
      bestConfidence: Math.round(confs[sorted[0]]),
      dealerSignal: wheel.signal || undefined
    }
  }

  // ═══════════════════════════════════════════
  // COLUMN PREDICTION
  // ═══════════════════════════════════════════
  if (betType === 'column') {
    const cats = ['c1', 'c2', 'c3']
    const getCat = (n: number) => {
      if (n === 0) return null
      const col = n % 3 === 0 ? 3 : n % 3
      return `c${col}`
    }
    const freq = multiWindowFreq(getCat, cats)
    const markov = markovOrder2(getCat, cats)
    const markov3 = markovOrder3(getCat, cats)
    const gap = gapAnalysis(getCat, cats)
    const sector = sectorAnalysis(getCat, cats)
    const hotcold = hotColdAnalysis(getCat, cats)
    const triplet = tripletAnalysis(getCat, cats)
    const wheel = wheelDisplacement(getCat, cats)

    const streaks: Record<string, number> = {}
    let maxC1 = 0, maxC2 = 0, maxC3 = 0
    nonZero.forEach(n => {
      if (n === 0) { maxC1 = 0; maxC2 = 0; maxC3 = 0; return }
      const col = n % 3 === 0 ? 3 : n % 3
      if (col === 1) { maxC1++; maxC2 = 0; maxC3 = 0 }
      else if (col === 2) { maxC2++; maxC1 = 0; maxC3 = 0 }
      else { maxC3++; maxC1 = 0; maxC2 = 0 }
    })
    streaks.c1 = maxC1; streaks.c2 = maxC2; streaks.c3 = maxC3
    const streak = streakAnalysis(getCat, cats, streaks)

    const c1Count = nonZero.filter(n => n !== 0 && n % 3 === 1).length
    const c2Count = nonZero.filter(n => n !== 0 && n % 3 === 2).length
    const c3Count = nonZero.filter(n => n !== 0 && n % 3 === 0).length
    const expected = nzTotal / 3
    const chi = chiSquareTest([c1Count, c2Count, c3Count], expected)
    const chiScores: Record<string, number> = {}
    if (chi > 4.6) {
      const counts = [c1Count, c2Count, c3Count]
      cats.forEach((c, i) => {
        if (counts[i] < expected) chiScores[c] = ((expected - counts[i]) / expected) * 18
        else chiScores[c] = -((counts[i] - expected) / expected) * 12
      })
    } else { cats.forEach(c => chiScores[c] = 0) }

    const zScores: Record<string, number> = {}
    const zProb = 12 / 37
    const zStdDev = Math.sqrt(nzTotal * zProb * (1 - zProb))
    const colCounts = [c1Count, c2Count, c3Count]
    cats.forEach((c, i) => {
      zScores[c] = zStdDev > 0 ? (colCounts[i] - nzTotal * zProb) / zStdDev : 0
    })
    const zBonusScores: Record<string, number> = {}
    cats.forEach(c => {
      if (zScores[c] < -1.8) zBonusScores[c] = Math.min(20, Math.abs(zScores[c]) * 8)
      else zBonusScores[c] = 0
    })

    const scores: Record<string, number> = {}
    const baseScores: Record<string, number> = {}
    cats.forEach(c => { baseScores[c] = 0; scores[c] = 0 })
    contributingModules = []

    const momentum = momentumAnalysis(getCat, cats)

    cats.forEach(c => { scores[c] += freq[c] * getWeight('freq'); baseScores[c] += freq[c] * getWeight('freq') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'freq'))

    cats.forEach(c => { scores[c] += markov[c] * getWeight('markov'); baseScores[c] += markov[c] * getWeight('markov') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov'))

    const m3max = Math.max(...Object.values(markov3))
    if (m3max > 0) {
      cats.forEach(c => { scores[c] += markov3[c] * getWeight('markov3') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov3'))
    }

    cats.forEach(c => { scores[c] += streak[c] * getWeight('streak') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'streak'))

    cats.forEach(c => { scores[c] += gap[c] * getWeight('gap') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'gap'))

    cats.forEach(c => { scores[c] += sector[c] * getWeight('sector') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'sector'))

    cats.forEach(c => { scores[c] += chiScores[c] * getWeight('chisq') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'chisq'))

    cats.forEach(c => { scores[c] += hotcold[c] * getWeight('hotcold') })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'hotcold'))

    cats.forEach(c => { scores[c] += zBonusScores[c] * getWeight('chisq') })

    const triMax = Math.max(...Object.values(triplet))
    if (triMax > 0) {
      cats.forEach(c => { scores[c] += triplet[c] * getWeight('triplet') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'triplet'))
    }

    const wheelMax = Math.max(...Object.values(wheel.scores))
    if (wheelMax > 0) {
      cats.forEach(c => { scores[c] += wheel.scores[c] * getWeight('wheel') })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'wheel'))
    }

    if (momentum) { scores[momentum] += 10 * getWeight('momentum'); contributingModules.push('momentum') }

    const confs = toConfidence(scores, cats, 32.4)
    const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
    const labels: Record<string, string> = { c1: 'Col 1', c2: 'Col 2', c3: 'Col 3' }
    const values: Record<string, string> = { c1: '1', c2: '2', c3: '3' }
    return {
      type: 'column',
      options: sorted.map(c => ({ value: values[c], label: labels[c], confidence: Math.round(confs[c]) })),
      bestValue: values[sorted[0]],
      bestConfidence: Math.round(confs[sorted[0]]),
      dealerSignal: wheel.signal || undefined
    }
  }

  return { type: betType, options: [], bestValue: '', bestConfidence: 50 }
}
