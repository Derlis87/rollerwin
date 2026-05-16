/**
 * Simulador v6.1e — V6.0 + EMI Soft Martingala Reset
 * 
 * EMI no filtra apuestas. Solo resetea martingala cuando RA10 < 48%.
 * Todas las apuestas se realizan → accuracy se mantiene.
 * Martingala se resetea más seguido → menos busts, mejor net.
 */

import { generateSmartPrediction, recordPredictionFeedback, resetRecoveryHistory } from '../src/lib/smart-prediction-v4'
import { EngineMomentumIndex, EMI_CONFIG, EMI_LEVEL_INFO } from '../src/lib/emi'

const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
function getColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'; return RED_SET.has(n) ? 'red' : 'black'
}
function parseSeq(t: string): number[] {
  return t.split(/[,\s;\n\r|]+/).map(s => s.trim()).filter(s => s.length > 0)
    .map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n >= 0 && n <= 36)
}

interface SimResult {
  totalNumbers: number; totalPredictions: number; skipped: number
  skippedByEngine: number; skippedByCooldown: number; betted: number
  correct: number; incorrect: number; accuracy: number
  peaks: number[]; peakStats: { low: number; medium: number; high: number }; maxPeak: number
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; bustCount: number; maxConsecutiveLoss: number }
  greenCount: number
  emi: { martResets: number; finalRA10: number; levelDist: Record<string, number> }
}

function simulate(numbers: number[], emiEnabled: boolean): SimResult {
  const MIN_H = 10, CD_LOSS = 1, CD_BUST = 3, CD_GREEN = 1
  const peaks: number[] = []; let curPeak = 0
  let correct = 0, incorrect = 0, totalPred = 0, totalSkip = 0
  let skipEng = 0, skipCD = 0, totalBet = 0, greenCt = 0
  let mStep = 0; const mBets = [1, 2, 4]
  let mTB = 0, mTW = 0, bustCt = 0
  let rawLoss = 0, maxRL = 0
  let cdRemain = 0
  const emi = new EngineMomentumIndex(EMI_CONFIG)
  const emiD = { resets: 0, levels: {} as Record<string, number> }

  resetRecoveryHistory()

  for (let i = MIN_H; i < numbers.length; i++) {
    const hist = numbers.slice(0, i), nxt = numbers[i]
    const pred = generateSmartPrediction(hist, 'color')
    if (!pred.bestValue) continue
    totalPred++
    const predicted = pred.bestValue, engSkip = pred.shouldSkip === true
    const actual = getColor(nxt)

    // Cooldown
    if (cdRemain > 0) { cdRemain--; skipCD++; totalSkip++; if (actual === 'green') greenCt++; continue }

    // Engine skip
    if (engSkip) { skipEng++; totalSkip++; mStep = 0; if (actual === 'green') greenCt++; continue }

    const ok = actual !== 'green' && predicted === actual
    totalBet++
    if (actual === 'green') greenCt++
    recordPredictionFeedback(ok, ['markov'], predicted)

    // EMI: check if martingala should be reset (soft reset, NOT skip)
    if (emiEnabled) {
      const state = emi.getState()
      emiD.levels[state.level] = (emiD.levels[state.level] || 0) + 1
      if (state.shouldResetMartingala) {
        mStep = 0  // Reset martingala — free timeout
        rawLoss = 0
        emiD.resets++
        // Still record the bet for EMI tracking
      }
      emi.recordBet(ok)
    }

    // Process bet result
    if (actual === 'green') {
      mTB += mBets[Math.min(mStep, 2)]; mStep++; rawLoss++
      if (rawLoss > maxRL) maxRL = rawLoss
      if (mStep >= 3) { bustCt++; mStep = 0; rawLoss = 0; cdRemain = CD_BUST }
      else { cdRemain = CD_GREEN }
    } else if (ok) {
      correct++; mTB += mBets[Math.min(mStep, 2)]; mTW += mBets[Math.min(mStep, 2)] * 2
      mStep = 0; rawLoss = 0; peaks.push(curPeak + 1); curPeak = 0
    } else {
      incorrect++; mTB += mBets[Math.min(mStep, 2)]; mStep++; rawLoss++
      if (rawLoss > maxRL) maxRL = rawLoss
      if (mStep >= 3) { bustCt++; mStep = 0; rawLoss = 0; cdRemain = CD_BUST }
      else { cdRemain = CD_LOSS }
      curPeak++
    }
  }

  if (curPeak > 0) peaks.push(curPeak)
  const low = peaks.filter(p => p >= 1 && p <= 3).length
  const med = peaks.filter(p => p >= 4 && p <= 6).length
  const high = peaks.filter(p => p >= 7).length
  const mNet = mTW - mTB, mROI = mTB > 0 ? (mNet / mTB) * 100 : 0
  const acc = totalBet > 0 ? (correct / totalBet) * 100 : 0

  return {
    totalNumbers: numbers.length, totalPredictions: totalPred, skipped: totalSkip,
    skippedByEngine: skipEng, skippedByCooldown: skipCD, betted: totalBet,
    correct, incorrect, accuracy: acc, peaks,
    peakStats: { low, medium: med, high }, maxPeak: peaks.length > 0 ? Math.max(...peaks) : 0,
    martingale: { totalBet: mTB, totalWin: mTW, netResult: mNet, roi: mROI, bustCount: bustCt, maxConsecutiveLoss: maxRL },
    greenCount: greenCt,
    emi: { martResets: emiD.resets, finalRA10: emi.getState().ra10, levelDist: emiD.levels },
  }
}

