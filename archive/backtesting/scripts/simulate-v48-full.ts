/**
 * Simulación v4.8 con HISTORIAL LARGO — simula miles de spins reales
 * para reproducir el Pico: 7 que el usuario ve en datos reales.
 * 
 * La clave: con historial largo, Markov tiene MÁS datos y el patrón
 * "B,B → R" se refuerza (porque ~50% de las rachas de 2 rompen).
 * Esto hace que SOFT mode prediga opuesto MÁS fuertemente.
 */

import { generateSmartPrediction } from '../src/lib/smart-prediction-v4'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

// Deterministic pseudo-random for reproducibility
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
    return (s >>> 0) / 0xFFFFFFFF
  }
}

// Generate N roulette spins with realistic distribution
function generateRouletteSequence(count: number, seed: number): number[] {
  const rng = seededRandom(seed)
  const nums: number[] = []
  
  // European roulette: 0-36, with proper color distribution
  const redNums = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
  const blackNums = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]
  
  for (let i = 0; i < count; i++) {
    const r = rng()
    if (r < 1/37) {
      nums.push(0)
    } else if (r < (1 + 18) / 37) {
      nums.push(redNums[Math.floor(rng() * 18)])
    } else {
      nums.push(blackNums[Math.floor(rng() * 18)])
    }
  }
  
  return nums
}

interface FullSimResult {
  totalNumbers: number
  totalPeaks: number
  peaks: number[]
  maxPeak: number
  avgPeak: number
  peakDistribution: Record<string, number>
  peak7PlusCount: number
  peak7PlusDetails: { peakHeight: number; predicted: string; numbers: number[]; colors: string[] }[]
  streakBasedAccuracy: { streak: number; errors: number; corrects: number; accuracy: number }[]
}

function fullSimulation(numbers: number[]): FullSimResult {
  const peaks: number[] = []
  let currentPeak = 1
  let prediction: string | null = null
  const peak7PlusDetails: FullSimResult['peak7PlusDetails'] = []
  
  // Track predictions per streak level
  const streakStats: Map<number, { predColor: string; correct: boolean }[]> = new Map()

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i]
    const color = getNumberColor(num)
    
    // Generate prediction if needed
    if (i >= 4 && !prediction) {
      const smart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
      prediction = smart.bestValue
    }
    
    if (!prediction) continue
    
    if (color === prediction) {
      // MATCH
      peaks.push(currentPeak)
      
      // Calculate streak at this point for tracking
      const nonZero = numbers.slice(0, i + 1).filter(n => n !== 0)
      let maxR = 0, maxB = 0
      nonZero.forEach(n => {
        const c = getNumberColor(n)
        if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
      })
      const streak = Math.max(maxR, maxB)
      if (!streakStats.has(streak)) streakStats.set(streak, [])
      streakStats.get(streak)!.push({ predColor: prediction, correct: true })
      
      // Save peak 7+ details
      if (currentPeak >= 7) {
        const startIdx = Math.max(0, i - currentPeak + 1)
        peak7PlusDetails.push({
          peakHeight: currentPeak,
          predicted: prediction,
          numbers: numbers.slice(startIdx, i + 1),
          colors: numbers.slice(startIdx, i + 1).map(n => getNumberColor(n))
        })
      }
      
      currentPeak = 1
      prediction = null
    } else {
      // FAIL
      const nonZero = numbers.slice(0, i + 1).filter(n => n !== 0)
      let maxR = 0, maxB = 0
      nonZero.forEach(n => {
        const c = getNumberColor(n)
        if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
      })
      const streak = Math.max(maxR, maxB)
      if (!streakStats.has(streak)) streakStats.set(streak, [])
      streakStats.get(streak)!.push({ predColor: prediction, correct: false })
      
      currentPeak++
      
      // Regenerate (same as DashboardLive)
      if (i + 1 >= 4) {
        const smart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
        prediction = smart.bestValue
      }
    }
  }
  
  // Distribution
  const peakDistribution: Record<string, number> = {}
  peaks.forEach(p => {
    const key = p >= 15 ? '15+' : p >= 10 ? '10-14' : String(p)
    peakDistribution[key] = (peakDistribution[key] || 0) + 1
  })
  
  // Streak-based accuracy
  const streakBasedAccuracy: FullSimResult['streakBasedAccuracy'] = []
  const sorted = [...streakStats.entries()].sort((a, b) => a[0] - b[0])
  for (const [streak, preds] of sorted) {
    const corrects = preds.filter(p => p.correct).length
    const errors = preds.filter(p => !p.correct).length
    // Count how many times predicted SAME vs OPPOSITE
    const sameColorPreds = preds.filter(p => {
      const streakColor = streak > 0 ? 'unknown' : 'unknown' // need more context
      return true // simplified
    })
    streakBasedAccuracy.push({
      streak,
      errors,
      corrects,
      accuracy: preds.length > 0 ? (corrects / preds.length * 100) : 0
    })
  }
  
  return {
    totalNumbers: numbers.length,
    totalPeaks: peaks.length,
    peaks,
    maxPeak: peaks.length > 0 ? Math.max(...peaks) : 0,
    avgPeak: peaks.length > 0 ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0,
    peakDistribution,
    peak7PlusCount: peak7PlusDetails.length,
    peak7PlusDetails,
    streakBasedAccuracy
  }
}

