/**
 * Analyze correlations between V6.0 engine signals and prediction success
 * to find the most profitable technical indicator for roulette "trading".
 */
import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory } from '../src/lib/smart-prediction-v4'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
function getColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}
function parseSeq(text: string): number[] {
  return text.split(/[,\s;\n\r|]+/).map(s => s.trim()).filter(s => s.length > 0)
    .map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n >= 0 && n <= 36)
}

const fs = require('fs')
const numbers = parseSeq(fs.readFileSync(process.argv[2], 'utf-8'))
console.log(`Loaded: ${numbers.length} numbers`)

interface Bet {
  idx: number; predicted: string; actual: string; correct: boolean
  signalStrength: number; streakLen: number; streakColor: string
  ra10: number; ra20: number; ra30: number
  rs10: number; rs20: number
  balanceChange: number; mStep: number
  rawLossStreak: number
}

const MIN_HIST = 10
resetRecoveryHistory()
const bets: Bet[] = []
let mStep = 0
const mBets = [1, 2, 4]
const correctHist: boolean[] = []
const sigHist: number[] = []
let rawLoss = 0

for (let i = MIN_HIST; i < numbers.length; i++) {
  const hist = numbers.slice(0, i)
  const nxt = numbers[i]
  const pred = generateSmartPrediction(hist, 'color')
  if (!pred.bestValue) continue

  const actual = getColor(nxt)
  const predicted = pred.bestValue
  const ss = pred.signalStrength || 0

  let sLen = 0, sCol = ''
  for (let j = hist.length - 1; j >= 0; j--) {
    const c = getColor(hist[j])
    if (c === 'green') continue
    if (sLen === 0) { sCol = c; sLen = 1 }
    else if (c === sCol) { sLen++ }
    else { break }
  }

  if (pred.shouldSkip) { mStep = 0; continue }

  const ok = predicted === actual
  recordPredictionFeedback(ok, ['markov'], predicted)
  correctHist.push(ok)
  sigHist.push(ss)

  const l10 = correctHist.slice(-10)
  const l20 = correctHist.slice(-20)
  const l30 = correctHist.slice(-30)
  const ra10 = l10.filter(Boolean).length / l10.length
  const ra20 = l20.filter(Boolean).length / l20.length
  const ra30 = l30.filter(Boolean).length / l30.length

  const s10 = sigHist.slice(-10)
  const s20 = sigHist.slice(-20)
  const rs10 = s10.reduce((a, b) => a + b, 0) / s10.length
  const rs20 = s20.reduce((a, b) => a + b, 0) / s20.length

  let bal = 0
  const stepIdx = Math.min(mStep, 2)
  if (actual === 'green') {
    bal = -mBets[stepIdx]; mStep++; rawLoss++
    if (mStep >= 3) { mStep = 0; rawLoss = 0 }
  } else if (ok) {
    bal = mBets[stepIdx]; mStep = 0; rawLoss = 0
  } else {
    bal = -mBets[stepIdx]; mStep++; rawLoss++
    if (mStep >= 3) { mStep = 0; rawLoss = 0 }
  }

  bets.push({
    idx: i, predicted, actual, correct: ok,
    signalStrength: ss, streakLen: sLen, streakColor: sCol,
    ra10, ra20, ra30, rs10, rs20,
    balanceChange: bal, mStep: stepIdx, rawLossStreak: rawLoss
  })
}

const total = bets.length
const corrects = bets.filter(b => b.correct).length
const net = bets.reduce((s, b) => s + b.balanceChange, 0)
console.log(`\nTotal betted: ${total} | Correct: ${corrects} | Accuracy: ${(corrects/total*100).toFixed(1)}% | Net: ${net >= 0 ? '+' : ''}${net}`)

