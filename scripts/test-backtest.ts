const seq = '27, 14, 6, 24, 7, 25, 33, 2, 10, 6, 22, 15, 18, 34, 20, 34, 13, 13, 23, 13, 3, 36, 26, 25, 15, 6, 11, 29, 18, 32, 11, 24, 13, 33, 24, 26, 34, 4, 15, 18, 16, 23, 28, 0, 11, 33, 19, 8, 16, 14, 19, 12, 21, 11, 29, 4, 26, 25, 16, 16, 28, 0, 0, 28, 35, 9, 36, 29, 26, 11, 4, 10, 22, 5, 9, 34, 7, 16, 35, 1, 27, 10, 24, 9, 32, 7, 6, 14, 14, 29, 23, 18, 12, 26, 34, 30, 24';

async function main() {
  const resp = await fetch('http://localhost:3000/api/backtest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence: seq })
  });

  const r = await resp.json();

  if (r.error) { console.log('ERROR:', r.error); return; }

  console.log("=== BACKTEST RESULTS ===");
  console.log("Total numbers:", r.totalNumbers);
  console.log("Total predictions:", r.totalPredictions);
  console.log("Betted:", r.betted);
  console.log("Correct:", r.correct);
  console.log("Incorrect:", r.incorrect);
  console.log("Accuracy:", r.accuracy?.toFixed(1) + "%");
  console.log("Skipped:", r.skipped, "(engine:", r.skippedByEngine, "cooldown:", r.skippedByCooldown, ")");
  console.log("Green (0):", r.greenCount);
  console.log("");
  console.log("PEAKS:", JSON.stringify(r.peaks));
  console.log("Peak stats:", JSON.stringify(r.peakStats));
  console.log("Max peak:", r.maxPeak);
  console.log("");

  const RED = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  function getColor(n) { return n === 0 ? 'green' : RED.includes(n) ? 'red' : 'black'; }

  console.log("=== BETTED STEPS ===");
  for (const step of (r.steps || [])) {
    if (step.shouldSkip) continue;
    const num = step.number;
    const col = getColor(num);
    const pred = step.predictedColor || '?';
    const ok = step.isCorrect ? 'OK' : 'NO';
    console.log(`#${String(step.index).padStart(2)} num=${String(num).padStart(2)} (${col.padEnd(5)}) pred=${pred.padEnd(5)} ${ok}  peak=${step.peakHeight}  net=${step.runningNet}  mode=${step.mode} streak=${step.streakLength} str=${(step.signalStrength||0).toFixed(0)}`);
  }
}

main().catch(console.error);