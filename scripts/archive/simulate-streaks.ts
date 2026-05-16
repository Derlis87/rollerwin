/**
 * Streak Simulation: v4.6 vs v4.7 Smart Prediction Engine Comparison
 * 
 * Tests how both engine versions handle color streaks.
 * v4.7 is imported from the actual source file.
 * v4.6 is simulated based on documented bug behaviors.
 */

import { generateSmartPrediction } from '../src/lib/smart-prediction-v4'

// ── Roulette color definitions ──
const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function getColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

function colorEmoji(c: string): string {
  if (c === 'red') return '🔴'
  if (c === 'black') return '⚫'
  return '🟢'
}

// ── v4.6 SIMULATOR ──
// Replicates the 3 critical bugs from v4.6 that v4.7 fixed:
// BUG 1: saturationAnalysis active in SOFT mode (streaks 0-4)
// BUG 2: Markov-3 cap at streak 4: Math.min(contribution, 12)
// BUG 3: SOFT mode range was 0-4 (not 2-4), streaks 0-1 got reduced modules
// Also: ULTRA force was 85+ (not proportional ~50)

const WHEEL_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const WHEEL_INDEX: Record<number, number> = {}
WHEEL_LAYOUT.forEach((n, i) => { WHEEL_INDEX[n] = i })

