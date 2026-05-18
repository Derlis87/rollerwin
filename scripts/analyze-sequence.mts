/**
 * analyze-sequence.mts — V6.0 Backtesting Simulation
 * 
 * Reads numbers from /home/z/my-project/upload/sequence.txt
 * Runs the exact same simulation logic as the backtesting engine.
 * 
 * Constants:
 *   MIN_HISTORY = 10
 *   MARTINGALA = [1, 2, 4], MAX_MART = 3
 *   COOLDOWN_AFTER_LOSS = 1, COOLDOWN_AFTER_BUST = 3, COOLDOWN_AFTER_GREEN = 1
 *   
 * Rules:
 *   Green (0) does NOT increment peak height, only martingala
 *   Bust does NOT reset peak height, only martingala
 *   Engine SKIP resets martingala but NOT peak height
 */

import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory, resetFullEngine } from '../src/lib/smart-prediction-v4'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

function parseSequence(text: string): number[] {
  return text
    .split(/[,\s;\n\r|]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n) && n >= 0 && n <= 36)
}

// ═══════════════════════════════════════
// SIMULATION
// ═══════════════════════════════════════

function simulate(numbers: number[]) {
  const MIN_HISTORY = 10
  const MARTINGALA = [1, 2, 4]
  const MAX_MART = 3
  const COOLDOWN_AFTER_LOSS = 1
  const COOLDOWN_AFTER_BUST = 3
  const COOLDOWN_AFTER_GREEN = 1

  // Reset engine state for deterministic backtesting
  resetFullEngine()
  resetRecoveryHistory()

  // Tracking
  const peaks: number[] = []
  let currentPeakHeight = 0
  let wins = 0
  let losses = 0
  let greens = 0
  let totalSkips = 0
  let totalSignals = 0  // non-skipped bets
  let busts = 0

  // Martingale
  let martStep = 0
  let runningProfit = 0
  let maxRunningProfit = 0
  let minRunningProfit = 0
  let maxDrawdown = 0

  // Cooldown
  let cooldownRemaining = 0

  // Peak histogram for output
  const peakHistogram: Record<number, number> = {}

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]

    // Generate prediction
    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue

    const predictedColor = pred.bestValue
    const shouldSkip = pred.shouldSkip === true
    const actualColor = getNumberColor(nextNumber)

    // ═══ COOLDOWN SYSTEM ═══
    if (cooldownRemaining > 0) {
      cooldownRemaining--
      totalSkips++
      if (actualColor === 'green') greens++
      continue
    }

    // ═══ ENGINE SKIP ═══
    if (shouldSkip) {
      totalSkips++
      // Engine skip resets martingala but NOT peak height
      martStep = 0
      if (actualColor === 'green') greens++
      continue
    }

    // ═══ THIS IS A BETTED SPIN ═══
    totalSignals++
    const betAmount = MARTINGALA[Math.min(martStep, MAX_MART - 1)]

    if (actualColor === 'green') {
      // Green: loss for martingala, does NOT increment peak height
      greens++
      runningProfit -= betAmount
      martStep++

      // Track drawdown
      if (runningProfit < minRunningProfit) {
        minRunningProfit = runningProfit
        const dd = maxRunningProfit - runningProfit
        if (dd > maxDrawdown) maxDrawdown = dd
      }

      // Check for bust
      if (martStep >= MAX_MART) {
        busts++
        martStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
      } else {
        cooldownRemaining = COOLDOWN_AFTER_GREEN
      }

      recordPredictionFeedback(false, ['markov'], predictedColor)
      continue
    }

    const isCorrect = predictedColor === actualColor
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)

    if (isCorrect) {
      // Win: 1:1 payout = bet back + bet amount (net +betAmount)
      wins++
      runningProfit += betAmount

      if (runningProfit > maxRunningProfit) maxRunningProfit = runningProfit

      // Peak complete: current errors + 1 (the win)
      const peakValue = currentPeakHeight + 1
      peaks.push(peakValue)
      peakHistogram[peakValue] = (peakHistogram[peakValue] || 0) + 1

      martStep = 0
      currentPeakHeight = 0
    } else {
      // Loss
      losses++
      runningProfit -= betAmount

      // Track drawdown
      if (runningProfit < minRunningProfit) {
        minRunningProfit = runningProfit
        const dd = maxRunningProfit - runningProfit
        if (dd > maxDrawdown) maxDrawdown = dd
      }

      martStep++
      currentPeakHeight++

      // Check for bust
      if (martStep >= MAX_MART) {
        busts++
        martStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
      } else {
        cooldownRemaining = COOLDOWN_AFTER_LOSS
      }
    }
  }

  // Unfinished peak
  if (currentPeakHeight > 0) {
    peaks.push(currentPeakHeight)
    peakHistogram[currentPeakHeight] = (peakHistogram[currentPeakHeight] || 0) + 1
  }

  // Calculate results
  const totalSpins = numbers.length
  const accuracy = (wins + losses + greens) > 0
    ? (wins / (wins + losses + greens)) * 100
    : 0
  const profitPerSignal = totalSignals > 0 ? runningProfit / totalSignals : 0
  const profitPer100Spins = totalSpins > 0 ? (runningProfit / totalSpins) * 100 : 0
  const totalBet = (() => {
    // Recalculate total bet for ROI
    // We need to track total wagered, let's recalculate from profit
    // Actually we need to track it separately. Let me use a different approach.
    // For ROI: netProfit / totalBet * 100
    // We know: netProfit = totalWin - totalBet
    // And each win: profit += betAmount (which is +betAmount)
    // Each loss/green: profit -= betAmount
    // So totalBet = sum of all betAmounts
    // We can derive from: if we tracked totalBetAmount...
    // Actually I need to recompute. Let me just track it properly.
    return 0 // placeholder, we'll compute it properly below
  })()

  return {
    totalSpins,
    totalSignals,
    totalSkips,
    wins,
    losses,
    greens,
    busts,
    accuracy,
    netProfit: runningProfit,
    profitPerSignal,
    profitPer100Spins,
    maxDrawdown,
    peakHistogram,
    totalPeaks: peaks.length,
    maxPeak: peaks.length > 0 ? Math.max(...peaks) : 0,
    peaks,
    isProfitable: runningProfit > 0,
  }
}

