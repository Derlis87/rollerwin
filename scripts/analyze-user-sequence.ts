/**
 * ANÁLISIS COMPLETO — SECUENCIA MANUAL DEL USUARIO
 * 
 * Two simulations:
 *   A) ALL predictions bet (what user SEES — no skips, no cooldowns)
 *   B) With skips + cooldowns (engine V6.0 as designed)
 */

import { generateSmartPrediction, recordPredictionFeedback, resetFullEngine, resetRecoveryHistory } from '../src/lib/smart-prediction-v4'
import * as fs from 'fs'

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

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

type ModeName = 'NORMAL' | 'SOFT' | 'SKIPZONE' | 'ULTRA'

function getMode(streakLen: number): ModeName {
  if (streakLen >= 7) return 'ULTRA'
  if (streakLen >= 3) return 'SKIPZONE'
  if (streakLen >= 2) return 'SOFT'
  return 'NORMAL'
}

function colorLabel(c: string): string {
  return c === 'red' ? 'R' : 'N'
}

// ═══════════════════════════════════════════════════════════════
// SIMULATION A: ALL predictions bet (no skips, no cooldowns)
// ═══════════════════════════════════════════════════════════════

interface SimAEntry {
  spinIndex: number
  predicted: string
  actual: string
  correct: boolean
  mode: ModeName
  streakLen: number
}

interface SimAResult {
  total: number
  correct: number
  incorrect: number
  accuracy: number
  maxErrorStreak: number
  errorStreaks: Array<{
    length: number
    startSpin: number
    endSpin: number
    entries: SimAEntry[]
  }>
  allErrorStreaks: Array<{
    length: number
    startSpin: number
    endSpin: number
    entries: SimAEntry[]
  }>
  modeStats: Record<ModeName, { bet: number; correct: number; incorrect: number; accuracy: number }>
}

function simulateA(numbers: number[]): SimAResult {
  const MIN_HISTORY = 10

  // Reset engine for deterministic results
  resetFullEngine()

  const entries: SimAEntry[] = []

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]

    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue

    const predictedColor = pred.bestValue
    const actualColor = getNumberColor(nextNumber)

    // Record feedback regardless
    const isCorrect = predictedColor === actualColor && actualColor !== 'green'
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)

    const streak = getStreakAtEnd(history)
    const mode = getMode(streak.length)

    entries.push({
      spinIndex: i,
      predicted: predictedColor,
      actual: actualColor === 'green' ? 'green' : actualColor,
      correct: isCorrect,
      mode,
      streakLen: streak.length,
    })
  }

  // Calculate error streaks
  const errorStreaks: SimAResult['errorStreaks'] = []
  const allErrorStreaks: SimAResult['allErrorStreaks'] = []
  let currentErrorStreak: SimAEntry[] = []

  for (const entry of entries) {
    if (!entry.correct) {
      currentErrorStreak.push(entry)
    } else {
      if (currentErrorStreak.length > 0) {
        const streak = {
          length: currentErrorStreak.length,
          startSpin: currentErrorStreak[0].spinIndex,
          endSpin: currentErrorStreak[currentErrorStreak.length - 1].spinIndex,
          entries: [...currentErrorStreak],
        }
        allErrorStreaks.push(streak)
        if (streak.length >= 5) {
          errorStreaks.push(streak)
        }
        currentErrorStreak = []
      }
    }
  }
  // Unfinished streak
  if (currentErrorStreak.length > 0) {
    const streak = {
      length: currentErrorStreak.length,
      startSpin: currentErrorStreak[0].spinIndex,
      endSpin: currentErrorStreak[currentErrorStreak.length - 1].spinIndex,
      entries: [...currentErrorStreak],
    }
    allErrorStreaks.push(streak)
    if (streak.length >= 5) {
      errorStreaks.push(streak)
    }
  }

  // Sort error streaks by length descending
  errorStreaks.sort((a, b) => b.length - a.length)
  allErrorStreaks.sort((a, b) => b.length - a.length)

  // Mode stats
  const modeStats: Record<ModeName, { bet: number; correct: number; incorrect: number; accuracy: number }> = {
    NORMAL: { bet: 0, correct: 0, incorrect: 0, accuracy: 0 },
    SOFT: { bet: 0, correct: 0, incorrect: 0, accuracy: 0 },
    SKIPZONE: { bet: 0, correct: 0, incorrect: 0, accuracy: 0 },
    ULTRA: { bet: 0, correct: 0, incorrect: 0, accuracy: 0 },
  }

  for (const e of entries) {
    modeStats[e.mode].bet++
    if (e.correct) modeStats[e.mode].correct++
    else modeStats[e.mode].incorrect++
  }
  for (const m of Object.values(modeStats)) {
    m.accuracy = m.bet > 0 ? (m.correct / m.bet) * 100 : 0
  }

  const correct = entries.filter(e => e.correct).length
  const incorrect = entries.filter(e => !e.correct).length
  const maxErrorStreak = allErrorStreaks.length > 0 ? allErrorStreaks[0].length : 0

  return {
    total: entries.length,
    correct,
    incorrect,
    accuracy: entries.length > 0 ? (correct / entries.length) * 100 : 0,
    maxErrorStreak,
    errorStreaks,
    allErrorStreaks,
    modeStats,
  }
}

