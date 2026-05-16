/**
 * Live Session Analysis — V6.0 Signal Frequency
 * 
 * Analyzes a real 30-min session to count:
 * - Total spins processed
 * - Signals (shouldSkip=false) vs Skips (shouldSkip=true)
 * - Mode breakdown (NORMAL / SOFT / ULTRA / SKIP_ZONE)
 * - Current streak context at each decision point
 * 
 * RESEARCH ONLY — does not modify any existing files.
 */

import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory } from '../src/lib/smart-prediction-v4'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

function getStreakAtEnd(nums: number[]): { length: number; color: string } {
  let streakLen = 0
  let streakColor = ''
  for (let i = nums.length - 1; i >= 0; i--) {
    const c = getNumberColor(nums[i])
    if (c === 'green') continue
    if (streakLen === 0) {
      streakColor = c
      streakLen = 1
    } else if (c === streakColor) {
      streakLen++
    } else {
      break
    }
  }
  return { length: streakLen, color: streakColor }
}

function getModeLabel(streakLen: number): string {
  if (streakLen >= 7) return 'ULTRA'
  if (streakLen >= 3 && streakLen <= 6) return 'SKIP_ZONE'
  if (streakLen === 2) return 'SOFT'
  return 'NORMAL'
}

// ═══════════════════════════════════════════════════════
// Session data — OCR'd from user's live session image
// Original: 41,30,15,6,6,8,19,36,4,26,42→0,10,33,26,33,11,42→0,34,21,25,21,42→0,48→0,26,42→0,25,22,4,17,42→0,7,35,7,16,19,35,11,18,19,26,8,7,4,1,25,6,20,1,35,30,17,8,2,26,13,13,2,10,34,16,17,16,35,15,25,32→0,2,4,7,26,34,3,24,33,26,14,22,16,36,4,5,7,30,31,17,20,26,45→0,31,7
//
// Cleaned: anything >36 → 0 (green), anything marked →0 → 0
// ═══════════════════════════════════════════════════════
const SESSION_NUMBERS: number[] = [
  //  1-10: 41→0
    0, 30, 15,  6,  6,  8, 19, 36,  4, 26,
  // 11-20: 42→0
    0, 10, 33, 26, 33, 11,  0, 34, 21, 25,
  // 21-30
   21,  0,  0, 26,  0, 25, 22,  4, 17,  0,
  // 31-40
    7, 35,  7, 16, 19, 35, 11, 18, 19, 26,
  // 41-50
    8,  7,  4,  1, 25,  6, 20,  1, 35, 30,
  // 51-60
   17,  8,  2, 26, 13, 13,  2, 10, 34, 16,
  // 61-70
   17, 16, 35, 15, 25,  0,  2,  4,  7, 26,  // 32→0 at position 66
  // 71-80
   34,  3, 24, 33, 26, 14, 22, 16, 36,  4,
  // 81-90
    5,  7, 30, 31, 17, 20, 26,  0, 31,  7,  // 45→0 at position 88
]

// ═══ Run simulation ═══
resetRecoveryHistory()

const MIN_HISTORY = 5  // Engine needs at least 5 numbers

// Tracking
let totalSpins = 0
let totalPredictions = 0
let signals = 0       // shouldSkip=false → BET
let skips = 0         // shouldSkip=true → NO BET
let greens = 0

// Per-mode tracking
const modeStats: Record<string, { signals: number; skips: number; signalDetails: Array<{ spin: number; num: number; predicted: string; streak: number }> }> = {
  NORMAL:    { signals: 0, skips: 0, signalDetails: [] },
  SOFT:      { signals: 0, skips: 0, signalDetails: [] },
  ULTRA:     { signals: 0, skips: 0, signalDetails: [] },
  SKIP_ZONE: { signals: 0, skips: 0, signalDetails: [] },
}

// Skip reason tracking
let skipByWeakSignal = 0     // score diff < threshold
let skipByLowConsensus = 0   // consensus < 2
let skipByZone = 0           // streak 3-6

// Signal outcome tracking (for accuracy)
let signalCorrect = 0
let signalIncorrect = 0
let currentStreak = 0  // consecutive losses in signals

// Running streaks for display
let currentSkipStreak = 0
let maxSkipStreak = 0
let currentSignalStreak = 0

// Detailed log
interface SpinLog {
  spinNum: number
  number: number
  color: string
  streak: number
  streakColor: string
  mode: string
  action: 'SIGNAL' | 'SKIP'
  predicted?: string
  confidence?: number
  signalStrength?: number
  correct?: boolean
  skipReason?: string
}