function v46Simulator(nums: number[]): { predicted: 'red' | 'black'; confidence: number; mode: string } {
  if (nums.length < 5) return { predicted: 'black', confidence: 50, mode: 'insufficient' }

  const nonZero = nums.filter(n => n !== 0)
  const cats = ['red', 'black'] as const
  const getCat = (n: number): 'red' | 'black' | null => { const c = getColor(n); return c === 'green' ? null : c }

  // Calculate current streak
  let maxR = 0, maxB = 0
  nonZero.forEach(n => {
    const c = getColor(n)
    if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 } else { maxR = 0; maxB = 0 }
  })
  const currentStreak = Math.max(maxR, maxB)
  const streakColor = maxR > maxB ? 'red' : 'black'
  const oppositeColor = maxR > maxB ? 'black' : 'red'

  // ── v4.6 ULTRA mode (streak >= 3 in v4.6, MEDIUM at 3, STRONG at 4, ULTRA at 5+) ──
  // v4.6 activated anti-streak at streak 3 with 44-64 point forces
  // v4.6 at streak 5: force 85+
  if (currentStreak >= 5) {
    // v4.6 ULTRA: Strong anti-streak push (85+ points)
    const force = 85 + currentStreak * 5  // Much stronger than v4.7's ~50
    const scores: Record<string, number> = { red: 0, black: 0 }
    scores[oppositeColor] += force
    scores[streakColor] -= force * 0.3

    // Convert scores to prediction
    const predicted = scores.red > scores.black ? 'red' : 'black'
    const total = Math.abs(scores.red) + Math.abs(scores.black) || 1
    const confidence = Math.round(50 + (Math.abs(scores.red - scores.black) / total) * 35)
    return { predicted, confidence: Math.min(92, confidence), mode: 'ULTRA-5+' }
  }

  if (currentStreak >= 3) {
    // v4.6 MEDIUM (streak 3) / STRONG (streak 4) — active anti-streak
    // v4.6 BUG: These modes pushed OPPOSITE with forces of 44-64 points
    // for streaks 3-4 where the real edge is only 1.4-1.8%
    const force = currentStreak === 3 ? 44 : 64
    const scores: Record<string, number> = { red: 0, black: 0 }

    // Markov-2
    const markov2Scores = computeMarkov2(nonZero, getCat, cats)
    cats.forEach(c => { scores[c] += markov2Scores[c] * 2.5 * 0.2 })

    // v4.6 BUG 2: Markov-3 cap at streak 4
    if (nonZero.length >= 10) {
      const markov3Scores = computeMarkov3(nonZero, getCat, cats)
      cats.forEach(c => {
        let contribution = markov3Scores[c] * 1.8 * 0.3
        if (currentStreak === 4 && c === streakColor) {
          contribution = Math.min(contribution, 12) // v4.6 BUG: cap
        }
        scores[c] += contribution
      })
    }

    // v4.6 BUG 1: Saturation analysis ACTIVE in this mode
    if (nonZero.length >= 8) {
      const last8 = nonZero.slice(-8).map(n => getCat(n)).filter(Boolean)
      cats.forEach(c => {
        const count = last8.filter(x => x === c).length
        if (count >= 5) {
          const opposite = cats.find(x => x !== c)!
          scores[opposite] += (count - 4) * 10  // Up to 50 points!
          scores[c] -= (count - 4) * 8
        }
      })
    }

    // v4.6: Anti-streak push
    scores[oppositeColor] += force
    scores[streakColor] -= force

    const predicted = scores.red > scores.black ? 'red' : 'black'
    const total = Math.abs(scores.red) + Math.abs(scores.black) || 1
    const confidence = Math.round(50 + (Math.abs(scores.red - scores.black) / total) * 30)
    return { predicted, confidence: Math.min(88, confidence), mode: currentStreak === 3 ? 'MEDIUM-3' : 'STRONG-4' }
  }

  // v4.6 SOFT mode: streaks 0-4 (BUG 3: included 0-1 which should be NORMAL)
  // But with saturation active (BUG 1)
  const scores: Record<string, number> = { red: 0, black: 0 }

  // Markov-2
  const markov2Scores = computeMarkov2(nonZero, getCat, cats)
  cats.forEach(c => { scores[c] += markov2Scores[c] * 2.5 * 0.2 })

  // Markov-3 (no cap for streak < 4)
  if (nonZero.length >= 10) {
    const markov3Scores = computeMarkov3(nonZero, getCat, cats)
    cats.forEach(c => { scores[c] += markov3Scores[c] * 1.8 * 0.3 })
  }

  // v4.6 BUG 1: Saturation ACTIVE even in SOFT mode
  if (nonZero.length >= 8) {
    const last8 = nonZero.slice(-8).map(n => getCat(n)).filter(Boolean)
    cats.forEach(c => {
      const count = last8.filter(x => x === c).length
      if (count >= 5) {
        const opposite = cats.find(x => x !== c)!
        scores[opposite] += (count - 4) * 10  // Push opposite!
        scores[c] -= (count - 4) * 8
      }
    })
  }

  // v4.6: Streak reversion even at streak 2
  if (currentStreak === 2) {
    cats.forEach(c => { if (c !== streakColor) scores[c] += 6 })
    scores[streakColor] -= 6
  }

  const predicted = scores.red > scores.black ? 'red' : 'black'
  const total = Math.abs(scores.red) + Math.abs(scores.black) || 1
  const confidence = Math.round(50 + (Math.abs(scores.red - scores.black) / total) * 25)
  return { predicted, confidence: Math.min(80, confidence), mode: 'SOFT' }
}

// ── Markov helpers for v4.6 simulator ──
function computeMarkov2(nonZero: number[], getCat: (n: number) => string | null, cats: readonly string[]): Record<string, number> {
  const trans: Record<string, Record<string, number>> = {}
  for (let i = 1; i < nonZero.length; i++) {
    const prev = getCat(nonZero[i - 1]); const curr = getCat(nonZero[i])
    if (prev && curr) { if (!trans[prev]) trans[prev] = {}; trans[prev][curr] = (trans[prev][curr] || 0) + 1 }
  }
  const scores: Record<string, number> = {}
  cats.forEach(c => scores[c] = 0)
  const last = getCat(nonZero[nonZero.length - 1])
  if (last && trans[last]) {
    const tr = trans[last]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
    if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
  }
  return scores
}