// ═══════════════════════════════════════════════════════════════
// SIMULATION B: With skips + cooldowns (engine V6.0 designed)
// ═══════════════════════════════════════════════════════════════

interface SimBResult {
  totalPredictions: number
  skipped: number
  skippedByEngine: number
  skippedByCooldown: number
  betted: number
  correct: number
  incorrect: number
  accuracy: number
  maxErrorStreak: number
  bustCount: number
  netResult: number
}

function simulateB(numbers: number[]): SimBResult {
  const MIN_HISTORY = 10
  const COOLDOWN_AFTER_LOSS = 1
  const COOLDOWN_AFTER_BUST = 3
  const COOLDOWN_AFTER_GREEN = 1

  // Reset engine for deterministic results
  resetFullEngine()

  let totalPredictions = 0
  let skipped = 0
  let skippedByEngine = 0
  let skippedByCooldown = 0
  let betted = 0
  let correct = 0
  let incorrect = 0

  let martingaleStep = 0
  const martingaleBets = [1, 2, 4]
  let martTotalBet = 0
  let martTotalWin = 0
  let bustCount = 0

  let rawConsecutiveLoss = 0
  let maxRawConsecutiveLoss = 0

  let cooldownRemaining = 0
  let cooldownSource = ''

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i)
    const nextNumber = numbers[i]

    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue

    totalPredictions++
    const predictedColor = pred.bestValue
    const shouldSkip = pred.shouldSkip === true

    const actualColor = getNumberColor(nextNumber)

    // Cooldown check
    if (cooldownRemaining > 0) {
      cooldownRemaining--
      skippedByCooldown++
      skipped++
      if (actualColor === 'green') continue
      continue
    }

    // Engine skip
    if (shouldSkip) {
      skippedByEngine++
      skipped++
      martingaleStep = 0  // Reset martingala on skip
      if (actualColor === 'green') continue
      continue
    }

    // BETTED
    betted++

    const isAfterCooldown = cooldownSource !== ''
    cooldownSource = ''

    // Green = loss
    if (actualColor === 'green') {
      martTotalBet += martingaleBets[Math.min(martingaleStep, 2)]
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss

      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
      } else {
        cooldownRemaining = COOLDOWN_AFTER_GREEN
        cooldownSource = 'green'
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
      rawConsecutiveLoss = 0
    } else {
      incorrect++
      martTotalBet += martingaleBets[martingaleStep]
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss

      if (martingaleStep >= 3) {
        bustCount++
        martingaleStep = 0
        cooldownRemaining = COOLDOWN_AFTER_BUST
        cooldownSource = 'bust'
      } else {
        cooldownRemaining = COOLDOWN_AFTER_LOSS
        cooldownSource = 'loss'
      }
    }
  }

  const netResult = martTotalWin - martTotalBet
  const accuracy = betted > 0 ? (correct / betted) * 100 : 0

  return {
    totalPredictions,
    skipped,
    skippedByEngine,
    skippedByCooldown,
    betted,
    correct,
    incorrect,
    accuracy,
    maxErrorStreak: maxRawConsecutiveLoss,
    bustCount,
    netResult,
  }
}

// ═══════════════════════════════════════════════════════════════
// SEQUENCE ANALYSIS HELPERS
// ═══════════════════════════════════════════════════════════════

