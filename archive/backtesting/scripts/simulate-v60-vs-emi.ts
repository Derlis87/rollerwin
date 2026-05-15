/**
 * V6.0 vs V6.0+EMI Simulation — Uses the REAL engine (smart-prediction-v4.ts)
 * 
 * Usage: npx tsx scripts/simulate-v60-vs-emi.ts [sequence-file]
 */

import * as fs from 'fs'
import * as path from 'path'
import { generateSmartPrediction, type SmartPrediction, type BetType } from '../src/lib/smart-prediction-v4'
import { getNumberColor } from '../src/store/app-store'

// ── Bet type for simulation ──
const BET_TYPE: BetType = 'color'

// ── EMI Filter ──
class EMIFilter {
  private lastResults: ('win' | 'loss')[] = []
  private windowSize = 10
  
  shouldBet(): { bet: boolean; emi: number; zone: string } {
    if (this.lastResults.length < 5) {
      return { bet: true, emi: 100, zone: 'WARMUP' }
    }
    const recent = this.lastResults.slice(-this.windowSize)
    const wins = recent.filter(r => r === 'win').length
    const emi = (wins / recent.length) * 100
    if (emi < 55) return { bet: false, emi: Math.round(emi), zone: 'COLD (<55%)' }
    if (emi < 65) return { bet: true, emi: Math.round(emi), zone: 'NORMAL' }
    if (emi < 75) return { bet: true, emi: Math.round(emi), zone: 'HOT' }
    return { bet: true, emi: Math.round(emi), zone: 'FIRE' }
  }
  
  record(result: 'win' | 'loss') {
    this.lastResults.push(result)
    if (this.lastResults.length > 20) this.lastResults = this.lastResults.slice(-20)
  }
}

// ── Simulation ──
interface SimResult {
  name: string
  totalSpins: number
  signals: number
  skips: number
  correct: number
  incorrect: number
  accuracy: number
  netUnits: number
  roi: number
  busts: number
  maxPeak: number
  peakDistribution: Record<string, number>
  emiFiltered: number
  bustDetails: number[] // units lost per bust
  streaksDetail: { mode: string; correct: number; incorrect: number }[]
}

function mapColorValue(value: string): 'red' | 'black' {
  const v = value.toLowerCase()
  if (v.includes('rojo') || v.includes('red')) return 'red'
  return 'black'
}

