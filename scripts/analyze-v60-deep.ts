/**
 * ANALIZADOR PROFUNDO v6.0 — Análisis comparativo completo
 * 
 * Dos simulaciones:
 * A) TODAS las predicciones apostadas (sin skips, sin cooldowns)
 *    → Lo que el usuario VE: cada predicción se apuesta
 * B) Con skips y cooldowns (misma lógica que simulate-v60.ts)
 *    → Lo que el motor recomienda: solo apuestas fuertes
 * 
 * + Análisis RAW de cada spin con rachas de error detalladas
 */

import { generateSmartPrediction, resetFullEngine, recordPredictionFeedback } from '../src/lib/smart-prediction-v4'

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

interface RawSpinRecord {
  index: number
  number: number
  predictedColor: string
  actualColor: string
  shouldSkip: boolean
  signalStrength: number
  streakLength: number
  streakColor: string
  mode: string
  isCorrect: boolean
}

interface ErrorStreak {
  startIndex: number
  endIndex: number
  length: number
  predictedColors: string[]
  actualColors: string[]
  streakLevels: number[]
  numbers: number[]
}

interface SimResult {
  label: string
  totalPredictions: number
  skipped: number
  betted: number
  correct: number
  incorrect: number
  accuracy: number
  maxConsecutiveError: number
  errorStreaks: ErrorStreak[]
  modeBreakdown: {
    normal: { predictions: number; correct: number; accuracy: number }
    soft: { predictions: number; correct: number; accuracy: number }
    skipzone: { predictions: number; correct: number; accuracy: number }
    ultra: { predictions: number; correct: number; accuracy: number }
  }
  streakLevelBreakdown: {
    '0-1': { total: number; correct: number; accuracy: number }
    '2': { total: number; correct: number; accuracy: number }
    '3-6': { total: number; correct: number; accuracy: number }
    '7+': { total: number; correct: number; accuracy: number }
  }
  rawSpins: RawSpinRecord[]
}