// ═══════════════════════════════════════
// RUN SIMULATION with 5000 spins (multiple seeds)
// ═══════════════════════════════════════
console.log('='.repeat(80))
console.log('SIMULACIÓN v4.8 — 5,000 spins con historial largo')
console.log('='.repeat(80))

// Find the worst seed (most peaks 7+)
let worstResult: FullSimResult | null = null
let worstSeed = 0
let worstMaxPeak = 0

for (let seed = 1; seed <= 20; seed++) {
  const seq = generateRouletteSequence(5000, seed)
  const result = fullSimulation(seq)
  
  if (result.maxPeak > worstMaxPeak) {
    worstMaxPeak = result.maxPeak
    worstResult = result
    worstSeed = seed
  }
}

console.log(`\nPeor semilla encontrada: ${worstSeed} (max peak = ${worstMaxPeak})`)

if (worstResult) {
  console.log(`Total numbers: ${worstResult.totalNumbers}`)
  console.log(`Total peaks: ${worstResult.totalPeaks}`)
  console.log(`Max peak: ${worstResult.maxPeak}`)
  console.log(`Avg peak: ${worstResult.avgPeak.toFixed(2)}`)
  console.log(`Peaks >= 7: ${worstResult.peak7PlusCount}`)
  console.log(`Distribution:`, worstResult.peakDistribution)
  
  console.log(`\n--- Detalle de picos >= 5 ---`)
  const highPeaks = worstResult.peaks
    .map((p, i) => ({ idx: i, height: p }))
    .filter(x => x.height >= 5)
  
  for (const hp of highPeaks.slice(0, 15)) {
    const detail = worstResult.peak7PlusDetails.find(d => d.peakHeight === hp.height)
    if (detail) {
      console.log(`  Pico ${hp.height} (índice ${hp.idx}): predijo ${detail.predicted}`)
      console.log(`    Secuencia: ${detail.colors.join(', ')}`)
    }
  }
  
  console.log(`\n--- Precisión por nivel de streak ---`)
  console.log(`  Streak | Correct | Errors | Accuracy | Predicciones`)
  for (const s of worstResult.streakBasedAccuracy) {
    if (s.streak <= 10) {
      const total = s.corrects + s.errors
      console.log(`  ${String(s.streak).padStart(6)} | ${String(s.corrects).padStart(7)} | ${String(s.errors).padStart(6)} | ${s.accuracy.toFixed(1).padStart(7)}% | ${total}`)
    }
  }
}

// ═══════════════════════════════════════
// Additional: Find specific patterns that cause Pico 7+
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('ANÁLISIS: ¿Qué causa picos 7+?')
console.log('='.repeat(80))

// Run a specific scenario: what if there's a long streak that starts 
// right after another streak of the same color was interrupted?
const trickySeq = [
  // Build up Markov data that makes "B,B → R" very strong
  // Many short B streaks that break after 2
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, // Alternating R,B,R,B...
  12, 11, 14, 13, 16, 15, 18, 17, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 30, 32,
  // Now 10 consecutive Blacks
  2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 33
]

const trickyResult = fullSimulation(trickySeq)
console.log(`Tricky sequence peaks: [${trickyResult.peaks.join(', ')}]`)
console.log(`Max peak: ${trickyResult.maxPeak}`)
if (trickyResult.peak7PlusDetails.length > 0) {
  for (const d of trickyResult.peak7PlusDetails) {
    console.log(`  Pico ${d.peakHeight}: predijo ${d.predicted}, colors: ${d.colors.join(', ')}`)
  }
}

// ═══════════════════════════════════════
// KEY TEST: 2000 spins then inject 12-black streak
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TEST CLAVE: 2000 spins normales + racha de 12 Blacks')
console.log('='.repeat(80))