function computeMarkov3(nonZero: number[], getCat: (n: number) => string | null, cats: readonly string[]): Record<string, number> {
  const scores: Record<string, number> = {}
  cats.forEach(c => scores[c] = 0)
  if (nonZero.length < 10) return scores
  const trans: Record<string, Record<string, Record<string, number>>> = {}
  for (let i = 2; i < nonZero.length; i++) {
    const c0 = getCat(nonZero[i - 2]); const c1 = getCat(nonZero[i - 1]); const c2 = getCat(nonZero[i])
    if (c0 && c1 && c2) {
      if (!trans[c0]) trans[c0] = {}; if (!trans[c0][c1]) trans[c0][c1] = {}
      trans[c0][c1][c2] = (trans[c0][c1][c2] || 0) + 1
    }
  }
  if (nonZero.length >= 2) {
    const c0 = getCat(nonZero[nonZero.length - 2]); const c1 = getCat(nonZero[nonZero.length - 1])
    if (c0 && c1 && trans[c0] && trans[c0][c1]) {
      const tr = trans[c0][c1]; const total = Object.values(tr).reduce((s, v) => s + v, 0)
      if (total >= 2) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
    }
  }
  return scores
}

// ── TEST SEQUENCE ──
// Colors: 8(B), 19(R), 23(R), 4(B), 17(B) = warmup (mixed)
// Then: 34(R), 16(R), 27(R), 3(R), 36(R), 25(R) = 6 REDS in a row
// Then: 33(B), 6(B), 11(B), 15(B), 24(B), 10(B), 13(B), 28(B), 22(B) = 9 BLACKS in a row

const numbers = [8, 19, 23, 4, 17, 34, 16, 27, 3, 36, 25, 33, 6, 11, 15, 24, 10, 13, 28, 22]

console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
console.log('║   STREAK SIMULATION: v4.6 vs v4.7 Smart Prediction Engine                   ║')
console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
console.log()

// Print sequence overview
console.log('TEST SEQUENCE:')
console.log('─'.repeat(100))
let seqOverview = ''
for (const n of numbers) {
  const c = getColor(n)
  seqOverview += `${String(n).padStart(2)}(${c[0].toUpperCase()}) `
}
console.log(seqOverview)
console.log()
console.log('PATTERN: Mixed warmup → 6 REDs streak → 9 BLACKs streak')
console.log()

// ── Run simulation ──
interface StepResult {
  step: number
  history: number[]
  nextNumber: number
  nextColor: 'red' | 'black'
  currentStreak: number
  streakColor: string

  v47Prediction: 'red' | 'black'
  v47Confidence: number
  v47Correct: boolean

  v46Prediction: 'red' | 'black'
  v46Confidence: number
  v46Correct: boolean
  v46Mode: string
}

const results: StepResult[] = []
let v47ConsecutiveFailures = 0
let v47PeakFailures = 0
let v46ConsecutiveFailures = 0
let v46PeakFailures = 0
let v47Correct = 0
let v46Correct = 0
let totalPredictions = 0

for (let i = 5; i < numbers.length; i++) {
  const history = numbers.slice(0, i)
  const nextNumber = numbers[i]
  const nextColor = getColor(nextNumber) as 'red' | 'black'

  // Calculate current streak for display
  const nonZero = history.filter(n => n !== 0)
  let maxR = 0, maxB = 0
  nonZero.forEach(n => {
    const c = getColor(n)
    if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 } else { maxR = 0; maxB = 0 }
  })
  const currentStreak = Math.max(maxR, maxB)
  const streakColor = maxR > maxB ? 'RED' : maxB > maxR ? 'BLACK' : '-'

  // v4.7: Use actual imported function
  const v47 = generateSmartPrediction(history, 'color')
  const v47Pred = v47.bestValue as 'red' | 'black'

  // v4.6: Use simulator
  const v46 = v46Simulator(history)
  const v46Pred = v46.predicted

  const v47IsCorrect = v47Pred === nextColor
  const v46IsCorrect = v46Pred === nextColor

  if (v47IsCorrect) v47Correct++
  else v47ConsecutiveFailures++
  if (!v47IsCorrect && v47ConsecutiveFailures > v47PeakFailures) {
    v47PeakFailures = v47ConsecutiveFailures
  }
  if (v47IsCorrect) v47ConsecutiveFailures = 0

  if (v46IsCorrect) v46Correct++
  else v46ConsecutiveFailures++
  if (!v46IsCorrect && v46ConsecutiveFailures > v46PeakFailures) {
    v46PeakFailures = v46ConsecutiveFailures
  }
  if (v46IsCorrect) v46ConsecutiveFailures = 0

  totalPredictions++

  results.push({
    step: i,
    history: [...history],
    nextNumber,
    nextColor,
    currentStreak,
    streakColor,
    v47Prediction: v47Pred,
    v47Confidence: v47.bestConfidence,
    v47Correct: v47IsCorrect,
    v46Prediction: v46Pred,
    v46Confidence: v46.confidence,
    v46Correct: v46IsCorrect,
    v46Mode: v46.mode,
  })
}

