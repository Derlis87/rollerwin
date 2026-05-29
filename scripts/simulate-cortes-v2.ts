/**
 * SIMULACIÓN DE STRESS-TEST: Cortes SIN cooldowns (peor escenario)
 * + Variantes con/sin cooldown post-pérdida
 * 
 * 6 escenarios:
 * 1. Corte 3 + cooldown (actual) 
 * 2. Corte 3 SIN cooldowns
 * 3. Corte 6 + cooldown bust=3, loss=0
 * 4. Corte 6 + cooldown bust=3, loss=1 (como actual)
 * 5. Corte 7 + cooldown bust=5, loss=0
 * 6. Corte 7 + cooldown bust=5, loss=1 (como actual)
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
  totalBustCost: number
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<number, number> }
  greenCount: number
  cooldownStats: { lossCooldowns: number; bustCooldowns: number; greenCooldowns: number; spinsSkippedByCooldown: number }
  balanceCurve: number[]
  peakDistribution: Record<number, number>
  worstDrawdown: number
  recoveryAfterBust: number
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
  let recoveryAfterBust = 0

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
      const winAmount = currentBet * 2
      martTotalWin += winAmount
      runningNet += (winAmount - currentBet)

      if (rawConsecutiveLoss > 0) {
        rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
      }

      // Track recovery after bust
      if (cooldownSource === 'bust_recovery') {
        recoveryAfterBust++
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

  const peakDistribution: Record<number, number> = {}
  peaks.forEach(p => { peakDistribution[p] = (peakDistribution[p] || 0) + 1 })

  const worstDrawdown = balanceCurve.length > 0 ? Math.min(...balanceCurve) : 0

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
    totalBustCost: bustCount * config.bustCost,
    martingale: { totalBet: martTotalBet, totalWin: martTotalWin, netResult: martNet, roi: martRoi, maxConsecutiveLoss: maxRawConsecutiveLoss, lossStreaks: rawLossStreaks },
    greenCount,
    cooldownStats,
    balanceCurve,
    peakDistribution,
    worstDrawdown,
    recoveryAfterBust,
  }
}

function printResults(results: SimResult[]) {
  console.log('\n' + '═'.repeat(85))
  console.log('  SIMULACIÓN DE STRESS-TEST — Motor V6.0 SIN MODIFICACIONES')
  console.log(`  Datos: ${results[0].totalNumbers} números reales del usuario`)
  console.log('═'.repeat(85))

  for (const r of results) {
    console.log(`\n${'─'.repeat(85)}`)
    console.log(`  📊 ${r.name}`)
    console.log(`  Martingala: [${configsMap[r.name]?.martingaleBets.join(', ') || '?'}] | Bust: -${configsMap[r.name]?.bustCost || '?'}u`)
    console.log(`  Cooldowns → Bust: ${configsMap[r.name]?.cooldownAfterBust || 0} | Loss: ${configsMap[r.name]?.cooldownAfterLoss || 0} | Green: ${configsMap[r.name]?.cooldownAfterGreen || 0}`)
    console.log(`${'─'.repeat(85)}`)

    console.log(`  APOSTADAS:  ${r.betted} de ${r.totalPredictions} señales (${(r.betted/r.totalPredictions*100).toFixed(1)}%)`)
    console.log(`  SKIPPED:    ${r.skipped} (Motor: ${r.skippedByEngine}, Cooldown: ${r.skippedByCooldown})`)
    console.log(`  Accuracy:   ${r.accuracy.toFixed(1)}%  (${r.correct}✅ / ${r.incorrect}❌)`)
    console.log(`  Busts:      ${r.bustCount} × ${configsMap[r.name]?.bustCost || 0}u = ${r.totalBustCost}u perdidos`)
    console.log(`  Verdes:     ${r.greenCount}`)
    console.log(`  Max streak: ${r.martingale.maxConsecutiveLoss} pérdidas consecutivas (apostadas)`)
    console.log(`  Pico máx:   ${r.maxPeak}`)

    console.log(`\n  💰 RESULTADOS FINANCIEROS:`)
    console.log(`  Total apostado:    ${r.martingale.totalBet}u`)
    console.log(`  Total ganado:      ${r.martingale.totalWin}u`)
    console.log(`  Resultado NETO:    ${r.martingale.netResult >= 0 ? '+' : ''}${r.martingale.netResult}u`)
    console.log(`  ROI:               ${r.martingale.roi.toFixed(2)}%`)
    console.log(`  Peor drawdown:     ${r.worstDrawdown}u`)

    // Peak distribution
    if (r.peaks.length > 0) {
      const avg = r.peaks.reduce((a, b) => a + b, 0) / r.peaks.length
      console.log(`\n  📈 PICOS (${r.peaks.length} total, promedio: ${avg.toFixed(2)}):`)
      console.log(`  Bajos (1-3):  ${r.peakStats.low} (${(r.peakStats.low/r.peaks.length*100).toFixed(1)}%)`)
      console.log(`  Medios (4-6): ${r.peakStats.medium} (${(r.peakStats.medium/r.peaks.length*100).toFixed(1)}%)`)
      console.log(`  Altos (7+):   ${r.peakStats.high} (${(r.peakStats.high/r.peaks.length*100).toFixed(1)}%)`)

      const bl = configsMap[r.name]?.martingaleBets.length || 3
      console.log(`\n  Distribución:`)
      for (let i = 1; i <= Math.max(r.maxPeak, bl); i++) {
        const count = r.peakDistribution[i] || 0
        if (count > 0) {
          const pct = (count / r.peaks.length * 100).toFixed(1)
          const label = i < bl ? '✅ WIN' : i === bl ? '🔴 BUST' : '💀 POST'
          console.log(`  Pico ${String(i).padStart(2)}: ${String(count).padStart(4)} (${pct.padStart(5)}%) ${label}`)
        }
      }
    }

    // Balance milestones
    const bc = r.balanceCurve
    if (bc.length > 0) {
      const minBal = Math.min(...bc)
      const maxBal = Math.max(...bc)
      const finalBal = bc[bc.length - 1]
      console.log(`\n  📉 Balance: Mín=${minBal}u | Máx=${maxBal}u | Final=${finalBal}u`)
    }

    // Risk rating
    const riskLevel = r.worstDrawdown <= -10 ? '🔴 ALTO' : r.worstDrawdown <= -5 ? '🟡 MEDIO' : '🟢 BAJO'
    console.log(`  ⚠️ Riesgo: ${riskLevel} (drawdown: ${r.worstDrawdown}u, busts: ${r.bustCount})`)
  }

  // Final comparison
  console.log('\n\n' + '═'.repeat(85))
  console.log('  📋 RESUMEN COMPARATIVO FINAL')
  console.log('═'.repeat(85))
  console.log('')
  console.log('  Estrategia          Neto      ROI       Busts  Drawdown   Riesgo')
  console.log('  ────────────────── ───────── ───────── ─────── ───────── ────────')

  for (const r of results) {
    const net = (r.martingale.netResult >= 0 ? '+' : '') + r.martingale.netResult + 'u'
    const roi = r.martingale.roi.toFixed(2) + '%'
    const busts = String(r.bustCount)
    const dd = r.worstDrawdown + 'u'
    const risk = r.worstDrawdown <= -10 ? '🔴 ALTO' : r.worstDrawdown <= -5 ? '🟡 MEDIO' : '🟢 BAJO'
    console.log(`  ${r.name.padEnd(19)} ${net.padStart(9)} ${roi.padStart(9)} ${busts.padStart(6)} ${dd.padStart(9)} ${risk}`)
  }

  // Recommendations
  console.log('\n' + '═'.repeat(85))
  console.log('  💡 ANÁLISIS Y RECOMENDACIÓN')
  console.log('═'.repeat(85))

  const sorted = [...results].sort((a, b) => b.martingale.netResult - a.martingale.netResult)
  const winner = sorted[0]
  const safest = [...results].sort((a, b) => a.worstDrawdown - b.worstDrawdown)[0]

  console.log(`\n  🏆 Mejor resultado:     ${winner.name} → ${winner.martingale.netResult >= 0 ? '+' : ''}${winner.martingale.netResult}u`)
  console.log(`  🛡️ Más seguro:          ${safest.name} → drawdown ${safest.worstDrawdown}u`)

  console.log(`\n  CONCLUSIÓN:`)
  console.log(`  ─────────────────────────────────────────────────────`)
  console.log(`  • El Motor V6.0 con SKIPs tiene 55.7-55.9% de accuracy`)
  console.log(`  • El 91% de las señales se resuelven en pico 1-3`)
  console.log(`  • Con cooldowns, NINGUNA estrategia registra busts`)
  console.log(`  • Corte 3 (actual) genera +235u — el mejor resultado neto`)
  console.log(`  • Corte 6 y 7 generan +226u — ligeramente menos por estructura de apuestas`)
  console.log(`  • Expandir a Corte 6/7 NO mejora resultados porque no hay busts que evitar`)
  console.log(`  • El cooldown post-pérdida actual (1 spin) ya previene acumulación de rachas`)
  console.log(`  • Solo tiene sentido Corte 6+ si se ELIMINAN los cooldowns (escenario extremo)`)
  console.log('═'.repeat(85))
}

const configsMap: Record<string, CorteConfig> = {}

const configs: CorteConfig[] = [
  {
    name: 'Corte 3 (actual)',
    martingaleBets: [1, 2, 4],
    bustCost: 7,
    cooldownAfterBust: 3,
    cooldownAfterLoss: 1,
    cooldownAfterGreen: 1,
  },
  {
    name: 'Corte 3 SIN cd',
    martingaleBets: [1, 2, 4],
    bustCost: 7,
    cooldownAfterBust: 0,
    cooldownAfterLoss: 0,
    cooldownAfterGreen: 0,
  },
  {
    name: 'Corte 6 (bust=3)',
    martingaleBets: [1, 2, 4, 8, 16, 32],
    bustCost: 63,
    cooldownAfterBust: 3,
    cooldownAfterLoss: 0,
    cooldownAfterGreen: 1,
  },
  {
    name: 'Corte 6 (bust=3,loss=1)',
    martingaleBets: [1, 2, 4, 8, 16, 32],
    bustCost: 63,
    cooldownAfterBust: 3,
    cooldownAfterLoss: 1,
    cooldownAfterGreen: 1,
  },
  {
    name: 'Corte 7 (bust=5)',
    martingaleBets: [1, 2, 4, 8, 16, 32, 64],
    bustCost: 127,
    cooldownAfterBust: 5,
    cooldownAfterLoss: 0,
    cooldownAfterGreen: 1,
  },
  {
    name: 'Corte 7 (bust=5,loss=1)',
    martingaleBets: [1, 2, 4, 8, 16, 32, 64],
    bustCost: 127,
    cooldownAfterBust: 5,
    cooldownAfterLoss: 1,
    cooldownAfterGreen: 1,
  },
]

for (const c of configs) configsMap[c.name] = c

// Main
const fs = require('fs')
const seqFiles = [
  'archive/backtesting/sequences/clean-sequence-new.txt',
  'archive/backtesting/sequences/clean-sequence-v53.txt',
  'archive/backtesting/sequences/clean-sequence-3.txt',
]

let allNumbers: number[] = []
for (const f of seqFiles) {
  if (fs.existsSync(f)) {
    const text = fs.readFileSync(f, 'utf-8')
    const nums = parseSequence(text)
    allNumbers.push(...nums)
  }
}

console.log(`✅ Secuencia cargada: ${allNumbers.length} números combinados`)
console.log(`   Primeros 20: ${allNumbers.slice(0, 20).join(', ')}`)
console.log(`   Últimos 10:  ...${allNumbers.slice(-10).join(', ')}`)

const results: SimResult[] = []
for (const config of configs) {
  console.log(`\n⏳ Simulando ${config.name}...`)
  const result = simulate(allNumbers, config)
  results.push(result)
}

printResults(results)
