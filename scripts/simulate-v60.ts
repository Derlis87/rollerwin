/**
 * Simulador v6.0 — Engine V6.0 + Post-Loss/Post-Bust Cooldown System
 * 
 * NOVEDADES sobre simulate-v54.ts:
 * 1. COOLDOWN after loss: Skip next 1 spin after any loss (breaks martingala chains)
 * 2. COOLDOWN after bust: Skip next 3 spins after martingala bust (extended recovery)
 * 3. COOLDOWN after green: Skip next 1 spin after green (zero disrupts patterns)
 * 4. Correctly tracks V6.0's SKIP ZONE (streaks 3-6) as skips
 * 5. Detailed cooldown stats
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
  streakBreakdown: Record<number, { total: number; correct: number; accuracy: number; skipped: number }>
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<number, number>; bustCount: number }
  greenCount: number
  recoveryFlips: number
  recoveryCorrectAfterFlip: number
  recoveryIncorrectAfterFlip: number
  cooldownStats: { lossCooldowns: number; bustCooldowns: number; greenCooldowns: number; spinsSkippedByCooldown: number; winsAfterCooldown: number; lossesAfterCooldown: number }
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
  const COOLDOWN_AFTER_LOSS = 1  // v6.0a: Skip 1 spin after loss (breaks martingala chains)
  const COOLDOWN_AFTER_BUST = 3  // Skip 3 spins after bust
  const COOLDOWN_AFTER_GREEN = 1 // Skip 1 spin after green

  const peaks: number[] = []
  let currentPeakHeight = 0
  let correct = 0
  let incorrect = 0
  let totalPredictions = 0
  let totalSkipped = 0
  let skippedByEngine = 0
  let skippedByCooldown = 0
  let totalBetted = 0
  
  // Mode tracking
  const normalMode = { predictions: 0, correct: 0, incorrect: 0, skipped: 0 }
  const softMode = { predictions: 0, correct: 0, incorrect: 0, skipped: 0 }
  const ultraMode = { predictions: 0, correct: 0, incorrect: 0, skipped: 0 }
  const skipZone = { streak3: 0, streak4: 0, streak5: 0, streak6: 0 }
  
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
  
  // Cooldown tracking
  let cooldownRemaining = 0
  let cooldownSource = '' // 'loss', 'bust', 'green'
  const cooldownStats = {
    lossCooldowns: 0,
    bustCooldowns: 0,
    greenCooldowns: 0,
    spinsSkippedByCooldown: 0,
    winsAfterCooldown: 0,
    lossesAfterCooldown: 0,
  }
  
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
    if (streak.length >= 7) mode = 'ultra'
    else if (streak.length >= 3 && streak.length <= 6) mode = 'skipzone'
    else if (streak.length >= 2) mode = 'soft'
    
    // Track streak breakdown (initialize if needed)
    const sKey = streak.length
    if (!streakBreakdown[sKey]) streakBreakdown[sKey] = { total: 0, correct: 0, accuracy: 0, skipped: 0 }
    streakBreakdown[sKey].total++
    
    // Track skip zone
    if (mode === 'skipzone') {
      if (streak.length === 3) skipZone.streak3++
      else if (streak.length === 4) skipZone.streak4++
      else if (streak.length === 5) skipZone.streak5++
      else if (streak.length === 6) skipZone.streak6++
    }
    
    // ═══ v6.0: COOLDOWN SYSTEM ═══
    if (cooldownRemaining > 0) {
      cooldownRemaining--
      skippedByCooldown++
      totalSkipped++
      cooldownStats.spinsSkippedByCooldown++
      
      // Track mode skips
      if (mode === 'normal') normalMode.skipped++
      else if (mode === 'soft') softMode.skipped++
      else if (mode === 'ultra') ultraMode.skipped++
      
      streakBreakdown[sKey].skipped++
      
      // Track green
      if (actualColor === 'green') greenCount++
      
      continue
    }
    
    // ═══ v6.0: Handle shouldSkip from engine ═══
    if (shouldSkip) {
      skippedByEngine++
      totalSkipped++
      skipSignalStrengthSum += signalStrength
      
      // Track mode skips
      if (mode === 'normal') normalMode.skipped++
      else if (mode === 'soft') softMode.skipped++
      else if (mode === 'ultra') ultraMode.skipped++
      
      streakBreakdown[sKey].skipped++
      
      // v6.0a: Engine skip RESETS martingala (prevents bust accumulation)
      martingaleStep = 0
      
      if (actualColor === 'green') greenCount++
      
      continue
    }
    
    // ═══ This is a BETTED spin ═══
    totalBetted++
    bettedSignalStrengthSum += signalStrength
    
    // Track mode stats
    if (mode === 'normal') normalMode.predictions++
    else if (mode === 'soft') softMode.predictions++
    else if (mode === 'ultra') ultraMode.predictions++
    
    // Track if this is first bet after cooldown
    const isAfterCooldown = cooldownSource !== ''
    cooldownSource = ''
    
    // Check if green (zero)
    if (actualColor === 'green') {
      greenCount++
      // Green is a loss for martingale
      martTotalBet += martingaleBets[Math.min(martingaleStep, 2)]
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      
      // Check for bust
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
        cooldownStats.bustCooldowns++
      } else {
        // Green loss → short cooldown
        cooldownRemaining = COOLDOWN_AFTER_GREEN
        cooldownSource = 'green'
        cooldownStats.greenCooldowns++
      }
      
      recordPredictionFeedback(false, ['markov'], predictedColor)
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
      else if (mode === 'ultra') ultraMode.correct++
      
      // Track after cooldown
      if (isAfterCooldown) cooldownStats.winsAfterCooldown++
      
      // Martingale: win — 1:1 payout means you get 2× your bet back
      martTotalBet += martingaleBets[martingaleStep]
      martTotalWin += martingaleBets[martingaleStep] * 2  // FIXED: 1:1 payout = 2× return
      
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
      else if (mode === 'ultra') ultraMode.incorrect++
      
      // Track after cooldown
      if (isAfterCooldown) cooldownStats.lossesAfterCooldown++
      
      // Martingale: loss
      martTotalBet += martingaleBets[martingaleStep]
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      
      // Martingale bust
      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
        cooldownStats.bustCooldowns++
      } else {
        // v6.0: Cooldown after loss (non-bust)
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
  }
}

function printResults(result: SimResult) {
  console.log('\n' + '═'.repeat(65))
  console.log('  SIMULACIÓN SMART PREDICTION v6.0 (ULTRA-SELECTIVE + COOLDOWN)')
  console.log('═'.repeat(65))
  
  console.log(`\n📊 DATOS GENERALES:`)
  console.log(`   Números totales:     ${result.totalNumbers}`)
  console.log(`   Total predicciones:   ${result.totalPredictions}`)
  console.log(`   SKIPPED total:        ${result.skipped} (${(result.skipped/result.totalPredictions*100).toFixed(1)}%) 🔵`)
  console.log(`     ↳ Por motor:        ${result.skippedByEngine} 🔵`)
  console.log(`     ↳ Por cooldown:     ${result.skippedByCooldown} 🟡`)
  console.log(`   APOSTADAS:            ${result.betted} (${(result.betted/result.totalPredictions*100).toFixed(1)}%) 🎯`)
  console.log(`   Correctas:            ${result.correct} ✅`)
  console.log(`   Incorrectas:          ${result.incorrect} ❌`)
  console.log(`   Accuracy (apostadas): ${result.accuracy.toFixed(1)}%`)
  console.log(`   Verdes (cero):        ${result.greenCount} 🟢`)
  
  console.log(`\n🚫 SKIP ZONE (streaks 3-6 — sin edge demostrado):`)
  console.log(`   Streak 3:  ${result.skipZone.streak3} skipeados`)
  console.log(`   Streak 4:  ${result.skipZone.streak4} skipeados`)
  console.log(`   Streak 5:  ${result.skipZone.streak5} skipeados`)
  console.log(`   Streak 6:  ${result.skipZone.streak6} skipeados`)
  console.log(`   Total:     ${result.skipZone.streak3 + result.skipZone.streak4 + result.skipZone.streak5 + result.skipZone.streak6}`)
  
  console.log(`\n❄️ COOLDOWN SYSTEM:`)
  console.log(`   Cooldowns por pérdida:  ${result.cooldownStats.lossCooldowns} → ${result.cooldownStats.lossCooldowns} spins skipeados`)
  console.log(`   Cooldowns por bust:     ${result.cooldownStats.bustCooldowns} → ${result.cooldownStats.bustCooldowns * 3} spins skipeados`)
  console.log(`   Cooldowns por verde:    ${result.cooldownStats.greenCooldowns} → ${result.cooldownStats.greenCooldowns} spins skipeados`)
  console.log(`   Total spins por cooldown: ${result.cooldownStats.spinsSkippedByCooldown}`)
  console.log(`   Wins después de cooldown: ${result.cooldownStats.winsAfterCooldown}`)
  console.log(`   Losses después de cooldown: ${result.cooldownStats.lossesAfterCooldown}`)
  
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
  console.log(`   (Bust = 3 pérdidas seguidas apostadas, skip+cooldown NO rompe cadena)`)
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
  console.log(`   SOFT (streak 2):      ${result.softMode.predictions} bet | ${result.softMode.skipped} skip | ${result.softMode.correct}✅ ${result.softMode.incorrect}❌ | ${result.softMode.accuracy.toFixed(1)}%`)
  console.log(`   ULTRA (streak 7+):    ${result.ultraMode.predictions} bet | ${result.ultraMode.skipped} skip | ${result.ultraMode.correct}✅ ${result.ultraMode.incorrect}❌ | ${result.ultraMode.accuracy.toFixed(1)}%`)
  
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
  console.log('Uso: npx tsx scripts/simulate-v60.ts <archivo_con_secuencia.txt>')
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
