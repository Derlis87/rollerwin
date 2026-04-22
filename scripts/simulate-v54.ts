/**
 * Simulador v5.4 — Selective Prediction + Skip + Aggressive Recovery
 * 
 * NOVEDADES v5.4:
 * - shouldSkip handling: spins with weak signal are SKIPPED (no bet)
 * - Skip breaks martingala chains (doesn't advance martingale step)
 * - Skip breaks loss streaks (doesn't count as loss)
 * - Recovery at 2 errors (v5.3 was 3)
 * - Skip stats: how many skipped, skip accuracy if we had bet
 * 
 * Uso: npx tsx scripts/simulate-v54.ts <archivo_con_secuencia.txt>
 */

import { generateSmartPrediction, recordPredictionFeedback } from '../src/lib/smart-prediction-v4'

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
  // Streak breakdown
  streakBreakdown: Record<number, { total: number; correct: number; accuracy: number }>
  // Martingale simulation (3-step: 1→2→4)
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<number, number>; bustCount: number }
  // Worst peak details
  worstPeaks: Array<{ startIdx: number; height: number; numbers: number[]; predictions: string[]; mode: string }>
  // Green (zero) impact
  greenCount: number
  greenAfterCorrect: number
  greenAfterIncorrect: number
  // v5.4: Skip tracking
  skippedPredictions: number
  skippedWouldHaveWon: number
  skippedWouldHaveLost: number
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
  
  // Mode tracking
  const normalMode = { predictions: 0, correct: 0, incorrect: 0 }
  const softMode = { predictions: 0, correct: 0, incorrect: 0 }
  const ultraMode = { predictions: 0, correct: 0, incorrect: 0 }
  
  // Streak breakdown
  const streakBreakdown: Record<number, { total: number; correct: number; accuracy: number }> = {}
  
  // Martingale tracking
  let martingaleStep = 0
  const martingaleBets = [1, 2, 4]
  let martTotalBet = 0
  let martTotalWin = 0
  
  // ═══ NEW: Consecutive loss tracking ═══
  // Raw loss streak: ALL consecutive losses (green + wrong), only resets on correct
  let rawConsecutiveLoss = 0
  let maxRawConsecutiveLoss = 0
  const rawLossStreaks: Record<number, number> = {} // {1: count, 2: count, ...}
  let bustCount = 0 // Times martingale hit step 3 (3 consecutive losses = bust)
  
  // Track worst peaks
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
  
  // Recovery tracking
  let recoveryFlips = 0
  let recoveryCorrectAfterFlip = 0
  let recoveryIncorrectAfterFlip = 0
  let lastPrediction = ''
  let flipDetected = false
  
  // v5.4: Skip tracking
  let skippedPredictions = 0
  let skippedWouldHaveWon = 0
  let skippedWouldHaveLost = 0
  
  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]
    
    // Generate prediction
    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue
    
    const predictedColor = pred.bestValue
    
    // ═══ v5.4: SKIP HANDLING ═══
    // When shouldSkip is true, we DON'T bet. This means:
    // - No martingale advance
    // - No rawConsecutiveLoss advance
    // - No mode/streak tracking
    // - But we DO track what would have happened (for analysis)
    if (pred.shouldSkip) {
      skippedPredictions++
      const actualColor = getNumberColor(nextNumber)
      if (actualColor !== 'green') {
        if (predictedColor === actualColor) skippedWouldHaveWon++
        else skippedWouldHaveLost++
      }
      // DON'T feed back to recovery system — skip is neutral
      continue
    }
    
    // Detect recovery flip (v5.4: reverted to 3 errors — 2 was counterproductive)
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
      // Green is a loss for martingale
      martTotalBet += martingaleBets[Math.min(martingaleStep, 2)]
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0 // Martingale resets, but rawConsecutiveLoss continues!
      }
      continue
    }
    
    const isCorrect = predictedColor === actualColor
    
    // Track streak breakdown accuracy
    if (isCorrect) streakBreakdown[sKey].correct++
    
    // Record feedback for adaptive weights
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
      
      // Count the completed raw loss streak (if any)
      if (rawConsecutiveLoss > 0) {
        rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
      }
      
      martingaleStep = 0
      rawConsecutiveLoss = 0
      
      // Peak complete
      peaks.push(currentPeakHeight + 1)
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
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      
      // Martingale bust (3 consecutive losses)
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0 // Martingale resets, but rawConsecutiveLoss continues!
      }
      
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
  
  // Count remaining raw loss streak
  if (rawConsecutiveLoss > 0) {
    rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
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
    martingale: { totalBet: martTotalBet, totalWin: martTotalWin, netResult: martNet, roi: martRoi, maxConsecutiveLoss: maxRawConsecutiveLoss, lossStreaks: rawLossStreaks, bustCount },
    worstPeaks,
    greenCount,
    greenAfterCorrect,
    greenAfterIncorrect,
    recoveryFlips,
    recoveryCorrectAfterFlip,
    recoveryIncorrectAfterFlip,
    skippedPredictions,
    skippedWouldHaveWon,
    skippedWouldHaveLost
  }
}

