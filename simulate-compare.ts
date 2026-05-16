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

async function main() {
  const fs = await import('fs');
  
  // Load seq 5 (5,646 numbers)
  const raw5 = fs.readFileSync('/home/z/my-project/download/clean-sequence-5.txt', 'utf-8');
  const numbers5 = raw5.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
  
  // Load seq 6 (5,846 numbers)
  const raw6 = fs.readFileSync('/home/z/my-project/download/clean-sequence-6.txt', 'utf-8');
  const numbers6 = raw6.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

  // Simulate ONLY the new 200 spins (spins 5647-5846) with context of seq5
  console.log(`\n=== ANÁLISIS: Qué pasó en los 200 spins NUEVOS ===\n`);
  
  let bankroll_at_seq5 = 0;
  let signals_at_seq5 = 0;
  let wins_at_seq5 = 0;
  let losses_at_seq5 = 0;
  let maxPeak_at_seq5 = 1;
  let currentPeak = 1;
  
  // First simulate seq5 fully to get the state at spin 5646
  for (let i = 5; i < numbers5.length; i++) {
    const window = numbers5.slice(0, i + 1);
    const smart = generateSmartPrediction(window, 'color');
    
    if (smart.shouldSkip) continue;
    
    signals_at_seq5++;
    const prediction = { type: smart.type, value: smart.bestValue };
    const actualNumber = numbers5[i];
    const matched = checkMatch(prediction, actualNumber);
    
    if (matched) {
      bankroll_at_seq5 += 1;
      wins_at_seq5++;
      if (currentPeak > maxPeak_at_seq5) maxPeak_at_seq5 = currentPeak;
      currentPeak = 1;
    } else {
      bankroll_at_seq5 -= 1;
      losses_at_seq5++;
      currentPeak++;
      if (currentPeak > maxPeak_at_seq5) maxPeak_at_seq5 = currentPeak;
    }
  }
  
  console.log(`Estado al final de Seq 5 (5,646 spins):`);
  console.log(`  Bankroll: ${bankroll_at_seq5 >= 0 ? '+' : ''}${bankroll_at_seq5} u`);
  console.log(`  Señales: ${signals_at_seq5} | Wins: ${wins_at_seq5} | Losses: ${losses_at_seq5}`);
  console.log(`  Precisión: ${(wins_at_seq5/signals_at_seq5*100).toFixed(1)}%`);
  console.log(`  Pico máx: ${maxPeak_at_seq5}`);
  console.log(`  Pico actual al terminar: ${currentPeak}`);
  
  // Now simulate ONLY the 200 new spins
  let new_signals = 0;
  let new_wins = 0;
  let new_losses = 0;
  let new_bankroll = 0;
  let new_maxPeak = currentPeak;
  let worst_bankroll = bankroll_at_seq5;
  let running_bankroll = bankroll_at_seq5;
  let peak_start = currentPeak; // carry over the peak from seq5
  
  console.log(`\nSimulando los 200 spins nuevos (5647-5846) con pico inicial=${peak_start}...\n`);
  
  // Use full seq6 (it contains all numbers including seq5)
  for (let i = numbers5.length; i < numbers6.length; i++) {
    const window = numbers6.slice(0, i + 1);
    const smart = generateSmartPrediction(window, 'color');
    
    if (smart.shouldSkip) continue;
    
    new_signals++;
    const prediction = { type: smart.type, value: smart.bestValue };
    const actualNumber = numbers6[i];
    const matched = checkMatch(prediction, actualNumber);
    
    if (matched) {
      running_bankroll += 1;
      new_bankroll += 1;
      new_wins++;
      if (running_bankroll < worst_bankroll) worst_bankroll = running_bankroll;
      if (peak_start > new_maxPeak) new_maxPeak = peak_start;
      peak_start = 1;
    } else {
      running_bankroll -= 1;
      new_bankroll -= 1;
      new_losses++;
      peak_start++;
      if (peak_start > new_maxPeak) new_maxPeak = peak_start;
      if (running_bankroll < worst_bankroll) worst_bankroll = running_bankroll;
    }
  }
  
  console.log(`Resultado de los 200 spins nuevos:`);
  console.log(`  Señales nuevas: ${new_signals}`);
  console.log(`  Aciertos: ${new_wins} | Fallos: ${new_losses}`);
  console.log(`  Precisión nueva: ${new_signals > 0 ? (new_wins/new_signals*100).toFixed(1) : 0}%`);
  console.log(`  Bankroll contribuido: ${new_bankroll >= 0 ? '+' : ''}${new_bankroll} u`);
  console.log(`  Pico máximo en nueva zona: ${new_maxPeak}`);
  console.log(`  Peor bankroll alcanzado: ${worst_bankroll} u (drawdown: ${bankroll_at_seq5 - worst_bankroll} u)`);
  
  console.log(`\nComparación final:`);
  console.log(`  Seq 5 sola:    ${bankroll_at_seq5 >= 0 ? '+' : ''}${bankroll_at_seq5} u | ${signals_at_seq5} señales | ${(wins_at_seq5/signals_at_seq5*100).toFixed(1)}% | pico máx ${maxPeak_at_seq5}`);
  console.log(`  Seq 6 completa: ${bankroll_at_seq5 + new_bankroll >= 0 ? '+' : ''}${bankroll_at_seq5 + new_bankroll} u | ${signals_at_seq5 + new_signals} señales | ${((wins_at_seq5+new_wins)/(signals_at_seq5+new_signals)*100).toFixed(1)}% | pico máx ${new_maxPeak}`);
}

main().catch(console.error);