function analyzeSequence(numbers: number[]) {
  let reds = 0, blacks = 0, greens = 0
  for (const n of numbers) {
    const c = getNumberColor(n)
    if (c === 'red') reds++
    else if (c === 'black') blacks++
    else greens++
  }

  // Longest same-color streak
  let maxStreak = 0
  let currentStreak = 0
  let currentColor = ''
  for (const n of numbers) {
    const c = getNumberColor(n)
    if (c === 'green') { currentStreak = 0; currentColor = ''; continue }
    if (c === currentColor) {
      currentStreak++
    } else {
      currentColor = c
      currentStreak = 1
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak
  }

  return { reds, blacks, greens, maxColorStreak: maxStreak }
}

// ═══════════════════════════════════════════════════════════════
// OUTPUT
// ═══════════════════════════════════════════════════════════════

function printOutput(numbers: number[], resultA: SimAResult, resultB: SimBResult, seqAnalysis: ReturnType<typeof analyzeSequence>) {
  console.log('')
  console.log('═'.repeat(67))
  console.log('  ANÁLISIS COMPLETO — SECUENCIA MANUAL DEL USUARIO')
  console.log('═'.repeat(67))

  console.log('')
  console.log('📊 DATOS DE LA SECUENCIA:')
  console.log(`   Total números: ${numbers.length}`)
  console.log(`   Rojos: ${seqAnalysis.reds} | Negros: ${seqAnalysis.blacks} | Verdes: ${seqAnalysis.greens}`)
  console.log(`   Racha más larga (mismo color): ${seqAnalysis.maxColorStreak}`)

  // ─── SIMULATION A ───
  console.log('')
  console.log('━'.repeat(67))
  console.log('  SIMULACIÓN A: TODAS LAS PREDICCIONES APOSTADAS')
  console.log('  (Lo que el usuario VE si apuesta en cada predicción)')
  console.log('━'.repeat(67))
  console.log(`   Total predicciones: ${resultA.total}`)
  console.log(`   Correctas: ${resultA.correct} | Incorrectas: ${resultA.incorrect}`)
  console.log(`   Accuracy: ${resultA.accuracy.toFixed(2)}%`)
  console.log(`   Máxima racha de errores: ${resultA.maxErrorStreak}`)
  console.log(`   Rachas de error >= 5: ${resultA.errorStreaks.length}`)

  // Top 10 error streaks
  const top10 = resultA.allErrorStreaks.slice(0, 10)
  if (top10.length > 0) {
    console.log('')
    console.log('   Top 10 rachas de error más largas:')
    top10.forEach((streak, idx) => {
      const preds = streak.entries.map(e => colorLabel(e.predicted)).join(',')
      const reals = streak.entries.map(e => e.actual === 'green' ? 'V' : colorLabel(e.actual)).join(',')
      console.log(`   ${idx + 1}. Errores ${streak.length} seguidos (spins ${streak.startSpin}→${streak.endSpin}): pred=[${preds}] real=[${reals}]`)
    })
  }

  // All error streaks >= 5
  if (resultA.errorStreaks.length > top10.length || resultA.errorStreaks.filter(s => s.length >= 5).length > top10.filter(s => s.length >= 5).length) {
    // Show all streaks >= 5 if there are more than the top 10 covers
    const allGe5 = resultA.allErrorStreaks.filter(s => s.length >= 5)
    if (allGe5.length > 10) {
      console.log('')
      console.log(`   TODAS las rachas de error >= 5 (${allGe5.length} total):`)
      allGe5.forEach((streak, idx) => {
        const preds = streak.entries.map(e => colorLabel(e.predicted)).join(',')
        const reals = streak.entries.map(e => e.actual === 'green' ? 'V' : colorLabel(e.actual)).join(',')
        console.log(`   ${idx + 1}. Errores ${streak.length} seguidos (spins ${streak.startSpin}→${streak.endSpin}): pred=[${preds}] real=[${reals}]`)
      })
    }
  }

  // Mode breakdown for Simulation A
  console.log('')
  console.log('   Desglose por modo:')
  const modes = resultA.modeStats
  console.log(`   NORMAL  (streak 0-1): ${modes.NORMAL.bet} bet | ${modes.NORMAL.correct}✅ ${modes.NORMAL.incorrect}❌ | ${modes.NORMAL.accuracy.toFixed(1)}%`)
  console.log(`   SOFT    (streak 2):   ${modes.SOFT.bet} bet | ${modes.SOFT.correct}✅ ${modes.SOFT.incorrect}❌ | ${modes.SOFT.accuracy.toFixed(1)}%`)
  console.log(`   SKIPZONE(streak 3-6): ${modes.SKIPZONE.bet} bet | ${modes.SKIPZONE.correct}✅ ${modes.SKIPZONE.incorrect}❌ | ${modes.SKIPZONE.accuracy.toFixed(1)}%`)
  console.log(`   ULTRA   (streak 7+):  ${modes.ULTRA.bet} bet | ${modes.ULTRA.correct}✅ ${modes.ULTRA.incorrect}❌ | ${modes.ULTRA.accuracy.toFixed(1)}%`)

  // ─── SIMULATION B ───
  console.log('')
  console.log('━'.repeat(67))
  console.log('  SIMULACIÓN B: CON SKIPs + COOLDOWNS (Motor V6.0 diseñado)')
  console.log('━'.repeat(67))
  console.log(`   Total predicciones: ${resultB.totalPredictions}`)
  console.log(`   SKIPPED: ${resultB.skipped} (${(resultB.skipped / resultB.totalPredictions * 100).toFixed(1)}%)`)
  console.log(`     ↳ Por motor:    ${resultB.skippedByEngine}`)
  console.log(`     ↳ Por cooldown: ${resultB.skippedByCooldown}`)
  console.log(`   APOSTADAS: ${resultB.betted} (${(resultB.betted / resultB.totalPredictions * 100).toFixed(1)}%)`)
  console.log(`   Correctas: ${resultB.correct} | Incorrectas: ${resultB.incorrect}`)
  console.log(`   Accuracy (apostadas): ${resultB.accuracy.toFixed(2)}%`)
  console.log(`   Máxima racha de errores: ${resultB.maxErrorStreak}`)
  console.log(`   Busts martingala: ${resultB.bustCount}`)
  console.log(`   Neto: ${resultB.netResult >= 0 ? '+' : ''}${resultB.netResult} unidades`)

  // ─── CONCLUSIÓN ───
  console.log('')
  console.log('═'.repeat(67))
  console.log('  CONCLUSIÓN')
  console.log('═'.repeat(67))

  const accuracyDiff = resultB.accuracy - resultA.accuracy
  const simAGreenErrors = resultA.entries
    ? resultA.allErrorStreaks.flatMap(s => s.entries).filter(e => e.actual === 'green').length
    : 0

  console.log('')
  console.log(`   🔴 SIM A (sin filtros): ${resultA.accuracy.toFixed(2)}% accuracy, max error streak: ${resultA.maxErrorStreak}`)
  console.log(`   🟢 SIM B (con filtros):  ${resultB.accuracy.toFixed(2)}% accuracy, max error streak: ${resultB.maxErrorStreak}`)
  console.log(`   📈 Mejora por filtros:   ${accuracyDiff >= 0 ? '+' : ''}${accuracyDiff.toFixed(2)} pp`)
  console.log(`   💰 SIM B neto:           ${resultB.netResult >= 0 ? '+' : ''}${resultB.netResult} unidades (${resultB.bustCount} busts)`)
  console.log('')

  if (resultA.maxErrorStreak >= 7) {
    console.log(`   ⚠️  SIM A: La racha máxima de ${resultA.maxErrorStreak} errores CONSECUTIVOS`)
    console.log(`       destruye CUALQUIER martingala 3-step (1→2→4).`)
    console.log(`       Esto es lo que el usuario EXPERIMENTA si apuesta siempre.`)
    console.log('')
  }

  if (resultA.errorStreaks.length > 0) {
    console.log(`   ⚠️  SIM A: ${resultA.errorStreaks.length} racha${resultA.errorStreaks.length > 1 ? 's' : ''} de error >= 5 consecutivos.`)
    console.log(`       Cada una potentially causa bust martingala.`)
    console.log('')
  }

  if (resultB.maxErrorStreak < resultA.maxErrorStreak) {
    console.log(`   ✅ SIM B reduce racha máxima de ${resultA.maxErrorStreak} → ${resultB.maxErrorStreak} errores.`)
  }

  if (resultB.netResult >= 0) {
    console.log(`   ✅ SIM B es rentable con martingala 3-step.`)
  } else {
    console.log(`   ❌ SIM B aún pierde ${Math.abs(resultB.netResult)} unidades.`)
    if (resultB.bustCount > 0) {
      console.log(`       ${resultB.bustCount} busts × -7 = ${resultB.bustCount * -7} unidades perdidas por busts.`)
    }
  }

  console.log('')
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const filePath = '/home/z/my-project/download/user-sequence.txt'

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

const seqAnalysis = analyzeSequence(numbers)

console.log('')
console.log('⏳ Ejecutando Simulación A (todas las predicciones apostadas)...')
const resultA = simulateA(numbers)

console.log('⏳ Ejecutando Simulación B (con skips + cooldowns)...')
const resultB = simulateB(numbers)

printOutput(numbers, resultA, resultB, seqAnalysis)
