/**
 * Simulador de Cortes 6 y 7 vs Baseline (Corte 3)
 * 
 * SIMULACIÓN SOLAMENTE — NO MODIFICA NADA
 * 
 * Estrategias:
 * - Baseline (Corte 3): Martingala [1,2,4], bust -7u, cooldown bust=3, loss=1, green=1
 * - Corte 6: Martingala [1,2,4,8,16,32], bust -63u, cooldown bust=3 señales, loss=1, green=1
 * - Corte 7: Martingala [1,2,4,8,16,32,64], bust -127u, cooldown bust=5 señales, loss=1, green=1
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

interface CorteConfig {
  name: string
  martingaleBets: number[]
  bustCost: number
  cooldownAfterBust: number
  cooldownAfterLoss: number
  cooldownAfterGreen: number
}

interface SimResult {
  name: string
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
  bustCount: number
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<number, number> }
  greenCount: number
  cooldownStats: { lossCooldowns: number; bustCooldowns: number; greenCooldowns: number; spinsSkippedByCooldown: number }
  balanceCurve: number[]
  peakDistribution: Record<number, number>
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

function simulate(numbers: number[], config: CorteConfig): SimResult {
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

  let martingaleStep = 0
  let martTotalBet = 0
  let martTotalWin = 0
  let runningNet = 0

  let rawConsecutiveLoss = 0
  let maxRawConsecutiveLoss = 0
  const rawLossStreaks: Record<number, number> = {}
  let bustCount = 0

  let greenCount = 0

  let cooldownRemaining = 0
  let cooldownSource = ''
  const cooldownStats = {
    lossCooldowns: 0,
    bustCooldowns: 0,
    greenCooldowns: 0,
    spinsSkippedByCooldown: 0,
  }

  const balanceCurve: number[] = [0]

  resetRecoveryHistory()

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
      totalSkipped++
      cooldownStats.spinsSkippedByCooldown++
      if (actualColor === 'green') greenCount++
      continue
    }

    // Engine skip
    if (shouldSkip) {
      skippedByEngine++
      totalSkipped++
      martingaleStep = 0 // Reset martingala on engine skip
      if (actualColor === 'green') greenCount++
      continue
    }

    // BETTED spin
    totalBetted++
    const maxStep = config.martingaleBets.length - 1
    const currentBet = config.martingaleBets[Math.min(martingaleStep, maxStep)]

    const isAfterCooldown = cooldownSource !== ''
    cooldownSource = ''

    // Green = loss
    if (actualColor === 'green') {
      greenCount++
      martTotalBet += currentBet
      runningNet -= currentBet
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss

      if (martingaleStep > maxStep) {
        // BUST
        bustCount++
        martingaleStep = 0
        cooldownRemaining = config.cooldownAfterBust
        cooldownSource = 'bust'
        cooldownStats.bustCooldowns++
      } else {
        cooldownRemaining = config.cooldownAfterGreen
        cooldownSource = 'green'
        cooldownStats.greenCooldowns++
      }

      recordPredictionFeedback(false, ['markov'], predictedColor)
      currentPeakHeight++
      balanceCurve.push(runningNet)
      continue
    }

    const isCorrect = predictedColor === actualColor
    recordPredictionFeedback(isCorrect, ['markov'], predictedColor)

    if (isCorrect) {
      correct++
      martTotalBet += currentBet
      const winAmount = currentBet * 2 // 1:1 payout
      martTotalWin += winAmount
      runningNet += (winAmount - currentBet)

      if (rawConsecutiveLoss > 0) {
        rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
      }

      martingaleStep = 0
      rawConsecutiveLoss = 0
      peaks.push(currentPeakHeight + 1)
      currentPeakHeight = 0

      balanceCurve.push(runningNet)
    } else {
      incorrect++
      martTotalBet += currentBet
      runningNet -= currentBet
      martingaleStep++
      rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss

      if (martingaleStep > maxStep) {
        // BUST
        bustCount++
        martingaleStep = 0
        cooldownRemaining = config.cooldownAfterBust
        cooldownSource = 'bust'
        cooldownStats.bustCooldowns++
      } else {
        cooldownRemaining = config.cooldownAfterLoss
        cooldownSource = 'loss'
        cooldownStats.lossCooldowns++
      }

      currentPeakHeight++
      balanceCurve.push(runningNet)
    }
  }

  // Unfinished peak
  if (currentPeakHeight > 0) {
    peaks.push(currentPeakHeight)
  }
  if (rawConsecutiveLoss > 0) {
    rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
  }

  const low = peaks.filter(p => p >= 1 && p <= 3).length
  const medium = peaks.filter(p => p >= 4 && p <= 6).length
  const high = peaks.filter(p => p >= 7).length
  const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0

  const martNet = martTotalWin - martTotalBet
  const martRoi = martTotalBet > 0 ? (martNet / martTotalBet) * 100 : 0
  const accuracy = totalBetted > 0 ? (correct / totalBetted) * 100 : 0

  // Peak distribution
  const peakDistribution: Record<number, number> = {}
  peaks.forEach(p => { peakDistribution[p] = (peakDistribution[p] || 0) + 1 })

  return {
    name: config.name,
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
    bustCount,
    martingale: { totalBet: martTotalBet, totalWin: martTotalWin, netResult: martNet, roi: martRoi, maxConsecutiveLoss: maxRawConsecutiveLoss, lossStreaks: rawLossStreaks },
    greenCount,
    cooldownStats,
    balanceCurve,
    peakDistribution,
  }
}

function printComparison(results: SimResult[]) {
  console.log('\n' + '═'.repeat(80))
  console.log('  SIMULACIÓN COMPARATIVA: CORTES vs BASELINE — Motor V6.0 (SIN MODIFICACIONES)')
  console.log('═'.repeat(80))

  // Summary table
  console.log('\n┌──────────────────┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐')
  console.log('│ Métrica          │ ' + results.map(r => r.name.padEnd(8)).join('│ ') + '│')
  console.log('├──────────────────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤')

  const metrics = [
    { label: 'Total números', fn: (r: SimResult) => r.totalNumbers.toLocaleString() },
    { label: 'Señales motor', fn: (r: SimResult) => r.totalPredictions.toLocaleString() },
    { label: 'Skipped engine', fn: (r: SimResult) => r.skippedByEngine.toLocaleString() },
    { label: 'Skipped cooldown', fn: (r: SimResult) => r.skippedByCooldown.toLocaleString() },
    { label: 'Apostadas', fn: (r: SimResult) => r.betted.toLocaleString() },
    { label: 'Correctas ✅', fn: (r: SimResult) => r.correct.toLocaleString() },
    { label: 'Incorrectas ❌', fn: (r: SimResult) => r.incorrect.toLocaleString() },
    { label: 'Accuracy', fn: (r: SimResult) => r.accuracy.toFixed(1) + '%' },
    { label: 'Busts', fn: (r: SimResult) => String(r.bustCount) },
    { label: 'Costo/bust', fn: (r: SimResult) => '-' + results.find(x => x.name === r.name) ? (() => {
      // Find the config
      const configs: Record<string, number> = { 'Corte 3': 7, 'Corte 6': 63, 'Corte 7': 127 }
      return (configs[r.name] || 0) + 'u'
    })() : '?'
    },
    { label: 'Costo total busts', fn: (r: SimResult) => {
      const configs: Record<string, number> = { 'Corte 3': 7, 'Corte 6': 63, 'Corte 7': 127 }
      const cost = configs[r.name] || 0
      return (r.bustCount * -cost) + 'u'
    }},
    { label: 'Total apostado', fn: (r: SimResult) => r.martingale.totalBet.toLocaleString() + 'u' },
    { label: 'Total ganado', fn: (r: SimResult) => r.martingale.totalWin.toLocaleString() + 'u' },
    { label: 'Resultado NETO', fn: (r: SimResult) => (r.martingale.netResult >= 0 ? '+' : '') + r.martingale.netResult + 'u' },
    { label: 'ROI', fn: (r: SimResult) => r.martingale.roi.toFixed(2) + '%' },
    { label: 'Máx. racha pérdida', fn: (r: SimResult) => String(r.martingale.maxConsecutiveLoss) },
    { label: 'Pico máximo', fn: (r: SimResult) => String(r.maxPeak) },
    { label: 'Picos bajos (1-3)', fn: (r: SimResult) => r.peakStats.low + ' (' + (r.peaks.length > 0 ? (r.peakStats.low / r.peaks.length * 100).toFixed(1) : '0') + '%)' },
    { label: 'Picos medios (4-6)', fn: (r: SimResult) => r.peakStats.medium + ' (' + (r.peaks.length > 0 ? (r.peakStats.medium / r.peaks.length * 100).toFixed(1) : '0') + '%)' },
    { label: 'Picos altos (7+)', fn: (r: SimResult) => r.peakStats.high + ' (' + (r.peaks.length > 0 ? (r.peakStats.high / r.peaks.length * 100).toFixed(1) : '0') + '%)' },
    { label: 'Cooldowns bust', fn: (r: SimResult) => r.cooldownStats.bustCooldowns + ' (' + (r.cooldownStats.bustCooldowns * 3) + ' spins)' },
  ]

  for (const m of metrics) {
    const vals = results.map(r => m.fn(r).padEnd(8))
    console.log('│ ' + m.label.padEnd(16) + '│ ' + vals.join('│ ') + '│')
  }
  console.log('└──────────────────┴──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘')

  // Detailed peak distribution per strategy
  for (const result of results) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`  Distribución de Picos — ${result.name}`)
    console.log(`${'─'.repeat(60)}`)

    if (result.peaks.length > 0) {
      const avg = result.peaks.reduce((a, b) => a + b, 0) / result.peaks.length
      console.log(`   Total picos: ${result.peaks.length}  |  Promedio: ${avg.toFixed(2)}  |  Máximo: ${result.maxPeak}`)
    }

    const dist = result.peakDistribution
    const maxHist = Math.max(...Object.values(dist))
    const maxLevel = Math.max(result.maxPeak, 10)

    for (let i = 1; i <= maxLevel; i++) {
      const count = dist[i] || 0
      if (count > 0) {
        const bar = '█'.repeat(Math.round(count / maxHist * 25))
        const pct = (count / result.peaks.length * 100).toFixed(1)
        const bustLevels: Record<string, number> = { 'Corte 3': 3, 'Corte 6': 6, 'Corte 7': 7 }
        const bustLevel = bustLevels[result.name] || 3
        const label = i < bustLevel ? '  ✅ WIN' : i === bustLevel ? '  🔴 BUST' : '  💀 POST-BUST'
        console.log(`   Pico ${String(i).padStart(2)}: ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar}${label}`)
      }
    }

    // Loss streaks
    console.log(`\n   Rachas de pérdida consecutiva:`)
    const streaks = result.martingale.lossStreaks
    const bustLevel: Record<string, number> = { 'Corte 3': 3, 'Corte 6': 6, 'Corte 7': 7 }
    const bl = bustLevel[result.name] || 3
    for (let len = 1; len <= Math.min(result.martingale.maxConsecutiveLoss, 15); len++) {
      const count = streaks[len] || 0
      if (count > 0) {
        const label = len < bl ? '🟢 OK' : len === bl ? '🔴 BUST' : '💀 POST-BUST'
        console.log(`   ${len} pérdida(s): ${String(count).padStart(5)} ${label}`)
      }
    }

    // Balance curve summary
    const bc = result.balanceCurve
    if (bc.length > 0) {
      const minBal = Math.min(...bc)
      const maxBal = Math.max(...bc)
      const finalBal = bc[bc.length - 1]
      console.log(`\n   Balance: Mín=${minBal}u | Máx=${maxBal}u | Final=${finalBal}u`)
    }
  }

  // VERDICT
  console.log('\n' + '═'.repeat(80))
  console.log('  VEREDICTO COMPARATIVO')
  console.log('═'.repeat(80))

  const best = results.reduce((a, b) => a.martingale.netResult > b.martingale.netResult ? a : b)
  const bestROI = results.reduce((a, b) => a.martingale.roi > b.martingale.roi ? a : b)
  const fewestBusts = results.reduce((a, b) => a.bustCount <= b.bustCount ? a : b)

  console.log(`\n   🏆 Mejor resultado neto:  ${best.name} → ${best.martingale.netResult >= 0 ? '+' : ''}${best.martingale.netResult}u`)
  console.log(`   📈 Mejor ROI:            ${bestROI.name} → ${bestROI.martingale.roi.toFixed(2)}%`)
  console.log(`   🛡️ Menos busts:          ${fewestBusts.name} → ${fewestBusts.bustCount} busts`)

  // Risk analysis
  console.log(`\n   ⚠️ ANÁLISIS DE RIESGO:`)
  for (const r of results) {
    const bustCost: Record<string, number> = { 'Corte 3': 7, 'Corte 6': 63, 'Corte 7': 127 }
    const cost = bustCost[r.name] || 0
    const totalBustCost = r.bustCount * cost
    const maxDrawdown = r.balanceCurve.length > 0 ? Math.min(...r.balanceCurve) : 0
    const riskLabel = maxDrawdown <= -20 ? '🔴 ALTO' : maxDrawdown <= -10 ? '🟡 MEDIO' : '🟢 BAJO'
    console.log(`   ${r.name}: Bust cost=${cost}u | Busts=${r.bustCount} | Costo total busts=${totalBustCost}u | Max drawdown=${maxDrawdown}u ${riskLabel}`)
  }

  console.log('\n' + '═'.repeat(80))
}

// Main
const fs = require('fs')
const args = process.argv.slice(2)

// Load all available sequences and combine them
const seqFiles = [
  'archive/backtesting/sequences/clean-sequence-new.txt',
  'archive/backtesting/sequences/clean-sequence-v53.txt',
  'archive/backtesting/sequences/clean-sequence-3.txt',
]

// Check for a specific file argument
let allNumbers: number[] = []
if (args.length >= 1) {
  const filePath = args[0]
  if (fs.existsSync(filePath)) {
    const text = fs.readFileSync(filePath, 'utf-8')
    allNumbers = parseSequence(text)
  } else {
    console.error(`Error: Archivo no encontrado: ${filePath}`)
    process.exit(1)
  }
} else {
  // Combine all available sequences
  for (const f of seqFiles) {
    if (fs.existsSync(f)) {
      const text = fs.readFileSync(f, 'utf-8')
      const nums = parseSequence(text)
      allNumbers.push(...nums)
    }
  }
}

if (allNumbers.length < 15) {
  console.error(`Error: Se necesitan al menos 15 números. Solo se encontraron ${allNumbers.length}.`)
  process.exit(1)
}

console.log(`✅ Secuencia cargada: ${allNumbers.length} números combinados`)
console.log(`   Primeros 20: ${allNumbers.slice(0, 20).join(', ')}`)
console.log(`   Últimos 10:  ...${allNumbers.slice(-10).join(', ')}`)

// Define strategies
const configs: CorteConfig[] = [
  {
    name: 'Corte 3',
    martingaleBets: [1, 2, 4],
    bustCost: 7,
    cooldownAfterBust: 3,
    cooldownAfterLoss: 1,
    cooldownAfterGreen: 1,
  },
  {
    name: 'Corte 6',
    martingaleBets: [1, 2, 4, 8, 16, 32],
    bustCost: 63,
    cooldownAfterBust: 3,
    cooldownAfterLoss: 1,
    cooldownAfterGreen: 1,
  },
  {
    name: 'Corte 7',
    martingaleBets: [1, 2, 4, 8, 16, 32, 64],
    bustCost: 127,
    cooldownAfterBust: 5,
    cooldownAfterLoss: 1,
    cooldownAfterGreen: 1,
  },
]

// Run all simulations
const results: SimResult[] = []
for (const config of configs) {
  console.log(`\n⏳ Simulando ${config.name}...`)
  const result = simulate(allNumbers, config)
  results.push(result)
}

printComparison(results)
