/**
 * Simulador V6.0 vs V6.0+EMI — Comparison with EMI (Engine Momentum Indicator) filter
 *
 * EMI = Rolling accuracy of last 10 actual bets placed (NOT skips)
 * If EMI < 55% AND at least 5 bets placed → SKIP (even if engine says signal)
 * Tracks what WOULD have happened during EMI cold zones for comparison
 */

import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory } from '../src/lib/smart-prediction-v4'
import * as fs from 'fs'

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

interface SimConfig {
  useEMI: boolean
}

interface SimResult {
  label: string
  totalNumbers: number
  totalPredictions: number
  skipped: number
  skippedByEngine: number
  skippedByCooldown: number
  skippedByEMI: number
  betted: number
  correct: number
  incorrect: number
  accuracy: number
  peaks: number[]
  peakStats: { low: number; medium: number; high: number }
  maxPeak: number
  greenCount: number
  bustCount: number
  martingale: {
    totalBet: number
    totalWin: number
    netResult: number
    roi: number
    winsStep1: number
    winsStep2: number
    winsStep3: number
    busts: number
  }
  cooldownStats: {
    lossCooldowns: number
    bustCooldowns: number
    greenCooldowns: number
    spinsSkippedByCooldown: number
  }
  // EMI-specific stats
  emiStats: {
    zones: { '<40%': number; '40-50%': number; '50-55%': number; '55-65%': number; '65-75%': number; '>75%': number }
    emiFilteredSpins: number
    emiFilteredCorrect: number  // What WOULD have been correct if we bet
    emiFilteredIncorrect: number
    emiFilteredWins: number
    emiFilteredLosses: number
    avgEMI: number
    minEMI: number
    maxEMI: number
    emiHistory: Array<{ spin: number; emi: number; action: string; correct?: boolean }>
  }
}

const MIN_HISTORY = 10
const COOLDOWN_AFTER_LOSS = 1
const COOLDOWN_AFTER_BUST = 3
const COOLDOWN_AFTER_GREEN = 1
const EMI_WINDOW = 10
const EMI_THRESHOLD = 55
const EMI_MIN_BETS = 5

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

function classifyEMI(emi: number): string {
  if (emi < 40) return '<40%'
  if (emi < 50) return '40-50%'
  if (emi < 55) return '50-55%'
  if (emi < 65) return '55-65%'
  if (emi < 75) return '65-75%'
  return '>75%'
}