function bucketAnalyze(data: Bet[], getBucket: (b: Bet) => string, labels: Record<string, string>) {
  const buckets: Record<string, { c: number; t: number; n: number }> = {}
  for (const b of data) {
    const k = getBucket(b)
    if (!buckets[k]) buckets[k] = { c: 0, t: 0, n: 0 }
    buckets[k].t++
    if (b.correct) buckets[k].c++
    buckets[k].n += b.balanceChange
  }
  console.log('   Bucket               | Bets | Accuracy | Net      | ROI')
  console.log('   ' + '-'.repeat(58))
  const entries = Object.entries(buckets).sort((a, b) => b[1].n - a[1].n)
  for (const [k, v] of entries) {
    if (v.t === 0) continue
    const acc = (v.c / v.t * 100).toFixed(1)
    const roi = (v.n / (v.t * 1.56) * 100).toFixed(1)
    const label = (labels[k] || k).padEnd(20)
    const netStr = (v.n >= 0 ? '+' : '') + String(v.n).padStart(7)
    console.log(`   ${label}| ${String(v.t).padStart(4)} | ${acc.padStart(5)}%  | ${netStr} | ${roi.padStart(5)}%`)
  }
}

// ═══ 1: Signal Strength ═══
console.log('\n' + '='.repeat(60))
console.log('  1. SIGNAL STRENGTH vs ACCURACY')
console.log('='.repeat(60))
bucketAnalyze(bets, b => {
  if (b.signalStrength < 40) return 'a_ss_0_40'
  if (b.signalStrength < 50) return 'b_ss_40_50'
  if (b.signalStrength < 60) return 'c_ss_50_60'
  if (b.signalStrength < 70) return 'd_ss_60_70'
  if (b.signalStrength < 80) return 'e_ss_70_80'
  return 'f_ss_80+'
}, {
  'a_ss_0_40': '0-40 (Muy Debil)',
  'b_ss_40_50': '40-50 (Debil)',
  'c_ss_50_60': '50-60 (Medio)',
  'd_ss_60_70': '60-70 (Alto)',
  'e_ss_70_80': '70-80 (Muy Alto)',
  'f_ss_80+': '80+ (Extremo)'
})

// ═══ 2: Rolling Accuracy 10 ═══
console.log('\n' + '='.repeat(60))
console.log('  2. ROLLING ACCURACY (10 spins) como predictor')
console.log('='.repeat(60))
bucketAnalyze(bets, b => {
  if (b.ra10 < 0.40) return 'a_ra_cold'
  if (b.ra10 < 0.50) return 'b_ra_cool'
  if (b.ra10 < 0.55) return 'c_ra_neutral'
  if (b.ra10 < 0.65) return 'd_ra_warm'
  if (b.ra10 < 0.75) return 'e_ra_hot'
  return 'f_ra_fire'
}, {
  'a_ra_cold': '<40% (Helado)',
  'b_ra_cool': '40-50% (Frio)',
  'c_ra_neutral': '50-55% (Neutral)',
  'd_ra_warm': '55-65% (Caliente)',
  'e_ra_hot': '65-75% (Muy Caliente)',
  'f_ra_fire': '>75% (En Fuego!!)'
})

// ═══ 3: MACD-like Signal Trend ═══
console.log('\n' + '='.repeat(60))
console.log('  3. SIGNAL TREND (MACD: shortMA - longMA)')
console.log('='.repeat(60))
bucketAnalyze(bets, b => {
  const macd = b.rs10 - b.rs20
  if (macd < -10) return 'a_macd_strong_down'
  if (macd < -3) return 'b_macd_down'
  if (macd < 3) return 'c_macd_flat'
  if (macd < 10) return 'd_macd_up'
  return 'e_macd_strong_up'
}, {
  'a_macd_strong_down': 'MACD << 0 (Fuerte Bajada)',
  'b_macd_down': 'MACD < 0 (Bajada)',
  'c_macd_flat': 'MACD ~ 0 (Lateral)',
  'd_macd_up': 'MACD > 0 (Subida)',
  'e_macd_strong_up': 'MACD >> 0 (Fuerte Subida)'
})