// ═══════════════════════════════════════════════════════════
// SIMULACIÓN A: TODAS las predicciones apostadas (SIN skips)
// ═══════════════════════════════════════════════════════════
function simulateAllBetted(numbers: number[]): SimResult {
  const MIN_HISTORY = 10
  const rawSpins: RawSpinRecord[] = []
  
  let totalPredictions = 0
  let betted = 0
  let correct = 0
  let incorrect = 0
  
  const modeStats = {
    normal: { predictions: 0, correct: 0 },
    soft: { predictions: 0, correct: 0 },
    skipzone: { predictions: 0, correct: 0 },
    ultra: { predictions: 0, correct: 0 },
  }
  
  const streakLevelStats = {
    '0-1': { total: 0, correct: 0 },
    '2': { total: 0, correct: 0 },
    '3-6': { total: 0, correct: 0 },
    '7+': { total: 0, correct: 0 },
  }
  
  // Track consecutive errors
  let currentErrorStreak: ErrorStreak | null = null
  const allErrorStreaks: ErrorStreak[] = []
  
  // Reset engine for clean deterministic results
  resetFullEngine()
  
  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]
    
    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue
    
    totalPredictions++
    const predictedColor = pred.bestValue
    const actualColor = getNumberColor(nextNumber)
    const isCorrect = predictedColor === actualColor
    const streak = getStreakAtEnd(history)
    
    // Determine mode
    let mode = 'normal'
    if (streak.length >= 7) mode = 'ultra'
    else if (streak.length >= 3 && streak.length <= 6) mode = 'skipzone'
    else if (streak.length >= 2) mode = 'soft'
    
    // Determine streak level bucket
    let streakBucket: '0-1' | '2' | '3-6' | '7+' = '0-1'
    if (streak.length >= 7) streakBucket = '7+'
    else if (streak.length >= 3) streakBucket = '3-6'
    else if (streak.length >= 2) streakBucket = '2'
    
    // ALL predictions are betted (no skips!)
    betted++
    if (isCorrect) correct++
    else incorrect++
    
    modeStats[mode as keyof typeof modeStats].predictions++
    if (isCorrect) modeStats[mode as keyof typeof modeStats].correct++
    
    streakLevelStats[streakBucket].total++
    if (isCorrect) streakLevelStats[streakBucket].correct++
    
    // Record raw spin
    rawSpins.push({
      index: i,
      number: nextNumber,
      predictedColor,
      actualColor,
      shouldSkip: pred.shouldSkip === true,
      signalStrength: pred.signalStrength || 0,
      streakLength: streak.length,
      streakColor: streak.color,
      mode,
      isCorrect,
    })
    
    // Track error streaks
    if (!isCorrect) {
      if (!currentErrorStreak) {
        currentErrorStreak = {
          startIndex: i,
          endIndex: i,
          length: 1,
          predictedColors: [predictedColor],
          actualColors: [actualColor],
          streakLevels: [streak.length],
          numbers: [nextNumber],
        }
      } else {
        currentErrorStreak.endIndex = i
        currentErrorStreak.length++
        currentErrorStreak.predictedColors.push(predictedColor)
        currentErrorStreak.actualColors.push(actualColor)
        currentErrorStreak.streakLevels.push(streak.length)
        currentErrorStreak.numbers.push(nextNumber)
      }
    } else {
      if (currentErrorStreak) {
        allErrorStreaks.push(currentErrorStreak)
        currentErrorStreak = null
      }
    }
    
    // Record feedback (important for engine state)
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)
  }
  
  // Save unfinished error streak
  if (currentErrorStreak) {
    allErrorStreaks.push(currentErrorStreak)
  }
  
  const accuracy = betted > 0 ? (correct / betted) * 100 : 0
  const maxError = allErrorStreaks.length > 0 ? Math.max(...allErrorStreaks.map(s => s.length)) : 0
  
  return {
    label: 'SIMULACIÓN A: TODAS las predicciones apostadas',
    totalPredictions,
    skipped: 0,
    betted,
    correct,
    incorrect,
    accuracy,
    maxConsecutiveError: maxError,
    errorStreaks: allErrorStreaks,
    modeBreakdown: {
      normal: { predictions: modeStats.normal.predictions, correct: modeStats.normal.correct, accuracy: modeStats.normal.predictions > 0 ? (modeStats.normal.correct / modeStats.normal.predictions) * 100 : 0 },
      soft: { predictions: modeStats.soft.predictions, correct: modeStats.soft.correct, accuracy: modeStats.soft.predictions > 0 ? (modeStats.soft.correct / modeStats.soft.predictions) * 100 : 0 },
      skipzone: { predictions: modeStats.skipzone.predictions, correct: modeStats.skipzone.correct, accuracy: modeStats.skipzone.predictions > 0 ? (modeStats.skipzone.correct / modeStats.skipzone.predictions) * 100 : 0 },
      ultra: { predictions: modeStats.ultra.predictions, correct: modeStats.ultra.correct, accuracy: modeStats.ultra.predictions > 0 ? (modeStats.ultra.correct / modeStats.ultra.predictions) * 100 : 0 },
    },
    streakLevelBreakdown: {
      '0-1': { total: streakLevelStats['0-1'].total, correct: streakLevelStats['0-1'].correct, accuracy: streakLevelStats['0-1'].total > 0 ? (streakLevelStats['0-1'].correct / streakLevelStats['0-1'].total) * 100 : 0 },
      '2': { total: streakLevelStats['2'].total, correct: streakLevelStats['2'].correct, accuracy: streakLevelStats['2'].total > 0 ? (streakLevelStats['2'].correct / streakLevelStats['2'].total) * 100 : 0 },
      '3-6': { total: streakLevelStats['3-6'].total, correct: streakLevelStats['3-6'].correct, accuracy: streakLevelStats['3-6'].total > 0 ? (streakLevelStats['3-6'].correct / streakLevelStats['3-6'].total) * 100 : 0 },
      '7+': { total: streakLevelStats['7+'].total, correct: streakLevelStats['7+'].correct, accuracy: streakLevelStats['7+'].total > 0 ? (streakLevelStats['7+'].correct / streakLevelStats['7+'].total) * 100 : 0 },
    },
    rawSpins,
  }
}

