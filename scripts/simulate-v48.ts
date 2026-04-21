/**
 * Simulación completa del motor v4.8 — reproduce el flujo exacto de DashboardLive
 * para encontrar qué causa Pico: 7+
 * 
 * El flujo en DashboardLive es:
 * 1. Generar predicción con generateSmartPrediction(nums, 'color')
 * 2. Entra número → check match
 * 3. Si MATCH → registrar pico, reset a 1, generar NUEVA predicción
 * 4. Si FAIL → incrementar pico, generar NUEVA predicción
 * 
 * La predicción se REGENERA en cada paso.
 */

import { generateSmartPrediction } from '../src/lib/smart-prediction-v4'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

interface SimResult {
  totalNumbers: number
  totalPeaks: number
  peaks: number[]  // height of each resolved peak
  peakDistribution: Record<string, number>
  maxPeak: number
  avgPeak: number
  peak7Plus: { startIdx: number; prediction: string; numbers: number[]; streakAtPrediction: number }[]
  streakErrors: { streakLen: number; errors: number; corrects: number }[]
}

function simulateSequence(numbers: number[]): SimResult {
  const peaks: number[] = []
  let currentPeak = 1
  let prediction: string | null = null
  let totalPeaks = 0
  const peak7Plus: SimResult['peak7Plus'] = []
  
  // Track streak-level performance
  const streakMap: Map<number, { errors: number; corrects: number }> = new Map()

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i]
    
    // Generate prediction if we have enough numbers (same as DashboardLive)
    if (i >= 4 && !prediction) {
      const smart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
      prediction = smart.bestValue
    }
    
    if (!prediction) continue
    
    const actualColor = getNumberColor(num)
    
    // Calculate streak at this point (for diagnostics)
    const nonZero = numbers.slice(0, i + 1).filter(n => n !== 0)
    let maxR = 0, maxB = 0
    nonZero.forEach(n => {
      const c = getNumberColor(n)
      if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
    })
    const currentStreak = Math.max(maxR, maxB)
    
    if (actualColor === prediction) {
      // MATCH - record peak and reset
      peaks.push(currentPeak)
      totalPeaks++
      
      if (currentPeak >= 7) {
        // Save the peak-7+ case for analysis
        peak7Plus.push({
          startIdx: Math.max(0, i - currentPeak),
          prediction,
          numbers: numbers.slice(Math.max(0, i - currentPeak), i + 1),
          streakAtPrediction: currentStreak
        })
      }
      
      // Track streak performance
      const key = currentStreak
      if (!streakMap.has(key)) streakMap.set(key, { errors: 0, corrects: 0 })
      streakMap.get(key)!.corrects++
      
      currentPeak = 1
      prediction = null
    } else {
      // FAIL
      if (actualColor !== 'green') {
        // Track streak performance
        const key = currentStreak
        if (!streakMap.has(key)) streakMap.set(key, { errors: 0, corrects: 0 })
        streakMap.get(key)!.errors++
      }
      
      currentPeak++
      
      // Regenerate prediction with ALL numbers so far (same as DashboardLive)
      if (i + 1 >= 4) {
        const smart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
        prediction = smart.bestValue
      }
    }
  }
  
  // Distribution
  const peakDistribution: Record<string, number> = {}
  peaks.forEach(p => {
    const key = p >= 10 ? '10+' : String(p)
    peakDistribution[key] = (peakDistribution[key] || 0) + 1
  })
  
  const streakErrors: SimResult['streakErrors'] = []
  const sortedStreaks = [...streakMap.entries()].sort((a, b) => a[0] - b[0])
  for (const [streakLen, stats] of sortedStreaks) {
    streakErrors.push({ streakLen, errors: stats.errors, corrects: stats.corrects })
  }
  
  return {
    totalNumbers: numbers.length,
    totalPeaks,
    peaks,
    peakDistribution,
    maxPeak: peaks.length > 0 ? Math.max(...peaks) : 0,
    avgPeak: peaks.length > 0 ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0,
    peak7Plus,
    streakErrors
  }
}

// ═══════════════════════════════════════
// TEST 1: Pure Black Streak (worst case)
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TEST 1: Streak puro de 15 Blacks seguidos (después de 5 números de calentamiento)')
console.log('='.repeat(80))

const warmup = [14, 32, 5, 17, 23]  // Mix of red and black
const blackStreak15 = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 33]
// All black: 2,4,6,8,10,11,13,15,17,20,22,24,26,28,33

const test1Seq = [...warmup, ...blackStreak15]
const result1 = simulateSequence(test1Seq)

