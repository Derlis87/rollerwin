/**
 * Simulación SOLO con secuencia REAL del usuario (9,008 números)
 * 6 escenarios: Corte 3, 6, 7 con/sin cooldowns
 */
import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory } from '../src/lib/smart-prediction-v4'
import * as fs from 'fs'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

const text = fs.readFileSync('download/user-sequence-real.txt', 'utf-8')
const numbers = text.split(/[,\s;\n\r|]+/).map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n) && n >= 0 && n <= 36)

console.log(`✅ Secuencia REAL del usuario: ${numbers.length} números`)
console.log(`   Primeros 20: ${numbers.slice(0, 20).join(', ')}`)
console.log(`   Últimos 10:  ...${numbers.slice(-10).join(', ')}`)

interface CorteConfig { name: string; martingaleBets: number[]; bustCost: number; cooldownAfterBust: number; cooldownAfterLoss: number; cooldownAfterGreen: number }

interface SimResult {
  name: string; totalNumbers: number; totalPredictions: number; skipped: number; skippedByEngine: number; skippedByCooldown: number
  betted: number; correct: number; incorrect: number; accuracy: number; peaks: number[]
  peakStats: { low: number; medium: number; high: number }; maxPeak: number; bustCount: number; totalBustCost: number
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<number, number> }
  greenCount: number; cooldownStats: { lossCooldowns: number; bustCooldowns: number; greenCooldowns: number; spinsSkippedByCooldown: number }
  balanceCurve: number[]; peakDistribution: Record<number, number>; worstDrawdown: number
}

function getStreakAtEnd(nums: number[]): { length: number; color: string } {
  let streakLen = 0, streakColor = ''
  for (let i = nums.length - 1; i >= 0; i--) {
    const c = getNumberColor(nums[i])
    if (c === 'green') continue
    if (streakLen === 0) { streakColor = c; streakLen = 1 }
    else if (c === streakColor) streakLen++
    else break
  }
  return { length: streakLen, color: streakColor }
}