function simulate(numbers: number[], config: SimConfig): SimResult {
  const peaks: number[] = []
  let currentPeakHeight = 0
  let correct = 0
  let incorrect = 0
  let totalPredictions = 0
  let totalSkipped = 0
  let skippedByEngine = 0
  let skippedByCooldown = 0
  let skippedByEMI = 0
  let totalBetted = 0

  // Martingale tracking
  let martingaleStep = 0
  const martingaleBets = [1, 2, 4]
  let martTotalBet = 0
  let martTotalWin = 0
  let winsStep1 = 0
  let winsStep2 = 0
  let winsStep3 = 0
  let bustCount = 0

  // Green tracking
  let greenCount = 0

  // Cooldown tracking
  let cooldownRemaining = 0
  let cooldownSource = ''
  const cooldownStats = {
    lossCooldowns: 0,
    bustCooldowns: 0,
    greenCooldowns: 0,
    spinsSkippedByCooldown: 0,
  }

  // EMI tracking (rolling accuracy of last 10 actual bets)
  const betResults: boolean[] = [] // true=win, false=loss for last EMI_WINDOW bets
  const emiStats = {
    zones: { '<40%': 0, '40-50%': 0, '50-55%': 0, '55-65%': 0, '65-75%': 0, '>75%': 0 } as Record<string, number>,
    emiFilteredSpins: 0,
    emiFilteredCorrect: 0,
    emiFilteredIncorrect: 0,
    emiFilteredWins: 0,
    emiFilteredLosses: 0,
    avgEMI: 0,
    minEMI: 100,
    maxEMI: 0,
    emiHistory: [] as Array<{ spin: number; emi: number; action: string; correct?: boolean }>,
  }
  const emiValues: number[] = []

  function currentEMI(): number {
    if (betResults.length === 0) return 50 // neutral start
    const recent = betResults.slice(-EMI_WINDOW)
    return (recent.filter(r => r).length / recent.length) * 100
  }

  // Reset recovery history for clean simulation
  resetRecoveryHistory()

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]

    // Generate prediction
    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue

    totalPredictions++
    const predictedColor = pred.bestValue
    const shouldSkip = pred.shouldSkip === true
    const actualColor = getNumberColor(nextNumber)

    // ═══ COOLDOWN SYSTEM ═══
    if (cooldownRemaining > 0) {
      cooldownRemaining--
      skippedByCooldown++
      totalSkipped++
      cooldownStats.spinsSkippedByCooldown++
      if (actualColor === 'green') greenCount++
      continue
    }

    // ═══ ENGINE SKIP ═══
    if (shouldSkip) {
      skippedByEngine++
      totalSkipped++
      martingaleStep = 0
      if (actualColor === 'green') greenCount++
      continue
    }

    // ═══ EMI FILTER (only for EMI version) ═══
    const emi = currentEMI()
    if (config.useEMI && betResults.length >= EMI_MIN_BETS && emi < EMI_THRESHOLD) {
      // EMI says skip, but record what WOULD have happened
      skippedByEMI++
      totalSkipped++
      emiStats.emiFilteredSpins++

      const isGreen = actualColor === 'green'
      const wouldBeCorrect = !isGreen && predictedColor === actualColor

      if (wouldBeCorrect) {
        emiStats.emiFilteredCorrect++
      } else {
        emiStats.emiFilteredIncorrect++
      }

      // Track the zone
      const zone = classifyEMI(emi)
      emiStats.zones[zone]++

      // Record EMI history
      emiStats.emiHistory.push({ spin: i, emi: Math.round(emi * 10) / 10, action: 'emi_skip', correct: wouldBeCorrect })

      if (actualColor === 'green') greenCount++
      // Note: We do NOT reset martingale on EMI skip — it's a passive filter, not a signal change
      // Actually, since we're not betting, we should not advance martingale either
      continue
    }

    // ═══ This is a BETTED spin ═══
    totalBetted++

    // Track EMI zone for this bet
    if (config.useEMI) {
      const zone = classifyEMI(emi)
      emiStats.zones[zone]++
      emiStats.emiHistory.push({ spin: i, emi: Math.round(emi * 10) / 10, action: 'bet' })
    }

    // Check if green (zero)
    if (actualColor === 'green') {
      greenCount++
      martTotalBet += martingaleBets[Math.min(martingaleStep, 2)]
      martingaleStep++
      betResults.push(false) // loss

      // Check for bust
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
        cooldownStats.bustCooldowns++
      } else {
        cooldownRemaining = COOLDOWN_AFTER_GREEN
        cooldownSource = 'green'
        cooldownStats.greenCooldowns++
      }

      recordPredictionFeedback(false, ['markov'], predictedColor)
      continue
    }

    const isCorrect = predictedColor === actualColor
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)

    if (isCorrect) {
      correct++
      martTotalBet += martingaleBets[martingaleStep]
      martTotalWin += martingaleBets[martingaleStep] * 2

      if (martingaleStep === 0) winsStep1++
      else if (martingaleStep === 1) winsStep2++
      else if (martingaleStep === 2) winsStep3++

      martingaleStep = 0
      betResults.push(true)

      // Peak complete
      peaks.push(currentPeakHeight + 1)
      currentPeakHeight = 0
    } else {
      incorrect++
      martTotalBet += martingaleBets[martingaleStep]
      martingaleStep++
      betResults.push(false)

      // Bust check
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
        cooldownStats.bustCooldowns++
      } else {
        cooldownRemaining = COOLDOWN_AFTER_LOSS
        cooldownSource = 'loss'
        cooldownStats.lossCooldowns++
      }

      currentPeakHeight++
    }
  }

  // Unfinished peak
  if (currentPeakHeight > 0) {
    peaks.push(currentPeakHeight)
  }

  // Calculate stats
  const low = peaks.filter(p => p >= 1 && p <= 3).length
  const medium = peaks.filter(p => p >= 4 && p <= 6).length
  const high = peaks.filter(p => p >= 7).length
  const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0
  const martNet = martTotalWin - martTotalBet
  const martRoi = martTotalBet > 0 ? (martNet / martTotalBet) * 100 : 0
  const accuracy = totalBetted > 0 ? (correct / totalBetted) * 100 : 0

  // EMI summary stats
  if (config.useEMI) {
    const allEmiVals = emiStats.emiHistory.map(e => e.emi)
    if (allEmiVals.length > 0) {
      emiStats.avgEMI = allEmiVals.reduce((a, b) => a + b, 0) / allEmiVals.length
      emiStats.minEMI = Math.min(...allEmiVals)
      emiStats.maxEMI = Math.max(...allEmiVals)
    }
  }

  return {
    label: config.useEMI ? 'V6.0 + EMI' : 'V6.0 Pure',
    totalNumbers: numbers.length,
    totalPredictions,
    skipped: totalSkipped,
    skippedByEngine,
    skippedByCooldown,
    skippedByEMI,
    betted: totalBetted,
    correct,
    incorrect,
    accuracy,
    peaks,
    peakStats: { low, medium, high },
    maxPeak,
    greenCount,
    bustCount,
    martingale: {
      totalBet: martTotalBet,
      totalWin: martTotalWin,
      netResult: martNet,
      roi: martRoi,
      winsStep1,
      winsStep2,
      winsStep3,
      busts: bustCount,
    },
    cooldownStats,
    emiStats,
  }
}