const log: SpinLog[] = []

console.log('═'.repeat(80))
console.log('  V6.0 LIVE SESSION ANALYSIS — Signal Frequency')
console.log('═'.repeat(80))
console.log(`  Total numbers: ${SESSION_NUMBERS.length}`)
console.log(`  Numbers: ${SESSION_NUMBERS.join(', ')}`)
console.log(`  Greens (0): ${SESSION_NUMBERS.filter(n => n === 0).length}`)
console.log('═'.repeat(80))

for (let i = MIN_HISTORY; i < SESSION_NUMBERS.length; i++) {
  const history = SESSION_NUMBERS.slice(0, i)
  const nextNumber = SESSION_NUMBERS[i]
  const nextColor = getNumberColor(nextNumber)

  totalSpins++
  if (nextColor === 'green') greens++

  // Need at least a few non-green for meaningful prediction
  const nonGreenCount = history.filter(n => n !== 0).length
  if (nonGreenCount < 5) continue

  const pred = generateSmartPrediction(history, 'color')
  if (!pred.bestValue) continue

  totalPredictions++
  const streak = getStreakAtEnd(history)
  const mode = getModeLabel(streak.length)
  const shouldSkip = pred.shouldSkip === true
  const signalStrength = pred.signalStrength ?? 0

  const entry: SpinLog = {
    spinNum: totalSpins,
    number: nextNumber,
    color: nextColor,
    streak: streak.length,
    streakColor: streak.color,
    mode,
    action: shouldSkip ? 'SKIP' : 'SIGNAL',
  }

  if (shouldSkip) {
    skips++
    modeStats[mode].skips++
    currentSkipStreak++
    currentSignalStreak = 0
    if (currentSkipStreak > maxSkipStreak) maxSkipStreak = currentSkipStreak

    // Determine skip reason
    if (mode === 'SKIP_ZONE') {
      skipByZone++
      entry.skipReason = 'SKIP_ZONE (streak 3-6)'
    } else if (signalStrength === 0) {
      skipByWeakSignal++
      entry.skipReason = `weak signal (strength=${signalStrength.toFixed(1)})`
    } else {
      // Could be weak signal OR low consensus — we don't have direct access
      // but we can infer: if strength < threshold, it's weak signal
      skipByWeakSignal++
      entry.skipReason = `low strength (${signalStrength.toFixed(1)}) or low consensus`
    }
  } else {
    signals++
    modeStats[mode].signals++
    currentSignalStreak++
    currentSkipStreak = 0

    entry.predicted = pred.bestValue
    entry.confidence = pred.bestConfidence
    entry.signalStrength = signalStrength

    // Check accuracy
    if (nextColor === 'green') {
      // Green = neither red nor black, counts as incorrect for color bet
      signalIncorrect++
      currentStreak++
      entry.correct = false
    } else {
      const isCorrect = pred.bestValue === nextColor
      if (isCorrect) {
        signalCorrect++
        currentStreak = 0
        entry.correct = true
      } else {
        signalIncorrect++
        currentStreak++
        entry.correct = false
      }
    }

    // Record signal details for mode
    modeStats[mode].signalDetails.push({
      spin: totalSpins,
      num: nextNumber,
      predicted: pred.bestValue,
      streak: streak.length,
    })

    // Record feedback for engine state
    recordPredictionFeedback(entry.correct ?? false, ['markov'], pred.bestValue)
  }

  log.push(entry)

  // ═══ Print summary every 10 spins ═══
  if (totalSpins % 10 === 0) {
    const signalRate = totalPredictions > 0 ? (signals / totalPredictions * 100).toFixed(1) : '0.0'
    const skipRate = totalPredictions > 0 ? (skips / totalPredictions * 100).toFixed(1) : '0.0'
    const acc = (signals - signalIncorrect + (signalIncorrect - signalCorrect)) >= 0
      ? (signals > 0 ? (signalCorrect / signals * 100).toFixed(0) : '—')
      : '—'

    console.log(
      `\n── Spin ${String(totalSpins).padStart(3)} ────────────── ` +
      `Signals: ${signals} (${signalRate}%) | Skips: ${skips} (${skipRate}%) | ` +
      `Running skip-streak: ${currentSkipStreak} | Loss streak: ${currentStreak}`
    )
  }
}

// ═══════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════
console.log('\n')
console.log('═'.repeat(80))
console.log('  FINAL REPORT — V6.0 Signal Frequency Analysis')
console.log('═'.repeat(80))