// ═══════════════════════════════════════
// PROPER SIMULATION WITH ROI TRACKING
// ═══════════════════════════════════════

function simulateFull(numbers: number[]) {
  const MIN_HISTORY = 10
  const MARTINGALA = [1, 2, 4]
  const MAX_MART = 3
  const COOLDOWN_AFTER_LOSS = 1
  const COOLDOWN_AFTER_BUST = 3
  const COOLDOWN_AFTER_GREEN = 1

  // Reset engine state for deterministic backtesting
  resetFullEngine()
  resetRecoveryHistory()

  // Tracking
  const peaks: number[] = []
  let currentPeakHeight = 0
  let wins = 0
  let losses = 0
  let greens = 0
  let totalSkips = 0
  let totalSignals = 0
  let busts = 0

  // Martingale
  let martStep = 0
  let runningProfit = 0
  let maxRunningProfit = 0
  let totalBet = 0
  let maxDrawdown = 0

  // Cooldown
  let cooldownRemaining = 0

  // Peak histogram
  const peakHistogram: Record<number, number> = {}

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]

    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue

    const predictedColor = pred.bestValue
    const shouldSkip = pred.shouldSkip === true
    const actualColor = getNumberColor(nextNumber)

    // Cooldown
    if (cooldownRemaining > 0) {
      cooldownRemaining--
      totalSkips++
      if (actualColor === 'green') greens++
      continue
    }

    // Engine skip
    if (shouldSkip) {
      totalSkips++
      martStep = 0
      if (actualColor === 'green') greens++
      continue
    }

    // Bet
    totalSignals++
    const betAmount = MARTINGALA[Math.min(martStep, MAX_MART - 1)]
    totalBet += betAmount

    if (actualColor === 'green') {
      greens++
      runningProfit -= betAmount
      martStep++

      const dd = maxRunningProfit - runningProfit
      if (dd > maxDrawdown) maxDrawdown = dd

      if (martStep >= MAX_MART) {
        busts++
        martStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
      } else {
        cooldownRemaining = COOLDOWN_AFTER_GREEN
      }
      recordPredictionFeedback(false, ['markov'], predictedColor)
      continue
    }

    const isCorrect = predictedColor === actualColor
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)

    if (isCorrect) {
      wins++
      runningProfit += betAmount
      if (runningProfit > maxRunningProfit) maxRunningProfit = runningProfit

      const peakValue = currentPeakHeight + 1
      peaks.push(peakValue)
      peakHistogram[peakValue] = (peakHistogram[peakValue] || 0) + 1

      martStep = 0
      currentPeakHeight = 0
    } else {
      losses++
      runningProfit -= betAmount

      const dd = maxRunningProfit - runningProfit
      if (dd > maxDrawdown) maxDrawdown = dd

      martStep++
      currentPeakHeight++

      if (martStep >= MAX_MART) {
        busts++
        martStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
      } else {
        cooldownRemaining = COOLDOWN_AFTER_LOSS
      }
    }
  }

  // Unfinished peak
  if (currentPeakHeight > 0) {
    peaks.push(currentPeakHeight)
    peakHistogram[currentPeakHeight] = (peakHistogram[currentPeakHeight] || 0) + 1
  }

  const totalSpins = numbers.length
  const totalDecisions = wins + losses + greens
  const accuracy = totalDecisions > 0 ? (wins / totalDecisions) * 100 : 0
  const profitPerSignal = totalSignals > 0 ? runningProfit / totalSignals : 0
  const profitPer100Spins = totalSpins > 0 ? (runningProfit / totalSpins) * 100 : 0
  const roi = totalBet > 0 ? (runningProfit / totalBet) * 100 : 0
  const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0
  const isProfitable = runningProfit > 0

  return {
    totalSpins,
    totalSignals,
    totalSkips,
    wins,
    losses,
    greens,
    busts,
    accuracy,
    netProfit: runningProfit,
    profitPerSignal,
    profitPer100Spins,
    roi,
    maxDrawdown,
    peakHistogram,
    totalPeaks: peaks.length,
    maxPeak,
    peaks,
    isProfitable,
  }
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