function simulate(nums: number[], useEMI: boolean): SimResult {
  let signals = 0
  let skips = 0
  let emiFiltered = 0
  let correct = 0
  let incorrect = 0
  let netUnits = 0
  let busts = 0
  let currentPeak = 0
  let maxPeak = 0
  let currentBetIndex = 0
  const MARTINGALA = [1, 2, 4]
  const peakDistribution: Record<string, number> = { low: 0, medium: 0, high: 0 }
  const bustDetails: number[] = []
  const streaksDetail: { mode: string; correct: number; incorrect: number }[] = []
  
  const emi = useEMI ? new EMIFilter() : null
  let lastSmart: SmartPrediction | null = null
  
  // Use the REAL engine to generate prediction for initial state
  if (nums.length >= 5) {
    lastSmart = generateSmartPrediction(nums.slice(0, 5), BET_TYPE)
  }
  
  for (let i = 5; i < nums.length; i++) {
    const history = nums.slice(0, i)
    const nextNum = nums[i]
    const actualColor = getNumberColor(nextNum)
    
    // Generate prediction using REAL engine
    const smart = generateSmartPrediction(history, BET_TYPE)
    
    if (smart.shouldSkip) {
      skips++
      // During SKIP: verify prediction for learning (dashboard fix behavior)
      if (smart.bestValue && actualColor !== 'green') {
        const predColor = mapColorValue(smart.bestValue)
        // Just verify, don't count
      }
      currentPeak = 0
      currentBetIndex = 0
      lastSmart = smart
      continue
    }
    
    // Active signal — check EMI if enabled
    if (emi) {
      const emiStatus = emi.shouldBet()
      if (!emiStatus.bet) {
        emiFiltered++
        skips++
        // Verify what would have happened for EMI learning
        const predColor = mapColorValue(smart.bestValue)
        if (predColor === actualColor) emi.record('win')
        else emi.record('loss')
        currentPeak = 0
        currentBetIndex = 0
        lastSmart = smart
        continue
      }
    }
    
    // BET
    signals++
    const predColor = mapColorValue(smart.bestValue)
    
    // Track streak mode
    if (!streaksDetail.length || streaksDetail[streaksDetail.length - 1].mode !== (smart.signalStrength !== undefined ? 'signal' : 'unknown')) {
      streaksDetail.push({ mode: smart.signalStrength !== undefined ? 'signal' : 'unknown', correct: 0, incorrect: 0 })
    }
    
    if (predColor === actualColor) {
      correct++
      const betAmount = MARTINGALA[currentBetIndex] || MARTINGALA[MARTINGALA.length - 1]
      netUnits += betAmount
      if (emi) emi.record('win')
      
      if (currentPeak > 0) {
        if (currentPeak <= 3) peakDistribution.low++
        else if (currentPeak <= 6) peakDistribution.medium++
        else peakDistribution.high++
      } else {
        peakDistribution.low++ // won on first try
      }
      
      if (currentPeak > maxPeak) maxPeak = currentPeak
      currentPeak = 0
      currentBetIndex = 0
      streaksDetail[streaksDetail.length - 1].correct++
    } else {
      incorrect++
      const betAmount = MARTINGALA[currentBetIndex] || MARTINGALA[MARTINGALA.length - 1]
      netUnits -= betAmount
      if (emi) emi.record('loss')
      currentPeak++
      currentBetIndex++
      streaksDetail[streaksDetail.length - 1].incorrect++
      
      if (currentBetIndex >= MARTINGALA.length) {
        busts++
        bustDetails.push(-7) // 1+2+4 = 7 lost
        currentPeak = 0
        currentBetIndex = 0
      }
      
      if (currentPeak > maxPeak) maxPeak = currentPeak
    }
    
    lastSmart = smart
  }
  
  const accuracy = signals > 0 ? (correct / signals) * 100 : 0
  const roi = signals > 0 ? (netUnits / signals) * 100 : 0
  
  return {
    name: useEMI ? 'V6.0 + EMI' : 'V6.0 Ultra-Selective',
    totalSpins: nums.length,
    signals, skips, correct, incorrect,
    accuracy: Math.round(accuracy * 10) / 10,
    netUnits, roi: Math.round(roi * 10) / 10,
    busts, maxPeak, peakDistribution, emiFiltered, bustDetails, streaksDetail
  }
}