function simulate(numbers: number[], config: CorteConfig): SimResult {
  const MIN_HISTORY = 10
  const peaks: number[] = []; let currentPeakHeight = 0; let correct = 0; let incorrect = 0; let totalPredictions = 0; let totalSkipped = 0
  let skippedByEngine = 0; let skippedByCooldown = 0; let totalBetted = 0
  let martingaleStep = 0; let martTotalBet = 0; let martTotalWin = 0; let runningNet = 0
  let rawConsecutiveLoss = 0; let maxRawConsecutiveLoss = 0; const rawLossStreaks: Record<number, number> = {}; let bustCount = 0
  let greenCount = 0; let cooldownRemaining = 0; let cooldownSource = ''
  const cooldownStats = { lossCooldowns: 0, bustCooldowns: 0, greenCooldowns: 0, spinsSkippedByCooldown: 0 }
  const balanceCurve: number[] = [0]
  resetRecoveryHistory()

  for (let i = MIN_HISTORY; i < numbers.length; i++) {
    const history = numbers.slice(0, i); const nextNumber = numbers[i]
    const pred = generateSmartPrediction(history, 'color')
    if (!pred.bestValue) continue
    totalPredictions++; const predictedColor = pred.bestValue; const shouldSkip = pred.shouldSkip === true; const actualColor = getNumberColor(nextNumber)

    if (cooldownRemaining > 0) { cooldownRemaining--; skippedByCooldown++; totalSkipped++; cooldownStats.spinsSkippedByCooldown++; if (actualColor === 'green') greenCount++; continue }
    if (shouldSkip) { skippedByEngine++; totalSkipped++; martingaleStep = 0; if (actualColor === 'green') greenCount++; continue }

    totalBetted++; const maxStep = config.martingaleBets.length - 1; const currentBet = config.martingaleBets[Math.min(martingaleStep, maxStep)]
    cooldownSource = ''

    if (actualColor === 'green') {
      greenCount++; martTotalBet += currentBet; runningNet -= currentBet; martingaleStep++; rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      if (martingaleStep > maxStep) { bustCount++; martingaleStep = 0; cooldownRemaining = config.cooldownAfterBust; cooldownSource = 'bust'; cooldownStats.bustCooldowns++ }
      else { cooldownRemaining = config.cooldownAfterGreen; cooldownSource = 'green'; cooldownStats.greenCooldowns++ }
      recordPredictionFeedback(false, ['markov'], predictedColor); currentPeakHeight++; balanceCurve.push(runningNet); continue
    }

    const isCorrect = predictedColor === actualColor; recordPredictionFeedback(isCorrect, ['markov'], predictedColor)

    if (isCorrect) {
      correct++; martTotalBet += currentBet; martTotalWin += currentBet * 2; runningNet += currentBet
      if (rawConsecutiveLoss > 0) rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1
      martingaleStep = 0; rawConsecutiveLoss = 0; peaks.push(currentPeakHeight + 1); currentPeakHeight = 0; balanceCurve.push(runningNet)
    } else {
      incorrect++; martTotalBet += currentBet; runningNet -= currentBet; martingaleStep++; rawConsecutiveLoss++
      if (rawConsecutiveLoss > maxRawConsecutiveLoss) maxRawConsecutiveLoss = rawConsecutiveLoss
      if (martingaleStep > maxStep) { bustCount++; martingaleStep = 0; cooldownRemaining = config.cooldownAfterBust; cooldownSource = 'bust'; cooldownStats.bustCooldowns++ }
      else { cooldownRemaining = config.cooldownAfterLoss; cooldownSource = 'loss'; cooldownStats.lossCooldowns++ }
      currentPeakHeight++; balanceCurve.push(runningNet)
    }
  }
  if (currentPeakHeight > 0) peaks.push(currentPeakHeight)
  if (rawConsecutiveLoss > 0) rawLossStreaks[rawConsecutiveLoss] = (rawLossStreaks[rawConsecutiveLoss] || 0) + 1

  const low = peaks.filter(p => p >= 1 && p <= 3).length; const medium = peaks.filter(p => p >= 4 && p <= 6).length
  const high = peaks.filter(p => p >= 7).length; const maxPeak = peaks.length > 0 ? Math.max(...peaks) : 0
  const martNet = martTotalWin - martTotalBet; const martRoi = martTotalBet > 0 ? (martNet / martTotalBet) * 100 : 0
  const accuracy = totalBetted > 0 ? (correct / totalBetted) * 100 : 0
  const peakDistribution: Record<number, number> = {}; peaks.forEach(p => { peakDistribution[p] = (peakDistribution[p] || 0) + 1 })
  const worstDrawdown = balanceCurve.length > 0 ? Math.min(...balanceCurve) : 0

  return {
    name: config.name, totalNumbers: numbers.length, totalPredictions, skipped: totalSkipped, skippedByEngine, skippedByCooldown,
    betted: totalBetted, correct, incorrect, accuracy, peaks, peakStats: { low, medium, high }, maxPeak, bustCount,
    totalBustCost: bustCount * config.bustCost, martingale: { totalBet: martTotalBet, totalWin: martTotalWin, netResult: martNet, roi: martRoi, maxConsecutiveLoss: maxRawConsecutiveLoss, lossStreaks: rawLossStreaks },
    greenCount, cooldownStats, balanceCurve, peakDistribution, worstDrawdown,
  }
}

const configs: CorteConfig[] = [
  { name: 'Corte 3 (actual)', martingaleBets: [1, 2, 4], bustCost: 7, cooldownAfterBust: 3, cooldownAfterLoss: 1, cooldownAfterGreen: 1 },
  { name: 'Corte 3 SIN cd', martingaleBets: [1, 2, 4], bustCost: 7, cooldownAfterBust: 0, cooldownAfterLoss: 0, cooldownAfterGreen: 0 },
  { name: 'Corte 6 (bust=3)', martingaleBets: [1, 2, 4, 8, 16, 32], bustCost: 63, cooldownAfterBust: 3, cooldownAfterLoss: 0, cooldownAfterGreen: 1 },
  { name: 'Corte 6 (bust=3,loss=1)', martingaleBets: [1, 2, 4, 8, 16, 32], bustCost: 63, cooldownAfterBust: 3, cooldownAfterLoss: 1, cooldownAfterGreen: 1 },
  { name: 'Corte 7 (bust=5)', martingaleBets: [1, 2, 4, 8, 16, 32, 64], bustCost: 127, cooldownAfterBust: 5, cooldownAfterLoss: 0, cooldownAfterGreen: 1 },
  { name: 'Corte 7 (bust=5,loss=1)', martingaleBets: [1, 2, 4, 8, 16, 32, 64], bustCost: 127, cooldownAfterBust: 5, cooldownAfterLoss: 1, cooldownAfterGreen: 1 },
]

const results: SimResult[] = []
for (const config of configs) {
  console.log(`\n⏳ Simulando ${config.name}...`)
  results.push(simulate(numbers, config))
}

// Print results
console.log('\n' + '═'.repeat(85))
console.log(`  SIMULACIÓN CON ${results[0].totalNumbers} NÚMEROS REALES DEL USUARIO`)
console.log('  Motor V6.0 SIN MODIFICACIONES')
console.log('═'.repeat(85))

