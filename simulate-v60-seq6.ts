import { generateSmartPrediction } from './src/lib/smart-prediction-v4';

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n) ? 'red' : 'black';
}

function checkMatch(prediction: { type: string; value: string | number }, num: number, betType: string): boolean {
  if (betType === 'color') {
    const predColor = prediction.value as string;
    const numColor = getNumberColor(num);
    if (numColor === 'green') return false;
    return predColor === numColor;
  }
  return false;
}

async function main() {
  const fs = await import('fs');
  const raw = fs.readFileSync('/home/z/my-project/download/clean-sequence-6.txt', 'utf-8');
  const numbers = raw.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
  
  console.log(`\n=== SIMULACIÓN V6.0 PURO — Secuencia 6 (${numbers.length} spins) ===\n`);
  console.log(`Lectura: fila por fila, izquierda a derecha`);
  console.log(`Apuesta: color (paga 1:1)\n`);

  let bankroll = 0;
  let totalSignals = 0;
  let wins = 0;
  let losses = 0;
  let skips = 0;
  let currentPeak = 1;
  let maxPeak = 1;
  let peakHistory: number[] = [];
  let signalDetails: { spin: number; num: number; pred: string; result: string; bankroll: number; peak: number }[] = [];
  let bustCount = 0;
  
  for (let i = 5; i < numbers.length; i++) {
    const window = numbers.slice(0, i + 1);
    const smart = generateSmartPrediction(window, 'color');
    
    if (smart.shouldSkip) {
      skips++;
      continue;
    }
    
    totalSignals++;
    const prediction = { type: smart.type, value: smart.bestValue };
    const actualNumber = numbers[i];
    const matched = checkMatch(prediction, actualNumber, 'color');
    
    if (matched) {
      // Win: payout 1:1
      const payout = 1;
      bankroll += payout;
      wins++;
      signalDetails.push({ spin: i + 1, num: actualNumber, pred: prediction.value as string, result: 'WIN', bankroll, peak: currentPeak });
      
      if (currentPeak >= 2) {
        peakHistory.push(currentPeak);
      }
      currentPeak = 1;
    } else {
      // Loss
      const loss = 1;
      bankroll -= loss;
      losses++;
      currentPeak++;
      if (currentPeak > maxPeak) maxPeak = currentPeak;
      signalDetails.push({ spin: i + 1, num: actualNumber, pred: prediction.value as string, result: 'LOSS', bankroll, peak: currentPeak });
      
      if (currentPeak >= 7) {
        bustCount++;
      }
    }
  }
  
  const accuracy = totalSignals > 0 ? (wins / totalSignals * 100).toFixed(1) : '0';
  const avgPeak = peakHistory.length > 0 ? (peakHistory.reduce((a, b) => a + b, 0) / peakHistory.length).toFixed(1) : '0';
  const roi = totalSignals > 0 ? (bankroll / totalSignals * 100).toFixed(2) : '0';
  
  console.log(`--- RESULTADOS ---`);
  console.log(`Señales:     ${totalSignals}`);
  console.log(`Skips:       ${skips}`);
  console.log(`Ratio señal: ${totalSignals + skips > 0 ? (totalSignals / (totalSignals + skips) * 100).toFixed(1) : 0}%`);
  console.log(`Aciertos:    ${wins}`);
  console.log(`Fallos:      ${losses}`);
  console.log(`Precisión:   ${accuracy}%`);
  console.log(`Bankroll:    ${bankroll >= 0 ? '+' : ''}${bankroll} unidades`);
  console.log(`ROI:         ${roi}%`);
  console.log(`Pico máximo: ${maxPeak}`);
  console.log(`Busts (7+):  ${bustCount}`);
  console.log(`Promedio pico (resueltos): ${avgPeak}`);
  console.log(`Picos bajos (1-3): ${peakHistory.filter(p => p <= 3).length}`);
  console.log(`Picos medios (4-6): ${peakHistory.filter(p => p >= 4 && p <= 6).length}`);
  console.log(`Picos altos (7+): ${peakHistory.filter(p => p >= 7).length}`);
  
  // Bankroll progression every 100 signals
  console.log(`\n--- PROGRESIÓN BANROLL (cada 100 señales) ---`);
  for (let s = 0; s < signalDetails.length; s += 100) {
    const chunk = signalDetails.slice(s, Math.min(s + 100, signalDetails.length));
    const endBank = chunk[chunk.length - 1].bankroll;
    const w = chunk.filter(d => d.result === 'WIN').length;
    console.log(`Señales ${s + 1}-${Math.min(s + 100, signalDetails.length)}: ${endBank >= 0 ? '+' : ''}${endBank} u (${w}/${chunk.length} aciertos)`);
  }
  
  // Peak distribution
  console.log(`\n--- DISTRIBUCIÓN DE PICOS RESUELTOS ---`);
  const peakDist: Record<number, number> = {};
  for (const p of peakHistory) {
    peakDist[p] = (peakDist[p] || 0) + 1;
  }
  for (const [h, c] of Object.entries(peakDist).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    const bar = '█'.repeat(c);
    console.log(`Pico ${h}: ${String(c).padStart(3)} ${bar}`);
  }
  
  // Last 20 signals detail
  console.log(`\n--- ÚLTIMAS 20 SEÑALES ---`);
  const last20 = signalDetails.slice(-20);
  for (const d of last20) {
    const icon = d.result === 'WIN' ? '✅' : '❌';
    console.log(`${icon} Spin ${d.spin}: pred=${d.pred} → num=${d.num} | bankroll=${d.bankroll >= 0 ? '+' : ''}${d.bankroll} | pico=${d.peak}`);
  }
}

main().catch(console.error);