// ── Print detailed step-by-step log ──
console.log('STEP-BY-STEP PREDICTION LOG:')
console.log('═'.repeat(120))
console.log(
  'Step  | History (last 5)            | Next | Streak | v4.7 Pred | v4.7 ✓✗ | v4.6 Pred | v4.6 ✓✗ | v4.6 Mode'
)
console.log('─'.repeat(120))

for (const r of results) {
  const last5 = r.history.slice(-5).map(n => `${n}(${getColor(n)[0].toUpperCase()})`).join(', ')
  const streakStr = `${r.currentStreak} ${r.streakColor}`.padEnd(8)

  const v47Str = `${r.v47Prediction.padEnd(5)} ${String(r.v47Confidence).padStart(2)}%`
  const v47Mark = r.v47Correct ? '  ✓ ' : '  ✗ '

  const v46Str = `${r.v46Prediction.padEnd(5)} ${String(r.v46Confidence).padStart(2)}%`
  const v46Mark = r.v46Correct ? '  ✓ ' : '  ✗ '

  const nextStr = `${String(r.nextNumber).padStart(2)}(${colorEmoji(r.nextColor)})`

  console.log(
    ` ${String(r.step).padStart(2)}   | ${last5.padEnd(28)} | ${nextStr.padEnd(6)} | ${streakStr} | ${v47Str.padEnd(12)} | ${v47Mark} | ${v46Str.padEnd(12)} | ${v46Mark} | ${r.v46Mode}`
  )
}

console.log('═'.repeat(120))
console.log()

// ── Streak analysis summary ──
console.log('STREAK-BY-STREAK ANALYSIS:')
console.log('─'.repeat(80))

// Analyze RED streak period
console.log()
console.log('▶ RED STREAK (positions 6-11: 34R, 16R, 27R, 3R, 36R, 25R)')
console.log('  During this 6-red streak, predictions for the NEXT number:')
const redStreakResults = results.filter((_, idx) => idx >= 0 && idx <= 5) // Steps 5-10
for (const r of redStreakResults) {
  const v47Arrow = r.v47Prediction === 'red' ? '→RED ' : '→BLK '
  const v46Arrow = r.v46Prediction === 'red' ? '→RED ' : '→BLK '
  const actual = r.nextColor === 'red' ? '  RED' : '  BLK'
  const v47Ok = r.v47Correct ? '✓' : '✗'
  const v46Ok = r.v46Correct ? '✓' : '✗'
  console.log(
    `    After ${String(r.history[r.history.length - 1]).padStart(2)}(${r.streakColor[0]}${r.currentStreak}): ` +
    `v4.7 ${v47Arrow} ${v47Ok}  |  v4.6 ${v46Arrow} ${v46Ok}  |  Actual:${actual}`
  )
}

console.log()
console.log('▶ BLACK STREAK (positions 12-19: 33B, 6B, 11B, 15B, 24B, 10B, 13B, 28B, 22B)')
console.log('  During this 9-black streak, predictions for the NEXT number:')
const blackStreakResults = results.filter((_, idx) => idx >= 6) // Steps 11-19
for (const r of blackStreakResults) {
  const v47Arrow = r.v47Prediction === 'red' ? '→RED ' : '→BLK '
  const v46Arrow = r.v46Prediction === 'red' ? '→RED ' : '→BLK '
  const actual = r.nextColor === 'red' ? '  RED' : '  BLK'
  const v47Ok = r.v47Correct ? '✓' : '✗'
  const v46Ok = r.v46Correct ? '✓' : '✗'
  console.log(
    `    After ${String(r.history[r.history.length - 1]).padStart(2)}(${r.streakColor[0]}${r.currentStreak}): ` +
    `v4.7 ${v47Arrow} ${v47Ok}  |  v4.6 ${v46Arrow} ${v46Ok}  |  Actual:${actual}`
  )
}

