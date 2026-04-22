/**
 * Simulador v5.1 — Prueba el motor de predicción spin-by-spin
 * 
 * Uso: npx tsx scripts/simulate-v51.ts <archivo_con_secuencia.txt>
 * 
 * El archivo debe contener números de ruleta separados por comas, espacios o newlines.
 * 
 * Ejemplo: echo "14,32,5,0,18,7,25,3" > sequence.txt && npx tsx scripts/simulate-v51.ts sequence.txt
 */

import { generateSmartPrediction, recordPredictionFeedback } from '../src/lib/smart-prediction-v4'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

function parseSequence(text: string): number[] {
  // Support comma, space, newline, semicolon, pipe separated
  return text
    .split(/[,\s;\n\r|]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n) && n >= 0 && n <= 36)
}

interface SimResult {
  totalNumbers: number
  totalPredictions: number
  correct: number
  incorrect: number
  accuracy: number
  peaks: number[]
  peakStats: { low: number; medium: number; high: number }
  maxPeak: number
  // Mode breakdown
  normalMode: { predictions: number; correct: number; incorrect: number; accuracy: number }
  softMode: { predictions: number; correct: number; incorrect: number; accuracy: number }
  ultraMode: { predictions: number; correct: number; incorrect: number; accuracy: number }
  // Streak breakdown - when engine was on a losing streak, how did it do?
  streakBreakdown: Record<number, { total: number; correct: number; accuracy: number }>
  // Martingale simulation (3-step: 1→2→4)
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number }
  // Worst peak details
  worstPeaks: Array<{ startIdx: number; height: number; numbers: number[]; predictions: string[]; mode: string }>
  // Green (zero) impact
  greenCount: number
  greenAfterCorrect: number
  greenAfterIncorrect: number
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

