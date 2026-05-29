/**
 * Simulate betting on ALL predictions (ignoring shouldSkip) — for comparison
 */
import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory } from '../src/lib/smart-prediction-v4'

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

function simulate(numbers: number[]) {
  const MIN_HISTORY = 10
  resetRecoveryHistory()

  let correct = 0
  let incorrect = 0
  let totalPredictions = 0
  let greenCount = 0

  // Martingale tracking
  let martingaleStep = 0
  const martingaleBets = [1, 2, 4]
  let martTotalBet = 0
  let martTotalWin = 0
  let bustCount = 0
  let maxConsecutiveLoss = 0
  let currentLoss = 0
  const lossStreaks: Record<number, number> = {}

  // Error streak tracking
  let currentErrorStreak = 0
  let maxErrorStreak = 0
  const errorStreaks: Record<number, number> = {}

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]

    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue

    totalPredictions++
    const predictedColor = pred.bestValue
    const actualColor = getNumberColor(nextNumber)

    if (actualColor === 'green') {
      greenCount++
      // Green = loss for color bet
      martTotalBet += martingaleBets[Math.min(martingaleStep, 2)]
      martingaleStep++
      currentLoss++
      currentErrorStreak++
      if (currentLoss > maxConsecutiveLoss) maxConsecutiveLoss = currentLoss
      if (currentErrorStreak > maxErrorStreak) maxErrorStreak = currentErrorStreak

      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        lossStreaks[currentLoss] = (lossStreaks[currentLoss] || 0) + 1
        currentLoss = 0
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
      martingaleStep = 0
      if (currentLoss > 0) {
        lossStreaks[currentLoss] = (lossStreaks[currentLoss] || 0) + 1
      }
      if (currentErrorStreak > 0) {
        errorStreaks[currentErrorStreak] = (errorStreaks[currentErrorStreak] || 0) + 1
      }
      currentLoss = 0
      currentErrorStreak = 0
    } else {
      incorrect++
      martTotalBet += martingaleBets[martingaleStep]
      martingaleStep++
      currentLoss++
      currentErrorStreak++
      if (currentLoss > maxConsecutiveLoss) maxConsecutiveLoss = currentLoss
      if (currentErrorStreak > maxErrorStreak) maxErrorStreak = currentErrorStreak

      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        lossStreaks[currentLoss] = (lossStreaks[currentLoss] || 0) + 1
        currentLoss = 0
      }
    }
  }

  // Remaining streaks
  if (currentLoss > 0) lossStreaks[currentLoss] = (lossStreaks[currentLoss] || 0) + 1
  if (currentErrorStreak > 0) errorStreaks[currentErrorStreak] = (errorStreaks[currentErrorStreak] || 0) + 1

  const netResult = martTotalWin - martTotalBet
  const roi = martTotalBet > 0 ? (netResult / martTotalBet) * 100 : 0
  const accuracy = totalPredictions > 0 ? (correct / totalPredictions) * 100 : 0

  return {
    totalNumbers: numbers.length,
    totalPredictions,
    correct,
    incorrect,
    greenCount,
    accuracy,
    martTotalBet,
    martTotalWin,
    netResult,
    roi,
    bustCount,
    maxConsecutiveLoss,
    maxErrorStreak,
    lossStreaks,
    errorStreaks,
  }
}

const fs = require('fs')
const args = process.argv.slice(2)
if (args.length < 1) {
  console.log('Usage: npx tsx scripts/simulate-betall.ts <sequence_file>')
  process.exit(1)
}

const text = fs.readFileSync(args[0], 'utf-8')
const numbers = parseSequence(text)
console.log(`Sequence loaded: ${numbers.length} numbers`)

const r = simulate(numbers)

console.log('\n' + '='.repeat(60))
console.log('  SIMULACION: APOSTAR TODAS LAS PREDICCIONES (SIN SKIP)')
console.log('='.repeat(60))
console.log(`\nTotal predicciones:  ${r.totalPredictions}`)
console.log(`Correctas:          ${r.correct} (${r.accuracy.toFixed(1)}%)`)
console.log(`Incorrectas:        ${r.incorrect}`)
console.log(`Verdes (cero):      ${r.greenCount}`)
console.log(`\nMax racha errores:  ${r.maxErrorStreak}`)
console.log(`Max racha perdidas (martingala): ${r.maxConsecutiveLoss}`)
console.log(`Martingala busts:   ${r.bustCount}`)
console.log(`\nTotal apostado:     ${r.martTotalBet} unidades`)
console.log(`Total ganado:       ${r.martTotalWin} unidades`)
console.log(`Neto:               ${r.netResult >= 0 ? '+' : ''}${r.netResult} unidades`)
console.log(`ROI:                ${r.roi.toFixed(2)}%`)

console.log(`\nDistribucion de rachas de error:`)
for (let len = 1; len <= r.maxErrorStreak; len++) {
  const count = r.errorStreaks[len] || 0
  if (count > 0) {
    console.log(`  ${len} error(es): ${count}`)
  }
}

console.log(`\nDistribucion de rachas de perdida (martingala):`)
for (let len = 1; len <= Math.max(r.maxConsecutiveLoss, 3); len++) {
  const count = r.lossStreaks[len] || 0
  if (count > 0) {
    console.log(`  ${len} perdida(s): ${count}${len >= 4 ? ' FATAL' : ''}`)
  }
}
console.log('='.repeat(60))