// ═══ 4: Consecutive Context ═══
console.log('\n' + '='.repeat(60))
console.log('  4. CONSECUTIVE WIN/LOSS CONTEXT')
console.log('='.repeat(60))
let wStrk = 0, lStrk = 0
const ctxBets = bets.map(b => {
  const ctx = wStrk >= 3 ? 'a_3plus_wins' : wStrk === 2 ? 'b_2_wins' : wStrk === 1 ? 'c_1_win' : lStrk >= 2 ? 'e_2plus_losses' : 'd_1_loss'
  if (b.correct) { wStrk++; lStrk = 0 } else { lStrk++; wStrk = 0 }
  return { ...b, ctx }
})
bucketAnalyze(ctxBets, b => b.ctx, {
  'a_3plus_wins': 'Tras 3+ Wins (Momentum)',
  'b_2_wins': 'Tras 2 Wins',
  'c_1_win': 'Tras 1 Win',
  'd_1_loss': 'Tras 1 Loss',
  'e_2plus_losses': 'Tras 2+ Losses (Rebote?)'
})

// ═══ 5: Streak at Bet Time ═══
console.log('\n' + '='.repeat(60))
console.log('  5. STREAK LENGTH en spins apostados')
console.log('='.repeat(60))
bucketAnalyze(bets, b => {
  if (b.streakLen <= 1) return 's0'
  if (b.streakLen === 2) return 's2'
  if (b.streakLen === 7) return 's7'
  if (b.streakLen === 8) return 's8'
  if (b.streakLen >= 9) return 's9+'
  return 's_skip' // 3-6 should be skipped
}, {
  's0': 'Streak 0-1 (NORMAL)',
  's2': 'Streak 2 (SOFT)',
  's7': 'Streak 7 (ULTRA)',
  's8': 'Streak 8 (ULTRA+)',
  's9+': 'Streak 9+ (ULTRA++)',
  's_skip': 'Streak 3-6 (SKIP ZONE!)'
})

// ═══ 6: COMPOSITE — Best Combo ═══
console.log('\n' + '='.repeat(60))
console.log('  6. COMPOSITE: Rolling Acc + Signal Strength')
console.log('='.repeat(60))
bucketAnalyze(bets, b => {
  const ra = b.ra10
  const ss = b.signalStrength
  if (ra >= 0.70 && ss >= 70) return 'f_super'
  if (ra >= 0.60 && ss >= 60) return 'e_optimal'
  if (ra >= 0.50 && ss >= 55) return 'd_normal'
  if (ra < 0.40 || ss < 40) return 'a_danger'
  return 'b_caution'
}, {
  'f_super': 'SUPER (RA>=70% AND SS>=70)',
  'e_optimal': 'OPTIMO (RA>=60% AND SS>=60)',
  'd_normal': 'NORMAL (RA>=50% AND SS>=55)',
  'b_caution': 'PRECAUCION (marginal)',
  'a_danger': 'PELIGRO (RA<40% OR SS<40)'
})

// ═══ 7: SIMULATION — What if we add filters on top? ═══
console.log('\n' + '='.repeat(60))
console.log('  7. SIMULACION: FILTROS ADICIONALES sobre V6.0')
console.log('  (sin cambiar el modelo, solo agregando indicador)')
console.log('='.repeat(60))

function simFilter(label: string, filter: (b: Bet, idx: number, allBets: Bet[]) => boolean) {
  let fNet = 0, fBets = 0, fOk = 0, fBusts = 0
  let fmStep = 0, fRawLoss = 0
  for (const b of bets) {
    if (!filter(b, fBets, bets)) { fmStep = 0; fRawLoss = 0; continue }
    fBets++
    if (b.correct) {
      fOk++; fNet += mBets[Math.min(fmStep, 2)]; fmStep = 0; fRawLoss = 0
    } else {
      fNet -= mBets[Math.min(fmStep, 2)]; fmStep++; fRawLoss++
      if (fmStep >= 3) { fBusts++; fmStep = 0; fRawLoss = 0 }
    }
  }
  const acc = fBets > 0 ? (fOk / fBets * 100).toFixed(1) : '0.0'
  const roi = fBets > 0 ? (fNet / (fBets * 1.56) * 100).toFixed(1) : '0.0'
  const netStr = (fNet >= 0 ? '+' : '') + fNet
  console.log(`   ${label.padEnd(32)}| ${String(fBets).padStart(4)} bets | ${acc.padStart(5)}% | ${netStr.padStart(7)} | ${roi.padStart(5)}% ROI | ${fBusts} busts`)
  return { fNet, fBets, fBusts }
}

