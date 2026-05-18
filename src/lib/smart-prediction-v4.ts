/**
 * Smart Prediction Engine v6.0 — Ultra-Selective + Streak-Aware Filtering
 * 
 * HISTORIAL DE CORRECCIONES:
 *
 * v4.5 BUG: Activaba anti-racha a streak 3-4, empujando opuesto con 44-64 pts.
 * v4.6 FIX (parcial): Eliminados MEDIUM/STRONG, unificado streaks 2-4 en SOFT.
 * v4.7 FIX: Eliminado saturation en SOFT, cap Markov-3, corregido rango SOFT.
 * v4.8 FIX: Streak 5 movido a SOFT, ULTRA arranca a streak 6.
 *
 * v4.9 FIX: Streak-Context Dampening (push mismo color en streaks 3-5)
 *
 * v5.0 — Corrección de Picos Medios (Pico: 4-6):
 *   PROBLEMA v4.9: El dampening empujaba MISMO COLOR en rachas 3-5, pero los
 *   datos validados (3,920 spins reales) demuestran que en rachas 3-5,
 *   el OPUESTO es más probable:
 *     Streak 3: 51.8% rompen → OPUESTO tiene 1.8% edge
 *     Streak 4: 51.4% rompen → OPUESTO tiene 1.4% edge
 *     Streak 5: 54.9% rompen → OPUESTO tiene 4.9% edge (MEJOR EDGE!)
 *
 *   v4.9 empujaba mismo color en streaks 3-5, prediciendo la dirección
 *   MENOS probable. Esto causaba picos de 4-5 errores consecutivos.
 *
 *   v5.1 FIX — NORMAL Mode Overhaul:
 *   PROBLEMA: NORMAL mode (streak 0-1) tenía 49.6% accuracy en 2,215 predicciones.
 *   Era prácticamente random. El 50% de todas las jugadas caen en este modo.
 *   Causas: streakAnalysis empujaba opuesto a streak=1, saturation empujaba
 *   opuesto con 50+ pts, frequency raw count era ruido. Simulación en 4,551
 *   números mostró que 82% de picos >=7 empezaban con error en NORMAL.
 *
 *   v5.1 FIX — Markov-Primary NORMAL:
 *   1. ELIMINADO streakAnalysis, saturation, frequency raw count en NORMAL
 *   2. Recency Markov (últimos 300 spins) como señal primaria
 *   3. Markov-3 (últimos 300 spins) como señal secundaria
 *   4. Wheel alineado con Markov (solo aceptar si coinciden)
 *   5. Last-5 pattern: si los últimos 5 tienen patrón claro, seguirlo
 *
 * v5.2 — Corrección de Rachas Malas (Pico: hasta 15!)
 *   PROBLEMA v5.1: Simulación en 4,619 spins reales mostró:
 *     - Streak 3: 46.2% accuracy (SOFT nudge hacia opuesto falla)
 *     - Streak 5: 45.8% accuracy (EL PEOR — nudge opuesto contraproducente)
 *     - Pico máximo: 15 errores consecutivos
 *     - Patrones alternantes R-N-R-N no detectados
 *   CAUSA RAÍZ: Break-probabilities HARDCODEADAS (datos viejos de 3,920 spins)
 *   no reflejan las tendencias de la sesión actual. En el dataset nuevo,
 *   las rachas 3-5 TIENDEN A CONTINUAR, no a romper.
 *
 *   v5.2 FIX — 3 cambios principales:
 *   1. ADAPTIVE BREAK-PROBABILITY: Calcula probabilidades de ruptura en
 *      tiempo real desde los datos actuales (últimos 300 spins) en vez de
 *      valores hardcoded. Si la sesión actual muestra que las rachas
 *      continúan, el nudge va en esa dirección.
 *   2. ALTERNATING PATTERN DETECTOR (todos los modos): Detecta patrones
 *      R-N-R-N o N-R-N-R en los últimos 4-6 resultados. Si detecta
 *      alternación, predice el opuesto del último. Resuelve varios de
 *      los peores picos que mostraban alternación.
 *   3. SHORT-TERM REGENCY (modo NORMAL): Analiza los últimos 5 resultados
 *      y si están sesgados hacia un color (4+ de 5), da un pequeño boost.
 *      Detecta rachas emergentes antes de que SOFT mode active.
 *
 *   ⚠️ v5.2 BUG CRÍTICO: Las 3 funciones (computeAdaptiveBreakProb,
 *      detectAlternatingPattern, shouldRecoveryFlip) estaban DEFINIDAS
 *      pero NUNCA CONECTADAS al flujo de predicción. Simulación en 4,781
 *      spins mostró que v5.2 se comportaba idéntico a v5.1.
 *
 * v5.3 — Wiring Fix + Enhanced Recovery:
 *   PROBLEMA v5.2: 3 funciones definidas pero nunca llamadas:
 *     1. computeAdaptiveBreakProb → nunca usada en SOFT mode
 *     2. detectAlternatingPattern → nunca usada en ningún modo
 *     3. shouldRecoveryFlip → nunca usada en ningún modo
 *   RESULTADO: Pico máximo 15, ratio 8.12:1, streak 3 a 45.0%
 *
 *   v5.3 FIX:
 *   1. CONECTADO computeAdaptiveBreakProb en SOFT mode:
 *      - Streak 3-5: Usa adaptive break-prob de últimos 300 spins
 *      - Si la sesión muestra que rachas continúan, nudge va MISMO COLOR
 *      - Si la sesión muestra que rachas rompen, nudge va OPUESTO
 *      - Fallback a hardcoded SOLO si no hay suficientes datos
 *   2. CONECTADO detectAlternatingPattern en TODOS los modos:
 *      - Detecta R-N-R-N o N-R-N-R en últimos 4-6 resultados
 *      - Aplica override FUERTE (30 pts) cuando se detecta
 *      - Resuelve picos de 9-15 causados por alternación
 *   3. CONECTADO shouldRecoveryFlip como LAST RESORT:
 *      - Después de calcular predicción normal, verificar si recovery flip
 *      - Solo flip si engine repite MISMO color erróneo 2+ veces seguidas
 *      - Previene rachas de 5-15 errores del mismo color
 *   4. MEJORADO Recovery: Trigger a 2 errores consecutivos (no 3)
 *      - Más agresivo para cortar rachas malas temprano
 *      - Máximo 3 flips consecutivos para evitar flip loops
 *
 * LÓGICA v5.3:
 *   Streak 0-1:  NORMAL — Markov + Alternation + Recency + Recovery
 *   Streak 2-5:  SOFT   — Markov + Adaptive Break-Prob + Alternation + Recovery
 *   Streak 6+:   ULTRA  — Push MISMO COLOR + Alternation (reducido) + Recovery
 *
 * v5.4 — Selective Prediction + Aggressive Recovery:
 *   PROBLEMA v5.3: 49.6% accuracy = random. Martingala pierde -4,141 unidades.
 *   Rachas ≥4 son estadísticamente inevitables al ~50% accuracy.
 *   157 rachas fatales generan 336 busts × -7 = -2,352 unidades.
 *
 *   v5.4 FILOSOFÍA: No predecir TODOS los spins. Solo predecir cuando hay
 *   señal FUERTE. Los spins inciertos se SKIPEAN (no se apuesta).
 *   Esto sacrifica ~25-35% de predicciones pero las restantes tienen
 *   mayor accuracy porque solo se activa con señales claras.
 *
 *   v5.4 CAMBIOS:
 *   1. MICRO-MARKOV (50 spins): Señal primaria con ventana corta.
 *      Patrones recientes son más relevantes que histórico global.
 *      Markov-300 se mantiene como secundaria con peso reducido.
 *   2. SKIP THRESHOLD: Si la diferencia de scores entre colores es
 *      < SKIP_THRESHOLD, retorna shouldSkip=true. El simulador
 *      NO avanza martingala en skips. Esto rompe cadenas de pérdidas.
 *   3. RECOVERY A 2 ERRORES: Trigger recovery después de 2 errores
 *      consecutivos (no 3). Cada error que se previene del 3er spin
 *      ahorra las 7 unidades del bust martingala.
 *   4. ALTERNATION en TODOS los modos: Como tiebreaker cuando
 *      micro-Markov no tiene señal clara (scores < 55%).
 *   5. MAX_CONSECUTIVE_FLIPS = 3 (de 2): Permitir más recovery flips
 *      para manejar rachas más largas.
 *
 * LÓGICA v5.4:
 *   Streak 0-1:  NORMAL — Micro-Markov(50) + Markov(300) + Recency + Recovery + SKIP
 *   Streak 2-5:  SOFT   — Micro-Markov(50) + Markov(300) + Break-Prob + Recovery + SKIP
 *   Streak 6+:   ULTRA  — Push MISMO COLOR + Micro-Markov + Recovery + SKIP
 *
 * v6.0 — Ultra-Selective + Streak-Aware Filtering:
 *   PROBLEMA v5.5: Ratio 9.65:1 ✅ pero neto -758 unidades ❌.
 *   31 rachas fatales ≥4, max streak 9, 18 busts.
 *   SOFT mode (streak 2-5) tiene 49.6% accuracy = RANDOM.
 *   Streak 3: 36.5% accuracy, Streak 5: 30.0% — PEOR que random!
 *   El motor apuesta en situaciones sin edge, perdiendo unidades.
 *
 *   v6.0 FILOSOFÍA: NO apostar cuando NO hay edge demostrado.
 *   Calidad sobre cantidad. Mejor perder oportunidades que unidades.
 *
 *   v6.0 CAMBIOS:
 *   1. SOFT SKIP ZONE (streaks 3-5): Datos demuestran que NO hay edge.
 *      Streak 3: 36.5% accuracy, Streak 5: 30.0% — activamente dañino.
 *      → SKIP TOTAL en streaks 3-5. Solo apostar streak 2 (54.4%).
 *   2. ULTRA FILTER: Streak 6 tiene ~48.5% break = sin edge real.
 *      → SKIP streak 6. Solo apostar streak 7+ (edge demostrado 51-55%).
 *   3. NORMAL STRICT: Threshold 28→38. Solo apostar señales FUERTES.
 *      Requerir consensus agreement >= 2 para no skipear.
 *   4. ALTERNATION STRICT: Solo activar con strength >= 60 (de 40-50).
 *      Reduce falsos positivos de alternación.
 *   5. MIN BET SIGNAL: Señal mínima para apostar (score diff) más alta.
 *
 * LÓGICA v6.0:
 *   Streak 0-1:  NORMAL — Consensus(3w) + Markov + SKIP(strength<38 or consensus<2)
 *   Streak 2:    SOFT   — Markov + Consensus + SKIP(strength<30 or consensus<2)
 *   Streak 3-5:  SKIP   — No hay edge demostrado → SKIP TOTAL
 *   Streak 6:    SKIP   — Sin edge suficiente → SKIP
 *   Streak 7+:   ULTRA  — Push MISMO COLOR + Alternation (solo strength≥60)
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
  shouldSkip?: boolean // v5.4: true when signal is too weak to bet
  signalStrength?: number // v5.4: raw score difference (debug)
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

// ═══ v5.2 NEW: RECOVERY BAILOUT STATE ═══
// Tracks recent predictions and their correctness.
// When the engine makes 2+ consecutive wrong predictions of the SAME color,
// the next prediction is FLIPPED to break the bad streak.
interface RecoveryEntry {
  predicted: string
  correct: boolean
}

const recoveryHistory: RecoveryEntry[] = []
const MAX_RECOVERY_HISTORY = 6

/** Update recovery state with the result of the last prediction */
export function recordPredictionFeedback(correct: boolean, contributingModules: ModuleName[], predictedValue?: string) {
  // Update recovery history
  if (predictedValue) {
    recoveryHistory.push({ predicted: predictedValue, correct })
    if (recoveryHistory.length > MAX_RECOVERY_HISTORY) {
      recoveryHistory.shift()
    }
    // v5.3: Reset consecutive flip counter on correct prediction
    if (correct) {
      consecutiveFlips = 0
    }
  }

  // Update module accuracy (original logic)
  for (const mod of contributingModules) {
    if (!accuracyTracker[mod]) {
      accuracyTracker[mod] = { hits: 0, attempts: 0, weight: DEFAULT_WEIGHTS[mod] }
    }
    accuracyTracker[mod].attempts++
    if (correct) accuracyTracker[mod].hits++
    const acc = accuracyTracker[mod]
    const hitRate = acc.attempts > 5 ? acc.hits / acc.attempts : 0.5
    const baseWeight = DEFAULT_WEIGHTS[mod]
    acc.weight = baseWeight * Math.max(0.3, Math.min(2.0, hitRate * 2))
  }
}