const baseSeq = generateRouletteSequence(2000, 42)
const longBlackStreak = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24]
const injectSeq = [...baseSeq, ...longBlackStreak]
const injectResult = fullSimulation(injectSeq)

console.log(`Total numbers: ${injectResult.totalNumbers}`)
console.log(`Max peak: ${injectResult.maxPeak}`)
console.log(`Peaks >= 7: ${injectResult.peak7PlusCount}`)

// Show the last 20 peaks
console.log(`\nÚltimos 30 picos (alrededor del streak inyectado):`)
const last30 = injectResult.peaks.slice(-30)
console.log(`  [${last30.join(', ')}]`)

// Show peaks 7+ details
if (injectResult.peak7PlusDetails.length > 0) {
  for (const d of injectResult.peak7PlusDetails.slice(-5)) {
    console.log(`  Pico ${d.peakHeight}: predijo ${d.predicted}`)
    console.log(`    Colors: ${d.colors.join(', ')}`)
    console.log(`    Numbers: ${d.numbers.join(', ')}`)
  }
}

// ═══════════════════════════════════════
// TRACE: Exact predictions during the injected streak
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TRACE: Predicciones paso a paso durante el streak inyectado')
console.log('='.repeat(80))

const traceStart = baseSeq.length - 5 // Start trace 5 before the streak
let tracePred: string | null = null
let tracePeak = 1

for (let i = traceStart; i < injectSeq.length; i++) {
  const num = injectSeq[i]
  const color = getNumberColor(num)
  
  if (!tracePred && i >= 4) {
    const smart = generateSmartPrediction(injectSeq.slice(0, i + 1), 'color')
    tracePred = smart.bestValue
  }
  
  if (!tracePred) continue
  
  // Calculate streak
  const nonZero = injectSeq.slice(0, i + 1).filter(n => n !== 0)
  let maxR = 0, maxB = 0
  nonZero.forEach(n => {
    const c = getNumberColor(n)
    if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
  })
  const streak = Math.max(maxR, maxB)
  const streakColor = maxR > maxB ? 'RED' : maxB > maxR ? 'BLACK' : '-'
  const mode = streak >= 6 ? 'ULTRA' : streak >= 2 ? 'SOFT' : 'NORMAL'
  
  const smart = generateSmartPrediction(injectSeq.slice(0, i + 1), 'color')
  const rConf = smart.options.find(o => o.value === 'red')?.confidence || 0
  const bConf = smart.options.find(o => o.value === 'black')?.confidence || 0
  
  const match = color === tracePred
  const idx = i - baseSeq.length + 2 // Relative to streak start
  
  if (i >= baseSeq.length - 1) {  // Only print near/after streak starts
    console.log(`  ${String(idx).padStart(3)} | #${String(num).padStart(2)}(${color.charAt(0).toUpperCase()}) | Str:${String(streak).padStart(2)} ${streakColor.padEnd(5)} | ${mode.padEnd(5)} | Pred: ${tracePred.padEnd(5)} (${match ? 'OK' : 'FAIL'}) | Peak:${String(tracePeak).padStart(2)}${match ? '→1' : '→'+(tracePeak+1)} | R:${String(rConf).padStart(2)}% B:${String(bConf).padStart(2)}%`)
  }
  
  if (match) {
    tracePeak = 1
    tracePred = null
  } else {
    tracePeak++
    if (i + 1 >= 4) {
      const newSmart = generateSmartPrediction(injectSeq.slice(0, i + 1), 'color')
      tracePred = newSmart.bestValue
    }
  }
}

// ═══════════════════════════════════════
// FINAL: Run 50 seeds, aggregate stats
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('ESTADÍSTICAS AGREGADAS: 50 semillas × 5000 spins')
console.log('='.repeat(80))

let totalMaxPeaks = 0
let totalPeak7 = 0
const allMaxPeaks: number[] = []

for (let seed = 1; seed <= 50; seed++) {
  const seq = generateRouletteSequence(5000, seed)
  const result = fullSimulation(seq)
  totalMaxPeaks = Math.max(totalMaxPeaks, result.maxPeak)
  totalPeak7 += result.peak7PlusCount
  allMaxPeaks.push(result.maxPeak)
}

allMaxPeaks.sort((a, b) => b - a)
console.log(`Max peak global: ${totalMaxPeaks}`)
console.log(`Total peaks >= 7: ${totalPeak7}`)
console.log(`Top 10 max peaks por semilla: [${allMaxPeaks.slice(0, 10).join(', ')}]`)
console.log(`Promedio max peak: ${(allMaxPeaks.reduce((a, b) => a + b, 0) / allMaxPeaks.length).toFixed(1)}`)