function printResults(result: SimResult) {
  console.log('\n' + '═'.repeat(65))
  console.log(`  SIMULACIÓN SMART PREDICTION v5.4 — Skip=${result.skippedPredictions}/${result.totalPredictions + result.skippedPredictions}`)
  console.log('═'.repeat(65))
  
  console.log(`\n📊 DATOS GENERALES:`)
  console.log(`   Números totales:     ${result.totalNumbers}`)
  console.log(`   Predicciones:         ${result.totalPredictions} (apostadas)`)
  console.log(`   Skipeadas (SKIP):     ${result.skippedPredictions} (${(result.skippedPredictions / (result.totalPredictions + result.skippedPredictions) * 100).toFixed(1)}%)`)
  console.log(`   Skip habrían ganado:  ${result.skippedWouldHaveWon} (${result.skippedWouldHaveWon + result.skippedWouldHaveLost > 0 ? (result.skippedWouldHaveWon / (result.skippedWouldHaveWon + result.skippedWouldHaveLost) * 100).toFixed(1) : 0}%)`)
  console.log(`   Correctas:            ${result.correct} ✅`)
  console.log(`   Incorrectas:          ${result.incorrect} ❌`)
  console.log(`   Accuracy (apostadas): ${result.accuracy.toFixed(1)}%`)
  console.log(`   Verdes (cero):        ${result.greenCount} 🟢`)
  
  console.log(`\n📈 PICOS (Peak History):`)
  console.log(`   Total picos:          ${result.peaks.length}`)
  console.log(`   Bajos (1-3):          ${result.peakStats.low} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.low / Math.max(1, result.peaks.length) * 100)))}`)
  console.log(`   Medios (4-6):         ${result.peakStats.medium} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.medium / Math.max(1, result.peaks.length) * 100)))}`)
  console.log(`   Altos (7+):           ${result.peakStats.high} ${'█'.repeat(Math.min(30, Math.round(result.peakStats.high / Math.max(1, result.peaks.length) * 100)))}`)
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
  for (let i = 1; i <= Math.min(result.maxPeak, 20); i++) {
    const count = hist[i] || 0
    if (count > 0) {
      const bar = '█'.repeat(Math.round(count / maxHist * 25))
      const pct = (count / result.peaks.length * 100).toFixed(1)
      const label = i <= 3 ? '🟢' : i <= 6 ? '🟡' : '🔴'
      console.log(`   Pico ${String(i).padStart(2)}: ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar} ${label}`)
    }
  }
  
  // ═══ CRITICAL: Consecutive Loss Tracking ═══
  console.log(`\n🚨 RACHAS DE PÉRDIDA REALES (CRÍTICO para Martingala):`)
  console.log(`   Máxima racha pérdidas: ${result.martingale.maxConsecutiveLoss} ${result.martingale.maxConsecutiveLoss > 3 ? '❌ EXCEDE LÍMITE 3' : '✅ DENTRO DEL LÍMITE'}`)
  console.log(`   Martingala busts (3 seg): ${result.martingale.bustCount}`)
  console.log(`   (Bust = 3 pérdidas seguidas, martingala pierde -7 unidades)`)
  console.log(`   Distribución de rachas REALES:`)
  
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
  console.log(`   Rachas ≤3 (OK):       ${safeLosses} (${(safeLosses/totalLossStreaks*100).toFixed(1)}%)`)
  console.log(`   Rachas ≥4 (FATALES):  ${fatalLosses} (${(fatalLosses/totalLossStreaks*100).toFixed(1)}%)`)
  console.log(`   Problema: cada racha ≥4 causa al menos 1 bust (-7 uds) ANTES de que termine`)
  
  console.log(`\n🎯 RENDIMIENTO POR MODO:`)
  console.log(`   NORMAL (streak 0-1):  ${result.normalMode.predictions} pred | ${result.normalMode.correct}✅ ${result.normalMode.incorrect}❌ | ${result.normalMode.accuracy.toFixed(1)}%`)
  console.log(`   SOFT (streak 2-5):    ${result.softMode.predictions} pred | ${result.softMode.correct}✅ ${result.softMode.incorrect}❌ | ${result.softMode.accuracy.toFixed(1)}%`)
  console.log(`   ULTRA (streak 6+):    ${result.ultraMode.predictions} pred | ${result.ultraMode.correct}✅ ${result.ultraMode.incorrect}❌ | ${result.ultraMode.accuracy.toFixed(1)}%`)
  
  console.log(`\n🔀 ACCURACY POR STREAK ACTIVO:`)
  for (const [streak, data] of Object.entries(result.streakBreakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const s = parseInt(streak)
    const mode = s >= 6 ? 'ULTRA' : s >= 2 ? 'SOFT' : 'NORMAL'
    const label = s === 0 ? '(sin racha)' : `(streak ${s})`
    console.log(`   Streak ${String(s).padStart(2)} ${label.padStart(14)} [${mode.padEnd(5)}]: ${String(data.correct).padStart(4)}✅/${String(data.total).padStart(4)} = ${data.accuracy.toFixed(1).padStart(5)}%`)
  }
  
  console.log(`\n💰 MARTINGALA (3-step: 1→2→4):`)
  console.log(`   Total apostado:       ${result.martingale.totalBet} unidades`)
  console.log(`   Total ganado:         ${result.martingale.totalWin} unidades`)
  console.log(`   Resultado neto:       ${result.martingale.netResult >= 0 ? '+' : ''}${result.martingale.netResult} unidades`)
  console.log(`   ROI:                  ${result.martingale.roi.toFixed(2)}%`)
  console.log(`   Busts (3 seguidas):   ${result.martingale.bustCount} → -7 unidades c/u`)
  console.log(`   Costo total busts:    ${result.martingale.bustCount * -7} unidades`)
  
  // Profitability analysis
  console.log(`\n📊 ANÁLISIS DE RENTABILIDAD:`)
  const ratio = result.peakStats.low / Math.max(1, result.peakStats.medium + result.peakStats.high)
  console.log(`   Ratio bajos/(med+alt): ${ratio.toFixed(2)}:1`)
  console.log(`   Break-even necesario:  7.0:1 (cada pico bajo gana +1, cada pico med+alt pierde -7)`)
  console.log(`   Estado:                ${ratio >= 7 ? '✅ RENTABLE' : '❌ NO RENTABLE (necesita ' + Math.max(0, (7 * (result.peakStats.medium + result.peakStats.high) - result.peakStats.low)).toFixed(0) + ' más picos bajos para break-even)'}`)
  
  // Recovery tracking
  console.log(`\n🔄 RECOVERY SYSTEM:`)
  console.log(`   Total flips:          ${result.recoveryFlips}`)
  console.log(`   Correctos post-flip:  ${result.recoveryCorrectAfterFlip} (${result.recoveryFlips > 0 ? (result.recoveryCorrectAfterFlip/result.recoveryFlips*100).toFixed(1) : 0}%)`)
  console.log(`   Incorrectos post-flip:${result.recoveryIncorrectAfterFlip} (${result.recoveryFlips > 0 ? (result.recoveryIncorrectAfterFlip/result.recoveryFlips*100).toFixed(1) : 0}%)`)
  
  if (result.worstPeaks.length > 0) {
    console.log(`\n🔴 PEORES PICOS (Top ${Math.min(result.worstPeaks.length, 5)}):`)
    result.worstPeaks.slice(0, 5).forEach((wp, idx) => {
      const modeLabel = wp.mode === 'ultra' ? 'ULTRA' : wp.mode === 'soft' ? 'SOFT' : 'NORMAL'
      console.log(`   ${idx + 1}. Pico ${wp.height} [${modeLabel}] en posición ${wp.startIdx}:`)
      const colors = wp.numbers.map(n => {
        const c = getNumberColor(n)
        return c === 'red' ? 'R' : c === 'black' ? 'N' : 'V'
      })
      const preds = wp.predictions.map(p => p === 'red' ? 'R' : 'N')
      console.log(`      Real/Pred:  ${colors.join('-')} vs ${preds.join('-')}`)
      console.log(`      Números:    ${wp.numbers.slice(0, 12).join(', ')}${wp.numbers.length > 12 ? '...' : ''}`)
    })
  }
  
  console.log('\n' + '═'.repeat(65))
}

// Main
const args = process.argv.slice(2)
if (args.length < 1) {
  console.log('Uso: npx tsx scripts/simulate-v53.ts <archivo_con_secuencia.txt>')
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