function printComparison(r1: SimResult, r2: SimResult): string {
  const lines: string[] = []
  const sep = '═'.repeat(70)
  const sep2 = '─'.repeat(70)

  lines.push('')
  lines.push(sep)
  lines.push('  COMPARISON: V6.0 PURE  vs  V6.0 + EMI FILTER')
  lines.push(`  Sequence: clean-sequence-3.txt (${r1.totalNumbers} numbers)`)
  lines.push(sep)

  // ─── GENERAL STATS ───
  lines.push('')
  lines.push('┌─────────────────────────┬──────────────┬──────────────┐')
  lines.push('│ METRIC                  │ V6.0 PURE    │ V6.0 + EMI   │')
  lines.push('├─────────────────────────┼──────────────┼──────────────┤')
  lines.push(`│ Total spins             │ ${String(r1.totalPredictions).padStart(12)} │ ${String(r2.totalPredictions).padStart(12)} │`)
  lines.push(`│ Total bets              │ ${String(r1.betted).padStart(12)} │ ${String(r2.betted).padStart(12)} │`)
  lines.push(`│ Engine skips            │ ${String(r1.skippedByEngine).padStart(12)} │ ${String(r2.skippedByEngine).padStart(12)} │`)
  lines.push(`│ Cooldown skips          │ ${String(r1.skippedByCooldown).padStart(12)} │ ${String(r2.skippedByCooldown).padStart(12)} │`)
  lines.push(`│ EMI skips               │ ${String(0).padStart(12)} │ ${String(r2.skippedByEMI).padStart(12)} │`)
  lines.push(`│ Total skips             │ ${String(r1.skipped).padStart(12)} │ ${String(r2.skipped).padStart(12)} │`)
  lines.push(`│ Wins                    │ ${String(r1.correct).padStart(12)} │ ${String(r2.correct).padStart(12)} │`)
  lines.push(`│ Losses                  │ ${String(r1.incorrect).padStart(12)} │ ${String(r2.incorrect).padStart(12)} │`)
  lines.push(`│ Accuracy                │ ${r1.accuracy.toFixed(1).padStart(11)}% │ ${r2.accuracy.toFixed(1).padStart(11)}% │`)
  lines.push(`│ Greens (zero)           │ ${String(r1.greenCount).padStart(12)} │ ${String(r2.greenCount).padStart(12)} │`)
  lines.push('└─────────────────────────┴──────────────┴──────────────┘')

  // ─── FINANCIAL ───
  lines.push('')
  lines.push('┌─────────────────────────┬──────────────┬──────────────┐')
  lines.push('│ FINANCIAL               │ V6.0 PURE    │ V6.0 + EMI   │')
  lines.push('├─────────────────────────┼──────────────┼──────────────┤')
  lines.push(`│ Total bet               │ ${String(r1.martingale.totalBet).padStart(12)} │ ${String(r2.martingale.totalBet).padStart(12)} │`)
  lines.push(`│ Total won               │ ${String(r1.martingale.totalWin).padStart(12)} │ ${String(r2.martingale.totalWin).padStart(12)} │`)
  const net1sign = r1.martingale.netResult >= 0 ? '+' : ''
  const net2sign = r2.martingale.netResult >= 0 ? '+' : ''
  lines.push(`│ NET RESULT              │ ${net1sign}${String(r1.martingale.netResult).padStart(11)} │ ${net2sign}${String(r2.martingale.netResult).padStart(11)} │`)
  lines.push(`│ ROI                     │ ${r1.martingale.roi.toFixed(2).padStart(11)}% │ ${r2.martingale.roi.toFixed(2).padStart(11)}% │`)
  lines.push(`│ Busts (3 losses)        │ ${String(r1.bustCount).padStart(12)} │ ${String(r2.bustCount).padStart(12)} │`)
  lines.push(`│ Bust cost               │ ${String(r1.bustCount * -7).padStart(12)} │ ${String(r2.bustCount * -7).padStart(12)} │`)
  lines.push('└─────────────────────────┴──────────────┴──────────────┘')

  // ─── MARTINGALE BREAKDOWN ───
  lines.push('')
  lines.push('┌─────────────────────────┬──────────────┬──────────────┐')
  lines.push('│ MARTINGALE BREAKDOWN    │ V6.0 PURE    │ V6.0 + EMI   │')
  lines.push('├─────────────────────────┼──────────────┼──────────────┤')
  lines.push(`│ Wins at step 1 (1u)     │ ${String(r1.martingale.winsStep1).padStart(12)} │ ${String(r2.martingale.winsStep1).padStart(12)} │`)
  lines.push(`│ Wins at step 2 (2u)     │ ${String(r1.martingale.winsStep2).padStart(12)} │ ${String(r2.martingale.winsStep2).padStart(12)} │`)
  lines.push(`│ Wins at step 3 (4u)     │ ${String(r1.martingale.winsStep3).padStart(12)} │ ${String(r2.martingale.winsStep3).padStart(12)} │`)
  lines.push(`│ Busts                   │ ${String(r1.martingale.busts).padStart(12)} │ ${String(r2.martingale.busts).padStart(12)} │`)
  const totalBets1 = r1.martingale.winsStep1 + r1.martingale.winsStep2 + r1.martingale.winsStep3 + r1.martingale.busts
  const totalBets2 = r2.martingale.winsStep1 + r2.martingale.winsStep2 + r2.martingale.winsStep3 + r2.martingale.busts
  lines.push(`│ Total series             │ ${String(totalBets1).padStart(12)} │ ${String(totalBets2).padStart(12)} │`)
  if (totalBets1 > 0) {
    lines.push(`│ Bust rate               │ ${((r1.martingale.busts / totalBets1) * 100).toFixed(1).padStart(11)}% │ ${((r2.martingale.busts / totalBets2) * 100).toFixed(1).padStart(11)}% │`)
  }
  lines.push('└─────────────────────────┴──────────────┴──────────────┘')

  // ─── PEAK DISTRIBUTION ───
  lines.push('')
  lines.push('┌─────────────────────────┬──────────────┬──────────────┐')
  lines.push('│ PEAK DISTRIBUTION       │ V6.0 PURE    │ V6.0 + EMI   │')
  lines.push('├─────────────────────────┼──────────────┼──────────────┤')
  lines.push(`│ Total peaks             │ ${String(r1.peaks.length).padStart(12)} │ ${String(r2.peaks.length).padStart(12)} │`)
  lines.push(`│ Low (1-3)               │ ${String(r1.peakStats.low).padStart(12)} │ ${String(r2.peakStats.low).padStart(12)} │`)
  lines.push(`│ Medium (4-6)            │ ${String(r1.peakStats.medium).padStart(12)} │ ${String(r2.peakStats.medium).padStart(12)} │`)
  lines.push(`│ High (7+)               │ ${String(r1.peakStats.high).padStart(12)} │ ${String(r2.peakStats.high).padStart(12)} │`)
  lines.push(`│ Max peak                │ ${String(r1.maxPeak).padStart(12)} │ ${String(r2.maxPeak).padStart(12)} │`)
  if (r1.peaks.length > 0) {
    const avg1 = r1.peaks.reduce((a, b) => a + b, 0) / r1.peaks.length
    const avg2 = r2.peaks.length > 0 ? r2.peaks.reduce((a, b) => a + b, 0) / r2.peaks.length : 0
    lines.push(`│ Avg peak                │ ${avg1.toFixed(2).padStart(11)} │ ${avg2.toFixed(2).padStart(11)} │`)
  }
  if (r1.peaks.length > 0) {
    const ratio1 = r1.peakStats.low / Math.max(1, r1.peakStats.medium + r1.peakStats.high)
    const ratio2 = r2.peakStats.low / Math.max(1, r2.peakStats.medium + r2.peakStats.high)
    lines.push(`│ Ratio low/(med+high)    │ ${ratio1.toFixed(2).padStart(11)} │ ${ratio2.toFixed(2).padStart(11)} │`)
  }
  lines.push('└─────────────────────────┴──────────────┴──────────────┘')

  // Peak histogram for both
  lines.push('')
  lines.push('  PEAK HISTOGRAM (both versions):')
  lines.push(sep2)
  const hist1: Record<number, number> = {}
  const hist2: Record<number, number> = {}
  r1.peaks.forEach(p => { hist1[p] = (hist1[p] || 0) + 1 })
  r2.peaks.forEach(p => { hist2[p] = (hist2[p] || 0) + 1 })
  const allPeaks = new Set([...Object.keys(hist1).map(Number), ...Object.keys(hist2).map(Number)])
  const maxHistCount = Math.max(...[...allPeaks].map(p => Math.max(hist1[p] || 0, hist2[p] || 0)), 1)

  for (const p of [...allPeaks].sort((a, b) => a - b)) {
    const c1 = hist1[p] || 0
    const c2 = hist2[p] || 0
    const bar1 = '█'.repeat(Math.round(c1 / maxHistCount * 20))
    const bar2 = '█'.repeat(Math.round(c2 / maxHistCount * 20))
    const label = p <= 3 ? '🟢' : p <= 6 ? '🟡' : '🔴'
    lines.push(`  Peak ${String(p).padStart(2)}: ${label} PURE ${String(c1).padStart(4)} ${bar1.padEnd(20)} │ EMI ${String(c2).padStart(4)} ${bar2}`)
  }

  // ─── EMI ANALYSIS (only for EMI version) ───
  lines.push('')
  lines.push(sep)
  lines.push('  EMI FILTER ANALYSIS (V6.0 + EMI only)')
  lines.push(sep)
  lines.push('')
  lines.push('┌──────────────────────────────────────────────────────────┐')
  lines.push('│ EMI ZONE DISTRIBUTION (bets placed per EMI zone)        │')
  lines.push('├──────────────────┬──────────┬──────────┬────────────────┤')
  lines.push('│ Zone             │ Bets     │ Skipped  │ Avg accuracy   │')

  // Calculate accuracy per zone from emi history
  const zoneBets: Record<string, { bets: number; wins: number }> = {}
  for (const entry of r2.emiStats.emiHistory) {
    const zone = classifyEMI(entry.emi)
    if (!zoneBets[zone]) zoneBets[zone] = { bets: 0, wins: 0 }
    if (entry.action === 'bet') {
      zoneBets[zone].bets++
    }
    if (entry.action === 'bet' && entry.correct !== undefined) {
      if (entry.correct) zoneBets[zone].wins++
    }
  }

  const zones = ['<40%', '40-50%', '50-55%', '55-65%', '65-75%', '>75%']
  const emiZoneSkips: Record<string, number> = { '<40%': 0, '40-50%': 0, '50-55%': 0, '55-65%': 0, '65-75%': 0, '>75%': 0 }
  for (const entry of r2.emiStats.emiHistory) {
    if (entry.action === 'emi_skip') {
      const zone = classifyEMI(entry.emi)
      emiZoneSkips[zone]++
    }
  }

  for (const zone of zones) {
    const betCount = r2.emiStats.zones[zone] || 0
    const skipCount = emiZoneSkips[zone] || 0
    const zb = zoneBets[zone]
    const accStr = zb && zb.bets > 0 ? `${((zb.wins / zb.bets) * 100).toFixed(1)}%` : 'N/A'
    const totalInZone = betCount + skipCount
    lines.push(`│ ${zone.padEnd(16)} │ ${String(betCount).padStart(8)} │ ${String(skipCount).padStart(8)} │ ${accStr.padEnd(14)} │`)
  }
  lines.push('└──────────────────┴──────────┴──────────┴────────────────┘')

  lines.push('')
  lines.push(`  EMI filtered spins (skipped by EMI):  ${r2.emiStats.emiFilteredSpins}`)
  lines.push(`  Would-have-been correct if bet:      ${r2.emiStats.emiFilteredCorrect}`)
  lines.push(`  Would-have-been incorrect if bet:    ${r2.emiStats.emiFilteredIncorrect}`)
  const filteredAcc = (r2.emiStats.emiFilteredCorrect + r2.emiStats.emiFilteredIncorrect) > 0
    ? (r2.emiStats.emiFilteredCorrect / (r2.emiStats.emiFilteredCorrect + r2.emiStats.emiFilteredIncorrect) * 100).toFixed(1) + '%'
    : 'N/A'
  lines.push(`  EMI filtered accuracy (hypothetical): ${filteredAcc}`)
  lines.push(`  EMI avg/min/max: ${r2.emiStats.avgEMI.toFixed(1)}% / ${r2.emiStats.minEMI.toFixed(1)}% / ${r2.emiStats.maxEMI.toFixed(1)}%`)

  // ─── VERDICT ───
  lines.push('')
  lines.push(sep)
  lines.push('  VERDICT')
  lines.push(sep)
  lines.push('')
  const diff = r2.martingale.netResult - r1.martingale.netResult
  const diffSign = diff >= 0 ? '+' : ''
  lines.push(`  V6.0 Pure net:   ${net1sign}${r1.martingale.netResult} units`)
  lines.push(`  V6.0+EMI net:    ${net2sign}${r2.martingale.netResult} units`)
  lines.push(`  Difference:      ${diffSign}${diff} units`)
  lines.push('')
  if (diff > 0) {
    lines.push(`  ✅ EMI FILTER IMPROVES performance by ${diffSign}${diff} units`)
  } else if (diff < 0) {
    lines.push(`  ❌ EMI FILTER HURTS performance by ${diffSign}${Math.abs(diff)} units`)
  } else {
    lines.push(`  ➡️  EMI FILTER has NO EFFECT on performance`)
  }

  lines.push('')
  lines.push(`  Busts: V6.0=${r1.bustCount} vs EMI=${r2.bustCount} (difference: ${r2.bustCount - r1.bustCount})`)
  lines.push(`  Accuracy: V6.0=${r1.accuracy.toFixed(1)}% vs EMI=${r2.accuracy.toFixed(1)}% (difference: ${(r2.accuracy - r1.accuracy).toFixed(1)}%)`)
  lines.push(`  Bets: V6.0=${r1.betted} vs EMI=${r2.betted} (EMI skipped ${r2.skippedByEMI} additional)`)
  lines.push('')

  return lines.join('\n')
}