import fs from 'fs'

const SEQUENCE_PATH = '/home/z/my-project/upload/sequence.txt'

if (!fs.existsSync(SEQUENCE_PATH)) {
  console.error(`Error: File not found: ${SEQUENCE_PATH}`)
  process.exit(1)
}

const text = fs.readFileSync(SEQUENCE_PATH, 'utf-8')
const numbers = parseSequence(text)

if (numbers.length < 15) {
  console.error(`Error: Need at least 15 numbers. Found ${numbers.length}.`)
  process.exit(1)
}

console.log(`Sequence loaded: ${numbers.length} numbers`)
console.log(`First 20: ${numbers.slice(0, 20).join(', ')}`)
console.log(`Last 10:  ...${numbers.slice(-10).join(', ')}`)

const r = simulateFull(numbers)

console.log('\n' + '='.repeat(60))
console.log('  V6.0 BACKTESTING SIMULATION RESULTS')
console.log('='.repeat(60))

console.log(`\nTotal spins processed:  ${r.totalSpins}`)
console.log(`Total signals (bets):   ${r.totalSignals}`)
console.log(`Total skips:            ${r.totalSkips}`)
console.log(`Wins:                   ${r.wins}`)
console.log(`Losses:                 ${r.losses}`)
console.log(`Greens:                 ${r.greens}`)
console.log(`Busts:                  ${r.busts}`)
console.log(`Accuracy:               ${r.accuracy.toFixed(2)}%`)
console.log(`Net profit:             ${r.netProfit >= 0 ? '+' : ''}${r.netProfit.toFixed(2)} units`)
console.log(`Profit per signal:      ${r.profitPerSignal >= 0 ? '+' : ''}${r.profitPerSignal.toFixed(3)} units`)
console.log(`Profit per 100 spins:   ${r.profitPer100Spins >= 0 ? '+' : ''}${r.profitPer100Spins.toFixed(2)} units`)
console.log(`ROI:                    ${r.roi >= 0 ? '+' : ''}${r.roi.toFixed(2)}%`)
console.log(`Max drawdown:           ${r.maxDrawdown.toFixed(2)} units`)

console.log(`\nPeak histogram:`)
if (r.totalPeaks > 0) {
  const maxCount = Math.max(...Object.values(r.peakHistogram))
  for (let i = 1; i <= r.maxPeak; i++) {
    const count = r.peakHistogram[i] || 0
    if (count > 0) {
      const bar = '#'.repeat(Math.round(count / maxCount * 30))
      const pct = (count / r.totalPeaks * 100).toFixed(1)
      console.log(`  Pico ${String(i).padStart(2)}: ${String(count).padStart(5)} (${pct.padStart(6)}%) ${bar}`)
    }
  }
} else {
  console.log('  (no peaks)')
}

console.log(`\nTotal peaks:            ${r.totalPeaks}`)
console.log(`Max peak:               ${r.maxPeak}`)

console.log(`\n${r.isProfitable ? '✅ RENTABLE' : '❌ NO RENTABLE'}`)

console.log('\n' + '='.repeat(60))