// ── Final summary ──
console.log()
console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
console.log('║                              SUMMARY                                        ║')
console.log('╠══════════════════════════════════════════════════════════════════════════════╣')
console.log(`║  Total predictions:          ${String(totalPredictions).padStart(3)}                                          ║`)
console.log('╠══════════════════════════════════════════════════════════════════════════════╣')
console.log('║                              v4.6 (OLD)                                      ║')
console.log(`║    Correct:                  ${String(v46Correct).padStart(3)} / ${String(totalPredictions).padStart(3)}  (${String(Math.round(v46Correct / totalPredictions * 100)).padStart(3)}%)                        ║`)
console.log(`║    Wrong:                    ${String(totalPredictions - v46Correct).padStart(3)} / ${String(totalPredictions).padStart(3)}                                        ║`)
console.log(`║    Peak consecutive errors:  ${String(v46PeakFailures).padStart(3)}                                           ║`)
console.log('╠══════════════════════════════════════════════════════════════════════════════╣')
console.log('║                              v4.7 (NEW)                                      ║')
console.log(`║    Correct:                  ${String(v47Correct).padStart(3)} / ${String(totalPredictions).padStart(3)}  (${String(Math.round(v47Correct / totalPredictions * 100)).padStart(3)}%)                        ║`)
console.log(`║    Wrong:                    ${String(totalPredictions - v47Correct).padStart(3)} / ${String(totalPredictions).padStart(3)}                                        ║`)
console.log(`║    Peak consecutive errors:  ${String(v47PeakFailures).padStart(3)}                                           ║`)
console.log('╠══════════════════════════════════════════════════════════════════════════════╣')

if (v47PeakFailures < v46PeakFailures) {
  console.log(`║  ✅ v4.7 REDUCED peak consecutive errors: ${v46PeakFailures} → ${v47PeakFailures} (-${v46PeakFailures - v47PeakFailures})            ║`)
} else if (v47PeakFailures === v46PeakFailures) {
  console.log(`║  ⚖️  Peak consecutive errors: same (${v47PeakFailures})                                       ║`)
} else {
  console.log(`║  ⚠️  v4.7 INCREASED peak consecutive errors: ${v46PeakFailures} → ${v47PeakFailures} (+${v47PeakFailures - v46PeakFailures})            ║`)
}

const v47Acc = Math.round(v47Correct / totalPredictions * 100)
const v46Acc = Math.round(v46Correct / totalPredictions * 100)
if (v47Acc > v46Acc) {
  console.log(`║  ✅ v4.7 IMPROVED accuracy: ${v46Acc}% → ${v47Acc}% (+${v47Acc - v46Acc}%)                          ║`)
} else if (v47Acc === v46Acc) {
  console.log(`║  ⚖️  Accuracy: same (${v47Acc}%)                                                  ║`)
} else {
  console.log(`║  ⚠️  v4.7 accuracy: ${v46Acc}% → ${v47Acc}% (${v47Acc - v46Acc}%)                                  ║`)
}

console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
console.log()

// ── Key insight ──
console.log('KEY INSIGHT:')
console.log('─'.repeat(80))
console.log('v4.6 bug: During streaks of 3-4 same-color, saturation analysis would fire')
console.log('(5+ of same color in last 8), pushing OPPOSITE with up to 50 points.')
console.log('This caused the engine to stubbornly predict the opposite color during')
console.log('streaks, creating consecutive prediction failures.')
console.log()
console.log('v4.7 fix: SOFT mode (streaks 2-4) now uses ONLY Markov + wheel.')
console.log('No saturation, no anti-streak push. The engine follows patterns')
console.log('instead of fighting the streak, reducing consecutive errors.')