// ═══ MAIN ═══
const filePath = '/home/z/my-project/download/clean-sequence-3.txt'

if (!fs.existsSync(filePath)) {
  console.error(`Error: File not found: ${filePath}`)
  process.exit(1)
}

const text = fs.readFileSync(filePath, 'utf-8')
const numbers = parseSequence(text)

if (numbers.length < 15) {
  console.error(`Error: Need at least 15 numbers. Found: ${numbers.length}`)
  process.exit(1)
}

console.log(`✅ Sequence loaded: ${numbers.length} numbers`)
console.log(`   First 20: ${numbers.slice(0, 20).join(', ')}`)
console.log(`   Last 10:  ...${numbers.slice(-10).join(', ')}`)
console.log('')
console.log('Running V6.0 Pure simulation...')

const result1 = simulate(numbers, { useEMI: false })

console.log('Running V6.0 + EMI simulation...')
const result2 = simulate(numbers, { useEMI: true })

console.log('')
console.log('Building comparison report...')

const report = printComparison(result1, result2)

// Print to console
console.log(report)

// Save to file
const outputPath = '/home/z/my-project/download/results-seq3-v60-vs-emi.txt'
const header = `Generated: ${new Date().toISOString()}\nSequence: clean-sequence-3.txt (${numbers.length} numbers)\n`
fs.writeFileSync(outputPath, header + report + '\n')
console.log(`\n📁 Results saved to: ${outputPath}`)