// ── Main ──
function main() {
  const seqPath = process.argv[2] || path.join(process.cwd(), 'download', 'clean-sequence-3.txt')
  
  if (!fs.existsSync(seqPath)) {
    console.error(`❌ File not found: ${seqPath}`)
    process.exit(1)
  }
  
  const content = fs.readFileSync(seqPath, 'utf-8').trim()
  const nums = content.split(/[\s,;\n|]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 36)
  
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ROLLERWIN — V6.0 vs V6.0+EMI Comparative Analysis`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  Secuencia: ${path.basename(seqPath)}`)
  console.log(`  Números:  ${nums.length}`)
  console.log(`  Rojo: ${nums.filter(n => getNumberColor(n) === 'red').length} | Negro: ${nums.filter(n => getNumberColor(n) === 'black').length} | Verde: ${nums.filter(n => n === 0).length}`)
  console.log(`${'═'.repeat(70)}`)
  
  const v60 = simulate(nums, false)
  const v60emi = simulate(nums, true)
  
  function printResult(r: SimResult) {
    console.log(`\n  📊 ${r.name}`)
    console.log(`  ${'─'.repeat(50)}`)
    console.log(`  Señales activas:        ${r.signals}  (${(r.signals / r.totalSpins * 100).toFixed(1)}%)`)
    console.log(`  Skips:                  ${r.skips}  (${(r.skips / r.totalSpins * 100).toFixed(1)}%)`)
    if (r.emiFiltered > 0) {
      console.log(`  Filtrados por EMI:       ${r.emiFiltered} señales rechazadas`)
    }
    console.log(`  ────────────────────────────────────`)
    console.log(`  Aciertos:               ${r.correct}`)
    console.log(`  Errores:                ${r.incorrect}`)
    console.log(`  Exactitud:              ${r.accuracy}%`)
    console.log(`  ────────────────────────────────────`)
    console.log(`  Neto (unidades):        ${r.netUnits > 0 ? '+' : ''}${r.netUnits}`)
    console.log(`  ROI por señal:          ${r.roi > 0 ? '+' : ''}${r.roi}%`)
    console.log(`  Busts martingala:       ${r.busts}`)
    console.log(`  Pico máximo:            ${r.maxPeak}`)
    console.log(`  ────────────────────────────────────`)
    const tp = r.peakDistribution.low + r.peakDistribution.medium + r.peakDistribution.high
    if (tp > 0) {
      console.log(`  Resolución por pico:`)
      console.log(`    Bajo (1):   ${r.peakDistribution.low}  (${(r.peakDistribution.low / tp * 100).toFixed(1)}%)`)
      console.log(`    Medio (2-3): ${r.peakDistribution.medium}  (${(r.peakDistribution.medium / tp * 100).toFixed(1)}%)`)
      console.log(`    Alto (4+):  ${r.peakDistribution.high}  (${(r.peakDistribution.high / tp * 100).toFixed(1)}%)`)
      const ratio = (r.peakDistribution.low / Math.max(r.peakDistribution.medium + r.peakDistribution.high, 1)).toFixed(2)
      console.log(`    Ratio bajo/(med+alto): ${ratio}:1`)
    }
  }
  
  printResult(v60)
  printResult(v60emi)
  
  // Comparison table
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ⚔️  COMPARATIVA DIRECTA`)
  console.log(`${'═'.repeat(70)}`)
  console.log(`  ${'Métrica'.padEnd(28)} ${'V6.0'.padStart(12)} ${'V6.0+EMI'.padStart(12)}`)
  console.log(`  ${'─'.repeat(52)}`)
  
  const rows: [string, string, string][] = [
    ['Señales', String(v60.signals), String(v60emi.signals)],
    ['Skips', String(v60.skips), String(v60emi.skips)],
    ['Señales filtradas EMI', '—', String(v60emi.emiFiltered)],
    ['Aciertos', String(v60.correct), String(v60emi.correct)],
    ['Errores', String(v60.incorrect), String(v60emi.incorrect)],
    ['Exactitud', `${v60.accuracy}%`, `${v60emi.accuracy}%`],
    ['Neto', `${v60.netUnits > 0 ? '+' : ''}${v60.netUnits}`, `${v60emi.netUnits > 0 ? '+' : ''}${v60emi.netUnits}`],
    ['ROI', `${v60.roi > 0 ? '+' : ''}${v60.roi}%`, `${v60emi.roi > 0 ? '+' : ''}${v60emi.roi}%`],
    ['Busts', String(v60.busts), String(v60emi.busts)],
    ['Pico máximo', String(v60.maxPeak), String(v60emi.maxPeak)],
  ]
  rows.forEach(([l, a, b]) => console.log(`  ${l.padEnd(28)} ${a.padStart(12)} ${b.padStart(12)}`))
  
  // Verdict
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  📋 VEREDICTO`)
  console.log(`${'═'.repeat(70)}`)
  
  if (v60emi.busts < v60.busts && v60emi.netUnits > v60.netUnits) {
    console.log(`  ✅ EMI MEJORA: Reduce busts ${v60.busts}→${v60emi.busts}, neto +${v60emi.netUnits - v60.netUnits}`)
  } else if (v60emi.accuracy > v60.accuracy + 3) {
    console.log(`  ⚠️ EMI sube exactitud (+${(v60emi.accuracy - v60.accuracy).toFixed(1)}%) pero filtra ${v60emi.emiFiltered} señales`)
  } else if (v60.netUnits > v60emi.netUnits) {
    console.log(`  ❌ EMI no mejora: V6.0 puro rinde mejor (+${v60.netUnits - v60emi.netUnits} uds más)`)
  } else {
    console.log(`  ⚖️ Sin ventaja clara para EMI en esta secuencia`)
  }
  console.log(`${'═'.repeat(70)}\n`)
}

main()