function simulate(numbers: number[]): SimResult {
  const MIN_HISTORY = 10 // Need at least 10 numbers before first prediction
  const peaks: number[] = []
  let currentPeakHeight = 0
  let correct = 0
  let incorrect = 0
  let totalPredictions = 0
  
  // Mode tracking
  const normalMode = { predictions: 0, correct: 0, incorrect: 0 }
  const softMode = { predictions: 0, correct: 0, incorrect: 0 }
  const ultraMode = { predictions: 0, correct: 0, incorrect: 0 }
  
  // Streak breakdown: for each streak length, track accuracy
  const streakBreakdown: Record<number, { total: number; correct: number; accuracy: number }> = {}
  
  // Martingale tracking (3-step: bet 1, if lose bet 2, if lose bet 4, then reset)
  let martingaleStep = 0 // 0=first bet, 1=second, 2=third
  const martingaleBets = [1, 2, 4]
  let martTotalBet = 0
  let martTotalWin = 0
  
  // Track worst peaks (peaks >= 5)
  const worstPeakCandidates: Array<{ startIdx: number; height: number; numbers: number[]; predictions: string[]; mode: string }> = []
  let currentWorstStart = -1
  let currentWorstNumbers: number[] = []
  let currentWorstPredictions: string[] = []
  let currentWorstMode = ''
  
  // Green tracking
  let greenCount = 0
  let greenAfterCorrect = 0
  let greenAfterIncorrect = 0
  let lastWasCorrect = true
  
  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]
    
    // Generate prediction
    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue
    
    const predictedColor = pred.bestValue
    const actualColor = getNumberColor(nextNumber)
    
    // Determine mode
    const streak = getStreakAtEnd(history)
    let mode = 'normal'
    if (streak.length >= 6) mode = 'ultra'
    else if (streak.length >= 2) mode = 'soft'
    
    totalPredictions++
    
    // Track mode stats
    if (mode === 'normal') normalMode.predictions++
    else if (mode === 'soft') softMode.predictions++
    else ultraMode.predictions++
    
    // Track streak breakdown
    const sKey = streak.length
    if (!streakBreakdown[sKey]) streakBreakdown[sKey] = { total: 0, correct: 0, accuracy: 0 }
    streakBreakdown[sKey].total++
    
    // Check if green (zero)
    if (actualColor === 'green') {
      greenCount++
      if (lastWasCorrect) greenAfterCorrect++
      else greenAfterIncorrect++
      // Green doesn't count as correct or incorrect for peaks
      // But it does count for martingale (it's a loss)
      martingaleStep++
      martTotalBet += martingaleBets[Math.min(martingaleStep - 1, 2)]
      if (martingaleStep >= 3) martingaleStep = 0 // Reset after 3 losses
      continue
    }
    
    const isCorrect = predictedColor === actualColor
    
    // Track streak breakdown accuracy
    if (isCorrect) streakBreakdown[sKey].correct++
    
    // Record feedback for adaptive weights
    recordPredictionFeedback(isCorrect, ['markov'])
    
    if (isCorrect) {
      correct++
      if (mode === 'normal') normalMode.correct++
      else if (mode === 'soft') softMode.correct++
      else ultraMode.correct++
      
      // Martingale: win
      martTotalBet += martingaleBets[martingaleStep]
      martTotalWin += martingaleBets[martingaleStep] // 1:1 payout
      martingaleStep = 0
      
      // Peak complete
      peaks.push(currentPeakHeight + 1) // +1 because the correct prediction ends the peak
      if (currentPeakHeight >= 4) {
        worstPeakCandidates.push({
          startIdx: currentWorstStart,
          height: currentPeakHeight + 1,
          numbers: [...currentWorstNumbers, nextNumber],
          predictions: [...currentWorstPredictions, predictedColor],
          mode: currentWorstMode
        })
      }
      currentPeakHeight = 0
      currentWorstStart = -1
      currentWorstNumbers = []
      currentWorstPredictions = []
      currentWorstMode = ''
      lastWasCorrect = true
    } else {
      incorrect++
      if (mode === 'normal') normalMode.incorrect++
      else if (mode === 'soft') softMode.incorrect++
      else ultraMode.incorrect++
      
      // Martingale: loss
      martTotalBet += martingaleBets[martingaleStep]
      martingaleStep++
      if (martingaleStep >= 3) martingaleStep = 0 // Reset after 3 losses
      
      currentPeakHeight++
      if (currentWorstStart === -1) {
        currentWorstStart = i - MIN_HISTORY
        currentWorstMode = mode
      }
      currentWorstNumbers.push(nextNumber)
      currentWorstPredictions.push(predictedColor)
      lastWasCorrect = false
    }
  }
  
  // If there's an unfinished peak at the end
  if (currentPeakHeight > 0) {
    peaks.push(currentPeakHeight)
    worstPeakCandidates.push({
      startIdx: currentWorstStart,
      height: currentPeakHeight,
      numbers: currentWorstNumbers,
      predictions: currentWorstPredictions,
      mode: currentWorstMode
    })
  }
  
  // Calculate stats
  const low = peaks.filter(p => p >= 1 && p <= 3).length
  const medium = peaks.filter(p => p >= 4 && p <= 6).length
  const high = peaks.filter(p => p >= 7).length
  const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0
  
  // Mode accuracies
  normalMode.accuracy = normalMode.predictions > 0 ? (normalMode.correct / normalMode.predictions) * 100 : 0
  softMode.accuracy = softMode.predictions > 0 ? (softMode.correct / softMode.predictions) * 100 : 0
  ultraMode.accuracy = ultraMode.predictions > 0 ? (ultraMode.correct / ultraMode.predictions) * 100 : 0
  
  // Streak breakdown accuracy
  for (const key of Object.keys(streakBreakdown)) {
    const s = streakBreakdown[parseInt(key)]
    s.accuracy = s.total > 0 ? (s.correct / s.total) * 100 : 0
  }
  
  // Sort worst peaks by height desc
  const worstPeaks = worstPeakCandidates.sort((a, b) => b.height - a.height).slice(0, 10)
  
  const martNet = martTotalWin - martTotalBet
  const martRoi = martTotalBet > 0 ? (martNet / martTotalBet) * 100 : 0
  
  return {
    totalNumbers: numbers.length,
    totalPredictions,
    correct,
    incorrect,
    accuracy: totalPredictions > 0 ? (correct / totalPredictions) * 100 : 0,
    peaks,
    peakStats: { low, medium, high },
    maxPeak,
    normalMode,
    softMode,
    ultraMode,
    streakBreakdown,
    martingale: { totalBet: martTotalBet, totalWin: martTotalWin, netResult: martNet, roi: martRoi },
    worstPeaks,
    greenCount,
    greenAfterCorrect,
    greenAfterIncorrect
  }
}

