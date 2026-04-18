/**
 * Simulación ENFOCADA v4.8 — identifica exactamente qué causa Pico: 7+
 * 
 * Enfoque: crear historial controlado donde Markov tiene sesgo anti-racha,
 * luego inyectar un streak largo y ver qué pasa.
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
  console.log(`\n${'═'.repeat(70)}`)
  console.log(`  ${label}`)
  console.log(`${'═'.repeat(70)}`)
  
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
    
    const nonZero = numbers.slice(0, i + 1).filter(n => n !== 0)
    let maxR = 0, maxB = 0
    nonZero.forEach(n => {
      const c = getNumberColor(n)
      if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 }
    })
    const streak = Math.max(maxR, maxB)
    const streakColor = maxR > maxB ? 'R' : 'B'
    const mode = streak >= 6 ? 'ULTRA' : streak >= 2 ? 'SOFT' : 'NORM'
    
    const smart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
    const rConf = smart.options.find(o => o.value === 'red')?.confidence || 0
    const bConf = smart.options.find(o => o.value === 'black')?.confidence || 0
    
    const match = color === prediction
    
    if (match) {
      peakHeights.push(currentPeak)
      maxPeak = Math.max(maxPeak, currentPeak)
      if (currentPeak >= 3) {
        console.log(`  #${String(num).padStart(2)}(${color.charAt(0).toUpperCase()}) str=${streak}${streakColor} ${mode} | pred=${prediction} ✓ PEAK=${currentPeak}→1 | R:${rConf}% B:${bConf}%`)
      }
      currentPeak = 1
      prediction = null
    } else {
      if (currentPeak >= 3 || i >= numbers.length - 15) {
        console.log(`  #${String(num).padStart(2)}(${color.charAt(0).toUpperCase()}) str=${streak}${streakColor} ${mode} | pred=${prediction} ✗ peak=${currentPeak}→${currentPeak+1} | R:${rConf}% B:${bConf}%`)
      }
      currentPeak++
      if (i + 1 >= 4) {
        const newSmart = generateSmartPrediction(numbers.slice(0, i + 1), 'color')
        prediction = newSmart.bestValue
      }
    }
  }
  
  console.log(`  ── RESULTADO: peaks=[${peakHeights.join(',')}] max=${maxPeak}`)
  return { peakHeights, maxPeak }
}

// ═════════════════════════════════════════════════
// TEST A: Historial con muchos "BB→R" (rachas cortas que rompen)
// Esto simula lo que pasa con miles de spins reales
// ═════════════════════════════════════════════════
const historyBBtoR: number[] = []
// Create 200 spins where "B,B" is almost always followed by R
for (let i = 0; i < 100; i++) {
  historyBBtoR.push(BLACK_NUMS[i % 18], BLACK_NUMS[(i + 5) % 18], RED_NUMS[i % 18])
  // Pattern: B, B, R repeated 100 times
  // Markov-2 will learn: BB → R with very high confidence
}

// Now inject 12 consecutive Blacks
const testA = [...historyBBtoR, ...BLACK_NUMS.slice(0, 12)]
traceSequence(testA, 'TEST A: Historial "BB→R" fuerte + streak de 12 Blacks')

// ═════════════════════════════════════════════════
// TEST B: Historial alternante R,B,R,B + streak largo
// ═════════════════════════════════════════════════
const historyAlt: number[] = []
for (let i = 0; i < 150; i++) {
  historyAlt.push(RED_NUMS[i % 18], BLACK_NUMS[(i + 7) % 18])
}
// Inject 12 Blacks
const testB = [...historyAlt, ...BLACK_NUMS.slice(0, 12)]
traceSequence(testB, 'TEST B: Historial alternante R,B + 12 Blacks')

// ═════════════════════════════════════════════════
// TEST C: Historial con rachas de 3-4 que rompen
// (simula datos reales donde rachas de 3-4 son comunes y suelen romper)
// ═════════════════════════════════════════════════
const historyStreak3: number[] = []
for (let i = 0; i < 80; i++) {
  // Streak of 3 Blacks then Red
  historyStreak3.push(BLACK_NUMS[i % 18], BLACK_NUMS[(i+3) % 18], BLACK_NUMS[(i+7) % 18], RED_NUMS[i % 18])
  // Then streak of 3 Reds then Black
  historyStreak3.push(RED_NUMS[(i+2) % 18], RED_NUMS[(i+5) % 18], RED_NUMS[(i+9) % 18], BLACK_NUMS[(i+2) % 18])
}
const testC = [...historyStreak3, ...BLACK_NUMS.slice(0, 12)]
traceSequence(testC, 'TEST C: Historial rachas de 3-4 + 12 Blacks')

// ═════════════════════════════════════════════════
// TEST D: Secuencia REAL del usuario (si existe en el contexto)
// Usamos una secuencia realista que cause picos altos
// ═════════════════════════════════════════════════

// Simulate what happens when the engine has seen
// many patterns and a rare 10+ streak occurs
const realisticHistory: number[] = []
// Mix of patterns: singles, doubles, triples, occasional long streaks
const patterns = [
  [1, 2],       // RB
  [3, 4, 5],    // RBB
  [6, 7, 8, 9], // RBBR
  [10, 11],     // BB
  [12, 13, 14], // RRR
  [15, 16],     // BB
  [17, 18, 19, 20, 21], // RBBBR
  [22, 23],     // RR
  [24, 25, 26, 27],    // BBBR
  [28, 29, 30], // RRR
  [0],          // Green
  [31, 32, 33], // BBB
  [34, 35, 36], // RRR
]
// Repeat patterns many times to build history
for (let rep = 0; rep < 30; rep++) {
  for (const pat of patterns) {
    realisticHistory.push(...pat)
  }
}

const testD = [...realisticHistory, ...BLACK_NUMS.slice(0, 12)]
traceSequence(testD, 'TEST D: Historial realista mixta + 12 Blacks')

// ═════════════════════════════════════════════════
// TEST E: Streak de RED (no Black) — confirma simetría
// ═════════════════════════════════════════════════
const testE = [...historyAlt, ...RED_NUMS.slice(0, 12)]
traceSequence(testE, 'TEST E: Historial alternante + 12 Reds (simetría)')

// ═════════════════════════════════════════════════
// TEST F: Secuencia que intercala 0 (Green) en el streak
// Green no es rojo ni negro → siempre es FAIL → infla el pico
// ═════════════════════════════════════════════════
const testF = [...historyAlt, 2, 4, 0, 6, 8, 0, 10, 11, 0, 13, 15, 0, 17, 20, 0, 22, 24]
traceSequence(testF, 'TEST F: 12 Blacks con 0s intercalados (Green infla pico)')

// ═════════════════════════════════════════════════
// TEST G: Patrón R,B,B,R,B,B repetido (Markov ve BBB como raro)
// ═════════════════════════════════════════════════
const historyRBB: number[] = []
for (let i = 0; i < 100; i++) {
  historyRBB.push(RED_NUMS[i % 18], BLACK_NUMS[(i+3) % 18], BLACK_NUMS[(i+7) % 18])
  // R, B, B pattern → Markov learns RBB → R (next R starts)
}
const testG = [...historyRBB, ...BLACK_NUMS.slice(0, 12)]
traceSequence(testG, 'TEST G: Historial "R,B,B" repetido + 12 Blacks')

console.log('\n' + '═'.repeat(70))
console.log('  RESUMEN DE RESULTADOS')
console.log('═'.repeat(70))
console.log('Si algún test muestra max peak >= 7, ESE es el bug.')
console.log('Si ningún test llega a 7, el problema es específico')
console.log('de la secuencia REAL del usuario (no reproducible con datos sintéticos).')