for (const r of results) {
  console.log(`\n${'─'.repeat(85)}`)
  console.log(`  📊 ${r.name}`)
  console.log(`  Martingala: [${configs.find(c => c.name === r.name)!.martingaleBets.join(', ')}] | Bust: -${configs.find(c => c.name === r.name)!.bustCost}u`)
  console.log(`  APOSTADAS:  ${r.betted} de ${r.totalPredictions} señales (${(r.betted/r.totalPredictions*100).toFixed(1)}%)`)
  console.log(`  SKIPPED:    ${r.skipped} (Motor: ${r.skippedByEngine}, Cooldown: ${r.skippedByCooldown})`)
  console.log(`  Accuracy:   ${r.accuracy.toFixed(1)}%  (${r.correct}✅ / ${r.incorrect}❌)`)
  console.log(`  Busts:      ${r.bustCount} × ${configs.find(c => c.name === r.name)!.bustCost}u = ${r.totalBustCost}u`)
  console.log(`  Verdes:     ${r.greenCount}`)
  console.log(`  Max streak: ${r.martingale.maxConsecutiveLoss} pérdidas consecutivas`)
  console.log(`  💰 NETO:    ${r.martingale.netResult >= 0 ? '+' : ''}${r.martingale.netResult}u | ROI: ${r.martingale.roi.toFixed(2)}%`)
  console.log(`  📉 Balance: Mín=${r.worstDrawdown}u | Máx=${Math.max(...r.balanceCurve)}u | Final=${r.balanceCurve[r.balanceCurve.length-1]}u`)

  // Peak dist
  const cfg = configs.find(c => c.name === r.name)!
  const bl = cfg.martingaleBets.length
  if (r.peaks.length > 0) {
    const avg = r.peaks.reduce((a, b) => a + b, 0) / r.peaks.length
    console.log(`  📈 PICOS (${r.peaks.length}, prom: ${avg.toFixed(2)}): Bajos(1-3)=${r.peakStats.low}(${(r.peakStats.low/r.peaks.length*100).toFixed(1)}%) Medios(4-6)=${r.peakStats.medium} Altos(7+)=${r.peakStats.high}`)
    for (let i = 1; i <= Math.max(r.maxPeak, bl+1); i++) {
      const count = r.peakDistribution[i] || 0
      if (count > 0) {
        const pct = (count / r.peaks.length * 100).toFixed(1)
        const label = i < bl ? '✅ WIN' : i === bl ? '🔴 BUST' : '💀 POST'
        console.log(`  Pico ${String(i).padStart(2)}: ${String(count).padStart(4)} (${pct.padStart(5)}%) ${label}`)
      }
    }
  }
  const risk = r.worstDrawdown <= -10 ? '🔴 ALTO' : r.worstDrawdown <= -5 ? '🟡 MEDIO' : '🟢 BAJO'
  console.log(`  ⚠️ Riesgo: ${risk}`)
}

console.log('\n\n' + '═'.repeat(85))
console.log('  📋 RESUMEN COMPARATIVO')
console.log('═'.repeat(85))
console.log('')
console.log('  Estrategia               Neto      ROI       Busts  Drawdown   Riesgo')
console.log('  ───────────────────────── ───────── ───────── ─────── ───────── ────────')
for (const r of results) {
  const net = (r.martingale.netResult >= 0 ? '+' : '') + r.martingale.netResult + 'u'
  const roi = r.martingale.roi.toFixed(2) + '%'
  const dd = r.worstDrawdown + 'u'
  const risk = r.worstDrawdown <= -10 ? '🔴 ALTO' : r.worstDrawdown <= -5 ? '🟡 MEDIO' : '🟢 BAJO'
  console.log(`  ${r.name.padEnd(23)} ${net.padStart(9)} ${roi.padStart(9)} ${String(r.bustCount).padStart(6)} ${dd.padStart(9)} ${risk}`)
}

console.log('\n  💡 CONCLUSIÓN:')
console.log('  ─────────────────────────────────────────────────────')
const best = results.reduce((a, b) => a.martingale.netResult > b.martingale.netResult ? a : b)
const safest = results.reduce((a, b) => a.worstDrawdown > b.worstDrawdown ? a : b)
console.log(`  🏆 Mejor resultado: ${best.name} → ${best.martingale.netResult >= 0 ? '+' : ''}${best.martingale.netResult}u`)
console.log(`  🛡️ Más seguro:     ${safest.name} → drawdown ${safest.worstDrawdown}u`)
console.log('═'.repeat(85))