function printResults(result: SimResult) {
  console.log('\n' + '═'.repeat(60))
  console.log('  SIMULACIÓN SMART PREDICTION v5.1')
  console.log('═'.repeat(60))
  
  console.log(`\n📊 DATOS GENERALES:`)
  console.log(`   Números totales:     ${result.totalNumbers}`)
  console.log(`   Predicciones:         ${result.totalPredictions}`)
  console.log(`   Correctas:            ${result.correct} ✅`)
  console.log(`   Incorrectas:          ${result.incorrect} ❌`)
  console.log(`   Accuracy global:      ${result.accuracy.toFixed(1)}%`)
  console.log(`   Verdes (cero):        ${result.greenCount} 🟢`)
  
  console.log(`\n📈 PICOS (Peak History):`)
  console.log(`   Total picos:          ${result.peaks.length}`)
  console.log(`   Bajos (1-3):          ${result.peakStats.low} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.low / result.peaks.length * 100)))}`)
  console.log(`   Medios (4-6):         ${result.peakStats.medium} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.medium / result.peaks.length * 100)))}`)
  console.log(`   Altos (7+):           ${result.peakStats.high} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.high / result.peaks.length * 100)))}`)
  console.log(`   Pico máximo:          ${result.maxPeak}`)
  
  if (result.peaks.length > 0) {
    const avg = result.peaks.reduce((a, b) => a + b, 0) / result.peaks.length
    console.log(`   Promedio:             ${avg.toFixed(2)}`)
  }
  
  // Peak distribution histogram
  const hist: Record<number, number> = {}
  result.peaks.forEach(p => { hist[p] = (hist[p] || 0) + 1 })
  console.log(`\n   Distribución de picos:`)
  const maxHist = Math.max(...Object.values(hist))
  for (let i = 1; i <= Math.min(result.maxPeak, 15); i++) {
    const count = hist[i] || 0
    if (count > 0) {
      const bar = '█'.repeat(Math.round(count / maxHist * 25))
      const pct = (count / result.peaks.length * 100).toFixed(1)
      const label = i <= 3 ? '🟢' : i <= 6 ? '🟡' : '🔴'
      console.log(`   Pico ${String(i).padStart(2)}: ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar} ${label}`)
    }
  }
  
  console.log(`\n🎯 RENDIMIENTO POR MODO:`)
  console.log(`   NORMAL (streak 0-1):  ${result.normalMode.predictions} pred | ${result.normalMode.correct}✅ ${result.normalMode.incorrect}❌ | ${result.normalMode.accuracy.toFixed(1)}%`)
  console.log(`   SOFT (streak 2-5):    ${result.softMode.predictions} pred | ${result.softMode.correct}✅ ${result.softMode.incorrect}❌ | ${result.softMode.accuracy.toFixed(1)}%`)
  console.log(`   ULTRA (streak 6+):    ${result.ultraMode.predictions} pred | ${result.ultraMode.correct}✅ ${result.ultraMode.incorrect}❌ | ${result.ultraMode.accuracy.toFixed(1)}%`)
  
  console.log(`\n🔀 ACCURACY POR STREAK ACTIVO:`)
  for (const [streak, data] of Object.entries(result.streakBreakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const s = parseInt(streak)
    const mode = s >= 6 ? 'ULTRA' : s >= 2 ? 'SOFT' : 'NORMAL'
    const label = s === 0 ? '(sin racha)' : s === 1 ? '(streak 1)' : `(streak ${s})`
    console.log(`   Streak ${String(s).padStart(2)} ${label.padStart(14)} [${mode.padEnd(5)}]: ${String(data.correct).padStart(4)}✅/${String(data.total).padStart(4)} = ${data.accuracy.toFixed(1).padStart(5)}%`)
  }
  
  console.log(`\n💰 MARTINGALA (3-step: 1→2→4):`)
  console.log(`   Total apostado:       ${result.martingale.totalBet} unidades`)
  console.log(`   Total ganado:         ${result.martingale.totalWin} unidades`)
  console.log(`   Resultado neto:       ${result.martingale.netResult >= 0 ? '+' : ''}${result.martingale.netResult} unidades`)
  console.log(`   ROI:                  ${result.martingale.roi.toFixed(2)}%`)
  
  // Profitability analysis
  console.log(`\n📊 ANÁLISIS DE RENTABILIDAD:`)
  const ratio = result.peakStats.low / Math.max(1, result.peakStats.medium + result.peakStats.high)
  console.log(`   Ratio bajos/(med+alt): ${ratio.toFixed(2)}:1`)
  console.log(`   Break-even necesario:  7.0:1 (cada pico bajo gana +1, cada pico med+alt pierde -7)`)
  console.log(`   Estado:                ${ratio >= 7 ? '✅ RENTABLE' : '❌ NO RENTABLE (necesita ' + (7 * (result.peakStats.medium + result.peakStats.high) - result.peakStats.low).toFixed(0) + ' más picos bajos para break-even)'}`)
  
  if (result.worstPeaks.length > 0) {
    console.log(`\n🔴 PEORES PICOS (Top ${result.worstPeaks.length}):`)
    result.worstPeaks.forEach((wp, idx) => {
      const modeLabel = wp.mode === 'ultra' ? 'ULTRA' : wp.mode === 'soft' ? 'SOFT' : 'NORMAL'
      console.log(`   ${idx + 1}. Pico ${wp.height} [${modeLabel}] en posición ${wp.startIdx}:`)
      console.log(`      Números:    ${wp.numbers.join(', ')}`)
      console.log(`      Predicción: ${wp.predictions.join(', ')}`)
      // Show color mapping
      const colors = wp.numbers.map(n => {
        const c = getNumberColor(n)
        return c === 'red' ? 'R' : c === 'black' ? 'N' : 'V'
      })
      const preds = wp.predictions.map(p => p === 'red' ? 'R' : 'N')
      console.log(`      Real/Pred:  ${colors.join(' ')} vs ${preds.join(' ')}`)
    })
  }
  
  console.log('\n' + '═'.repeat(60))
}

// Main
const args = process.argv.slice(2)
if (args.length < 1) {
  console.log('Uso: npx tsx scripts/simulate-v51.ts <archivo_con_secuencia.txt>')
  console.log('')
  console.log('El archivo debe contener números de ruleta (0-36) separados por:')
  console.log('  comas, espacios, newlines, punto y coma, o pipes')
  console.log('')
  console.log('Ejemplo:')
  console.log('  echo "14,32,5,0,18,7,25,3,12,36" > sequence.txt')
  console.log('  npx tsx scripts/simulate-v51.ts sequence.txt')
  process.exit(1)
}

const fs = require('fs')
const filePath = args[0]
if (!fs.existsSync(filePath)) {
  console.error(`Error: Archivo no encontrado: ${filePath}`)
  process.exit(1)
}

const text = fs.readFileSync(filePath, 'utf-8')
const numbers = parseSequence(text)

if (numbers.length < 15) {
  console.error(`Error: Se necesitan al menos 15 números. Solo se encontraron ${numbers.length}.`)
  process.exit(1)
}

console.log(`✅ Secuencia cargada: ${numbers.length} números`)

// Print first 20 and last 10 for verification
console.log(`   Primeros 20: ${numbers.slice(0, 20).join(', ')}`)
console.log(`   Últimos 10:  ...${numbers.slice(-10).join(', ')}`)

const result = simulate(numbers)
printResults(result)
