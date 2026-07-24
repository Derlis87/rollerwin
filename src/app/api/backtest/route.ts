import { NextRequest, NextResponse } from 'next/server'
import { generateSmartPrediction, recordPredictionFeedback, resetFullEngine } from '@/lib/smart-prediction-v4'

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

interface SimStep {
  index: number
  number: number
  color: 'red' | 'black' | 'green'
  predictedColor: string
  shouldSkip: boolean
  skipReason: string
  mode: string
  streakLength: number
  signalStrength: number
  isCorrect?: boolean
  martingaleStep: number
  martingaleBet: number
  runningNet: number
  balance: number
  peakHeight: number
  cooldownRemaining: number
}

export interface SimResult {
  totalNumbers: number
  totalPredictions: number
  skipped: number
  skippedByEngine: number
  skippedByCooldown: number
  betted: number
  correct: number
  incorrect: number
  accuracy: number
  peaks: number[]
  peakStats: { low: number; medium: number; high: number }
  maxPeak: number
  normalMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  softMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  ultraMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  skipZone: { streak3: number; streak4: number; streak5: number; streak6: number }
  streakBreakdown: Record<string, { total: number; correct: number; accuracy: number; skipped: number }>
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<string, number>; bustCount: number }
  greenCount: number
  recoveryFlips: number
  recoveryCorrectAfterFlip: number
  recoveryIncorrectAfterFlip: number
  cooldownStats: { lossCooldowns: number; bustCooldowns: number; greenCooldowns: number; spinsSkippedByCooldown: number; winsAfterCooldown: number; lossesAfterCooldown: number }
  balanceCurve: number[]
  steps: SimStep[]
  flatBetProfit: number
  peakProfitBreakdown: { low: number; medium: number; high: number; unresolved: number }
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

