/**
 * ANÁLISIS COMPLETO ENHANCED — SECUENCIA COMPLETA DEL USUARIO
 * 
 * Uso: npx tsx scripts/analyze-full-enhanced.ts <archivo_secuencia.txt>
 * 
 * Two simulations:
 *   A) ALL predictions bet (what user SEES — no skips, no cooldowns)
 *   B) With skips + cooldowns (engine V6.0 as designed)
 * 
 * ENHANCED: Shows ALL error streaks >= 7 with full detail
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
  actualNumber: number
  correct: boolean
  mode: ModeName
  streakLen: number
}

interface ErrorStreak {
  length: number
  startSpin: number
  endSpin: number
  entries: SimAEntry[]
  greenCount: number
}

interface SimAResult {
  total: number
  correct: number
  incorrect: number
  accuracy: number
  maxErrorStreak: number
  errorStreaksGe5: ErrorStreak[]
  errorStreaksGe7: ErrorStreak[]
  allErrorStreaks: ErrorStreak[]
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
      actualNumber: nextNumber,
      correct: isCorrect,
      mode,
      streakLen: streak.length,
    })
  }

  // Calculate error streaks
  const allErrorStreaks: ErrorStreak[] = []
  let currentErrorStreak: SimAEntry[] = []

  for (const entry of entries) {
    if (!entry.correct) {
      currentErrorStreak.push(entry)
    } else {
      if (currentErrorStreak.length > 0) {
        const greenCount = currentErrorStreak.filter(e => e.actual === 'green').length
        const streak: ErrorStreak = {
          length: currentErrorStreak.length,
          startSpin: currentErrorStreak[0].spinIndex,
          endSpin: currentErrorStreak[currentErrorStreak.length - 1].spinIndex,
          entries: [...currentErrorStreak],
          greenCount,
        }
        allErrorStreaks.push(streak)
        currentErrorStreak = []
      }
    }
  }
  // Unfinished streak
  if (currentErrorStreak.length > 0) {
    const greenCount = currentErrorStreak.filter(e => e.actual === 'green').length
    const streak: ErrorStreak = {
      length: currentErrorStreak.length,
      startSpin: currentErrorStreak[0].spinIndex,
      endSpin: currentErrorStreak[currentErrorStreak.length - 1].spinIndex,
      entries: [...currentErrorStreak],
      greenCount,
    }
    allErrorStreaks.push(streak)
  }

  // Sort error streaks by length descending
  allErrorStreaks.sort((a, b) => b.length - a.length)
  const errorStreaksGe5 = allErrorStreaks.filter(s => s.length >= 5)
  const errorStreaksGe7 = allErrorStreaks.filter(s => s.length >= 7)

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
    errorStreaksGe5,
    errorStreaksGe7,
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
  martTotalBet: number
  martTotalWin: number
  lossStreaks: Record<number, number>
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
  const lossStreaks: Record<number, number> = {}

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
      // Record completed loss streak
      if (rawConsecutiveLoss > 0) {
        lossStreaks[rawConsecutiveLoss] = (lossStreaks[rawConsecutiveLoss] || 0) + 1
      }
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

  // Record unfinished loss streak
  if (rawConsecutiveLoss > 0) {
    lossStreaks[rawConsecutiveLoss] = (lossStreaks[rawConsecutiveLoss] || 0) + 1
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
    martTotalBet,
    martTotalWin,
    lossStreaks,
  }
}

// ═══════════════════════════════════════════════════════════════
// SEQUENCE ANALYSIS HELPERS
// ═══════════════════════════════════════════════════════════════

interface SeqAnalysis {
  reds: number
  blacks: number
  greens: number
  maxColorStreak: number
  colorStreaks: Record<number, number>
  numberFreq: Record<number, number>
}

function analyzeSequence(numbers: number[]): SeqAnalysis {
  let reds = 0, blacks = 0, greens = 0
  for (const n of numbers) {
    const c = getNumberColor(n)
    if (c === 'red') reds++
    else if (c === 'black') blacks++
    else greens++
  }

  // Color streak distribution
  const colorStreaks: Record<number, number> = {}
  let maxStreak = 0
  let currentStreak = 0
  let currentColor = ''
  for (const n of numbers) {
    const c = getNumberColor(n)
    if (c === 'green') {
      if (currentStreak > 0) {
        colorStreaks[currentStreak] = (colorStreaks[currentStreak] || 0) + 1
      }
      currentStreak = 0
      currentColor = ''
      continue
    }
    if (c === currentColor) {
      currentStreak++
    } else {
      if (currentStreak > 0) {
        colorStreaks[currentStreak] = (colorStreaks[currentStreak] || 0) + 1
      }
      currentColor = c
      currentStreak = 1
    }
    if (currentStreak > maxStreak) maxStreak = currentStreak
  }
  if (currentStreak > 0) {
    colorStreaks[currentStreak] = (colorStreaks[currentStreak] || 0) + 1
  }

  // Number frequency
  const numberFreq: Record<number, number> = {}
  for (const n of numbers) {
    numberFreq[n] = (numberFreq[n] || 0) + 1
  }

  return { reds, blacks, greens, maxColorStreak: maxStreak, colorStreaks, numberFreq }
}

// ═══════════════════════════════════════════════════════════════
// OUTPUT — ENHANCED, ALL IN SPANISH
// ═══════════════════════════════════════════════════════════════

function printErrorStreakDetail(streak: ErrorStreak, idx: number) {
  const preds = streak.entries.map(e => colorLabel(e.predicted)).join(',')
  const reals = streak.entries.map(e => e.actual === 'green' ? 'V' : colorLabel(e.actual)).join(',')
  const nums = streak.entries.map(e => e.actual === 'green' ? '0' : String(e.actualNumber)).join(',')
  const greens = streak.greenCount > 0 ? ` [🟢×${streak.greenCount}]` : ''
  
  console.log(`   ┌── Racha #${idx + 1}: ${streak.length} ERRORES seguidos (spins ${streak.startSpin}→${streak.endSpin})${greens}`)
  console.log(`   │  Predicciones: [${preds}]`)
  console.log(`   │  Resultados:   [${reals}]`)
  console.log(`   │  Números:      [${nums}]`)
  
  // Show mode breakdown within the streak
  const modes: Record<string, number> = {}
  for (const e of streak.entries) {
    modes[e.mode] = (modes[e.mode] || 0) + 1
  }
  const modeStr = Object.entries(modes).map(([m, c]) => `${m}×${c}`).join(' ')
  console.log(`   │  Modos:        ${modeStr}`)
  console.log(`   └──────────────────────────────────────`)
}

function printOutput(numbers: number[], resultA: SimAResult, resultB: SimBResult, seqAnalysis: SeqAnalysis) {
  console.log('')
  console.log('═'.repeat(70))
  console.log('  ANÁLISIS COMPLETO ENHANCED — SECUENCIA COMPLETA DEL USUARIO')
  console.log('═'.repeat(70))

  // ─── SEQUENCE STATS ───
  console.log('')
  console.log('📊 DATOS DE LA SECUENCIA:')
  console.log(`   Total números:    ${numbers.length}`)
  console.log(`   Rojos:             ${seqAnalysis.reds} (${(seqAnalysis.reds / numbers.length * 100).toFixed(1)}%)`)
  console.log(`   Negros:           ${seqAnalysis.blacks} (${(seqAnalysis.blacks / numbers.length * 100).toFixed(1)}%)`)
  console.log(`   Verdes (cero):     ${seqAnalysis.greens} (${(seqAnalysis.greens / numbers.length * 100).toFixed(1)}%)`)
  console.log(`   Racha más larga (mismo color): ${seqAnalysis.maxColorStreak}`)

  // Distribution of color streaks
  console.log('')
  console.log('   Distribución de rachas de color:')
  const maxCS = Math.max(...Object.keys(seqAnalysis.colorStreaks).map(Number))
  for (let i = 1; i <= Math.min(maxCS, 20); i++) {
    const count = seqAnalysis.colorStreaks[i] || 0
    if (count > 0) {
      const bar = '█'.repeat(Math.min(40, Math.round(count / Math.max(1, ...Object.values(seqAnalysis.colorStreaks)) * 40)))
      console.log(`   Streak ${String(i).padStart(2)}: ${String(count).padStart(4)} ${bar}`)
    }
  }

  // ─── SIMULATION A ───
  console.log('')
  console.log('━'.repeat(70))
  console.log('  SIMULACIÓN A: TODAS LAS PREDICCIONES APOSTADAS (SIN FILTROS)')
  console.log('  (Lo que el usuario EXPERIMENTA si apuesta en cada predicción)')
  console.log('━'.repeat(70))
  console.log(`   Total predicciones:    ${resultA.total}`)
  console.log(`   Correctas:             ${resultA.correct} | Incorrectas: ${resultA.incorrect}`)
  console.log(`   Accuracy:              ${resultA.accuracy.toFixed(2)}%`)
  console.log(`   Máxima racha de errores: ${resultA.maxErrorStreak}`)
  console.log(`   Rachas de error >= 5:  ${resultA.errorStreaksGe5.length}`)
  console.log(`   Rachas de error >= 7:  ${resultA.errorStreaksGe7.length}`)
  console.log(`   Total rachas de error: ${resultA.allErrorStreaks.length}`)

  // ─── ALL ERROR STREAKS >= 7 (ENHANCED) ───
  if (resultA.errorStreaksGe7.length > 0) {
    console.log('')
    console.log('  ╔══════════════════════════════════════════════════════════════╗')
    console.log(`  ║  🔴 TODAS LAS RACHAS DE ERROR >= 7 (${resultA.errorStreaksGe7.length} encontradas)  ║`)
    console.log('  ║     Cada una DESTRUYE cualquier martingala 3-step          ║')
    console.log('  ╚══════════════════════════════════════════════════════════════╝')
    console.log('')
    
    for (let idx = 0; idx < resultA.errorStreaksGe7.length; idx++) {
      printErrorStreakDetail(resultA.errorStreaksGe7[idx], idx)
      console.log('')
    }
  } else {
    console.log('')
    console.log('   ✅ No hay rachas de error >= 7')
    console.log('')
  }

  // ─── ALL ERROR STREAKS >= 5 ───
  if (resultA.errorStreaksGe5.length > 0) {
    console.log('')
    console.log('  ┌────────────────────────────────────────────────────────────┐')
    console.log(`  │  ⚠️  TODAS LAS RACHAS DE ERROR >= 5 (${resultA.errorStreaksGe5.length} encontradas)   │`)
    console.log('  │     Potencialmente peligrosas para martingala              │')
    console.log('  └────────────────────────────────────────────────────────────┘')
    console.log('')
    
    // Summary table
    console.log('   Resumen de todas las rachas >= 5:')
    console.log('   ' + '─'.repeat(65))
    console.log('   #  │ Longitud │ Spins inicio→fin │ Verdes │ Modo predominante')
    console.log('   ' + '─'.repeat(65))
    
    for (let idx = 0; idx < resultA.errorStreaksGe5.length; idx++) {
      const s = resultA.errorStreaksGe5[idx]
      const modeCounts: Record<string, number> = {}
      for (const e of s.entries) {
        modeCounts[e.mode] = (modeCounts[e.mode] || 0) + 1
      }
      const topMode = Object.entries(modeCounts).sort((a, b) => b[1] - a[1])[0]
      const gStr = s.greenCount > 0 ? `${s.greenCount}🟢` : '—'
      console.log(`   ${String(idx + 1).padStart(2)} │    ${String(s.length).padStart(2)}     │ ${String(s.startSpin).padStart(5)}→${String(s.endSpin).padStart(5)}    │  ${gStr.padStart(3)}  │ ${topMode[0]}`)
    }
    console.log('   ' + '─'.repeat(65))
    console.log('')
  }

  // Mode breakdown for Simulation A
  console.log('   Desglose por modo (SIM A):')
  const modes = resultA.modeStats
  console.log(`   NORMAL   (streak 0-1): ${modes.NORMAL.bet} bet | ${modes.NORMAL.correct}✅ ${modes.NORMAL.incorrect}❌ | ${modes.NORMAL.accuracy.toFixed(1)}%`)
  console.log(`   SOFT     (streak 2):   ${modes.SOFT.bet} bet | ${modes.SOFT.correct}✅ ${modes.SOFT.incorrect}❌ | ${modes.SOFT.accuracy.toFixed(1)}%`)
  console.log(`   SKIPZONE (streak 3-6): ${modes.SKIPZONE.bet} bet | ${modes.SKIPZONE.correct}✅ ${modes.SKIPZONE.incorrect}❌ | ${modes.SKIPZONE.accuracy.toFixed(1)}%`)
  console.log(`   ULTRA    (streak 7+):  ${modes.ULTRA.bet} bet | ${modes.ULTRA.correct}✅ ${modes.ULTRA.incorrect}❌ | ${modes.ULTRA.accuracy.toFixed(1)}%`)

  // ─── SIMULATION B ───
  console.log('')
  console.log('━'.repeat(70))
  console.log('  SIMULACIÓN B: CON SKIPs + COOLDOWNS (Motor V6.0 diseñado)')
  console.log('━'.repeat(70))
  console.log(`   Total predicciones:    ${resultB.totalPredictions}`)
  console.log(`   SKIPPED:               ${resultB.skipped} (${(resultB.skipped / resultB.totalPredictions * 100).toFixed(1)}%)`)
  console.log(`     ↳ Por motor:         ${resultB.skippedByEngine}`)
  console.log(`     ↳ Por cooldown:      ${resultB.skippedByCooldown}`)
  console.log(`   APOSTADAS:             ${resultB.betted} (${(resultB.betted / resultB.totalPredictions * 100).toFixed(1)}%)`)
  console.log(`   Correctas:             ${resultB.correct} | Incorrectas: ${resultB.incorrect}`)
  console.log(`   Accuracy (apostadas):  ${resultB.accuracy.toFixed(2)}%`)
  console.log(`   Máxima racha de errores: ${resultB.maxErrorStreak}`)
  console.log(`   Busts martingala:      ${resultB.bustCount}`)
  console.log(`   Total apostado:        ${resultB.martTotalBet} unidades`)
  console.log(`   Total ganado:          ${resultB.martTotalWin} unidades`)
  console.log(`   Neto:                  ${resultB.netResult >= 0 ? '+' : ''}${resultB.netResult} unidades`)

  // Loss streak distribution for Sim B
  console.log('')
  console.log('   Distribución de rachas de pérdida (SIM B, solo apostadas):')
  const totalLossStreaks = Object.values(resultB.lossStreaks).reduce((a, b) => a + b, 0)
  for (let len = 1; len <= 10; len++) {
    const count = resultB.lossStreaks[len] || 0
    if (count > 0) {
      const pct = (count / totalLossStreaks * 100).toFixed(1)
      const label = len <= 3 ? '🟢 OK' : '🔴 FATAL'
      console.log(`   ${len} pérdida${len > 1 ? 's' : ' '}: ${String(count).padStart(4)} (${pct.padStart(5)}%) ${label}`)
    }
  }
  const safeLosses = Object.entries(resultB.lossStreaks)
    .filter(([k]) => parseInt(k) <= 3)
    .reduce((sum, [, v]) => sum + v, 0)
  const fatalLosses = Object.entries(resultB.lossStreaks)
    .filter(([k]) => parseInt(k) >= 4)
    .reduce((sum, [, v]) => sum + v, 0)
  console.log(`   ──────────────────────────────────`)
  console.log(`   Rachas ≤3 (OK):        ${safeLosses} (${totalLossStreaks > 0 ? (safeLosses / totalLossStreaks * 100).toFixed(1) : 0}%)`)
  console.log(`   Rachas ≥4 (FATALES):   ${fatalLosses} (${totalLossStreaks > 0 ? (fatalLosses / totalLossStreaks * 100).toFixed(1) : 0}%)`)

  // ─── CONCLUSIÓN ───
  console.log('')
  console.log('═'.repeat(70))
  console.log('  CONCLUSIÓN')
  console.log('═'.repeat(70))

  const accuracyDiff = resultB.accuracy - resultA.accuracy

  console.log('')
  console.log(`   🔴 SIM A (sin filtros): ${resultA.accuracy.toFixed(2)}% accuracy, racha máx errores: ${resultA.maxErrorStreak}`)
  console.log(`   🟢 SIM B (con filtros):  ${resultB.accuracy.toFixed(2)}% accuracy, racha máx errores: ${resultB.maxErrorStreak}`)
  console.log(`   📈 Mejora por filtros:   ${accuracyDiff >= 0 ? '+' : ''}${accuracyDiff.toFixed(2)} pp`)
  console.log(`   💰 SIM B neto:           ${resultB.netResult >= 0 ? '+' : ''}${resultB.netResult} unidades (${resultB.bustCount} busts)`)
  console.log('')

  if (resultA.maxErrorStreak >= 7) {
    console.log(`   ⚠️  SIM A: La racha máxima de ${resultA.maxErrorStreak} errores CONSECUTIVOS`)
    console.log(`       destruye CUALQUIER martingala 3-step (1→2→4).`)
    console.log(`       Esto es lo que el usuario EXPERIMENTA si apuesta siempre.`)
    console.log('')
  }

  if (resultA.errorStreaksGe7.length > 0) {
    console.log(`   🔴 SIM A: ${resultA.errorStreaksGe7.length} racha${resultA.errorStreaksGe7.length > 1 ? 's' : ''} DESTRUCTOR${resultA.errorStreaksGe7.length > 1 ? 'AS' : 'A'} de error >= 7 consecutivos.`)
    console.log(`       Cada una destruye completamente la martingala 3-step.`)
    console.log(`       Pérdida acumulada estimada: ${resultA.errorStreaksGe7.length} busts × -7 = ${resultA.errorStreaksGe7.length * -7} unidades`)
    console.log('')
  }

  if (resultA.errorStreaksGe5.length > resultA.errorStreaksGe7.length) {
    const extra = resultA.errorStreaksGe5.length - resultA.errorStreaksGe7.length
    console.log(`   ⚠️  SIM A: ${extra} racha${extra > 1 ? 's' : ''} adicional${extra > 1 ? 'es' : ''} de error 5-6 (riesgo parcial).`)
    console.log('')
  }

  if (resultB.maxErrorStreak < resultA.maxErrorStreak) {
    console.log(`   ✅ SIM B reduce racha máxima de ${resultA.maxErrorStreak} → ${resultB.maxErrorStreak} errores.`)
  }

  if (resultB.netResult >= 0) {
    console.log(`   ✅ SIM B es rentable con martingala 3-step.`)
  } else {
    console.log(`   ❌ SIM B aún pierde ${Math.abs(resultB.netResult)} unidades netas.`)
    if (resultB.bustCount > 0) {
      console.log(`       ${resultB.bustCount} busts × -7 = ${resultB.bustCount * -7} unidades perdidas por busts.`)
    }
  }

  // Final assessment
  console.log('')
  console.log('   ──────────────────────────────────────────────')
  console.log('   📋 EVALUACIÓN FINAL:')
  console.log('   ──────────────────────────────────────────────')
  
  if (resultA.errorStreaksGe7.length === 0 && resultA.maxErrorStreak <= 3) {
    console.log('   🟢 La secuencia es GENTIL — sin rachas destructivas.')
  } else if (resultA.errorStreaksGe7.length <= 2 && resultA.maxErrorStreak <= 5) {
    console.log('   🟡 La secuencia tiene rachas moderadas — manejo cuidadoso necesario.')
  } else {
    console.log(`   🔴 La secuencia es HOSTIL — ${resultA.errorStreaksGe7.length} rachas destructivas (>=7).`)
    console.log('      La martingala 3-step NO es suficiente para esta secuencia.')
  }
  
  console.log('')
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

const args = process.argv.slice(2)
if (args.length < 1) {
  console.log('Uso: npx tsx scripts/analyze-full-enhanced.ts <archivo_secuencia.txt>')
  console.log('Ejemplo: npx tsx scripts/analyze-full-enhanced.ts download/user-sequence-full.txt')
  process.exit(1)
}

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

const seqAnalysis = analyzeSequence(numbers)

console.log('')
console.log('⏳ Ejecutando Simulación A (todas las predicciones apostadas)...')
const resultA = simulateA(numbers)

console.log('⏳ Ejecutando Simulación B (con skips + cooldowns)...')
const resultB = simulateB(numbers)

printOutput(numbers, resultA, resultB, seqAnalysis)