/** Count consecutive recovery flips to avoid flip loops */
let consecutiveFlips = 0
const MAX_CONSECUTIVE_FLIPS = 3 // v5.4: increased from 2 to allow more recovery

/** Get the opposite color for recovery flip */
function getOppositeColor(color: string): string {
  return color === 'red' ? 'black' : 'red'
}

/** Count consecutive wrong predictions from recovery history */
function getConsecutiveWrong(): RecoveryEntry[] {
  const recentWrong: RecoveryEntry[] = []
  for (let i = recoveryHistory.length - 1; i >= 0; i--) {
    if (!recoveryHistory[i].correct) {
      recentWrong.unshift(recoveryHistory[i])
    } else {
      break
    }
  }
  return recentWrong
}

/**
 * v5.5 RECOVERY — DISABLED (was actively harmful: 41.8% accuracy)
 * 
 * v5.3/v5.4 recovery had 3 strategies, but testing on 4,781 spins showed:
 *   - Total flips: 304
 *   - Correct: 127 (41.8%)
 *   - Incorrect: 170 (55.9%)
 * 
 * The recovery system was WORSE than random (50%), actively hurting accuracy.
 * Every flip that's wrong EXTENDS the loss streak instead of cutting it.
 * 
 * v5.5: Recovery is DISABLED. The engine relies on its core prediction
 * signals + skip mechanism + alternation detection instead.
 */
