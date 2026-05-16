/**
 * Simulador V6.0 Puro — importa el motor real de smart-prediction-v4.ts
 * Analiza secuencia de números y calcula: señales, accuracy, neto, ROI, busts, pico máximo
 * 
 * PICO = racha de errores consecutivos antes de acertar (o bust)
 * Ejemplo: pierdo 3, acierto → pico 3. Pierdo 7 seguidos → bust (pico 7+)
 */
import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory } from './src/lib/smart-prediction-v4'

const RED_SET = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])

function getColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

// Martingala: apuesta 1,2,4,8,16,32,64 (max 7 niveles, bust = -127)
const MARTINGALE = [1, 2, 4, 8, 16, 32, 64]
const MARTINGALE_MAX_LEVEL = 6 // 0-indexed levels 0-6

interface SimResult {
  totalSpins: number
  totalSignals: number
  totalSkips: number
  signalRate: number
  hits: number
  misses: number
  greens: number
  accuracy: number
  netUnits: number
  totalWagered: number
  roi: number
  busts: number
  maxPeak: number
  peakDistribution: { low: number; medium: number; high: number }
  longestWinStreak: number
  longestLoseStreak: number
  allPeaks: number[]      // Every completed losing streak (recovered or busted)
  martingaleCycles: number // Completed martingala cycles (recovered after losses)
}

function simulate(nums: number[]): SimResult {
  resetRecoveryHistory()
  
  const result: SimResult = {
    totalSpins: nums.length,
    totalSignals: 0,
    totalSkips: 0,
    signalRate: 0,
    hits: 0,
    misses: 0,
    greens: 0,
    accuracy: 0,
    netUnits: 0,
    totalWagered: 0,
    roi: 0,
    busts: 0,
    maxPeak: 0,
    peakDistribution: { low: 0, medium: 0, high: 0 },
    longestWinStreak: 0,
    longestLoseStreak: 0,
    allPeaks: [],
    martingaleCycles: 0
  }
  
  let martingaleLevel = 0  // Current martingala level (0 = base bet)
  let currentLoseStreak = 0 // Consecutive losses in current cycle
  let currentWinStreak = 0
  let maxWinStreak = 0
  let maxLoseStreak = 0
  
  for (let i = 0; i < nums.length; i++) {
    if (i < 5) continue // Engine needs minimum 5 numbers
    
    const history = nums.slice(0, i)
    const nextNumber = nums[i]
    
    const prediction = generateSmartPrediction(history, 'color')
    
    // SKIP: no signal, don't bet
    if (prediction.shouldSkip || !prediction.bestValue || prediction.bestValue === '') {
      result.totalSkips++
      continue
    }
    
    result.totalSignals++
    const predictedColor = prediction.bestValue
    const actualColor = getColor(nextNumber)
    
    // GREEN = house edge (lose the bet)
    if (actualColor === 'green') {
      result.greens++
      result.misses++
      const betAmount = MARTINGALE[Math.min(martingaleLevel, MARTINGALE_MAX_LEVEL)]
      result.netUnits -= betAmount
      result.totalWagered += betAmount
      
      martingaleLevel++
      currentLoseStreak++
      currentWinStreak = 0
      maxLoseStreak = Math.max(maxLoseStreak, currentLoseStreak)
      
      // Bust check
      if (martingaleLevel > MARTINGALE_MAX_LEVEL) {
        result.busts++
        result.allPeaks.push(currentLoseStreak) // Record peak (busted)
        const peak = currentLoseStreak
        if (peak <= 3) result.peakDistribution.low++
        else if (peak <= 6) result.peakDistribution.medium++
        else result.peakDistribution.high++
        result.maxPeak = Math.max(result.maxPeak, peak)
        martingaleLevel = 0
        currentLoseStreak = 0
      }
      continue
    }
    
    const hit = predictedColor === actualColor
    recordPredictionFeedback(hit, [], predictedColor)
    
    if (hit) {
      result.hits++
      const betAmount = MARTINGALE[Math.min(martingaleLevel, MARTINGALE_MAX_LEVEL)]
      result.netUnits += betAmount
      result.totalWagered += betAmount
      
      currentWinStreak++
      currentLoseStreak = 0
      maxWinStreak = Math.max(maxWinStreak, currentWinStreak)
      
      // If we were in a losing streak, record the peak (recovered)
      if (martingaleLevel > 0) {
        result.allPeaks.push(martingaleLevel)
        const peak = martingaleLevel
        if (peak <= 3) result.peakDistribution.low++
        else if (peak <= 6) result.peakDistribution.medium++
        else result.peakDistribution.high++
        result.maxPeak = Math.max(result.maxPeak, peak)
        result.martingaleCycles++
      }
      
      martingaleLevel = 0
    } else {
      result.misses++
      const betAmount = MARTINGALE[Math.min(martingaleLevel, MARTINGALE_MAX_LEVEL)]
      result.netUnits -= betAmount
      result.totalWagered += betAmount
      
      martingaleLevel++
      currentLoseStreak++
      currentWinStreak = 0
      maxLoseStreak = Math.max(maxLoseStreak, currentLoseStreak)
      
      // Bust check
      if (martingaleLevel > MARTINGALE_MAX_LEVEL) {
        result.busts++
        result.allPeaks.push(currentLoseStreak)
        const peak = currentLoseStreak
        if (peak <= 3) result.peakDistribution.low++
        else if (peak <= 6) result.peakDistribution.medium++
        else result.peakDistribution.high++
        result.maxPeak = Math.max(result.maxPeak, peak)
        martingaleLevel = 0
        currentLoseStreak = 0
      }
    }
  }
  
  // If there's an unfinished losing streak at the end, record it
  if (currentLoseStreak > 0) {
    result.allPeaks.push(currentLoseStreak)
    const peak = currentLoseStreak
    if (peak <= 3) result.peakDistribution.low++
    else if (peak <= 6) result.peakDistribution.medium++
    else result.peakDistribution.high++
    result.maxPeak = Math.max(result.maxPeak, peak)
  }
  
  const totalBets = result.hits + result.misses
  result.accuracy = totalBets > 0 ? (result.hits / totalBets) * 100 : 0
  result.signalRate = nums.length > 5 ? (result.totalSignals / (nums.length - 5)) * 100 : 0
  result.longestWinStreak = maxWinStreak
  result.longestLoseStreak = maxLoseStreak
  
  return result
}