console.log(`\n📊 OVERVIEW:`)
console.log(`   Total numbers in session: ${SESSION_NUMBERS.length}`)
console.log(`   Greens (0):               ${SESSION_NUMBERS.filter(n => n === 0).length}`)
console.log(`   Spins processed:          ${totalSpins}`)
console.log(`   Total predictions:        ${totalPredictions}`)

const sigPct = totalPredictions > 0 ? (signals / totalPredictions * 100).toFixed(1) : '0'
const skipPct = totalPredictions > 0 ? (skips / totalPredictions * 100).toFixed(1) : '0'

console.log(`\n🎯 SIGNALS vs SKIPS:`)
console.log(`   SIGNALS (shouldSkip=false):  ${signals}  (${sigPct}%)`)
console.log(`   SKIPS   (shouldSkip=true):   ${skips}   (${skipPct}%)`)
console.log(`   Signal:Skip ratio:           ${skips > 0 ? (signals / skips).toFixed(2) : '∞'}:1`)
console.log(`   Max consecutive skips:       ${maxSkipStreak}`)

console.log(`\n📋 MODE BREAKDOWN:`)
for (const [mode, stats] of Object.entries(modeStats)) {
  const total = stats.signals + stats.skips
  if (total === 0) continue
  const sRate = total > 0 ? (stats.signals / total * 100).toFixed(0) : '0'
  const kRate = total > 0 ? (stats.skips / total * 100).toFixed(0) : '0'
  console.log(`   ${mode.padEnd(10)} ${String(total).padStart(3)} total │ ${String(stats.signals).padStart(2)} signals (${sRate}%) │ ${String(stats.skips).padStart(3)} skips (${kRate}%)`)
}

console.log(`\n🔍 SKIP REASONS:`)
console.log(`   SKIP_ZONE (streak 3-6):    ${skipByZone}`)
console.log(`   Weak signal / low consensus: ${skipByWeakSignal}`)

if (signals > 0) {
  const accuracy = (signalCorrect / signals * 100).toFixed(1)
  console.log(`\n📈 SIGNAL ACCURACY (if bets were placed):`)
  console.log(`   Correct:     ${signalCorrect} ✅`)
  console.log(`   Incorrect:   ${signalIncorrect} ❌`)
  console.log(`   Accuracy:    ${accuracy}%`)
  console.log(`   Max loss streak: ${currentStreak}`)
}

console.log(`\n📝 DETAILED SIGNAL LOG:`)
for (const entry of log) {
  if (entry.action === 'SIGNAL') {
    const mark = entry.correct === true ? '✅' : entry.correct === false ? '❌' : '  '
    console.log(
      `   Spin ${String(entry.spinNum).padStart(3)} │ ` +
      `${String(entry.number).padStart(2)} (${entry.color.padEnd(5)}) │ ` +
      `streak ${entry.streakColor.padEnd(5)}×${entry.streak} │ ` +
      `${entry.mode.padEnd(9)} │ ` +
      `predicted ${String(entry.predicted ?? '?').padEnd(5)} │ ` +
      `conf ${String(entry.confidence ?? 0).padStart(2)}% │ ` +
      `str ${String((entry.signalStrength ?? 0).toFixed(1)).padStart(5)} │ ` +
      `${mark}`
    )
  }
}

console.log(`\n📝 SKIP LOG (first 30, showing pattern):`)
let skipCount = 0
for (const entry of log) {
  if (entry.action === 'SKIP') {
    skipCount++
    if (skipCount <= 30) {
      console.log(
        `   Spin ${String(entry.spinNum).padStart(3)} │ ` +
        `${String(entry.number).padStart(2)} (${entry.color.padEnd(5)}) │ ` +
        `streak ${entry.streakColor.padEnd(5)}×${entry.streak} │ ` +
        `${entry.mode.padEnd(9)} │ ` +
        `${entry.skipReason ?? ''}`
      )
    }
  }
}
if (skipCount > 30) {
  console.log(`   ... and ${skipCount - 30} more skips`)
}

console.log('\n' + '═'.repeat(80))
console.log('  KEY QUESTION: How many signals vs skips does V6.0 produce?')
console.log('═'.repeat(80))
console.log(`   ANSWER: ${signals} signals vs ${skips} skips out of ${totalPredictions} predictions`)
console.log(`   That's ${sigPct}% signals, ${skipPct}% skips.`)
console.log(`   On average, the user would bet once every ${(totalPredictions / Math.max(1, signals)).toFixed(1)} spins.`)
console.log('═'.repeat(80))