function getRecoveryPrediction(currentPrediction: string): string | null {
  // v5.5: DISABLED — recovery was counterproductive
  return null
}

/** Reset recovery history (call when bet type changes or session resets) */
export function resetRecoveryHistory() {
  recoveryHistory.length = 0
}

/** Full engine reset — clears ALL adaptive state for deterministic backtesting */
export function resetFullEngine() {
  recoveryHistory.length = 0
  consecutiveFlips = 0
  for (const key of Object.keys(DEFAULT_WEIGHTS) as ModuleName[]) {
    accuracyTracker[key] = { hits: 0, attempts: 0, weight: DEFAULT_WEIGHTS[key] }
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

// ═══ v5.5: ADAPTIVE SKIP THRESHOLD ═══
// v5.4 used fixed 15.0. v5.5 uses context-aware thresholds:
//   NORMAL: Higher threshold (more selective) — this is where most predictions happen
//   SOFT:   Medium threshold — streak context provides some signal
//   ULTRA:  No skip — ULTRA's streak-based push is already a strong signal
const SKIP_THRESHOLD_NORMAL = 38.0  // v6.0: 28→38 — mucho más selectivo
const SKIP_THRESHOLD_SOFT = 30.0     // v6.0: 24→30 — solo streak 2
const SKIP_THRESHOLD = 15.0  // Fallback for parity/dozen

/** v5.5: CONSENSUS MARKOV — multi-window Markov with agreement scoring
 *  Builds Markov-2 at multiple window sizes and checks if they AGREE.
 *  Returns { scores, consensus, agreement } where:
 *    consensus: the color that most windows agree on (or null if tied)
 *    agreement: 0-3, how many windows agree on the consensus color
 *    scores: combined scores from all windows
 *  The key insight: if 3 independent windows all say RED, that's a much
 *  stronger signal than 1 window saying RED with slightly higher confidence.
 */
function buildConsensusMarkov(
  data: number[],
  getCat: (n: number) => string | null
): { scores: Record<string, number>; consensus: string | null; agreement: number; windowResults: Array<{ window: number; color: string; pct: number }> } {
  const windows = [20, 50, 100]
  const windowResults: Array<{ window: number; color: string; pct: number }> = []
  const scores: Record<string, number> = { red: 0, black: 0 }

  for (const windowSize of windows) {
    const slice = data.length > windowSize ? data.slice(-windowSize) : data
    const trans: Record<string, Record<string, Record<string, number>>> = {}
    for (let i = 2; i < slice.length; i++) {
      const c0 = getCat(slice[i - 2]); const c1 = getCat(slice[i - 1]); const c2 = getCat(slice[i])
      if (c0 && c1 && c2) {
        if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
        trans[c0][c1][c2] = (trans[c0][c1][c2] || 0) + 1
      }
    }
    if (slice.length >= 2) {
      const c0 = getCat(slice[slice.length - 2]); const c1 = getCat(slice[slice.length - 1])
      if (c0 && c1 && trans[c0] && trans[c0][c1]) {
        const tr = trans[c0][c1]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
        if (total > 0) {
          const redPct = ((tr['red'] || 0) / total) * 100
          const blackPct = ((tr['black'] || 0) / total) * 100
          const leader = redPct > blackPct ? 'red' : 'black'
          const leaderPct = Math.max(redPct, blackPct)
          windowResults.push({ window: windowSize, color: leader, pct: leaderPct })
          // Amplified scoring for consensus
          const amplification = 1.0 + (leaderPct - 50) * 0.02  // Higher pct = more amplification
          scores[leader] += leaderPct * amplification
        }
      }
    }
  }

  // Count agreement
  const redVotes = windowResults.filter(r => r.color === 'red').length
  const blackVotes = windowResults.filter(r => r.color === 'black').length
  let consensus: string | null = null
  let agreement = 0
  if (redVotes > blackVotes) { consensus = 'red'; agreement = redVotes }
  else if (blackVotes > redVotes) { consensus = 'black'; agreement = blackVotes }
  // If tied, no consensus

  return { scores, consensus, agreement, windowResults }
}

/** v5.4: Build micro-Markov from short window with amplification */
function buildMicroMarkov(
  data: number[],
  getCat: (n: number) => string | null,
  windowSize: number
): Record<string, number> {
  const micro = data.length > windowSize ? data.slice(-windowSize) : data
  const trans: Record<string, Record<string, Record<string, number>>> = {}
  for (let i = 2; i < micro.length; i++) {
    const c0 = getCat(micro[i - 2]); const c1 = getCat(micro[i - 1]); const c2 = getCat(micro[i])
    if (c0 && c1 && c2) {
      if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
      trans[c0][c1][c2] = (trans[c0][c1][c2] || 0) + 1
    }
  }
  const scores: Record<string, number> = { red: 0, black: 0 }
  if (micro.length >= 2) {
    const c0 = getCat(micro[micro.length - 2]); const c1 = getCat(micro[micro.length - 1])
    if (c0 && c1 && trans[c0] && trans[c0][c1]) {
      const tr = trans[c0][c1]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
      if (total > 0) {
        for (const c of ['red', 'black'] as const) {
          const pct = ((tr[c] || 0) / total) * 100
          scores[c] = pct > 50 ? pct + (pct - 50) * 0.5 : pct - (50 - pct) * 0.5
        }
      }
    }
  }
  return scores
}

/** v5.4: Check if should skip based on score difference */
function shouldSkipPrediction(scores: Record<string, number>, cats: string[]): { skip: boolean; strength: number } {
  const values = cats.map(c => scores[c])
  const maxScore = Math.max(...values)
  const minScore = Math.min(...values)
  const strength = maxScore - minScore
  return { skip: strength < SKIP_THRESHOLD, strength }
}

// ── v5.2 NEW: Compute Adaptive Break Probability ──
// Counts how many times, in the recent history, a streak of `targetStreak` length
// broke vs continued. Returns null if not enough data (less than 6 observations).
function computeAdaptiveBreakProb(
  history: number[],
  targetStreak: number,
  getCat: (n: number) => string | null
): number | null {
  let breaks = 0
  let continues = 0
  let streakLen = 0
  let streakColor: string | null = null

  for (let i = 0; i < history.length; i++) {
    const c = getCat(history[i])
    if (c === null) {
      // Green resets streak
      streakLen = 0
      streakColor = null
      continue
    }

    if (streakColor === null) {
      streakColor = c
      streakLen = 1
    } else if (c === streakColor) {
      streakLen++
      // When we reach the target streak length, check the NEXT spin
      if (streakLen === targetStreak && i + 1 < history.length) {
        const next = getCat(history[i + 1])
        if (next !== null) {
          if (next === streakColor) continues++
          else breaks++
        }
      }
    } else {
      streakColor = c
      streakLen = 1
    }
  }

  const total = breaks + continues
  if (total < 6) return null  // Not enough observations
  return (breaks / total) * 100
}

// ── v5.2 NEW: Detect Alternating Pattern ──
// Checks if the last 4-6 non-green results form an alternating pattern (R-N-R-N...).
// Returns { detected: true, lastColor: 'red'|'black' } if alternating, or { detected: false }.
function detectAlternatingPattern(
  history: number[],
  getCat: (n: number) => string | null
): { detected: boolean; lastColor?: string; strength: number } {
  const recent = history.slice(-8).map(n => getCat(n)).filter((c): c is string => c !== null)
  if (recent.length < 3) return { detected: false, strength: 0 }

  const last = recent[recent.length - 1]

  // v5.5: Count transitions (color changes) and compute strength
  let transitions = 0
  for (let i = 1; i < recent.length; i++) {
    if (recent[i] !== recent[i - 1]) transitions++
  }
  const maxTransitions = recent.length - 1
  const transitionRate = maxTransitions > 0 ? transitions / maxTransitions : 0
  // Strength: 100% transitions = perfect alternation, 50% = random
  const strength = Math.round(Math.max(0, (transitionRate - 0.5) * 200))  // 0-100 scale

  // v6.0: Only detect strict alternation (4+ results) — no false positives from 3-result noise
  // Removed the weak 3-result detection that was triggering on random noise

  // Original: strict alternation in 4+ results
  if (recent.length >= 4) {
    let strictAlt = true
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] === recent[i - 1]) { strictAlt = false; break }
    }
    if (strictAlt) return { detected: true, lastColor: last, strength: Math.max(strength, 70) }
  }

  // v6.0: Partial alternation — 80%+ of last 6+ are alternating (stricter)
  if (recent.length >= 6 && strength >= 60) {
    return { detected: true, lastColor: last, strength }
  }

  return { detected: false, strength }
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

    const TRIPLET_SEARCH_WINDOW = Math.min(9, nonZero.length)
    const cats_history = nonZero.slice(-TRIPLET_SEARCH_WINDOW).map(n => getCat(n)).filter(Boolean)
    if (cats_history.length < 6) return scores

    // Look at last 3 results as current triplet
    const last3 = cats_history.slice(-3)
    const pattern = last3.join(',')

    // Search for this pattern earlier in the full history
    for (let i = 0; i <= cats_history.length - 4; i++) {
      const tri = cats_history.slice(i, i + 3).join(',')
      if (tri === pattern) {
        // Found the same pattern before → see what came next
        const nextCat = cats_history[i + 3]
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

    // ── v4.5: Hardcoded Break Probabilities (VALIDATED against 3,920 real spins) ──
    // These are the probabilities from the ENGINE'S perspective:
    // "When the engine observes N consecutive same-color at the end of history,
    // what % of the time does the NEXT spin break the streak?"
    //
    // IMPORTANT: These differ from "what fraction of streaks of exactly N break?"
    // due to the inspection paradox — observing at a random point within a streak
    // gives different statistics than observing at the end.
    //
    // Validation results (engine perspective, 3,920 spins):
    // Streak 2: 1,920 cases, 49.7% break  → NEUTRAL (~50/50)
    // Streak 3:   964 cases, 51.8% break  → OPPOSITE (slight edge)
    // Streak 4:   465 cases, 51.4% break  → OPPOSITE (slight edge)
    // Streak 5:   226 cases, 54.9% break  → OPPOSITE (best edge!)
    // Streak 6:   103 cases, 48.5% break  → SAME COLOR (racha continúa)
    // Streak 7:    53 cases, 45.3% break  → SAME COLOR
    // Streak 8:    29 cases, 44.8% break  → SAME COLOR
    // Streak 9+:   16 cases, 37.5% break  → SAME COLOR (strong)
    const BREAK_PROBS: Record<number, number> = {
      2: 49.7,  // After 2 same → basically 50/50, no edge
      3: 51.8,  // After 3 same → slight edge for opposite
      4: 51.4,  // After 4 same → slight edge for opposite
      5: 54.9,  // After 5 same → BEST edge for opposite (54.9%!)
      6: 48.5,  // After 6 same → edge for CONTINUING (51.5%)
      7: 45.3,  // After 7 same → good edge for continuing
      8: 44.8,  // After 8 same → good edge for continuing
    }

    const getBreakProb = (streakLen: number): number => {
      if (streakLen >= 9) return 37.5  // Streaks 9+: very likely to continue
      return BREAK_PROBS[streakLen] ?? 50.0
    }

    const getStreakAnalysis = (): { breakPct: number; continuePct: number; avgStreakLen: number } => {
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
        : 2.0

      const bp = getBreakProb(currentStreak)
      return {
        breakPct: bp,
        continuePct: 100 - bp,
        avgStreakLen
      }
    }

    // ── ANTI-STREAK v4.7: Hardcoded-probability response ──
    // Streak 2-4 (SOFT): SIN anti-racha. Markov decide libremente.
    // Streak 5 (ULTRA): 54.9% break → push opposite MODERADO (ventaja real 4.9%)
    // Streak 6 (ULTRA): 48.5% break → ~50/50 (sin ventaja real)
    // Streak 7+ (ULTRA): <48% break → push MISMO COLOR (racha continúa)

    const postStreak = getStreakAnalysis()

    const antiWheel = wheelDisplacement(getCat, cats)

    // v4.7: Force calculation — FUERZA PROPORCIONAL a la ventaja real
    // v4.5 tenía fuerzas exageradas (85+ puntos) para una ventaja de 4.9%
    // v4.7: Fuerza moderada, proporcional al edge real
    const computeAntiStreakForce = (streakLen: number): { force: number; pushOpposite: boolean; pushSame: boolean } => {
      const bp = getBreakProb(streakLen)
      const pushOpposite = bp >= 50  // Data says more likely to break
      const pushSame = bp < 50       // Data says more likely to continue!

      if (pushOpposite) {
        // v4.7: Fuerza proporcional al edge real, NO exagerada
        const edge = bp - 50  // e.g., 54.9 - 50 = 4.9
        const baseForce = 20  // v4.7: reducido de 30
        const edgeBonus = edge * 6  // v4.7: reducido de 8 (4.9*6=29.4 vs 4.9*8=39.2)
        const lengthBonus = Math.min(10, Math.max(0, streakLen - 3) * 5) // v4.7: reducido
        const force = baseForce + edgeBonus + lengthBonus
        // Streak 5: 20 + 29.4 + 10 = ~59 (vs 85+ en v4.5)
        return { force, pushOpposite: true, pushSame: false }
      } else {
        // Streak continúa: push MISMO COLOR
        const edge = 50 - bp  // e.g., 50 - 45.3 = 4.7
        const baseForce = 18  // v4.7: ligeramente reducido
        const edgeBonus = edge * 5
        const lengthBonus = Math.min(12, (streakLen - 5) * 4)
        const force = baseForce + edgeBonus + lengthBonus
        return { force, pushOpposite: false, pushSame: true }
      }
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

    // ═══ v6.0: STREAK-AWARE FILTERING ═══
    // Skip streaks where data shows NO predictive edge
    if (currentStreak >= 3 && currentStreak <= 6) {
      // v6.0: SKIP ZONE — streaks 3-6 have no demonstrated edge
      // Streak 3: 36.5% accuracy, Streak 4: 58.6% (but tiny sample=58), Streak 5: 30.0%
      // Streak 6: 53.8% but only 65 samples — marginal
      // → Skip ALL to protect capital
      return {
        type: 'color',
        options: cats.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: 50 })),
        bestValue: streakColor,  // Return the current streak color as "prediction" (irrelevant since skipped)
        bestConfidence: 50,
        dealerSignal: antiWheel.signal || undefined,
        shouldSkip: true,
        signalStrength: 0
      }
    }

    if (currentStreak >= 7) {
      // ═══ v6.0 ULTRA (streak >= 7) — PUSH MISMO COLOR (ONLY streak 7+) ═══
      // v6.0: Removed streak 6 from ULTRA — data shows insufficient edge
      // Only streak 7+ has demonstrated continuation edge (51-55%)
      const bp = getBreakProb(currentStreak)
      const continuePct = 100 - bp
      const edge = continuePct - 50  // How much > 50% the continue probability is
      const baseForce = 22
      const edgeBonus = edge * 6
      const lengthBonus = Math.min(15, (currentStreak - 5) * 5)
      const force = baseForce + edgeBonus + lengthBonus

      const scores: Record<string, number> = { red: 0, black: 0 }
      contributingModules = ['streak']

      // v4.8: SIEMPRE push MISMO COLOR en ULTRA (streak 6+)
      scores[streakColor] += force
      scores[oppositeColor] -= force * 0.25

      // Wheel signal — only accept if it aligns with our direction, or very strong
      if (antiWheel.signal && antiWheel.signal.targetNumber) {
        const wheelCat = getCat(antiWheel.signal.targetNumber)
        if (wheelCat && antiWheel.signal.reliability > 60) {
          // v4.8: ULTRA always pushes SAME COLOR — only boost if wheel agrees
          if (wheelCat === streakColor) {
            const wheelBonus = Math.min(20, antiWheel.signal.reliability * 0.3)
            scores[wheelCat] += wheelBonus
            contributingModules.push('wheel')
          }
          // If wheel points against our data-driven direction, ignore unless very strong
          else if (antiWheel.signal.reliability > 75) {
            const wheelBonus = Math.min(10, (antiWheel.signal.reliability - 60) * 0.5)
            scores[wheelCat] += wheelBonus
          }
        }
      }

      // Pre-streak frequency — very low weight, only as tiebreaker
      const preFreq = preStreakFrequency(currentStreak)
      if (Math.abs(preFreq.red) + Math.abs(preFreq.black) > 0) {
        cats.forEach(c => { scores[c] += preFreq[c] * 0.3 })  // v4.5: minimal weight
        contributingModules.push('freq')
      }

      // ═══ v5.5: ALTERNATING PATTERN DETECTOR (ULTRA mode — strength-aware) ═══
      // In ULTRA mode, alternation detection helps break the worst peaks
      // but with reduced weight since ULTRA's primary signal is push same color.
      const altUltra = detectAlternatingPattern(nonZero, getCat)
      if (altUltra.detected && altUltra.lastColor) {
        const altOpposite = getOppositeColor(altUltra.lastColor)
        // v5.5: Weight proportional to alternation strength
        const altWeight = Math.max(15, Math.round(altUltra.strength * 0.35))
        scores[altOpposite] += altWeight
        scores[altUltra.lastColor!] -= altWeight * 0.5
      }

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      let bestValue = sorted[0]

      // ═══ v5.3: PATTERN-AWARE RECOVERY (ULTRA mode — Last Resort) ═══
      const recoveryUltra = getRecoveryPrediction(bestValue)
      if (recoveryUltra) {
        bestValue = recoveryUltra
        consecutiveFlips++
      } else if (recoveryHistory.length > 0 && recoveryHistory[recoveryHistory.length - 1].correct) {
        consecutiveFlips = 0
      }

      return {
        type: 'color',
        options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
        bestValue,
        bestConfidence: Math.round(confs[bestValue]),
        dealerSignal: antiWheel.signal || undefined
      }
    }

    if (currentStreak === 2) {
      // ═══ v6.0 SOFT (streak 2 ONLY) — Markov + Consensus + Strict Skip ═══
      // v6.0: Streaks 3-5 moved to SKIP ZONE (no edge demonstrated).
      // Only streak 2 retains SOFT status — data shows 54.4% accuracy.

      // Recency-Weighted Markov
      const MARKOV_WINDOW_SOFT = 300
      const recentSlice = nonZero.length > MARKOV_WINDOW_SOFT ? nonZero.slice(-MARKOV_WINDOW_SOFT) : nonZero

      // Markov-2 (recency-weighted)
      const markov = (() => {
        const trans: Record<string, Record<string, Record<string, number>>> = {}
        for (let i = 2; i < recentSlice.length; i++) {
          const c0 = getCat(recentSlice[i - 2]); const c1 = getCat(recentSlice[i - 1]); const c2 = getCat(recentSlice[i])
          if (c0 && c1 && c2) {
            if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
            trans[c0][c1][c2] = (trans[c0][c1][c2] || 0) + 1
          }
        }
        const scores: Record<string, number> = { red: 0, black: 0 }
        if (recentSlice.length >= 2) {
          const c0 = getCat(recentSlice[recentSlice.length - 2]); const c1 = getCat(recentSlice[recentSlice.length - 1])
          if (c0 && c1 && trans[c0] && trans[c0][c1]) {
            const tr = trans[c0][c1]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
            if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
          }
        }
        if (Object.values(scores).every(v => v === 0) && recentSlice.length >= 1) {
          const last = getCat(recentSlice[recentSlice.length - 1])
          const trans1: Record<string, Record<string, number>> = {}
          for (let i = 1; i < recentSlice.length; i++) {
            const prev = getCat(recentSlice[i - 1]); const curr = getCat(recentSlice[i])
            if (prev && curr) { if (!trans1[prev]) trans1[prev] = {}; trans1[prev][curr] = (trans1[prev][curr] || 0) + 1 }
          }
          if (last && trans1[last]) {
            const tr = trans1[last]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
            if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
          }
        }
        return scores
      })()

      // Markov-3 (recency-weighted)
      const markov3 = (() => {
        if (recentSlice.length < 10) return { red: 0, black: 0 } as Record<string, number>
        const trans: Record<string, Record<string, Record<string, Record<string, number>>>> = {}
        for (let i = 3; i < recentSlice.length; i++) {
          const c0 = getCat(recentSlice[i - 3]); const c1 = getCat(recentSlice[i - 2])
          const c2 = getCat(recentSlice[i - 1]); const c3 = getCat(recentSlice[i])
          if (c0 && c1 && c2 && c3) {
            if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
            if (!trans[c0][c1][c2]) trans[c0][c1][c2] = {}
            trans[c0][c1][c2][c3] = (trans[c0][c1][c2][c3] || 0) + 1
          }
        }
        const scores: Record<string, number> = { red: 0, black: 0 }
        if (recentSlice.length >= 3) {
          const c0 = getCat(recentSlice[recentSlice.length - 3]); const c1 = getCat(recentSlice[recentSlice.length - 2])
          const c2 = getCat(recentSlice[recentSlice.length - 1])
          if (c0 && c1 && c2 && trans[c0] && trans[c0][c1] && trans[c0][c1][c2]) {
            const tr = trans[c0][c1][c2]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
            if (total >= 2) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
          }
        }
        return scores
      })()

      const scores: Record<string, number> = {}
      const baseScores: Record<string, number> = {}
      cats.forEach(c => { baseScores[c] = 0; scores[c] = 0 })
      contributingModules = []

      // Markov-2 — peso completo, SIN cap (Markov decide libremente)
      cats.forEach(c => {
        const contribution = markov[c] * getWeight('markov') * 0.2
        scores[c] += contribution; baseScores[c] += contribution
      })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov'))

      // Markov-3 — peso completo, SIN cap
      const m3max2 = Math.max(...Object.values(markov3))
      if (m3max2 > 0) {
        cats.forEach(c => {
          const contribution = markov3[c] * getWeight('markov3') * 0.3
          scores[c] += contribution
        })
        contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov3'))
      }

      // v5.0: Wheel signal — alineado con break-prob direction
      // En streaks 3-5, opuesto es más probable → solo aceptar wheel si
      // apunta en esa dirección, o si es extremadamente confiable (>70)
      if (antiWheel.signal && antiWheel.signal.targetNumber) {
        const wheelCat = getCat(antiWheel.signal.targetNumber)
        if (wheelCat && antiWheel.signal.reliability > 55) {
          if (currentStreak >= 3) {
            const bp = getBreakProb(currentStreak)
            if (bp > 50 && wheelCat === oppositeColor) {
              // Wheel coincide con dirección del edge → aceptar
              scores[wheelCat] += Math.min(15, antiWheel.signal.reliability * 0.3)
              contributingModules.push('wheel')
            } else if (bp <= 50 && wheelCat === streakColor) {
              // Break-prob dice mismo color → aceptar wheel mismo color
              scores[wheelCat] += Math.min(15, antiWheel.signal.reliability * 0.3)
              contributingModules.push('wheel')
            } else if (antiWheel.signal.reliability > 70) {
              // Wheel muy confiable → aceptar en cualquier dirección (pero menos peso)
              const wheelBonus = Math.min(8, (antiWheel.signal.reliability - 60) * 0.3)
              scores[wheelCat] += wheelBonus
              contributingModules.push('wheel')
            }
            // Si wheel va contra la dirección del edge → IGNORAR
          } else {
            // Streak 2: Markov decide, wheel aceptado libremente
            const wheelBonus = Math.min(18, antiWheel.signal.reliability * 0.35)
            scores[wheelCat] += wheelBonus
            contributingModules.push('wheel')
          }
        }
      }

      // ═══ v6.0: REMOVED break-prob nudge (was for streak 5 only, now in SKIP ZONE) ═══

      // ═══ v6.0: CONSENSUS QUALITY GATE (SOFT mode — stricter) ═══
      const consensusSoft = buildConsensusMarkov(nonZero, getCat)
      if (consensusSoft.consensus && consensusSoft.agreement === 3) {
        scores[consensusSoft.consensus] += 10
      }

      // ═══ v6.0: ALTERNATION (SOFT mode — strict strength ≥60) ═══
      const altSoft = detectAlternatingPattern(nonZero, getCat)
      if (altSoft.detected && altSoft.lastColor) {
        const altOpposite = getOppositeColor(altSoft.lastColor)
        const altBoost = Math.max(10, Math.round(altSoft.strength * 0.2))
        scores[altOpposite] += altBoost
        scores[altSoft.lastColor!] -= altBoost * 0.5
      }

      // ═══ v6.0: ADAPTIVE SKIP (SOFT mode — strict: strength < 30 OR consensus < 2) ═══
      const skipSoft = shouldSkipPrediction(scores, cats)
      const adaptiveSkipSoft = skipSoft.strength < SKIP_THRESHOLD_SOFT || consensusSoft.agreement <= 1
      if (adaptiveSkipSoft) {
        return {
          type: 'color',
          options: cats.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: 50 })),
          bestValue: scores.red >= scores.black ? 'red' : 'black',
          bestConfidence: 50,
          dealerSignal: antiWheel.signal || undefined,
          shouldSkip: true,
          signalStrength: skipSoft.strength
        }
      }

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      let bestValue = sorted[0]

      // ═══ v5.4: PATTERN-AWARE RECOVERY (SOFT mode — triggers at 2 errors) ═══
      const recoveryResult = getRecoveryPrediction(bestValue)
      if (recoveryResult) {
        bestValue = recoveryResult
        consecutiveFlips++
      } else if (recoveryHistory.length > 0 && recoveryHistory[recoveryHistory.length - 1].correct) {
        consecutiveFlips = 0
      }

      return {
        type: 'color',
        options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
        bestValue,
        bestConfidence: Math.round(confs[bestValue]),
        dealerSignal: antiWheel.signal || undefined,
        shouldSkip: false,
        signalStrength: skipSoft.strength
      }
    }

    // ── NORMAL MODE (streak < 2): v5.3 Markov-Primary + Alternation + Recovery ──
    // v5.3: Now actually CONNECTS detectAlternatingPattern and shouldRecoveryFlip.
    // v5.2: Added Recovery Bailout to detect when engine is stuck predicting
    // one color and flip the prediction. Also added short-term recency.
    // Recency-Weighted Markov
    const MARKOV_WINDOW_NORM = 300
    const recentSlice = nonZero.length > MARKOV_WINDOW_NORM ? nonZero.slice(-MARKOV_WINDOW_NORM) : nonZero

    // Markov-2 (recency-weighted, same as SOFT mode)
    const markov = (() => {
      const trans: Record<string, Record<string, Record<string, number>>> = {}
      for (let i = 2; i < recentSlice.length; i++) {
        const c0 = getCat(recentSlice[i - 2]); const c1 = getCat(recentSlice[i - 1]); const c2 = getCat(recentSlice[i])
        if (c0 && c1 && c2) {
          if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
          trans[c0][c1][c2] = (trans[c0][c1][c2] || 0) + 1
        }
      }
      const scores: Record<string, number> = { red: 0, black: 0 }
      if (recentSlice.length >= 2) {
        const c0 = getCat(recentSlice[recentSlice.length - 2]); const c1 = getCat(recentSlice[recentSlice.length - 1])
        if (c0 && c1 && trans[c0] && trans[c0][c1]) {
          const tr = trans[c0][c1]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
          if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
        }
      }
      if (Object.values(scores).every(v => v === 0) && recentSlice.length >= 1) {
        const last = getCat(recentSlice[recentSlice.length - 1])
        const trans1: Record<string, Record<string, number>> = {}
        for (let i = 1; i < recentSlice.length; i++) {
          const prev = getCat(recentSlice[i - 1]); const curr = getCat(recentSlice[i])
          if (prev && curr) { if (!trans1[prev]) trans1[prev] = {}; trans1[prev][curr] = (trans1[prev][curr] || 0) + 1 }
        }
        if (last && trans1[last]) {
          const tr = trans1[last]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
          if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
        }
      }
      return scores
    })()

    // Markov-3 (recency-weighted, same as SOFT mode)
    const markov3 = (() => {
      if (recentSlice.length < 10) return { red: 0, black: 0 } as Record<string, number>
      const trans: Record<string, Record<string, Record<string, Record<string, number>>>> = {}
      for (let i = 3; i < recentSlice.length; i++) {
        const c0 = getCat(recentSlice[i - 3]); const c1 = getCat(recentSlice[i - 2])
        const c2 = getCat(recentSlice[i - 1]); const c3 = getCat(recentSlice[i])
        if (c0 && c1 && c2 && c3) {
          if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
          if (!trans[c0][c1][c2]) trans[c0][c1][c2] = {}
          trans[c0][c1][c2][c3] = (trans[c0][c1][c2][c3] || 0) + 1
        }
      }
      const scores: Record<string, number> = { red: 0, black: 0 }
      if (recentSlice.length >= 3) {
        const c0 = getCat(recentSlice[recentSlice.length - 3]); const c1 = getCat(recentSlice[recentSlice.length - 2])
        const c2 = getCat(recentSlice[recentSlice.length - 1])
        if (c0 && c1 && c2 && trans[c0] && trans[c0][c1] && trans[c0][c1][c2]) {
          const tr = trans[c0][c1][c2]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
          if (total >= 2) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
        }
      }
      return scores
    })()

    const scores: Record<string, number> = {}
    const baseScores: Record<string, number> = {}
    cats.forEach(c => { baseScores[c] = 0; scores[c] = 0 })
    contributingModules = []

    // Markov-2 — PRIMARY signal (same weight as SOFT mode)
    cats.forEach(c => {
      const contribution = markov[c] * getWeight('markov') * 0.2
      scores[c] += contribution; baseScores[c] += contribution
    })
    contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov'))

    // Markov-3 — SECONDARY signal
    const m3max = Math.max(...Object.values(markov3))
    if (m3max > 0) {
      cats.forEach(c => {
        const contribution = markov3[c] * getWeight('markov3') * 0.3
        scores[c] += contribution
      })
      contributingModules.push(...trackContribution(scores, baseScores, cats, 'markov3'))
    }

    // Wheel signal — aligned with Markov direction
    const wheelData = wheelDisplacement(getCat, cats)
    if (wheelData.signal && wheelData.signal.targetNumber) {
      const wheelCat = getCat(wheelData.signal.targetNumber)
      if (wheelCat && wheelData.signal.reliability > 60) {
        // v5.1: In NORMAL mode, only accept wheel if it AGREES with Markov leader
        const markovLeader = scores.red >= scores.black ? 'red' : 'black'
        if (wheelCat === markovLeader) {
          // Wheel confirms Markov → boost
          scores[wheelCat] += Math.min(15, wheelData.signal.reliability * 0.3)
          contributingModules.push('wheel')
        }
        // If wheel disagrees with Markov → ignore (Markov is primary in NORMAL)
      }
    }

    // ═══ v5.2 NEW: SHORT-TERM RECENCY ═══
    // Detects emerging streaks: if last 5 non-green results are skewed
    // toward one color (4+ out of 5), give a small boost to continue.
    const last5raw = nonZero.slice(-5).map(n => getCat(n)).filter((c): c is 'red' | 'black' => c !== null)
    if (last5raw.length >= 4) {
      const redCount = last5raw.filter(c => c === 'red').length
      const blackCount = last5raw.filter(c => c === 'black').length
      if (redCount >= 4) {
        scores.red += 5
      } else if (blackCount >= 4) {
        scores.black += 5
      }
      // v5.3: Also detect 3/3 of last 3 — emerging streak
      const last3raw = last5raw.slice(-3)
      if (last3raw.length === 3) {
        const l3red = last3raw.filter(c => c === 'red').length
        const l3black = last3raw.filter(c => c === 'black').length
        if (l3red === 3) {
          scores.red += 3  // Small boost for 3-same in last 3
        } else if (l3black === 3) {
          scores.black += 3
        }
      }
    }

    // ═══ v5.5: CONSENSUS QUALITY GATE — multi-window agreement as filter ═══
    // Instead of adding consensus to scores (which inflates them and kills skip),
    // use it as a QUALITY GATE: if windows disagree, signal is unreliable → SKIP
    const consensusNorm = buildConsensusMarkov(nonZero, getCat)
    // If 0 or 1 windows agree (no consensus or weak), add small bonus
    // If all 3 agree, that's a strong signal — DON'T skip even with low score
    if (consensusNorm.consensus && consensusNorm.agreement === 3) {
      scores[consensusNorm.consensus] += 12
    }

    // ═══ v6.0: ADAPTIVE SKIP — stricter: strength < 38 OR consensus < 2 ═══
    const skipCheck = shouldSkipPrediction(scores, cats)
    // v6.0: Skip if signal too weak OR no multi-window consensus
    const adaptiveSkip = skipCheck.strength < SKIP_THRESHOLD_NORMAL || consensusNorm.agreement <= 1
    if (adaptiveSkip) {
      return {
        type: 'color',
        options: cats.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: 50 })),
        bestValue: scores.red >= scores.black ? 'red' : 'black',
        bestConfidence: 50,
        dealerSignal: wheelData.signal || undefined,
        shouldSkip: true,
        signalStrength: skipCheck.strength
      }
    }

    // ═══ v6.0: ALTERNATION AS TIEBREAKER (NORMAL mode — strict strength ≥60) ═══
    const altNorm = detectAlternatingPattern(nonZero, getCat)
    if (altNorm.detected && altNorm.lastColor && altNorm.strength >= 60) {
      const altOpposite = getOppositeColor(altNorm.lastColor)
      // v5.5: Boost proportional to alternation strength
      const altBoost = Math.max(8, Math.round(altNorm.strength * 0.2))
      scores[altOpposite] += altBoost
      scores[altNorm.lastColor!] -= altBoost * 0.5
    }

    const confs = toConfidence(scores, cats, 48.6)
    const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
    let bestValue = sorted[0]

    // ═══ v5.4: PATTERN-AWARE RECOVERY (NORMAL mode — triggers at 2 errors) ═══
    const recoveryNorm = getRecoveryPrediction(bestValue)
    if (recoveryNorm) {
      bestValue = recoveryNorm
      consecutiveFlips++
    } else if (recoveryHistory.length > 0 && recoveryHistory[recoveryHistory.length - 1].correct) {
      consecutiveFlips = 0
    }

    return {
      type: 'color',
      options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
      bestValue,
      bestConfidence: Math.round(confs[bestValue]),
      dealerSignal: wheelData.signal || undefined,
      shouldSkip: false,
      signalStrength: skipCheck.strength
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