console.log(`Total numbers: ${result1.totalNumbers}`)
console.log(`Total peaks: ${result1.totalPeaks}`)
console.log(`Peak heights: [${result1.peaks.join(', ')}]`)
console.log(`Max peak: ${result1.maxPeak}`)
console.log(`Avg peak: ${result1.avgPeak.toFixed(1)}`)
console.log(`Distribution:`, result1.peakDistribution)
console.log(`Peak 7+ cases: ${result1.peak7Plus.length}`)
for (const p of result1.peak7Plus) {
  console.log(`  Peak ${p.numbers.length}: predicted ${p.prediction}, sequence: ${p.numbers.map(n => `${n}(${getNumberColor(n)})`).join(', ')}`)
}

// ═══════════════════════════════════════
// TEST 2: Black streak with 0s interspersed
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TEST 2: Streak de Blacks con Greens (0) intercalados')
console.log('='.repeat(80))

const test2Seq = [...warmup, 2, 4, 0, 6, 8, 0, 10, 11, 0, 13, 15, 0, 17, 20, 22, 24, 26, 28, 33]
const result2 = simulateSequence(test2Seq)

console.log(`Peak heights: [${result2.peaks.join(', ')}]`)
console.log(`Max peak: ${result2.maxPeak}`)
console.log(`Distribution:`, result2.peakDistribution)
console.log(`Peak 7+ cases: ${result2.peak7Plus.length}`)
for (const p of result2.peak7Plus) {
  console.log(`  Peak ${p.numbers.length}: predicted ${p.prediction}, sequence: ${p.numbers.map(n => `${n}(${getNumberColor(n)})`).join(', ')}`)
}

// ═══════════════════════════════════════
// TEST 3: Long realistic sequence
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TEST 3: Secuencia realista larga (200 números) con rachas extremas')
console.log('='.repeat(80))

// Generate a sequence that includes a 10-black streak embedded in normal play
function generateTestSequence(): number[] {
  const nums: number[] = []
  // First 50: normal distribution
  const normalPhase = [14, 32, 0, 5, 17, 23, 8, 12, 36, 3, 19, 0, 25, 7, 28, 33, 1, 15, 21, 4,
    30, 11, 24, 9, 16, 34, 6, 27, 13, 2, 18, 22, 35, 20, 31, 10, 26, 0, 29, 3, 14, 8, 17, 23,
    36, 5, 12, 19, 33, 7]
  nums.push(...normalPhase)
  
  // Phase 2: 12-black streak (extreme)
  const blackStreak = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24]
  nums.push(...blackStreak)
  
  // Phase 3: 12-red streak (extreme opposite)
  const redStreak = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23]
  nums.push(...redStreak)
  
  // Phase 4: 15 more normal numbers
  const endPhase = [0, 32, 25, 8, 33, 11, 28, 4, 19, 36, 15, 22, 7, 30, 13]
  nums.push(...endPhase)
  
  return nums
}

const test3Seq = generateTestSequence()
const result3 = simulateSequence(test3Seq)

console.log(`Total numbers: ${result3.totalNumbers}`)
console.log(`Total peaks: ${result3.totalPeaks}`)
console.log(`Max peak: ${result3.maxPeak}`)
console.log(`Avg peak: ${result3.avgPeak.toFixed(1)}`)
console.log(`Distribution:`, result3.peakDistribution)
console.log(`\nPeak 5+ cases (detailed):`)
const highPeaks = result3.peaks.map((p, i) => ({ index: i, height: p })).filter(x => x.height >= 5)
for (const hp of highPeaks) {
  const peakData = result3.peak7Plus.find(p => p.numbers.length === hp.height)
  if (peakData) {
    console.log(`  Peak ${hp.height} at index ${hp.index}: predicted ${peakData.prediction}`)
    console.log(`    Sequence: ${peakData.numbers.map(n => `${n}(${getNumberColor(n).charAt(0).toUpperCase()})`).join(', ')}`)
  }
}

// ═══════════════════════════════════════
// TEST 4: Detailed trace of prediction at each step during a 10-black streak
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TEST 4: TRACE DETALLADO — predicción paso a paso durante streak de 10 Blacks')
console.log('='.repeat(80))

const traceWarmup = [14, 32, 5, 17, 23]  // R, B, R, B, R
const traceBlacks = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20]
const traceSeq = [...traceWarmup, ...traceBlacks]

let tracePrediction: string | null = null
let tracePeak = 1