const fs = require('fs')
const nums = parseSeq(fs.readFileSync(process.argv[2], 'utf-8'))
if (nums.length < 15) { console.error('Need 15+ numbers'); process.exit(1) }
console.log(`Sequence: ${nums.length} numbers\n`)

const v60 = simulate(nums, false)
const v61 = simulate(nums, true)

const print = (r: SimResult, label: string) => {
  const m = r.martingale
  console.log(`  ${label}`)
  console.log(`  Accuracy: ${r.accuracy.toFixed(1)}% | Bets: ${r.betted} | Net: ${m.netResult >= 0 ? '+' : ''}${m.netResult} | ROI: ${m.roi.toFixed(1)}% | Busts: ${m.bustCount} | MaxLoss: ${m.maxConsecutiveLoss}`)
  console.log(`  Peaks: ${r.peaks.length} (L:${r.peakStats.low} M:${r.peakStats.medium} H:${r.peakStats.high})`)
}

console.log('='.repeat(55))
print(v60, 'V6.0 BASELINE')
console.log('-'.repeat(55))
print(v61, 'V6.1 + EMI (soft reset)')
console.log('='.repeat(55))
console.log(`  Accuracy: ${v60.accuracy.toFixed(1)}% → ${v61.accuracy.toFixed(1)}%`)
console.log(`  Bets: ${v60.betted} → ${v61.betted}`)
console.log(`  Net: ${v60.martingale.netResult} → ${v61.martingale.netResult} (${v61.martingale.netResult - v60.martingale.netResult})`)
console.log(`  ROI: ${v60.martingale.roi.toFixed(1)}% → ${v61.martingale.roi.toFixed(1)}%`)
console.log(`  Busts: ${v60.martingale.bustCount} → ${v61.martingale.bustCount}`)
if (v61.emi.martResets > 0) {
  console.log(`  EMI: ${v61.emi.martResets} martingala resets | RA10: ${(v61.emi.finalRA10 * 100).toFixed(1)}%`)
  console.log(`  Levels: ${Object.entries(v61.emi.levelDist).map(([k, v]) => `${EMI_LEVEL_INFO[k as keyof typeof EMI_LEVEL_INFO]?.emoji || ''}${k}:${v}`).join(' ')}`)
}