async function main() {
  const fs = await import('fs')
  const path = await import('path')
  
  const seqPath = process.argv[2] || './download/clean-sequence-4.txt'
  const raw = fs.readFileSync(path.resolve(seqPath), 'utf-8')
  const nums = raw.split(/[,\s\n]+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 36)
  
  console.log(`\n${'═'.repeat(65)}`)
  console.log(`  SIMULACIÓN V6.0 PURO — MOTOR REAL`)
  console.log(`${'═'.repeat(65)}`)
  console.log(`  Archivo:    ${seqPath}`)
  console.log(`  Números:    ${nums.length} (0-36 validados)`)
  console.log(`${'═'.repeat(65)}\n`)
  
  const r = simulate(nums)
  
  console.log(`📊 RESULTADOS`)
  console.log(`${'─'.repeat(45)}`)
  console.log(`  Total spins evaluados:   ${r.totalSpins}`)
  console.log(`  Señales (apuestas):      ${r.totalSignals}`)
  console.log(`  Skips (no apuesta):      ${r.totalSkips}`)
  console.log(`  Tasa de señal:           ${r.signalRate.toFixed(1)}%`)
  console.log(`  Verdes (house edge):     ${r.greens}`)
  console.log(``)
  console.log(`🎯 PRECISIÓN`)
  console.log(`${'─'.repeat(45)}`)
  console.log(`  Aciertos:                ${r.hits}`)
  console.log(`  Fallos:                  ${r.misses}`)
  console.log(`  Accuracy:                ${r.accuracy.toFixed(1)}%`)
  console.log(`  Edge vs random (50%):    ${(r.accuracy - 50).toFixed(1)}%`)
  console.log(``)
  console.log(`💰 RENTABILIDAD`)
  console.log(`${'─'.repeat(45)}`)
  console.log(`  Neto:                    ${r.netUnits > 0 ? '+' : ''}${r.netUnits} unidades`)
  console.log(`  Total apostado:          ${r.totalWagered} unidades`)
  console.log(`  ROI:                     ${r.totalWagered > 0 ? ((r.netUnits / r.totalWagered) * 100).toFixed(2) : '0.00'}%`)
  console.log(`  Ciclos martingala:       ${r.martingaleCycles} (recuperados tras losses)`)
  console.log(`  Neto por señal:          ${r.totalSignals > 0 ? (r.netUnits / r.totalSignals).toFixed(2) : '0'} u/señal`)
  console.log(`  Neto por 100 spins:      ${(r.netUnits / r.totalSpins * 100).toFixed(2)} u/100spins`)
  console.log(``)
  console.log(`⚡ Picos Y RACHAS`)
  console.log(`${'─'.repeat(45)}`)
  console.log(`  Busts (7+ losses seg):   ${r.busts}`)
  console.log(`  Pico máximo:             ${r.maxPeak}`)
  console.log(`  Total picos (rachas):    ${r.allPeaks.length}`)
  console.log(`  Racha wins más larga:    ${r.longestWinStreak}`)
  console.log(`  Racha losses más larga:  ${r.longestLoseStreak}`)
  console.log(``)
  
  if (r.allPeaks.length > 0) {
    const totalPeaks = r.peakDistribution.low + r.peakDistribution.medium + r.peakDistribution.high
    console.log(`  Distribución de picos:`)
    console.log(`    Bajos (1-3):           ${r.peakDistribution.low}  (${(r.peakDistribution.low/totalPeaks*100).toFixed(1)}%)`)
    console.log(`    Medios (4-6):          ${r.peakDistribution.medium}  (${(r.peakDistribution.medium/totalPeaks*100).toFixed(1)}%)`)
    console.log(`    Altos (7+):            ${r.peakDistribution.high}  (${(r.peakDistribution.high/totalPeaks*100).toFixed(1)}%)`)
    const medHigh = r.peakDistribution.medium + r.peakDistribution.high
    if (medHigh > 0) {
      console.log(`    Ratio bajos/(med+alt):  ${(r.peakDistribution.low / medHigh).toFixed(2)}:1`)
    } else {
      console.log(`    Ratio bajos/(med+alt):  ∞:1 (sin picos medios/altos)`)
    }
    console.log(``)
    console.log(`  Estadísticas de picos:`)
    const avg = r.allPeaks.reduce((a, b) => a + b, 0) / r.allPeaks.length
    const sorted = [...r.allPeaks].sort((a, b) => a - b)
    const median = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    console.log(`    Promedio:               ${avg.toFixed(1)}`)
    console.log(`    Mediana:                ${median}`)
    console.log(`    Pico más común:         ${(() => { const freq: Record<number, number> = {}; r.allPeaks.forEach(p => freq[p] = (freq[p]||0)+1); return Object.entries(freq).sort((a,b) => b[1]-a[1])[0]; })()?.[0] || 'N/A'} (${(() => { const freq: Record<number, number> = {}; r.allPeaks.forEach(p => freq[p] = (freq[p]||0)+1); return Object.entries(freq).sort((a,b) => b[1]-a[1])[0]; })()?.[1] || 0}x)`)
    
    // Peak histogram
    console.log(``)
    console.log(`  Histograma de picos:`)
    const peakFreq: Record<number, number> = {}
    r.allPeaks.forEach(p => peakFreq[p] = (peakFreq[p] || 0) + 1)
    const maxFreq = Math.max(...Object.values(peakFreq))
    for (let p = 1; p <= Math.max(...r.allPeaks); p++) {
      const count = peakFreq[p] || 0
      const bar = '█'.repeat(Math.round(count / maxFreq * 20))
      console.log(`    Pico ${p}: ${count.toString().padStart(4)} ${bar}`)
    }
  }
  
  console.log(`\n${'═'.repeat(65)}`)
  if (r.netUnits > 0) {
    console.log(`  ✅ RENTABLE: +${r.netUnits} unidades en ${r.totalSpins} spins`)
    console.log(`     Accuracy ${r.accuracy.toFixed(1)}% | ${r.totalSignals} señales | ${r.busts} busts`)
    console.log(`     Proyección: +${(r.netUnits / r.totalSpins * 100).toFixed(1)} u / 100 spins`)
  } else {
    console.log(`  ❌ NO RENTABLE: ${r.netUnits} unidades en ${r.totalSpins} spins`)
    console.log(`     Accuracy ${r.accuracy.toFixed(1)}% — necesita >50% con martingala`)
  }
  console.log(`${'═'.repeat(65)}\n`)
}

main().catch(console.error)