// ═══════════════════════════════════════════════════════════
// SIMULACIÓN B: Con skips y cooldowns (misma lógica v6.0)
// ═══════════════════════════════════════════════════════════
function simulateWithSkips(numbers: number[]): SimResult {
  const MIN_HISTORY = 10
  const COOLDOWN_AFTER_LOSS = 1
  const COOLDOWN_AFTER_BUST = 3
  const COOLDOWN_AFTER_GREEN = 1
  
  const rawSpins: RawSpinRecord[] = []
  
  let totalPredictions = 0
  let skipped = 0
  let betted = 0
  let correct = 0
  let incorrect = 0
  
  const modeStats = {
    normal: { predictions: 0, correct: 0 },
    soft: { predictions: 0, correct: 0 },
    skipzone: { predictions: 0, correct: 0 },
    ultra: { predictions: 0, correct: 0 },
  }
  
  const streakLevelStats = {
    '0-1': { total: 0, correct: 0 },
    '2': { total: 0, correct: 0 },
    '3-6': { total: 0, correct: 0 },
    '7+': { total: 0, correct: 0 },
  }
  
  // Track consecutive errors (only for BETTED spins)
  let currentErrorStreak: ErrorStreak | null = null
  const allErrorStreaks: ErrorStreak[] = []
  
  // Martingale + cooldown tracking
  let martingaleStep = 0
  let cooldownRemaining = 0
  let cooldownSource = ''
  
  // Reset engine for clean deterministic results
  resetFullEngine()
  
  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]
    
    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue
    
    totalPredictions++
    const predictedColor = pred.bestValue
    const actualColor = getNumberColor(nextNumber)
    const shouldSkip = pred.shouldSkip === true
    const streak = getStreakAtEnd(history)
    
    // Determine mode
    let mode = 'normal'
    if (streak.length >= 7) mode = 'ultra'
    else if (streak.length >= 3 && streak.length <= 6) mode = 'skipzone'
    else if (streak.length >= 2) mode = 'soft'
    
    // Determine streak level bucket
    let streakBucket: '0-1' | '2' | '3-6' | '7+' = '0-1'
    if (streak.length >= 7) streakBucket = '7+'
    else if (streak.length >= 3) streakBucket = '3-6'
    else if (streak.length >= 2) streakBucket = '2'
    
    // Record raw spin (always, even if skipped)
    rawSpins.push({
      index: i,
      number: nextNumber,
      predictedColor,
      actualColor,
      shouldSkip: shouldSkip || cooldownRemaining > 0,
      signalStrength: pred.signalStrength || 0,
      streakLength: streak.length,
      streakColor: streak.color,
      mode,
      isCorrect: predictedColor === actualColor, // correctness is based on prediction vs actual regardless of skip
    })
    
    // ── COOLDOWN SYSTEM ──
    if (cooldownRemaining > 0) {
      cooldownRemaining--
      skipped++
      // No feedback on cooldown skips? Actually the engine didn't predict this spin
      // so we DON'T record feedback — this keeps engine state clean
      continue
    }
    
    // ── ENGINE SKIP ──
    if (shouldSkip) {
      skipped++
      martingaleStep = 0 // Reset martingala on engine skip
      // Still record feedback since engine made a prediction
      recordPredictionFeedback(predictedColor === actualColor, ['markov'], predictedColor)
      continue
    }
    
    // ── BETTED SPIN ──
    betted++
    const isCorrect = predictedColor === actualColor
    if (isCorrect) correct++
    else incorrect++
    
    modeStats[mode as keyof typeof modeStats].predictions++
    if (isCorrect) modeStats[mode as keyof typeof modeStats].correct++
    
    streakLevelStats[streakBucket].total++
    if (isCorrect) streakLevelStats[streakBucket].correct++
    
    // Track error streaks
    if (!isCorrect) {
      if (!currentErrorStreak) {
        currentErrorStreak = {
          startIndex: i,
          endIndex: i,
          length: 1,
          predictedColors: [predictedColor],
          actualColors: [actualColor],
          streakLevels: [streak.length],
          numbers: [nextNumber],
        }
      } else {
        currentErrorStreak.endIndex = i
        currentErrorStreak.length++
        currentErrorStreak.predictedColors.push(predictedColor)
        currentErrorStreak.actualColors.push(actualColor)
        currentErrorStreak.streakLevels.push(streak.length)
        currentErrorStreak.numbers.push(nextNumber)
      }
    } else {
      if (currentErrorStreak) {
        allErrorStreaks.push(currentErrorStreak)
        currentErrorStreak = null
      }
    }
    
    // Record feedback
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)
    
    // Handle green
    if (actualColor === 'green') {
      martingaleStep++
      if (martingaleStep >= 3) {
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
        martingaleStep = 0
      } else {
        cooldownRemaining = COOLDOWN_AFTER_GREEN
        cooldownSource = 'green'
      }
      continue
    }
    
    if (isCorrect) {
      martingaleStep = 0
    } else {
      martingaleStep++
      if (martingaleStep >= 3) {
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
        martingaleStep = 0
      } else {
        cooldownRemaining = COOLDOWN_AFTER_LOSS
        cooldownSource = 'loss'
      }
    }
  }
  
  // Save unfinished error streak
  if (currentErrorStreak) {
    allErrorStreaks.push(currentErrorStreak)
  }
  
  const accuracy = betted > 0 ? (correct / betted) * 100 : 0
  const maxError = allErrorStreaks.length > 0 ? Math.max(...allErrorStreaks.map(s => s.length)) : 0
  
  return {
    label: 'SIMULACIÓN B: Con skips y cooldowns (v6.0)',
    totalPredictions,
    skipped,
    betted,
    correct,
    incorrect,
    accuracy,
    maxConsecutiveError: maxError,
    errorStreaks: allErrorStreaks,
    modeBreakdown: {
      normal: { predictions: modeStats.normal.predictions, correct: modeStats.normal.correct, accuracy: modeStats.normal.predictions > 0 ? (modeStats.normal.correct / modeStats.normal.predictions) * 100 : 0 },
      soft: { predictions: modeStats.soft.predictions, correct: modeStats.soft.correct, accuracy: modeStats.soft.predictions > 0 ? (modeStats.soft.correct / modeStats.soft.predictions) * 100 : 0 },
      skipzone: { predictions: modeStats.skipzone.predictions, correct: modeStats.skipzone.correct, accuracy: modeStats.skipzone.predictions > 0 ? (modeStats.skipzone.correct / modeStats.skipzone.predictions) * 100 : 0 },
      ultra: { predictions: modeStats.ultra.predictions, correct: modeStats.ultra.correct, accuracy: modeStats.ultra.predictions > 0 ? (modeStats.ultra.correct / modeStats.ultra.predictions) * 100 : 0 },
    },
    streakLevelBreakdown: {
      '0-1': { total: streakLevelStats['0-1'].total, correct: streakLevelStats['0-1'].correct, accuracy: streakLevelStats['0-1'].total > 0 ? (streakLevelStats['0-1'].correct / streakLevelStats['0-1'].total) * 100 : 0 },
      '2': { total: streakLevelStats['2'].total, correct: streakLevelStats['2'].correct, accuracy: streakLevelStats['2'].total > 0 ? (streakLevelStats['2'].correct / streakLevelStats['2'].total) * 100 : 0 },
      '3-6': { total: streakLevelStats['3-6'].total, correct: streakLevelStats['3-6'].correct, accuracy: streakLevelStats['3-6'].total > 0 ? (streakLevelStats['3-6'].correct / streakLevelStats['3-6'].total) * 100 : 0 },
      '7+': { total: streakLevelStats['7+'].total, correct: streakLevelStats['7+'].correct, accuracy: streakLevelStats['7+'].total > 0 ? (streakLevelStats['7+'].correct / streakLevelStats['7+'].total) * 100 : 0 },
    },
    rawSpins,
  }
}

