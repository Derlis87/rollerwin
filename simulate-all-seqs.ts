import { generateSmartPrediction } from './src/lib/smart-prediction-v4';

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(n) ? 'red' : 'black';
}

function checkMatch(prediction: { type: string; value: string | number }, num: number): boolean {
  const predColor = prediction.value as string;
  const numColor = getNumberColor(num);
  if (numColor === 'green') return false;
  return predColor === numColor;
}

async function simulate(label: string, numbers: number[]) {
  let bankroll = 0;
  let totalSignals = 0;
  let wins = 0;
  let losses = 0;
  let skips = 0;
  let currentPeak = 1;
  let maxPeak = 1;
  let busts = 0;
  let worstBankroll = 0;
  let peakHistory: number[] = [];

  for (let i = 5; i < numbers.length; i++) {
    const window = numbers.slice(0, i + 1);
    const smart = generateSmartPrediction(window, 'color');

    if (smart.shouldSkip) { skips++; continue; }

    totalSignals++;
    const prediction = { type: smart.type, value: smart.bestValue };
    const matched = checkMatch(prediction, numbers[i]);

    if (matched) {
      bankroll += 1;
      wins++;
      if (currentPeak >= 2) peakHistory.push(currentPeak);
      currentPeak = 1;
    } else {
      bankroll -= 1;
      losses++;
      currentPeak++;
      if (currentPeak > maxPeak) maxPeak = currentPeak;
      if (currentPeak >= 7) busts++;
    }
    if (bankroll < worstBankroll) worstBankroll = bankroll;
  }

  const accuracy = totalSignals > 0 ? (wins / totalSignals * 100).toFixed(1) : '0';
  const roi = totalSignals > 0 ? (bankroll / totalSignals * 100).toFixed(2) : '0';
  const avgPeak = peakHistory.length > 0 ? (peakHistory.reduce((a, b) => a + b, 0) / peakHistory.length).toFixed(1) : '0';

  console.log(`\n=== ${label} (${numbers.length} spins) ===`);
  console.log(`  Señales:   ${totalSignals} | Skips: ${skips} | Ratio: ${totalSignals + skips > 0 ? (totalSignals/(totalSignals+skips)*100).toFixed(1) : 0}%`);
  console.log(`  Precisión: ${accuracy}% (${wins}W / ${losses}L)`);
  console.log(`  Bankroll:  ${bankroll >= 0 ? '+' : ''}${bankroll} u | ROI: ${roi}%`);
  console.log(`  Drawdown:  ${worstBankroll} u`);
  console.log(`  Pico máx:  ${maxPeak} | Busts (7+): ${busts}`);
  console.log(`  Picos resueltos: ${peakHistory.length} | Promedio: ${avgPeak}`);
  console.log(`  Picos bajos (1-3): ${peakHistory.filter(p => p <= 3).length}`);
  console.log(`  Picos medios (4-6): ${peakHistory.filter(p => p >= 4 && p <= 6).length}`);
  console.log(`  Picos altos (7+): ${peakHistory.filter(p => p >= 7).length}`);

  return { bankroll, totalSignals, wins, losses, maxPeak };
}

async function main() {
  const fs = await import('fs');

  const raw4 = fs.readFileSync('/home/z/my-project/download/clean-sequence-4.txt', 'utf-8');
  const numbers4 = raw4.replace(/\n/g, ',').split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

  const raw5 = fs.readFileSync('/home/z/my-project/download/clean-sequence-5.txt', 'utf-8');
  const numbers5 = raw5.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

  const raw6 = fs.readFileSync('/home/z/my-project/download/clean-sequence-6.txt', 'utf-8');
  const numbers6 = raw6.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

  console.log('═══════════════════════════════════════════════════');
  console.log('  SIMULACIÓN V6.0 PURO — TODAS LAS SECUENCIAS');
  console.log('  Lectura: fila por fila, izquierda a derecha');
  console.log('═══════════════════════════════════════════════════');

  await simulate('Seq 4', numbers4);
  await simulate('Seq 5', numbers5);
  await simulate('Seq 6', numbers6);

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  RESUMEN COMPARATIVO');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Seq 4 (5,406): base original');
  console.log('  Seq 5 (5,646): +240 spins nuevos');
  console.log('  Seq 6 (5,846): +200 spins más (total +440 vs seq4)');
}

main().catch(console.error);
