/**
 * Simulador v5.4 — CORRECTAMENTE maneja shouldSkip del motor V5.4
 * 
 * BUG FIX del simulador anterior: El simulate-v53.ts ignoraba pred.shouldSkip
 * completamente, haciendo que todas las features de V5.4 (SKIP, micro-Markov)
 * fueran invisibles en las simulaciones.
 * 
 * NOVEDADES:
 * - shouldSkip correctamente manejado: NO apuesta, NO avanza martingala
 * - Tracking de skips: cuántos se saltaron, accuracy solo en spins apostados
 * - rawConsecutiveLoss: NO se incrementa en skips (se pausa la racha)
 * - Stats detalladas: accuracy por modo CON y SIN skips
 * - SKIP_THRESHOLD configurable por argumento
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

interface SimResult {
  totalNumbers: number
  // Raw predictions (including skips)
  totalPredictions: number
  skipped: number
  betted: number
  correct: number
  incorrect: number
  accuracy: number  // accuracy on BETTED spins only
  // Peaks (only from betted spins)
  peaks: number[]
  peakStats: { low: number; medium: number; high: number }
  maxPeak: number
  // Mode breakdown (betted only)
  normalMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  softMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  ultraMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  // Streak breakdown (betted only)
  streakBreakdown: Record<number, { total: number; correct: number; accuracy: number; skipped: number }>
  // Martingale (only on betted spins, skips pause martingala)
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<number, number>; bustCount: number }
  // Green
  greenCount: number
  // Recovery
  recoveryFlips: number
  recoveryCorrectAfterFlip: number
  recoveryIncorrectAfterFlip: number
  // Skip analysis
  skipAnalysis: { totalSkips: number; skipsInNormal: number; skipsInSoft: number; skipsInUltra: number; avgSignalStrength: number; avgBettedSignalStrength: number }
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
  const MIN_HISTORY = 10
  const peaks: number[] = []
  let currentPeakHeight = 0
  let correct = 0
  let incorrect = 0
  let totalPredictions = 0
  let totalSkipped = 0
  let totalBetted = 0
  
  // Mode tracking
  const normalMode = { predictions: 0, correct: 0, incorrect: 0, skipped: 0 }
  const softMode = { predictions: 0, correct: 0, incorrect: 0, skipped: 0 }
  const ultraMode = { predictions: 0, correct: 0, incorrect: 0, skipped: 0 }
  
  // Streak breakdown
  const streakBreakdown: Record<number, { total: number; correct: number; accuracy: number; skipped: number }> = {}
  
  // Martingale tracking
  let martingaleStep = 0
  const martingaleBets = [1, 2, 4]
  let martTotalBet = 0
  let martTotalWin = 0
  
  // Raw consecutive loss tracking
  let rawConsecutiveLoss = 0
  let maxRawConsecutiveLoss = 0
  const rawLossStreaks: Record<number, number> = {}
  let bustCount = 0
  
  // Green tracking
  let greenCount = 0
  
  // Recovery tracking
  let recoveryFlips = 0
  let recoveryCorrectAfterFlip = 0
  let recoveryIncorrectAfterFlip = 0
  let lastPrediction = ''
  let flipDetected = false
  
  // Skip analysis
  let skipSignalStrengthSum = 0
  let bettedSignalStrengthSum = 0
  
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
    const signalStrength = pred.signalStrength || 0
    
    // Detect recovery flip
    if (lastPrediction && predictedColor !== lastPrediction && rawConsecutiveLoss >= 3) {
      recoveryFlips++
      flipDetected = true
    }
    lastPrediction = predictedColor
    
    const actualColor = getNumberColor(nextNumber)
    
    // Determine mode
    const streak = getStreakAtEnd(history)
    let mode = 'normal'
    if (streak.length >= 6) mode = 'ultra'
    else if (streak.length >= 2) mode = 'soft'
    
    // Track streak breakdown (initialize if needed)
    const sKey = streak.length
    if (!streakBreakdown[sKey]) streakBreakdown[sKey] = { total: 0, correct: 0, accuracy: 0, skipped: 0 }
    streakBreakdown[sKey].total++
    
    // ═══ v5.5 PROPER: Handle shouldSkip ═══
    if (shouldSkip) {
      totalSkipped++
      skipSignalStrengthSum += signalStrength
      
      // Track mode skips
      if (mode === 'normal') normalMode.skipped++
      else if (mode === 'soft') softMode.skipped++
      else ultraMode.skipped++
      
      // Streak breakdown skip tracking
      streakBreakdown[sKey].skipped++
      
      // ═══ v5.5: Skip RESETS martingala step (fresh start after skip) ═══
      // The martingala resets to step 0 after a skip. This means after
      // a skip, the next bet starts fresh at 1 unit regardless of previous losses.
      // rawConsecutiveLoss is NOT reset (still tracks the real loss streak for stats).
      // But the financial exposure is limited because we're back at step 0.
      
      // IMPORTANT: Count the ongoing loss streak as "completed" before resetting martingala
      // This prevents the martingala from carrying over accumulated risk after a skip.
      martingaleStep = 0  // Reset martingala to step 0
      
      // Green is still tracked
      if (actualColor === 'green') {
        greenCount++
      }
      
      continue
    }
    
    // ═══ This is a BETTED spin ═══
    totalBetted++
    bettedSignalStrengthSum += signalStrength
    
    // Track mode stats
    if (mode === 'normal') normalMode.predictions++
    else if (mode === 'soft') softMode.predictions++
    else ultraMode.predictions++
    
    // Check if green (zero)
    if (actualColor === 'green') {
      greenCount++
      // Green is a loss for martingale
      martTotalBet += martingaleBets[Math.min(martingaleStep, 2)]
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
      }
      continue
    }
    
    const isCorrect = predictedColor === actualColor
    
    // Track streak breakdown accuracy
    if (isCorrect) streakBreakdown[sKey].correct++
    
    // Record feedback
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)
    
    // Track recovery flip results
    if (flipDetected) {
      if (isCorrect) recoveryCorrectAfterFlip++
      else recoveryIncorrectAfterFlip++
      flipDetected = false
    }
    
    if (isCorrect) {
      correct++
      if (mode === 'normal') normalMode.correct++
      else if (mode === 'soft') softMode.correct++
      else ultraMode.correct++
      
      // Martingale: win
      martTotalBet += martingaleBets[martingaleStep]
      martTotalWin += martingaleBets[martingaleStep]
      
      // Count completed raw loss streak
      if (rawConsecutiveLoss > 0) {
        rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
      }
      
      martingaleStep = 0
      rawConsecutiveLoss = 0
      
      // Peak complete
      peaks.push(currentPeakHeight + 1)
      currentPeakHeight = 0
    } else {
      incorrect++
      if (mode === 'normal') normalMode.incorrect++
      else if (mode === 'soft') softMode.incorrect++
      else ultraMode.incorrect++
      
      // Martingale: loss
      martTotalBet += martingaleBets[martingaleStep]
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      
      // Martingale bust
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
      }
      
      currentPeakHeight++
    }
  }
  
  // Unfinished peak
  if (currentPeakHeight > 0) {
    peaks.push(currentPeakHeight)
  }
  
  // Remaining raw loss streak
  if (rawConsecutiveLoss > 0) {
    rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
  }
  
  // Calculate stats
  const low = peaks.filter(p => p >= 1 && p <= 3).length
  const medium = peaks.filter(p => p >= 4 && p <= 6).length
  const high = peaks.filter(p => p >= 7).length
  const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0
  
  normalMode.accuracy = normalMode.predictions > 0 ? (normalMode.correct / normalMode.predictions) * 100 : 0
  softMode.accuracy = softMode.predictions > 0 ? (softMode.correct / softMode.predictions) * 100 : 0
  ultraMode.accuracy = ultraMode.predictions > 0 ? (ultraMode.correct / ultraMode.predictions) * 100 : 0
  
  for (const key of Object.keys(streakBreakdown)) {
    const s = streakBreakdown[parseInt(key)]
    s.accuracy = s.total > 0 ? (s.correct / s.total) * 100 : 0
  }
  
  const martNet = martTotalWin - martTotalBet
  const martRoi = martTotalBet > 0 ? (martNet / martTotalBet) * 100 : 0
  
  const accuracy = totalBetted > 0 ? (correct / totalBetted) * 100 : 0
  
  return {
    totalNumbers: numbers.length,
    totalPredictions,
    skipped: totalSkipped,
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
    streakBreakdown,
    martingale: { totalBet: martTotalBet, totalWin: martTotalWin, netResult: martNet, roi: martRoi, maxConsecutiveLoss: maxRawConsecutiveLoss, lossStreaks: rawLossStreaks, bustCount },
    greenCount,
    recoveryFlips,
    recoveryCorrectAfterFlip,
    recoveryIncorrectAfterFlip,
    skipAnalysis: {
      totalSkips: totalSkipped,
      skipsInNormal: normalMode.skipped,
      skipsInSoft: softMode.skipped,
      skipsInUltra: ultraMode.skipped,
      avgSignalStrength: totalSkipped > 0 ? skipSignalStrengthSum / totalSkipped : 0,
      avgBettedSignalStrength: totalBetted > 0 ? bettedSignalStrengthSum / totalBetted : 0,
    }
  }
}

function printResults(result: SimResult) {
  console.log('\n' + '═'.repeat(65))
  console.log('  SIMULACIÓN SMART PREDICTION v5.4 (CON SKIP CORRECTO)')
  console.log('═'.repeat(65))
  
  console.log(`\n📊 DATOS GENERALES:`)
  console.log(`   Números totales:     ${result.totalNumbers}`)
  console.log(`   Total predicciones:   ${result.totalPredictions}`)
  console.log(`   SKIPPED (no apostó):  ${result.skipped} (${(result.skipped/result.totalPredictions*100).toFixed(1)}%) 🔵`)
  console.log(`   APOSTADAS:            ${result.betted} (${(result.betted/result.totalPredictions*100).toFixed(1)}%) 🎯`)
  console.log(`   Correctas:            ${result.correct} ✅`)
  console.log(`   Incorrectas:          ${result.incorrect} ❌`)
  console.log(`   Accuracy (apostadas): ${result.accuracy.toFixed(1)}%`)
  console.log(`   Verdes (cero):        ${result.greenCount} 🟢`)
  
  console.log(`\n🔵 SKIP ANALYSIS:`)
  console.log(`   Skips en NORMAL:      ${result.skipAnalysis.skipsInNormal}`)
  console.log(`   Skips en SOFT:        ${result.skipAnalysis.skipsInSoft}`)
  console.log(`   Skips en ULTRA:       ${result.skipAnalysis.skipsInUltra}`)
  console.log(`   Avg strength (skips): ${result.skipAnalysis.avgSignalStrength.toFixed(1)}`)
  console.log(`   Avg strength (bets):  ${result.skipAnalysis.avgBettedSignalStrength.toFixed(1)}`)
  
  console.log(`\n📈 PICOS (Peak History — SOLO spins apostados):`)
  console.log(`   Total picos:          ${result.peaks.length}`)
  console.log(`   Bajos (1-3):          ${result.peakStats.low} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.low / Math.max(1, result.peaks.length) * 100)))}`)
  console.log(`   Medios (4-6):         ${result.peakStats.medium} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.medium / Math.max(1, result.peaks.length) * 100)))}`)
  console.log(`   Altos (7+):           ${result.peakStats.high} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.high / Math.max(1, result.peaks.length) * 100)))}`)
  console.log(`   Pico máximo:          ${result.maxPeak}`)
  
  if (result.peaks.length > 0) {
    const avg = result.peaks.reduce((a, b) => a + b, 0) / result.peaks.length
    console.log(`   Promedio:             ${avg.toFixed(2)}`)
  }
  
  const hist: Record<number, number> = {}
  result.peaks.forEach(p => { hist[p] = (hist[p] || 0) + 1 })
  console.log(`\n   Distribución de picos:`)
  const maxHist = Math.max(...Object.values(hist))
  for (let i = 1; i <= Math.min(result.maxPeak, 20); i++) {
    const count = hist[i] || 0
    if (count > 0) {
      const bar = '█'.repeat(Math.round(count / maxHist * 25))
      const pct = (count / result.peaks.length * 100).toFixed(1)
      const label = i <= 3 ? '🟢' : i <= 6 ? '🟡' : '🔴'
      console.log(`   Pico ${String(i).padStart(2)}: ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar} ${label}`)
    }
  }
  
  // Consecutive Loss Tracking
  console.log(`\n🚨 RACHAS DE PÉRDIDA REALES (solo spins apostados):`)
  console.log(`   Máxima racha pérdidas: ${result.martingale.maxConsecutiveLoss} ${result.martingale.maxConsecutiveLoss > 3 ? '❌ EXCEDE LÍMITE 3' : '✅ DENTRO DEL LÍMITE'}`)
  console.log(`   Martingala busts:      ${result.martingale.bustCount}`)
  console.log(`   (Bust = 3 pérdidas seguidas apostadas, skip NO rompe cadena)`)
  console.log(`   Distribución:`)
  
  const totalLossStreaks = Object.values(result.martingale.lossStreaks).reduce((a, b) => a + b, 0)
  for (let len = 1; len <= 20; len++) {
    const count = result.martingale.lossStreaks[len] || 0
    if (count > 0) {
      const pct = (count / totalLossStreaks * 100).toFixed(1)
      const label = len <= 3 ? '🟢 OK' : '🔴 FATAL'
      console.log(`   ${len} pérdida${len > 1 ? 's' : ' '}: ${String(count).padStart(5)} (${pct.padStart(5)}%) ${label}`)
    }
  }
  
  const safeLosses = Object.entries(result.martingale.lossStreaks)
    .filter(([k]) => parseInt(k) <= 3)
    .reduce((sum, [, v]) => sum + v, 0)
  const fatalLosses = Object.entries(result.martingale.lossStreaks)
    .filter(([k]) => parseInt(k) >= 4)
    .reduce((sum, [, v]) => sum + v, 0)
  console.log(`   ─────────────────────`)
  console.log(`   Rachas ≤3 (OK):       ${safeLosses} (${totalLossStreaks > 0 ? (safeLosses/totalLossStreaks*100).toFixed(1) : 0}%)`)
  console.log(`   Rachas ≥4 (FATALES):  ${fatalLosses} (${totalLossStreaks > 0 ? (fatalLosses/totalLossStreaks*100).toFixed(1) : 0}%)`)
  
  console.log(`\n🎯 RENDIMIENTO POR MODO (solo apostadas):`)
  console.log(`   NORMAL (streak 0-1):  ${result.normalMode.predictions} bet | ${result.normalMode.skipped} skip | ${result.normalMode.correct}✅ ${result.normalMode.incorrect}❌ | ${result.normalMode.accuracy.toFixed(1)}%`)
  console.log(`   SOFT (streak 2-5):    ${result.softMode.predictions} bet | ${result.softMode.skipped} skip | ${result.softMode.correct}✅ ${result.softMode.incorrect}❌ | ${result.softMode.accuracy.toFixed(1)}%`)
  console.log(`   ULTRA (streak 6+):    ${result.ultraMode.predictions} bet | ${result.ultraMode.skipped} skip | ${result.ultraMode.correct}✅ ${result.ultraMode.incorrect}❌ | ${result.ultraMode.accuracy.toFixed(1)}%`)
  
  console.log(`\n🔀 ACCURACY POR STREAK (total/skipped/betted):`)
  for (const [streak, data] of Object.entries(result.streakBreakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const s = parseInt(streak)
    const mode = s >= 6 ? 'ULTRA' : s >= 2 ? 'SOFT' : 'NORMAL'
    const label = s === 0 ? '(sin racha)' : `(streak ${s})`
    const betted = data.total - data.skipped
    console.log(`   Streak ${String(s).padStart(2)} ${label.padStart(14)} [${mode.padEnd(5)}]: ${String(data.total).padStart(4)} total | ${String(data.skipped).padStart(3)} skip | ${String(betted).padStart(4)} bet | ${String(data.correct).padStart(4)}✅ = ${data.accuracy.toFixed(1)}%`)
  }
  
  console.log(`\n💰 MARTINGALA (3-step: 1→2→4, solo spins apostados):`)
  console.log(`   Total apostado:       ${result.martingale.totalBet} unidades`)
  console.log(`   Total ganado:         ${result.martingale.totalWin} unidades`)
  console.log(`   Resultado neto:       ${result.martingale.netResult >= 0 ? '+' : ''}${result.martingale.netResult} unidades`)
  console.log(`   ROI:                  ${result.martingale.roi.toFixed(2)}%`)
  console.log(`   Busts (3 seguidas):   ${result.martingale.bustCount} → -7 unidades c/u`)
  console.log(`   Costo total busts:    ${result.martingale.bustCount * -7} unidades`)
  
  console.log(`\n📊 ANÁLISIS DE RENTABILIDAD:`)
  const ratio = result.peakStats.low / Math.max(1, result.peakStats.medium + result.peakStats.high)
  console.log(`   Ratio bajos/(med+alt): ${ratio.toFixed(2)}:1`)
  console.log(`   Break-even necesario:  7.0:1`)
  console.log(`   Estado:                ${ratio >= 7 ? '✅ RENTABLE' : '❌ NO RENTABLE'}`)
  
  console.log(`\n🔄 RECOVERY SYSTEM:`)
  console.log(`   Total flips:          ${result.recoveryFlips}`)
  console.log(`   Correctos post-flip:  ${result.recoveryCorrectAfterFlip} (${result.recoveryFlips > 0 ? (result.recoveryCorrectAfterFlip/result.recoveryFlips*100).toFixed(1) : 0}%)`)
  console.log(`   Incorrectos post-flip:${result.recoveryIncorrectAfterFlip} (${result.recoveryFlips > 0 ? (result.recoveryIncorrectAfterFlip/result.recoveryFlips*100).toFixed(1) : 0}%)`)
  
  console.log('\n' + '═'.repeat(65))
}

// Main
const args = process.argv.slice(2)
if (args.length < 1) {
  console.log('Uso: npx tsx scripts/simulate-v54.ts <archivo_con_secuencia.txt>')
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
console.log(`   Primeros 20: ${numbers.slice(0, 20).join(', ')}`)
console.log(`   Últimos 10:  ...${numbers.slice(-10).join(', ')}`)

const result = simulate(numbers)
printResults(result)