// ═══════════════════════════════════════════════════════════
// OUTPUT FUNCTIONS
// ═══════════════════════════════════════════════════════════

function printSimResult(result: SimResult) {
  console.log('\n' + '═'.repeat(70))
  console.log(`  ${result.label}`)
  console.log('═'.repeat(70))
  
  console.log(`\n📊 DATOS GENERALES:`)
  console.log(`   Total predicciones:  ${result.totalPredictions}`)
  console.log(`   Skipeadas:            ${result.skipped}${result.skipped > 0 ? ` (${(result.skipped/result.totalPredictions*100).toFixed(1)}%)` : ''} ${result.skipped > 0 ? '🔵' : ''}`)
  console.log(`   Apostadas:            ${result.betted} (${(result.betted/result.totalPredictions*100).toFixed(1)}%) 🎯`)
  console.log(`   Correctas:            ${result.correct} ✅`)
  console.log(`   Incorrectas:          ${result.incorrect} ❌`)
  console.log(`   Accuracy:             ${result.accuracy.toFixed(2)}%`)
  
  console.log(`\n🚨 RACHAS DE ERROR:`)
  console.log(`   Máxima racha de errores consecutivos: ${result.maxConsecutiveError}`)
  
  // Error streaks >= 5
  const bigStreaks = result.errorStreaks.filter(s => s.length >= 5).sort((a, b) => b.length - a.length)
  if (bigStreaks.length > 0) {
    console.log(`\n   Rachas de error ≥ 5 (${bigStreaks.length} encontradas):`)
    bigStreaks.forEach((streak, idx) => {
      const numsStr = streak.numbers.join(', ')
      console.log(`   ┌─ #${idx + 1}: ${streak.length} errores seguidos`)
      console.log(`   │  Índice:       ${streak.startIndex} → ${streak.endIndex}`)
      console.log(`   │  Números:      [${numsStr}]`)
      console.log(`   │  Predicciones: [${streak.predictedColors.join(', ')}]`)
      console.log(`   │  Reales:       [${streak.actualColors.join(', ')}]`)
      console.log(`   │  Streak levels:[${streak.streakLevels.join(', ')}]`)
      console.log(`   └─────────────────────────────────────────`)
    })
  } else {
    console.log(`   No se encontraron rachas de error ≥ 5 ✅`)
  }
  
  console.log(`\n🎯 RENDIMIENTO POR MODO:`)
  const md = result.modeBreakdown
  console.log(`   NORMAL (streak 0-1):    ${String(md.normal.predictions).padStart(6)} apostadas | ${md.normal.correct}✅ ${md.normal.predictions - md.normal.correct}❌ | ${md.normal.accuracy.toFixed(1)}%`)
  console.log(`   SOFT (streak 2):        ${String(md.soft.predictions).padStart(6)} apostadas | ${md.soft.correct}✅ ${md.soft.predictions - md.soft.correct}❌ | ${md.soft.accuracy.toFixed(1)}%`)
  console.log(`   SKIPZONE (streak 3-6):  ${String(md.skipzone.predictions).padStart(6)} apostadas | ${md.skipzone.correct}✅ ${md.skipzone.predictions - md.skipzone.correct}❌ | ${md.skipzone.accuracy.toFixed(1)}%`)
  console.log(`   ULTRA (streak 7+):      ${String(md.ultra.predictions).padStart(6)} apostadas | ${md.ultra.correct}✅ ${md.ultra.predictions - md.ultra.correct}❌ | ${md.ultra.accuracy.toFixed(1)}%`)
  
  console.log(`\n📈 DESGLOSE POR NIVEL DE STREAK:`)
  const sb = result.streakLevelBreakdown
  console.log(`   Streak 0-1:  ${String(sb['0-1'].total).padStart(6)} total | ${sb['0-1'].correct}✅ | ${sb['0-1'].accuracy.toFixed(1)}%`)
  console.log(`   Streak 2:    ${String(sb['2'].total).padStart(6)} total | ${sb['2'].correct}✅ | ${sb['2'].accuracy.toFixed(1)}%`)
  console.log(`   Streak 3-6:  ${String(sb['3-6'].total).padStart(6)} total | ${sb['3-6'].correct}✅ | ${sb['3-6'].accuracy.toFixed(1)}%`)
  console.log(`   Streak 7+:   ${String(sb['7+'].total).padStart(6)} total | ${sb['7+'].correct}✅ | ${sb['7+'].accuracy.toFixed(1)}%`)
}