function simulate(numbers: number[], options?: { cooldownAfterLoss?: number; cooldownAfterBust?: number; cooldownAfterGreen?: number; martingaleBets?: number[] }): SimResult {
  const COOLDOWN_AFTER_LOSS = options?.cooldownAfterLoss ?? 1
  const COOLDOWN_AFTER_BUST = options?.cooldownAfterBust ?? 3
  const COOLDOWN_AFTER_GREEN = options?.cooldownAfterGreen ?? 1
  const martingaleBets = options?.martingaleBets ?? [1, 2, 4]
  const MIN_HISTORY = 10

  const peaks: number[] = []
  let currentPeakHeight = 0
  let correct = 0
  let incorrect = 0
  let totalPredictions = 0
  let totalSkipped = 0
  let skippedByEngine = 0
  let skippedByCooldown = 0
  let totalBetted = 0

  const normalMode: { predictions: number; correct: number; incorrect: number; skipped: number; accuracy: number } = { predictions: 0, correct: 0, incorrect: 0, skipped: 0, accuracy: 0 }
  const softMode: { predictions: number; correct: number; incorrect: number; skipped: number; accuracy: number } = { predictions: 0, correct: 0, incorrect: 0, skipped: 0, accuracy: 0 }
  const ultraMode: { predictions: number; correct: number; incorrect: number; skipped: number; accuracy: number } = { predictions: 0, correct: 0, incorrect: 0, skipped: 0, accuracy: 0 }
  const skipZone = { streak3: 0, streak4: 0, streak5: 0, streak6: 0 }

  const streakBreakdown: Record<string, { total: number; correct: number; accuracy: number; skipped: number }> = {}

  let martingaleStep = 0
  let martTotalBet = 0
  let martTotalWin = 0
  let runningNet = 0

  let rawConsecutiveLoss = 0
  let maxRawConsecutiveLoss = 0
  const rawLossStreaks: Record<string, number> = {}
  let bustCount = 0

  let greenCount = 0

  let recoveryFlips = 0
  let recoveryCorrectAfterFlip = 0
  let recoveryIncorrectAfterFlip = 0
  let lastPrediction = ''
  let flipDetected = false

  let cooldownRemaining = 0
  let cooldownSource = ''
  const cooldownStats = {
    lossCooldowns: 0,
    bustCooldowns: 0,
    greenCooldowns: 0,
    spinsSkippedByCooldown: 0,
    winsAfterCooldown: 0,
    lossesAfterCooldown: 0,
  }

  const steps: SimStep[] = []
  const balanceCurve: number[] = [0]

  resetFullEngine()  // Full reset (accuracyTracker + recovery) for deterministic results

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]

    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue

    totalPredictions++
    const predictedColor = pred.bestValue
    const shouldSkip = pred.shouldSkip === true
    const signalStrength = pred.signalStrength || 0

    if (lastPrediction && predictedColor !== lastPrediction && rawConsecutiveLoss >= 3) {
      recoveryFlips++
      flipDetected = true
    }
    lastPrediction = predictedColor

    const actualColor = getNumberColor(nextNumber)

    const streak = getStreakAtEnd(history)
    let mode = 'normal'
    if (streak.length >= 7) mode = 'ultra'
    else if (streak.length >= 3 && streak.length <= 6) mode = 'skipzone'
    else if (streak.length >= 2) mode = 'soft'

    const sKey = String(streak.length)
    if (!streakBreakdown[sKey]) streakBreakdown[sKey] = { total: 0, correct: 0, accuracy: 0, skipped: 0 }
    streakBreakdown[sKey].total++

    if (mode === 'skipzone') {
      if (streak.length === 3) skipZone.streak3++
      else if (streak.length === 4) skipZone.streak4++
      else if (streak.length === 5) skipZone.streak5++
      else if (streak.length === 6) skipZone.streak6++
    }

    // Cooldown
    if (cooldownRemaining > 0) {
      cooldownRemaining--
      skippedByCooldown++
      totalSkipped++
      cooldownStats.spinsSkippedByCooldown++

      if (mode === 'normal') normalMode.skipped++
      else if (mode === 'soft') softMode.skipped++
      else if (mode === 'ultra') ultraMode.skipped++

      streakBreakdown[sKey].skipped++

      if (actualColor === 'green') greenCount++

      steps.push({
        index: i,
        number: nextNumber,
        color: actualColor,
        predictedColor,
        shouldSkip: true,
        skipReason: `cooldown (${cooldownSource})`,
        mode,
        streakLength: streak.length,
        signalStrength,
        martingaleStep: 0,
        martingaleBet: 0,
        runningNet,
        balance: runningNet,
        peakHeight: currentPeakHeight,
        cooldownRemaining: cooldownRemaining + 1,
      })

      continue
    }

    // Engine skip
    if (shouldSkip) {
      skippedByEngine++
      totalSkipped++

      if (mode === 'normal') normalMode.skipped++
      else if (mode === 'soft') softMode.skipped++
      else if (mode === 'ultra') ultraMode.skipped++

      streakBreakdown[sKey].skipped++
      martingaleStep = 0

      if (actualColor === 'green') greenCount++

      steps.push({
        index: i,
        number: nextNumber,
        color: actualColor,
        predictedColor,
        shouldSkip: true,
        skipReason: 'engine skip',
        mode,
        streakLength: streak.length,
        signalStrength,
        martingaleStep: 0,
        martingaleBet: 0,
        runningNet,
        balance: runningNet,
        peakHeight: currentPeakHeight,
        cooldownRemaining: 0,
      })

      continue
    }

    // BETTED spin
    totalBetted++
    const currentBet = martingaleBets[Math.min(martingaleStep, martingaleBets.length - 1)]

    if (mode === 'normal') normalMode.predictions++
    else if (mode === 'soft') softMode.predictions++
    else if (mode === 'ultra') ultraMode.predictions++

    const isAfterCooldown = cooldownSource !== ''
    cooldownSource = ''

    // Green
    if (actualColor === 'green') {
      greenCount++
      martTotalBet += currentBet
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss

      if (martingaleStep >= martingaleBets.length) {
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

      steps.push({
        index: i,
        number: nextNumber,
        color: actualColor,
        predictedColor,
        shouldSkip: false,
        skipReason: '',
        mode,
        streakLength: streak.length,
        signalStrength,
        isCorrect: false,
        martingaleStep: martingaleStep,
        martingaleBet: currentBet,
        runningNet: runningNet - currentBet,
        balance: runningNet - currentBet,
        peakHeight: currentPeakHeight,
        cooldownRemaining: cooldownRemaining,
      })

      runningNet -= currentBet
      balanceCurve.push(runningNet)
      continue
    }

    const isCorrect = predictedColor === actualColor

    if (isCorrect) streakBreakdown[sKey].correct++

    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)

    if (flipDetected) {
      if (isCorrect) recoveryCorrectAfterFlip++
      else recoveryIncorrectAfterFlip++
      flipDetected = false
    }

    if (isCorrect) {
      correct++
      if (mode === 'normal') normalMode.correct++
      else if (mode === 'soft') softMode.correct++
      else if (mode === 'ultra') ultraMode.correct++

      if (isAfterCooldown) cooldownStats.winsAfterCooldown++

      martTotalBet += currentBet
      const winAmount = currentBet * 2
      martTotalWin += winAmount
      const profit = winAmount - currentBet
      runningNet += profit

      if (rawConsecutiveLoss > 0) {
        rawLossStreaks[String(rawConsecutiveLoss)] = (rawLossStreaks[String(rawConsecutiveLoss)] || 0) + 1
      }

      martingaleStep = 0
      rawConsecutiveLoss = 0

      peaks.push(currentPeakHeight + 1)
      currentPeakHeight = 0

      balanceCurve.push(runningNet)

      steps.push({
        index: i,
        number: nextNumber,
        color: actualColor,
        predictedColor,
        shouldSkip: false,
        skipReason: '',
        mode,
        streakLength: streak.length,
        signalStrength,
        isCorrect: true,
        martingaleStep: 0,
        martingaleBet: currentBet,
        runningNet,
        balance: runningNet,
        peakHeight: 0,
        cooldownRemaining: 0,
      })
    } else {
      incorrect++
      if (mode === 'normal') normalMode.incorrect++
      else if (mode === 'soft') softMode.incorrect++
      else if (mode === 'ultra') ultraMode.incorrect++

      if (isAfterCooldown) cooldownStats.lossesAfterCooldown++

      martTotalBet += currentBet
      runningNet -= currentBet
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss

      if (martingaleStep >= martingaleBets.length) {
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

      balanceCurve.push(runningNet)

      steps.push({
        index: i,
        number: nextNumber,
        color: actualColor,
        predictedColor,
        shouldSkip: false,
        skipReason: '',
        mode,
        streakLength: streak.length,
        signalStrength,
        isCorrect: false,
        martingaleStep,
        martingaleBet: currentBet,
        runningNet,
        balance: runningNet,
        peakHeight: currentPeakHeight,
        cooldownRemaining: cooldownRemaining,
      })
    }
  }

  if (currentPeakHeight > 0) {
    peaks.push(currentPeakHeight)
  }

  if (rawConsecutiveLoss > 0) {
    rawLossStreaks[String(rawConsecutiveLoss)] = (rawLossStreaks[String(rawConsecutiveLoss)] || 0) + 1
  }

  const low = peaks.filter(p => p >= 1 && p <= 3).length
  const medium = peaks.filter(p => p >= 4 && p <= 6).length
  const high = peaks.filter(p => p >= 7).length
  const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0

  normalMode.accuracy = normalMode.predictions > 0 ? (normalMode.correct / normalMode.predictions) * 100 : 0
  softMode.accuracy = softMode.predictions > 0 ? (softMode.correct / softMode.predictions) * 100 : 0
  ultraMode.accuracy = ultraMode.predictions > 0 ? (ultraMode.correct / ultraMode.predictions) * 100 : 0

  for (const key of Object.keys(streakBreakdown)) {
    const s = streakBreakdown[key]
    s.accuracy = s.total > 0 ? (s.correct / s.total) * 100 : 0
  }

  const martNet = martTotalWin - martTotalBet
  const martRoi = martTotalBet > 0 ? (martNet / martTotalBet) * 100 : 0

  const accuracy = totalBetted > 0 ? (correct / totalBetted) * 100 : 0

  // Flat-bet profit: every signal win = +1 unit, every signal loss/green = -1 unit (no martingale)
  // This directly answers "X wins × $5 = $?" without martingale/cooldown complexity
  const flatBetProfit = correct - incorrect - greenCount

  // Peak-based profit breakdown: profit contribution by peak category
  // Low peaks (1-3) are the ones users typically see and count in the calculator
  let peakIdx = 0
  const resolvedPeaks = peaks.filter((_, idx) => idx < correct) // Only resolved peaks (wins)
  let lowProfit = 0
  let mediumProfit = 0
  let highProfit = 0
  for (const peakH of resolvedPeaks) {
    const peakLosses = peakH - 1 // losses before the win
    // With martingale, losses cost more than flat, but for transparency we show flat-equivalent
    const flatCycleProfit = 1 - peakLosses // +1 for win, -1 for each loss in the peak
    if (peakH <= 3) lowProfit += flatCycleProfit
    else if (peakH <= 6) mediumProfit += flatCycleProfit
    else highProfit += flatCycleProfit
  }
  // Unresolved peak (if any) represents pure losses
  const unresolvedLosses = currentPeakHeight > 0 ? currentPeakHeight : 0

  return {
    totalNumbers: numbers.length,
    totalPredictions,
    skipped: totalSkipped,
    skippedByEngine,
    skippedByCooldown,
    betted: totalBetted,
    correct,
    incorrect,
    accuracy,
    peaks,
    peakStats: { low, medium, high },
    maxPeak,
    normalMode,
    softMode,
    ultraMode,
    skipZone,
    streakBreakdown,
    martingale: { totalBet: martTotalBet, totalWin: martTotalWin, netResult: martNet, roi: martRoi, maxConsecutiveLoss: maxRawConsecutiveLoss, lossStreaks: rawLossStreaks, bustCount },
    greenCount,
    recoveryFlips,
    recoveryCorrectAfterFlip,
    recoveryIncorrectAfterFlip,
    cooldownStats,
    balanceCurve,
    steps,
    flatBetProfit,
    peakProfitBreakdown: { low: lowProfit, medium: mediumProfit, high: highProfit, unresolved: -unresolvedLosses },
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sequence, options } = body

    if (!sequence || typeof sequence !== 'string') {
      return NextResponse.json({ error: 'Se requiere una secuencia de numeros (texto)' }, { status: 400 })
    }

    const numbers = parseSequence(sequence)

    if (numbers.length < 15) {
      return NextResponse.json({ error: `Se necesitan al menos 15 numeros. Solo se encontraron ${numbers.length}.` }, { status: 400 })
    }

    if (numbers.length > 20000) {
      return NextResponse.json({ error: 'La secuencia es demasiado larga (maximo 20,000 numeros).' }, { status: 400 })
    }

    const result = simulate(numbers, options)

    // Don't send all steps for sequences > 5000 to keep response size manageable
    const returnSteps = numbers.length > 5000 ? result.steps.slice(0, 1000) : result.steps

    return NextResponse.json({
      ...result,
      steps: returnSteps,
      totalSteps: result.steps.length,
      parsedNumbers: numbers.length,
    })
  } catch (error: any) {
    console.error('Backtest error:', error)
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 })
  }
}