console.log('')
const base = simFilter('BASELINE V6.0 (sin filtro)', () => true)
console.log('   ' + '-'.repeat(85))
simFilter('Filtro A: RA10 >= 50%', (b) => b.ra10 >= 0.50)
simFilter('Filtro B: RA10 >= 55%', (b) => b.ra10 >= 0.55)
simFilter('Filtro C: SS >= 55', (b) => b.signalStrength >= 55)
simFilter('Filtro D: RA10>=50% AND SS>=55', (b) => b.ra10 >= 0.50 && b.signalStrength >= 55)
simFilter('Filtro E: RA10>=55% AND SS>=60', (b) => b.ra10 >= 0.55 && b.signalStrength >= 60)
simFilter('Filtro F: RA10>=60% AND SS>=65', (b) => b.ra10 >= 0.60 && b.signalStrength >= 65)
simFilter('Filtro G: MACD >= 0 (uptrend)', (b) => (b.rs10 - b.rs20) >= 0)
simFilter('Filtro H: RA10>=50% OR MACD>=0', (b) => b.ra10 >= 0.50 || (b.rs10 - b.rs20) >= 0)
simFilter('Filtro I: NOT(RA10<45% AND SS<50)', (b) => !(b.ra10 < 0.45 && b.signalStrength < 50))

// ═══ 8: DYNAMIC BET SIZING (Kelly-inspired) ═══
console.log('\n' + '='.repeat(60))
console.log('  8. SIZING DINAMICO (apostar mas cuando edge es alto)')
console.log('  (sin cambiar modelo, solo ajustando tamano de apuesta)')
console.log('='.repeat(60))

function simKelly(label: string, getBetSize: (b: Bet) => number) {
  let fNet = 0, fBets = 0, fOk = 0
  for (const b of bets) {
    const sz = getBetSize(b)
    if (sz <= 0) continue
    fBets++
    if (b.correct) { fOk++; fNet += sz }
    else { fNet -= sz }
  }
  const acc = fBets > 0 ? (fOk / fBets * 100).toFixed(1) : '0.0'
  const roi = fBets > 0 ? (fNet / fBets * 100).toFixed(1) : '0.0'
  const netStr = (fNet >= 0 ? '+' : '') + fNet
  console.log(`   ${label.padEnd(35)}| ${String(fBets).padStart(4)} bets | ${acc.padStart(5)}% | ${netStr.padStart(7)} | ROI: ${roi}%`)
}

console.log('')
simKelly('FIXED (1 unidad siempre)', () => 1)
simKelly('KELLY suave: apuesta = RA10 * 2', (b) => Math.max(0.5, b.ra10 * 2))
simKelly('SIGNAL: apuesta = SS / 50 (max 3)', (b) => Math.min(3, Math.max(0.5, b.signalStrength / 50)))
simKelly('COMBO: apuesta = (RA10*0.6 + SS/100*0.4) * 2', (b) => Math.max(0.5, (b.ra10 * 0.6 + b.signalStrength / 100 * 0.4) * 2))
simKelly('KELLY puro: (2*p - 1), min 0.5', (b) => Math.max(0.5, Math.min(3, 2 * b.ra10 - 1)))

// ═══ FINAL RECOMMENDATION ═══
console.log('\n' + '='.repeat(60))
console.log('  RECOMENDACION FINAL')
console.log('='.repeat(60))