function printRawPredictionAnalysis(resultA: SimResult) {
  console.log('\n' + '═'.repeat(70))
  console.log('  🔬 ANÁLISIS RAW DE PREDICCIONES (Simulación A — todas apostadas)')
  console.log('═'.repeat(70))
  
  const spins = resultA.rawSpins
  
  // Top 10 longest consecutive error streaks
  const errorStreaks = resultA.errorStreaks.sort((a, b) => b.length - a.length).slice(0, 10)
  
  console.log(`\n🏆 TOP 10 RACHAS DE ERROR MÁS LARGAS:`)
  console.log('─'.repeat(70))
  
  errorStreaks.forEach((streak, idx) => {
    const predSummary = streak.predictedColors.map((c, i) => 
      `${c === streak.predictedColors[i] ? 'R' : 'N'}@${streak.streakLevels[i]}`
    ).join(' → ')
    
    const numsStr = streak.numbers.map(n => {
      const color = getNumberColor(n)
      return `${n}${color === 'red' ? 'R' : color === 'black' ? 'N' : 'V'}`
    }).join(', ')
    
    const bar = '█'.repeat(streak.length) + '░'.repeat(Math.max(0, 20 - streak.length))
    
    console.log(`\n   #${String(idx + 1).padStart(2)} │ ${bar} │ ${streak.length} errores`)
    console.log(`       │ Índice:     ${streak.startIndex} → ${streak.endIndex} (${streak.endIndex - streak.startIndex + 1} spins)`)
    console.log(`       │ Números:    [${numsStr}]`)
    console.log(`       │ Predichos:  [${streak.predictedColors.join(', ')}]`)
    console.log(`       │ Reales:     [${streak.actualColors.join(', ')}]`)
    console.log(`       │ Streak lvl: [${streak.streakLevels.join(', ')}]`)
  })
  
  if (errorStreaks.length === 0) {
    console.log('   No se encontraron rachas de error.')
  }
  
  // Distribution of error streak lengths
  console.log('\n\n📊 DISTRIBUCIÓN DE RACHAS DE ERROR (todas las longitudes):')
  console.log('─'.repeat(70))
  const streakLengthCounts: Record<number, number> = {}
  resultA.errorStreaks.forEach(s => {
    streakLengthCounts[s.length] = (streakLengthCounts[s.length] || 0) + 1
  })
  const totalStreaks = resultA.errorStreaks.length
  for (let len = 1; len <= 20; len++) {
    const count = streakLengthCounts[len] || 0
    if (count > 0) {
      const pct = (count / totalStreaks * 100).toFixed(1)
      const bar = '█'.repeat(Math.min(40, Math.round(count / totalStreaks * 40)))
      const label = len <= 2 ? '🟢' : len <= 4 ? '🟡' : '🔴'
      console.log(`   ${String(len).padStart(2)} error${len > 1 ? 'es' : ' '}: ${String(count).padStart(5)} (${pct.padStart(6)}%) ${bar} ${label}`)
    }
  }
  
  // Stats summary
  const avgStreakLen = totalStreaks > 0 ? resultA.errorStreaks.reduce((a, s) => a + s.length, 0) / totalStreaks : 0
  const fatalStreaks = resultA.errorStreaks.filter(s => s.length >= 4).length
  const safeStreaks = resultA.errorStreaks.filter(s => s.length <= 3).length
  
  console.log(`\n   ────────────────────────────────────`)
  console.log(`   Total rachas de error:   ${totalStreaks}`)
  console.log(`   Promedio longitud:       ${avgStreakLen.toFixed(2)}`)
  console.log(`   Seguras (≤3):            ${safeStreaks} (${totalStreaks > 0 ? (safeStreaks/totalStreaks*100).toFixed(1) : 0}%)`)
  console.log(`   Fatales (≥4):            ${fatalStreaks} (${totalStreaks > 0 ? (fatalStreaks/totalStreaks*100).toFixed(1) : 0}%)`)
}

