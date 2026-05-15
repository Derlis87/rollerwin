/**
 * Validación v4.9 vs v4.8 — mismo test focused para comparar
 */

import { generateSmartPrediction } from '../src/lib/smart-prediction-v4'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
const RED_NUMS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const BLACK_NUMS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

function traceSequence(numbers: number[], label: string) {
  let prediction: string | null = null
  let currentPeak = 1
  let maxPeak = 0
  const peakHeights: number[] = []
  
  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i]
    const color = getNumberColor(num)
    
    if (i >= 4 && !prediction) {
      const smart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
      prediction = smart.bestValue
    }
    if (!prediction) continue
    
    if (color === prediction) {
      peakHeights.push(currentPeak)
      maxPeak = Math.max(maxPeak, currentPeak)
      currentPeak = 1
      prediction = null
    } else {
      currentPeak++
      if (i + 1 >= 4) {
        const newSmart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
        prediction = newSmart.bestValue
      }
    }
  }
  
  // Distribution
  const dist: Record<string, number> = {}
  peakHeights.forEach(p => { dist[p] = (dist[p] || 0) + 1 })
  
  console.log(`  ${label}: max=${maxPeak}, peaks=${JSON.stringify(dist)}, total=${peakHeights.length}`)
  return { peakHeights, maxPeak }
}

console.log('╔══════════════════════════════════════════════════════════════╗')
console.log('║  VALIDACIÓN v4.9 — Streak-Context Dampening                ║')
console.log('╚══════════════════════════════════════════════════════════════╝')

// ═══ TEST A: Historial "BB→R" fuerte + 12 Blacks ═══
console.log('\n--- TEST A: Historial "BB→R" fuerte + 12 Blacks ---')
const histBBR: number[] = []
for (let i = 0; i < 100; i++) {
  histBBR.push(BLACK_NUMS[i % 18], BLACK_NUMS[(i + 5) % 18], RED_NUMS[i % 18])
}
traceSequence([...histBBR, ...BLACK_NUMS.slice(0, 12)], 'v4.9')

// ═══ TEST B: Alternante + 12 Blacks ═══
console.log('\n--- TEST B: Alternante R,B + 12 Blacks ---')
const histAlt: number[] = []
for (let i = 0; i < 150; i++) {
  histAlt.push(RED_NUMS[i % 18], BLACK_NUMS[(i + 7) % 18])
}
traceSequence([...histAlt, ...BLACK_NUMS.slice(0, 12)], 'v4.9')

// ═══ TEST C: Rachas de 3-4 + 12 Blacks ═══
console.log('\n--- TEST C: Rachas de 3-4 + 12 Blacks ---')
const histS3: number[] = []
for (let i = 0; i < 80; i++) {
  histS3.push(BLACK_NUMS[i % 18], BLACK_NUMS[(i+3) % 18], BLACK_NUMS[(i+7) % 18], RED_NUMS[i % 18])
  histS3.push(RED_NUMS[(i+2) % 18], RED_NUMS[(i+5) % 18], RED_NUMS[(i+9) % 18], BLACK_NUMS[(i+2) % 18])
}
traceSequence([...histS3, ...BLACK_NUMS.slice(0, 12)], 'v4.9')

// ═══ TEST D: Realista mixta + 12 Blacks ═══
console.log('\n--- TEST D: Realista mixta + 12 Blacks ---')
const histMix: number[] = []
const patterns = [
  [1, 2], [3, 4, 5], [6, 7, 8, 9], [10, 11], [12, 13, 14],
  [15, 16], [17, 18, 19, 20, 21], [22, 23], [24, 25, 26, 27],
  [28, 29, 30], [0], [31, 32, 33], [34, 35, 36]
]
for (let rep = 0; rep < 30; rep++) {
  for (const pat of patterns) histMix.push(...pat)
}
traceSequence([...histMix, ...BLACK_NUMS.slice(0, 12)], 'v4.9')

// ═══ TEST E: Simetría - 12 Reds ═══
console.log('\n--- TEST E: Alternante + 12 Reds (simetría) ---')
traceSequence([...histAlt, ...RED_NUMS.slice(0, 12)], 'v4.9')

// ═══ TEST F: Greens intercalados ═══
console.log('\n--- TEST F: Blacks con 0s intercalados ---')
traceSequence([...histAlt, 2, 4, 0, 6, 8, 0, 10, 11, 0, 13, 15, 0, 17, 20, 0, 22, 24], 'v4.9')

// ═══ TEST G: "R,B,B" + 12 Blacks ═══
console.log('\n--- TEST G: "R,B,B" + 12 Blacks ---')
const histRBB: number[] = []
for (let i = 0; i < 100; i++) {
  histRBB.push(RED_NUMS[i % 18], BLACK_NUMS[(i+3) % 18], BLACK_NUMS[(i+7) % 18])
}
traceSequence([...histRBB, ...BLACK_NUMS.slice(0, 12)], 'v4.9')

// ═══ TRACE DETALLADO: Predicciones paso a paso durante 12-Black streak ═══
console.log('\n--- TRACE: Paso a paso durante 12-Black streak (Test A) ---')
const traceSeq = [...histBBR, ...BLACK_NUMS.slice(0, 12)]
let tPred: string | null = null
let tPeak = 1
let tMaxPeak = 0

for (let i = traceSeq.length - 15; i < traceSeq.length; i++) {
  const num = traceSeq[i]
  const color = getNumberColor(num)
  
  if (!tPred && i >= 4) {
    const smart = generateSmartPrediction(traceSeq.slice(0, i + 1), 'color')
    tPred = smart.bestValue
  }
  if (!tPred) continue
  
  const nonZero = traceSeq.slice(0, i + 1).filter(n => n !== 0)
  let maxR = 0, maxB = 0
  nonZero.forEach(n => {
    const c = getNumberColor(n)
    if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
  })
  const streak = Math.max(maxR, maxB)
  const mode = streak >= 6 ? 'ULTRA' : streak >= 2 ? 'SOFT' : 'NORM'
  
  const smart = generateSmartPrediction(traceSeq.slice(0, i + 1), 'color')
  const rConf = smart.options.find(o => o.value === 'red')?.confidence || 0
  const bConf = smart.options.find(o => o.value === 'black')?.confidence || 0
  
  const match = color === tPred
  
  console.log(`  #${String(num).padStart(2)}(${color.charAt(0).toUpperCase()}) str=${streak} ${mode.padEnd(5)} | pred=${tPred.padEnd(5)} ${match ? '✓' : '✗'} peak=${tPeak}${match ? '→1' : '→'+(tPeak+1)} | R:${rConf}% B:${bConf}%`)
  
  if (match) {
    tMaxPeak = Math.max(tMaxPeak, tPeak)
    tPeak = 1
    tPred = null
  } else {
    tPeak++
    if (i + 1 >= 4) {
      const ns = generateSmartPrediction(traceSeq.slice(0, i + 1), 'color')
      tPred = ns.bestValue
    }
  }
}
tMaxPeak = Math.max(tMaxPeak, tPeak)

console.log(`\n  Trace max peak: ${tMaxPeak}`)
console.log(`\n  v4.8 baseline (from previous run): max peak = 5`)
console.log(`  v4.9 result: max peak = ${tMaxPeak}`)
console.log(`  ${tMaxPeak < 5 ? '✅ MEJORA: Pico reducido!' : tMaxPeak === 5 ? '⚠️ Igual que v4.8' : '❌ PEOR que v4.8'}`)