for (let i = 0; i < traceSeq.length; i++) {
  const num = traceSeq[i]
  const color = getNumberColor(num)
  
  // Generate prediction first time
  if (i >= 4 && !tracePrediction) {
    const smart = generateSmartPrediction(traceSeq.slice(0, i + 1), 'color')
    tracePrediction = smart.bestValue
  }
  
  if (!tracePrediction) continue
  
  // Calculate streak
  const nonZero = traceSeq.slice(0, i + 1).filter(n => n !== 0)
  let maxR = 0, maxB = 0
  nonZero.forEach(n => {
    const c = getNumberColor(n)
    if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
  })
  const streak = Math.max(maxR, maxB)
  const streakColor = maxR > maxB ? 'RED' : 'BLACK'
  const mode = streak >= 6 ? 'ULTRA' : streak >= 2 ? 'SOFT' : 'NORMAL'
  
  const smart = generateSmartPrediction(traceSeq.slice(0, i + 1), 'color')
  
  const match = color === tracePrediction
  const status = match ? '✓ MATCH' : '✗ FAIL'
  
  console.log(`Step ${i}: #${num}(${color.charAt(0).toUpperCase()}) | Streak: ${streak} ${streakColor} | Mode: ${mode} | Predicted: ${tracePrediction} | ${status} | Peak: ${tracePeak}${match ? '→1' : '→' + (tracePeak + 1)} | Confidence: ${smart.bestConfidence}% | Options: R=${smart.options.find(o => o.value === 'red')?.confidence}% B=${smart.options.find(o => o.value === 'black')?.confidence}%`)
  
  if (match) {
    tracePeak = 1
    tracePrediction = null
  } else {
    tracePeak++
    // Regenerate prediction (same as DashboardLive)
    const newSmart = generateSmartPrediction(traceSeq.slice(0, i + 1), 'color')
    tracePrediction = newSmart.bestValue
  }
}

// ═══════════════════════════════════════
// TEST 5: What does Markov predict during streaks?
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TEST 5: Análisis de Markov-2 durante un streak creciente de Blacks')
console.log('='.repeat(80))

// Build up a sequence gradually and see what Markov says
const markovTestSeq = [14, 32, 5, 17, 23]  // Start: R, B, R, B, R
const blackNums = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20]

for (let b = 0; b < blackNums.length; b++) {
  markovTestSeq.push(blackNums[b])
  const smart = generateSmartPrediction(markovTestSeq, 'color')
  const nonZero = markovTestSeq.filter(n => n !== 0)
  let maxR = 0, maxB = 0
  nonZero.forEach(n => {
    const c = getNumberColor(n)
    if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
  })
  const streak = Math.max(maxR, maxB)
  const mode = streak >= 6 ? 'ULTRA' : streak >= 2 ? 'SOFT' : 'NORMAL'
  
  const redConf = smart.options.find(o => o.value === 'red')?.confidence || 0
  const blackConf = smart.options.find(o => o.value === 'black')?.confidence || 0
  
  console.log(`After adding #${blackNums[b]}(B): streak=${streak}, mode=${mode} | Prediction: ${smart.bestValue} | Red: ${redConf}% | Black: ${blackConf}% | Diff: ${Math.abs(redConf - blackConf)}%`)
}

// ═══════════════════════════════════════
// TEST 6: Very long alternating pattern (worst case for Markov)
// ═══════════════════════════════════════
console.log('\n' + '='.repeat(80))
console.log('TEST 6: Patrón alternante largo R,B,R,B,R,B...')
console.log('='.repeat(80))

const altSeq = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 11, 14, 13, 16, 15, 18, 17, 19, 20, 
  21, 22, 23, 24, 25, 26, 27, 28, 30, 32, 34, 33, 36, 35]
const result6 = simulateSequence(altSeq)
console.log(`Total numbers: ${result6.totalNumbers}`)
console.log(`Peaks: [${result6.peaks.slice(0, 30).join(', ')}...]`)
console.log(`Max peak: ${result6.maxPeak}`)
console.log(`Distribution:`, result6.peakDistribution)

console.log('\n' + '='.repeat(80))
console.log('RESUMEN')
console.log('='.repeat(80))
console.log(`Test 1 (15B streak): max peak = ${result1.maxPeak}`)
console.log(`Test 2 (B streak + 0s): max peak = ${result2.maxPeak}`)
console.log(`Test 3 (realistic + extremes): max peak = ${result3.maxPeak}`)
console.log(`Test 6 (alternating): max peak = ${result6.maxPeak}`)