function printComparison(resultA: SimResult, resultB: SimResult) {
  console.log('\n' + '═'.repeat(70))
  console.log('  ⚖️  COMPARACIÓN: A (todas) vs B (con skips)')
  console.log('═'.repeat(70))
  
  console.log(`\n{'Metrica':<25} {'Sim A (Todas)':<22} {'Sim B (Skips)':<22} {'Diferencia':<15}`)
  console.log('─'.repeat(85))
  
  const row = (label: string, a: string, b: string) => {
    const diff = parseFloat(a) - parseFloat(b)
    const diffStr = diff > 0 ? `+${diff.toFixed(1)}` : diff < 0 ? diff.toFixed(1) : '0.0'
    console.log(`   ${label.padEnd(25)} ${a.padStart(20)} ${b.padStart(20)} ${diffStr.padStart(13)}`)
  }
  
  row('Total predicciones', String(resultA.totalPredictions), String(resultB.totalPredictions))
  row('Skipeadas', String(resultA.skipped), String(resultB.skipped))
  row('Apostadas', String(resultA.betted), String(resultB.betted))
  row('Correctas', String(resultA.correct), String(resultB.correct))
  row('Incorrectas', String(resultA.incorrect), String(resultB.incorrect))
  row('Accuracy (%)', resultA.accuracy.toFixed(2), resultB.accuracy.toFixed(2))
  row('Max racha error', String(resultA.maxConsecutiveError), String(resultB.maxConsecutiveError))
  row('Rachas ≥ 5', String(resultA.errorStreaks.filter(s => s.length >= 5).length), String(resultB.errorStreaks.filter(s => s.length >= 5).length))
  
  console.log('\n   RENDIMIENTO POR MODO:')
  row('  NORMAL (%)', resultA.modeBreakdown.normal.accuracy.toFixed(1), resultB.modeBreakdown.normal.accuracy.toFixed(1))
  row('  SOFT (%)', resultA.modeBreakdown.soft.accuracy.toFixed(1), resultB.modeBreakdown.soft.accuracy.toFixed(1))
  row('  SKIPZONE (%)', resultA.modeBreakdown.skipzone.accuracy.toFixed(1), resultB.modeBreakdown.skipzone.accuracy.toFixed(1))
  row('  ULTRA (%)', resultA.modeBreakdown.ultra.accuracy.toFixed(1), resultB.modeBreakdown.ultra.accuracy.toFixed(1))
  
  console.log('\n   POR NIVEL DE STREAK:')
  row('  Streak 0-1 (%)', resultA.streakLevelBreakdown['0-1'].accuracy.toFixed(1), resultB.streakLevelBreakdown['0-1'].accuracy.toFixed(1))
  row('  Streak 2 (%)', resultA.streakLevelBreakdown['2'].accuracy.toFixed(1), resultB.streakLevelBreakdown['2'].accuracy.toFixed(1))
  row('  Streak 3-6 (%)', resultA.streakLevelBreakdown['3-6'].accuracy.toFixed(1), resultB.streakLevelBreakdown['3-6'].accuracy.toFixed(1))
  row('  Streak 7+ (%)', resultA.streakLevelBreakdown['7+'].accuracy.toFixed(1), resultB.streakLevelBreakdown['7+'].accuracy.toFixed(1))
  
  // Impact analysis
  console.log('\n💡 ANÁLISIS DE IMPACTO:')
  const fewerBets = resultA.betted - resultB.betted
  const accDiff = resultB.accuracy - resultA.accuracy
  const maxErrorDiff = resultA.maxConsecutiveError - resultB.maxConsecutiveError
  
  console.log(`   Al skipear ${resultB.skipped} predicciones (${(resultB.skipped/resultB.totalPredictions*100).toFixed(1)}%):`)
  console.log(`   → Se redujeron ${fewerBets} apuestas (${(fewerBets/resultA.betted*100).toFixed(1)}% menos volumen)`)
  console.log(`   → Accuracy cambió ${accDiff >= 0 ? '+' : ''}${accDiff.toFixed(2)}%`)
  console.log(`   → Max racha de error cambió en ${maxErrorDiff >= 0 ? '+' : ''}${maxErrorDiff}`)
  
  const aFatal5 = resultA.errorStreaks.filter(s => s.length >= 5).length
  const bFatal5 = resultB.errorStreaks.filter(s => s.length >= 5).length
  const aFatal4 = resultA.errorStreaks.filter(s => s.length >= 4).length
  const bFatal4 = resultB.errorStreaks.filter(s => s.length >= 4).length
  console.log(`   → Rachas ≥4 errores: ${aFatal4} → ${bFatal4} (Δ ${aFatal4 - bFatal4})`)
  console.log(`   → Rachas ≥5 errores: ${aFatal5} → ${bFatal5} (Δ ${aFatal5 - bFatal5})`)
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

const args = process.argv.slice(2)
if (args.length < 1) {
  console.log('Uso: npx tsx scripts/analyze-v60-deep.ts <archivo_con_secuencia.txt>')
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

console.log('╔' + '═'.repeat(68) + '╗')
console.log('║' + '  ANALIZADOR PROFUNDO v6.0 — SMART PREDICTION ENGINE'.padStart(68) + '║')
console.log('║' + '  Análisis comparativo: Todas las apuestas vs Selectivo'.padStart(68) + '║')
console.log('╚' + '═'.repeat(68) + '╝')

console.log(`\n✅ Secuencia cargada: ${numbers.length} números`)
console.log(`   Primeros 20: ${numbers.slice(0, 20).join(', ')}`)
console.log(`   Últimos 10:  ...${numbers.slice(-10).join(', ')}`)

// Color distribution
const colorCounts = { red: 0, black: 0, green: 0 }
numbers.forEach(n => {
  const c = getNumberColor(n)
  colorCounts[c]++
})
console.log(`\n📊 Distribución de colores en la secuencia:`)
console.log(`   Rojos:   ${colorCounts.red} (${(colorCounts.red/numbers.length*100).toFixed(1)}%)`)
console.log(`   Negros:  ${colorCounts.black} (${(colorCounts.black/numbers.length*100).toFixed(1)}%)`)
console.log(`   Verdes:  ${colorCounts.green} (${(colorCounts.green/numbers.length*100).toFixed(1)}%)`)

// Run Simulation A
console.log(`\n\n${'▶'.repeat(35)}`)
console.log(`  Ejecutando SIMULACIÓN A: TODAS las predicciones apostadas...`)
console.log(`${'▶'.repeat(35)}`)
const resultA = simulateAllBetted(numbers)

// Run Simulation B
console.log(`\n\n${'▶'.repeat(35)}`)
console.log(`  Ejecutando SIMULACIÓN B: Con skips y cooldowns...`)
console.log(`${'▶'.repeat(35)}`)
const resultB = simulateWithSkips(numbers)

// Print results
printSimResult(resultA)
printSimResult(resultB)
printComparison(resultA, resultB)
printRawPredictionAnalysis(resultA)

console.log('\n' + '═'.repeat(70))
console.log('  ✅ ANÁLISIS COMPLETADO')
console.log('═'.repeat(70))
