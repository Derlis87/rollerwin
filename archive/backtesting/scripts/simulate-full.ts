/**
 * Full v4.7 Simulation — Complete Roulette Sequence
 * Tests smart prediction engine against 4000+ real spins
 */
import { generateSmartPrediction } from '../src/lib/smart-prediction-v4'

// ── Color helpers ──
const RED_SET = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
function getColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_SET.has(n) ? 'red' : 'black'
}

// ── Raw sequence — cleaned from source ──
const RAW = `9, 36, 25, 28, 23, 12, 15, 26, 35, 28, 28, 15, 14, 24, 29, 2, 9, 3, 8, 21, 4, 22, 24, 3, 25, 29, 6, 8, 5, 17, 13, 23, 1, 28, 3, 15, 8, 20, 4, 10, 13, 22, 6, 13, 23, 21, 21, 23, 15, 36, 26, 4, 29, 35, 28, 8, 20, 21, 11, 0, 5, 22, 27, 0, 1, 7, 9, 7, 1, 18, 5, 18, 34, 20, 33, 8, 16, 35, 22, 27, 0, 1, 7, 20, 14, 33, 20, 7, 26, 8, 31, 16, 12, 25, 9, 15, 18, 9, 1, 36, 14, 13, 9, 9, 28, 30, 14, 21, 1, 9, 0, 31, 31, 20, 25, 17, 6, 11, 30, 14, 11, 23, 13, 13, 9, 7, 4, 25, 12, 12, 9, 0, 24, 8, 0, 13, 2, 30, 25, 34, 15, 27, 0, 25, 9, 20, 28, 28, 29, 29, 23, 6, 22, 34, 19, 24, 12, 6, 20, 24, 8, 22, 30, 10, 21, 18, 27, 35, 21, 33, 15, 5, 35, 16, 1, 17, 20, 31, 3, 4, 26, 11, 29, 8, 10, 13, 36, 21, 2, 28, 24, 30, 31, 13, 17, 22, 32, 16, 21, 36, 11, 10, 25, 9, 17, 28, 8, 20, 33, 34, 10, 28, 14, 26, 8, 14, 7, 26, 9, 27, 26, 33, 15, 23, 15, 33, 7, 6, 6, 28, 7, 18, 15, 22, 24, 26, 21, 31, 0, 29, 10, 35, 7, 28, 20, 35, 29, 11, 28, 7, 24, 32, 4, 32, 0, 36, 1, 5, 5, 30, 5, 17, 21, 19, 2, 12, 34, 0, 26, 30, 21, 17, 36, 36, 12, 9, 9, 14, 27, 18, 19, 6, 33, 6, 35, 16, 4, 12, 6, 32, 17, 11, 29, 10, 3, 0, 11, 7, 4, 17, 11, 9, 16, 28, 36, 18, 35, 26, 24, 33, 23, 26, 13, 15, 17, 5, 16, 3, 8, 4, 36, 6, 22, 29, 11, 1, 8, 35, 10, 15, 12, 12, 31, 8, 29, 13, 25, 0, 33, 2, 33, 18, 27, 36, 29, 30, 1, 31, 32, 34, 25, 10, 15, 7, 5, 22, 29, 11, 11, 0, 2, 0, 22, 20, 0, 21, 0, 16, 36, 28, 14, 0, 2, 0, 22, 20, 0, 23, 0, 16, 36, 21, 20, 18, 26, 26, 31, 15, 29, 23, 34, 32, 36, 26, 6, 34, 21, 17, 6, 19, 8, 8, 31, 10, 28, 6, 5, 10, 31, 25, 34, 16, 30, 29, 23, 32, 18, 17, 10, 2, 3, 16, 27, 10, 10, 3, 34, 34, 0, 36, 34, 2, 1, 19, 14, 25, 18, 28, 12, 31, 21, 4, 4, 33, 6, 32, 35, 33, 33, 9, 28, 8, 35, 36, 29, 6, 16, 1, 1, 25, 32, 17, 16, 3, 11, 29, 26, 27, 35, 25, 36, 8, 29, 6, 7, 27, 33, 1, 18, 29, 36, 30, 20, 26, 28, 32, 0, 11, 34, 14, 33, 34, 22, 16, 6, 16, 11, 24, 33, 9, 8, 20, 29, 12, 20, 15, 25, 5, 8, 19, 24, 17, 2, 34, 6, 9, 31, 14, 1, 28, 22, 34, 32, 33, 5, 36, 4, 15, 1, 4, 18, 18, 22, 13, 1, 36, 35, 29, 9, 28, 6, 33, 36, 22, 19, 26, 3, 8, 1, 1, 31, 15, 4, 29, 3, 4, 30, 9, 24, 12, 12, 18, 29, 2, 30, 23, 9, 35, 27, 16, 9, 6, 5, 13, 15, 5, 18, 35, 3, 6, 15, 11, 30, 6, 16, 6, 15, 0, 30, 13, 34, 33, 3, 5, 24, 32, 11, 18, 36, 20, 22, 22, 29, 32, 1, 11, 30, 17, 27, 31, 13, 35, 33, 9, 32, 13, 35, 12, 0, 15, 12, 13, 36, 14, 24, 28, 31, 31, 17, 28, 4, 1, 31, 2, 30, 23, 28, 21, 17, 25, 28, 16, 2, 30, 3, 25, 9, 35, 7, 0, 17, 18, 9, 24, 13, 22, 24, 33, 6, 35, 19, 12, 13, 8, 6, 14, 30, 12, 18, 35, 2, 11, 23, 13, 24, 5, 7, 29, 6, 28, 21, 17, 24, 30, 34, 24, 3, 23, 31, 1, 34, 12, 21, 21, 18, 31, 32, 24, 33, 36, 27, 13, 2, 9, 2, 20, 21, 31, 15, 24, 2, 16, 19, 4, 15, 1, 29, 32, 16, 1, 17, 24, 34, 25, 29, 14, 12, 23, 14, 35, 32, 35, 13, 34, 11, 34, 1, 26, 22, 30, 8, 33, 35, 11, 8, 16, 4, 35, 13, 8, 27, 23, 31, 1, 26, 18, 17, 36, 22, 2, 34, 26, 4, 28, 2, 14, 13, 21, 31, 6, 12, 13, 15, 27, 3, 10, 17, 17, 28, 10, 25, 4, 24, 34, 19, 2, 14, 21, 20, 28, 26, 20, 33, 0, 34, 4, 16, 20, 35, 25, 11, 35, 21, 35, 28, 25, 8, 15, 27, 31, 15, 25, 31, 22, 35, 35, 21, 13, 35, 23, 11, 10, 25, 6, 24, 14, 3, 12, 13, 6, 24, 33, 1, 31, 28, 6, 10, 0, 0, 15, 34, 20, 23, 32, 27, 23, 17, 20, 4, 11, 14, 22, 1, 36, 15, 36, 2, 24, 24, 20, 23, 19, 7, 10, 11, 17, 1, 26, 5, 23, 11, 6, 6, 0, 14, 27, 35, 24, 20, 4, 23, 23, 25, 0, 9, 26, 26, 9, 15, 17, 16, 26, 16, 27, 29, 18, 30, 25, 23, 21, 33, 13, 14, 12, 14, 18, 15, 20, 3, 18, 1, 12, 6, 11, 30, 29, 19, 30, 17, 13, 12, 30, 14, 9, 10, 8, 5, 28, 24, 13, 11, 25, 8, 7, 1, 21, 31, 18, 4, 26, 6, 7, 8, 22, 17, 18, 2, 19, 6, 19, 10, 27, 3, 19, 27, 9, 22, 12, 18, 27, 1, 23, 1, 26, 16, 11, 26, 34, 13, 17, 30, 18, 34, 0, 35, 0, 29, 5, 23, 12, 3, 4, 34, 10, 27, 15, 16, 7, 30, 21, 12, 31, 26, 16, 32, 18, 6, 31, 36, 25, 21, 9, 25, 28, 19, 1, 26, 30, 22, 4, 22, 6, 2, 31, 5, 22, 10, 12, 15, 29, 30, 25, 9, 25, 34, 0, 3, 36, 6, 8, 33, 14, 4, 1, 23, 28, 35, 11, 27, 5, 32, 22, 9, 24, 21, 4, 23, 14, 15, 12, 18, 18, 4, 27, 0, 2, 35, 8, 14, 16, 10, 4, 7, 22, 15, 32, 32, 19, 28, 3, 23, 8, 12, 4, 10, 13, 12, 9, 9, 23, 15, 35, 24, 4, 24, 17, 28, 1, 22, 31, 12, 32, 12, 14, 18, 15, 32, 34, 2, 11, 6, 14, 26, 8, 18, 6, 17, 34, 34, 27, 27, 16, 2, 0, 2, 2, 36, 12, 11, 29, 12, 6, 22, 15, 31, 19, 32, 30, 24, 35, 25, 30, 16, 4, 17, 0, 12, 27, 5, 11, 5, 13, 33, 6, 2, 5, 4, 1, 24, 15, 29, 18, 9, 30, 6, 26, 2, 19, 31, 6, 21, 30, 28, 22, 33, 10, 1, 15, 17, 16, 15, 21, 5, 34, 11, 29, 17, 13, 16, 27, 28, 7, 8, 1, 8, 34, 34, 25, 17, 2, 34, 16, 8, 14, 36, 27, 8, 36, 17, 19, 24, 5, 12, 3, 26, 36, 25, 29, 34, 20, 20, 20, 12, 34, 19, 34, 26, 32, 20, 28, 8, 14, 13, 4, 14, 5, 34, 25, 8, 24, 13, 27, 27, 17, 2, 9, 18, 30, 2, 36, 6, 27, 11, 24, 19, 12, 0, 0, 15, 25, 29, 16, 22, 35, 17, 36, 23, 24, 32, 21, 8, 30, 14, 8, 31, 23, 36, 33, 23, 3, 30, 28, 6, 10, 12, 16, 14, 8, 18, 21, 31, 6, 7, 35, 9, 5, 31, 16, 18, 8, 1, 19, 36, 15, 4, 2, 18, 0, 25, 16, 21, 24, 1, 7, 22, 14, 31, 17, 18, 16, 15, 28, 1, 26, 5, 4, 5, 6, 21, 14, 1, 25, 13, 29, 7, 22, 5, 30, 20, 16, 27, 18, 14, 20, 17, 36, 20, 32, 27, 0, 18, 34, 29, 19, 21, 2, 31, 32, 22, 32, 3, 20, 21, 11, 35, 32, 32, 36, 25, 20, 29, 14, 5, 0, 6, 6, 8, 6, 23, 16, 9, 2, 26, 7, 3, 21, 25, 27, 21, 6, 14, 33, 12, 36, 12, 2, 20, 14, 13, 0, 14, 6, 22, 35, 26, 21, 28, 20, 5, 20, 25, 7, 27, 36, 24, 28, 15, 35, 13, 10, 18, 11, 8, 33, 32, 5, 29, 21, 32, 34, 15, 8, 32, 10, 33, 22, 12, 30, 35, 7, 1, 27, 16, 23, 34, 28, 28, 29, 2, 26, 10, 2, 20, 22, 7, 3, 5, 2, 36, 10, 18, 13, 15, 21, 8, 14, 18, 20, 14, 1, 31, 32, 16, 15, 16, 11, 28, 0, 11, 4, 18, 13, 30, 13, 17, 36, 23, 30, 24, 33, 4, 22, 28, 7, 9, 11, 19, 26, 17, 11, 2, 35, 31, 18, 18, 13, 32, 14, 3, 12, 21, 35, 11, 9, 22, 1, 25, 8, 16, 7, 26, 35, 29, 23, 29, 20, 19, 19, 19, 19, 25, 28, 19, 19, 8, 15, 23, 5, 23, 5, 35, 27, 4, 3, 26, 19, 5, 5, 12, 13, 12, 9, 28, 27, 1, 33, 18, 15, 30, 33, 28, 34, 19, 26, 10, 32, 18, 7, 34, 2, 31, 34, 14, 12, 3, 24, 20, 1, 6, 26, 22, 34, 18, 30, 12, 23, 15, 14, 34, 9, 26, 33, 11, 7, 19, 15, 33, 7, 2, 35, 35, 32, 11, 30, 5, 10, 1, 11, 36, 24, 16, 28, 16, 16, 15, 35, 17, 34, 28, 17, 5, 33, 18, 20, 30, 23, 35, 31, 16, 19, 21, 17, 13, 8, 4, 21, 12, 0, 36, 20, 17, 33, 7, 20, 22, 17, 32, 33, 18, 36, 16, 11, 16, 31, 0, 20, 2, 1, 16, 5, 24, 18, 27, 26, 17, 6, 5, 36, 22, 25, 29, 12, 4, 2, 14, 12, 16, 16, 20, 20, 16, 11, 23, 4, 16, 16, 28, 3, 33, 20, 25, 26, 36, 20, 9, 31, 5, 5, 35, 21, 3, 21, 31, 13, 30, 29, 7, 23, 22, 15, 29, 13, 24, 36, 6, 15, 13, 33, 26, 31, 24, 29, 5, 4, 22, 23, 17, 20, 8, 1, 0, 14, 34, 5, 27, 32, 20, 18, 6, 21, 8, 34, 9, 22, 23, 13, 4, 28, 34, 8, 3, 19, 4, 15, 16, 5, 24, 16, 30, 15, 20, 0, 28, 18, 11, 1, 16, 18, 17, 28, 3, 34, 15, 5, 21, 1, 17, 6, 35, 26, 7, 24, 28, 2, 19, 29, 34, 5, 25, 22, 15, 12, 32, 1, 21, 33, 0, 14, 20, 33, 24, 4, 25, 5, 29, 7, 1, 36, 8, 3, 19, 16, 25, 26, 13, 23, 20, 20, 27, 11, 23, 20, 3, 19, 29, 12, 10, 1, 24, 10, 32, 16, 3, 27, 2, 16, 31, 4, 19, 24, 8, 15, 11, 31, 9, 22, 31, 1, 31, 4, 16, 22, 15, 2, 18, 12, 32, 19, 23, 21, 29, 29, 2, 5, 21, 15, 9, 14, 9, 0, 32, 23, 27, 35, 33, 19, 16, 34, 5, 14, 17, 1, 17, 34, 26, 26, 14, 2, 35, 7, 25, 2, 1, 33, 16, 36, 20, 15, 2, 21, 0, 0, 18, 18, 5, 13, 23, 18, 24, 28, 30, 31, 31, 25, 17, 36, 10, 7, 14, 35, 10, 32, 36, 9, 34, 19, 34, 32, 18, 24, 20, 21, 22, 36, 32, 23, 24, 30, 20, 19, 25, 24, 33, 25, 8, 10, 32, 7, 5, 6, 25, 31, 26, 21, 1, 6, 3, 2, 20, 29, 21, 14, 31, 10, 14, 0, 36, 22, 2, 14, 29, 20, 28, 31, 34, 34, 17, 34, 9, 27, 25, 36, 28, 19, 15, 4, 11, 10, 15, 3, 22, 32, 10, 35, 19, 12, 15, 3, 13, 16, 22, 32, 17, 26, 0, 18, 10, 9, 7, 18, 21, 15, 9, 27, 24, 19, 18, 32, 29, 8, 26, 8, 4, 20, 6, 0, 20, 12, 2, 7, 28, 9, 2, 15, 25, 31, 26, 12, 27, 20, 36, 27, 8, 32, 16, 20, 7, 1, 7, 17, 4, 20, 25, 23, 13, 5, 12, 14, 18, 19, 11, 33, 16, 36, 10, 34, 10, 33, 1, 32, 34, 1, 34, 11, 19, 36, 15, 27, 8, 25, 17, 14, 35, 18, 19, 21, 12, 21, 31, 9, 27, 7, 6, 21, 29, 24, 0, 35, 4, 25, 23, 12, 17, 35, 13, 30, 29, 4, 7, 13, 8, 6, 20, 19, 15, 16, 8, 11, 3, 5, 14, 18, 23, 30, 34, 10, 29, 33, 15, 8, 22, 15, 6, 35, 20, 33, 13, 27, 31, 4, 26, 28, 3, 26, 10, 0, 25, 24, 5, 27, 9, 15, 1, 8, 18, 30, 13, 30, 24, 18, 18, 24, 15, 35, 12, 0, 21, 1, 2, 23, 19, 11, 18, 23, 35, 29, 5, 11, 6, 12, 31, 2, 10, 1, 25, 28, 32, 26, 16, 27, 17, 11, 24, 30, 26, 3, 10, 3, 31, 22, 10, 9, 11, 11, 5, 17, 30, 24, 25, 19, 8, 24, 14, 23, 28, 35, 16, 31, 31, 5, 10, 11, 11, 1, 3, 21, 1, 22, 8, 12, 19, 22, 10, 20, 0, 9, 1, 4, 7, 17, 0, 0, 34, 19, 22, 0, 1, 35, 22, 28, 23, 19, 29, 9, 9, 9, 28, 5, 17, 32, 24, 16, 21, 36, 5, 31, 14, 28, 11, 21, 20, 33, 32, 32, 24, 32, 4, 28, 23, 9, 21, 17, 35, 6, 0, 11, 20, 26, 32, 1, 35, 18, 8, 1, 11, 6, 0, 2, 24, 21, 5, 3, 36, 0, 2, 23, 7, 13, 17, 3, 23, 20, 18, 29, 18, 29, 16, 12, 24, 28, 12, 6, 16, 29, 12, 29, 30, 21, 13, 32, 0, 35, 31, 10, 17, 33, 2, 26, 24, 23, 3, 32, 22, 36, 14, 0, 16, 33, 5, 20, 0, 21, 11, 24, 24, 21, 0, 12, 5, 34, 33, 23, 11, 3, 17, 6, 9, 33, 9, 33, 21, 31, 20, 3, 6, 34, 3, 21, 2, 24, 2, 24, 13, 27, 7, 0, 34, 12, 25, 28, 13, 20, 25, 31, 28, 34, 20, 35, 29, 26, 7, 31, 21, 35, 5, 11, 18, 25, 21, 17, 30, 32, 10, 31, 23, 34, 31, 28, 2, 21, 18, 2, 5, 0, 19, 34, 2, 11, 27, 23, 17, 6, 9, 14, 34, 19, 33, 18, 11, 22, 1, 7, 23, 32, 29, 10, 17, 2, 0, 25, 24, 6, 5, 12, 19, 21, 13, 17, 29, 17, 33, 34, 11, 6, 10, 12, 1, 20, 12, 1, 17, 12, 7, 2, 18, 10, 13, 22, 34, 27, 11, 26, 26, 4, 26, 4, 32, 36, 3, 16, 35, 33, 2, 5, 15, 35, 11, 24, 33, 21, 15, 0, 34, 15, 1, 18, 30, 22, 20, 3, 15, 0, 13, 6, 8, 22, 0, 24, 8, 19, 34, 19, 8, 36, 11, 33, 17, 24, 16, 32, 0, 12, 24, 17, 22, 7, 29, 27, 22, 34, 27, 10, 2, 8, 7, 16, 9, 5, 22, 15, 10, 10, 15, 18, 19, 8, 30, 19, 30, 5, 30, 15, 15, 24, 16, 11, 35, 0, 29, 23, 29, 30, 23, 10, 33, 25, 3, 12, 35, 7, 36, 30, 10, 24, 23, 36, 8, 20, 36, 10, 19, 4, 32, 18, 13, 20, 7, 29, 1, 35, 14, 0, 21, 3, 24, 16, 3, 28, 21, 10, 4, 25, 13, 30, 6, 28, 26, 27, 33, 25, 16, 28, 34, 27, 24, 9, 24, 33, 36, 10, 14, 27, 7, 36, 4, 10, 25, 28, 31, 25, 17, 11, 15, 10, 14, 6, 29, 23, 11, 25, 15, 14, 18, 21, 0, 10, 34, 16, 34, 32, 11, 32, 26, 32, 21, 3, 28, 13, 30, 32, 17, 18, 29, 4, 15, 34, 10, 31, 30, 17, 0, 10, 2, 34, 2, 36, 0, 12, 15, 32, 25, 11, 27, 4, 33, 31, 33, 2, 24, 18, 25, 29, 0, 6, 28, 26, 26, 24, 34, 17, 33, 23, 32, 6, 27, 1, 12, 15, 25, 23, 20, 21, 15, 25, 1, 18, 23, 14, 25, 36, 9, 18, 18, 17, 18, 22, 9, 32, 4, 3, 8, 28, 29, 8, 6, 13, 1, 32, 8, 9, 26, 36, 18, 21, 4, 21, 5, 6, 16, 23, 4, 0, 3, 31, 26, 33, 31, 15, 17, 13, 35, 22, 22, 28, 6, 31, 21, 30, 22, 28, 20, 1, 9, 33, 21, 19, 33, 10, 29, 0, 18, 15, 1, 34, 27, 31, 22, 17, 3, 33, 4, 16, 22, 17, 32, 28, 25, 1, 34, 10, 12, 26, 18, 0, 27, 2, 36, 0, 11, 4, 20, 26, 22, 0, 28, 23, 22, 16, 28, 32, 25, 7, 17, 3, 11, 35, 5, 31, 12, 19, 20, 12, 21, 22, 17, 34, 27, 25, 3, 12, 27, 14, 26, 16, 21, 28, 17, 8, 36, 5, 33, 28, 12, 11, 11, 10, 15, 3, 18, 22, 28, 22, 18, 35, 14, 4, 30, 28, 36, 6, 14, 3, 23, 19, 15, 30, 2, 20, 9, 32, 31, 19, 32, 23, 24, 33, 3, 20, 3, 9, 24, 0, 1, 27, 35, 19, 12, 2, 36, 0, 25, 32, 4, 34, 7, 29, 17, 36, 17, 6, 12, 11, 11, 3, 30, 10, 12, 3, 17, 16, 31, 2, 2, 5, 20, 5, 4, 18, 35, 10, 2, 12, 14, 18, 31, 12, 9, 26, 18, 12, 5, 3, 16, 36, 7, 35, 17, 20, 32, 1, 36, 23, 28, 29, 1, 28, 33, 13, 29, 15, 11, 33, 15, 24, 7, 1, 2, 3, 20, 5, 3, 12, 5, 4, 36, 27, 11, 0, 15, 2, 15, 15, 1, 0, 35, 16, 27, 11, 14, 12, 2, 16, 19, 15, 6, 17, 3, 22, 2, 14, 1, 7, 21, 17, 15, 12, 21, 11, 18, 4, 0, 35, 15, 19, 23, 14, 19, 22, 1, 12, 20, 19, 26, 18, 33, 18, 23, 4, 14, 2, 33, 34, 30, 6, 23, 28, 3, 31, 24, 12, 0, 17, 20, 8, 34, 11, 22, 3, 28, 27, 4, 29, 11, 22, 36, 19, 2, 22, 27, 9, 5, 29, 23, 7, 0, 17, 33, 28, 31, 0, 28, 16, 3, 27, 32, 35, 26, 10, 16, 33, 10, 33, 3, 31, 2, 20, 3, 14, 32, 17, 32, 2, 22, 1, 29, 36, 17, 0, 18, 17, 29, 20, 17, 4, 31, 22, 26, 11, 12, 15, 17, 7, 23, 34, 9, 8, 14, 14, 22, 13, 27, 18, 2, 27, 16, 33, 21, 3, 9, 30, 26, 25, 34, 30, 26, 20, 17, 27, 19, 6, 26, 15, 9, 4, 15, 28, 36, 12, 28, 17, 7, 3, 7, 30, 35, 17, 25, 5, 28, 1, 27, 5, 2, 17, 34, 36, 27, 33, 1, 20, 13, 17, 19, 18, 17, 33, 7, 11, 2, 8, 32, 36, 31, 26, 0, 16, 8, 30, 29, 14, 13, 10, 0, 35, 21, 23, 25, 29, 31, 19, 16, 27, 3, 2, 25, 30, 5, 11, 25, 23, 30, 19, 4, 18, 32, 6, 18, 10, 10, 26, 34, 18, 0, 17, 17, 1, 32, 28, 29, 0, 20, 17, 22, 7, 30, 1, 27, 29, 15, 9, 28, 6, 14, 35, 27, 7, 1, 6, 35, 32, 21, 9, 15, 31, 28, 27, 31, 10, 4, 33, 17, 16, 0, 36, 23, 9, 21, 11, 26, 22, 16, 34, 18, 22, 7, 20, 5, 29, 20, 11, 7, 30, 1, 1, 34, 34, 35, 33, 33, 16, 0, 15, 9, 36, 21, 12, 25, 17, 21, 12, 16, 6, 2, 7, 1, 23, 1, 28, 36, 19, 22, 19, 24, 36, 9, 14, 8, 12, 22, 25, 28, 23, 33, 28, 13, 3, 24, 16, 6, 5, 17, 5, 23, 7, 2, 34, 28, 28, 22, 22, 21, 31, 10, 20, 27, 18, 3, 19, 6, 21, 35, 24, 21, 24, 24, 3, 34, 14, 30, 1, 34, 3, 3, 29, 12, 31, 4, 2, 27, 17, 29, 5, 6, 9, 27, 34, 24, 0, 10, 26, 18, 29, 28, 7, 22, 19, 13, 22, 8, 11, 27, 20, 27, 13, 2, 32, 8, 4, 16, 29, 17, 25, 11, 36, 15, 20, 27, 25, 8, 8, 9, 21, 7, 17, 5, 25, 26, 8, 25, 3, 2, 33, 30, 27, 11, 8, 26, 21, 2, 17, 15, 17, 33, 27, 3, 4, 11, 32, 4, 19, 13, 2, 34, 21, 29, 20, 3, 23, 3, 30, 14, 31, 28, 4, 17, 2, 6, 29, 8, 13, 22, 23, 31, 8, 16, 22, 8, 36, 10, 29, 8, 28, 4, 11, 19, 13, 13, 26, 24, 24, 2, 7, 18, 25, 17, 10, 34, 7, 2, 28, 19, 28, 20, 8, 21, 21, 26, 30, 18, 27, 1, 33, 10, 19, 14, 7, 3, 4, 10, 15, 19, 32, 15, 25, 32, 33, 6, 5, 29, 14, 4, 10, 30, 14, 9, 15, 8, 8, 24, 28, 16, 35, 5, 0, 7, 31, 18, 8, 28, 24, 3, 3, 17, 26, 12, 12, 16, 33, 23, 18, 35, 30, 12, 22, 30, 2, 2, 31, 5, 5, 17, 16, 4, 24, 5, 18, 30, 25, 14, 8, 17, 31, 31, 28, 4, 27, 35, 7, 19, 25, 32, 26, 8, 36, 16, 19, 34, 27, 35, 3, 7, 22, 27, 10, 16, 19, 26, 16, 6, 0, 14, 22, 32, 31, 34, 2, 22, 34, 18, 28, 9, 11, 13, 27, 29, 25, 35, 34, 29, 34, 3, 7, 6, 6, 17, 28, 9, 6, 18, 5, 29, 1, 26, 5, 17, 27, 1, 14, 20, 23, 20, 35, 36, 9, 17, 32, 30, 5, 1, 21, 6, 26, 1, 20, 19, 4, 13, 17, 15, 7, 12, 33, 2, 11, 26, 8, 0, 31, 14, 5, 9, 27, 29, 32, 29, 21, 5, 30, 29, 10, 26, 36, 3, 21, 18, 18, 21, 25, 28, 28, 12, 22, 2, 5, 15, 11, 9, 12, 17, 3, 21, 22, 27, 12, 17, 32, 16, 4, 12, 1, 11, 22, 27, 31, 0, 20, 2, 23, 12, 28, 24, 29, 2, 16, 36, 17, 0, 35, 7, 28, 28, 2, 33, 7, 22, 26, 22, 14, 3, 3, 33, 26, 4, 11, 27, 22, 1, 6, 22, 23, 34, 24, 10, 20, 3, 36, 23, 34, 15, 33, 12, 7, 36, 33, 5, 15, 29, 36, 20, 0, 0, 4, 11, 27, 25, 22, 34, 34, 7, 6, 27, 0, 21, 6, 14, 14, 21, 36, 15, 13, 5, 23, 13, 19, 14, 24, 1, 24, 8, 28, 21, 21, 13, 4, 4, 6, 16, 3, 28, 13, 5, 16, 24, 27, 26, 10, 13, 7, 7, 16, 3, 20, 27, 11, 20, 15, 0, 10, 24, 18, 35, 35, 26, 5, 10, 27, 24, 13, 4, 26, 8, 23, 18, 17, 12, 8, 10, 28, 30, 4, 1, 36, 26, 7, 0, 11, 6, 36, 34, 30, 21, 28, 14, 33, 3, 31, 15, 26, 28, 19, 33, 27, 27, 0, 34, 8, 18, 34, 23, 17, 7, 0, 2, 14, 20, 32, 27, 7, 21, 20, 32, 16, 23, 15, 28, 3, 5, 33, 19, 15, 2, 11, 2, 14, 13, 11, 1, 6, 12, 16, 9, 26, 2, 35, 28, 29, 35, 11, 26, 30, 5, 11, 33, 8, 9, 12, 25, 18, 24, 4, 8, 2, 28, 36, 2, 27, 25, 29, 19, 0, 14, 6, 31, 34, 13, 4, 0, 19, 10, 31, 6, 16, 27, 5, 13, 24, 15, 6, 23, 13, 1, 0, 11, 34, 0, 32, 30, 36, 3, 27, 35, 15, 0, 5, 11, 17, 6, 25, 34, 15, 20, 29, 11, 31, 15, 22, 34, 15, 15, 14, 4, 13, 32, 22, 32, 4, 8, 14, 15, 27, 18, 24, 9, 12, 33, 6, 10, 1, 24, 13, 18, 4, 8, 2, 31, 27, 10, 8, 18, 27, 9, 14, 26, 34, 0, 5, 11, 12, 23, 21, 32, 1, 8, 19, 16, 19, 7, 15, 33, 19, 28, 24, 24, 9, 20, 7, 10, 34, 10, 30, 13, 16, 27, 8, 33, 24, 15, 11, 20, 20, 8, 13, 13, 6, 34, 12, 7, 4, 6, 29, 29, 14, 15, 34, 29, 25, 31, 9, 10, 2, 28, 23, 0, 31, 20, 7, 33, 0, 13, 2, 3, 35, 17, 29, 34, 9, 3, 20, 16, 18, 4, 11, 1, 28, 22, 23, 22, 34, 22, 0, 6, 1, 0, 11, 8, 26, 2, 34, 25, 4, 29, 20, 27, 8, 33, 9, 21, 30, 10, 35, 13, 34, 33, 15, 6, 0, 12, 1, 25, 33, 15, 18, 15, 22, 9, 4, 18, 29, 6, 31, 14, 23, 35, 7, 15, 9, 30, 33, 23, 3, 11, 0, 28, 30, 12, 1, 16, 34, 19, 20, 15, 32, 33, 4, 13, 0, 26, 33, 35, 10, 23, 20, 10, 18, 19, 30, 8, 4, 15, 18, 6, 0, 13, 2, 22, 13, 26, 8, 9, 20, 1, 31, 34, 34, 36, 4, 8, 18, 20, 9, 26, 20, 2, 0, 22, 32, 23, 5, 15, 6, 31, 34, 8, 16, 21, 36, 33, 2, 24, 11, 0, 14, 30, 16, 6, 24, 30, 35, 28, 35, 24, 0, 22, 28, 7, 17, 28, 1`

// ── Parse sequence ──
function parseSequence(raw: string): number[] {
  return raw.split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => parseInt(s, 10))
    .filter(n => !isNaN(n) && n >= 0 && n <= 36)
}

const SEQUENCE = parseSequence(RAW)

// ── Streak calculator ──
function getCurrentStreak(history: number[]): { length: number; color: 'red' | 'black' | null } {
  let streak = 0
  let lastColor: 'red' | 'black' | null = null
  for (let i = history.length - 1; i >= 0; i--) {
    const c = getColor(history[i])
    if (c === 'green') continue
    if (lastColor === null) {
      lastColor = c
      streak = 1
    } else if (c === lastColor) {
      streak++
    } else {
      break
    }
  }
  return { length: streak, color: lastColor }
}

function getMode(streakLen: number): string {
  if (streakLen >= 5) return 'ULTRA'
  if (streakLen >= 2) return 'SOFT'
  return 'NORMAL'
}

// ── Simulation types ──
interface SimRecord {
  index: number
  predicted: 'red' | 'black'
  actual: 'red' | 'black'
  correct: boolean
  streakLen: number
  streakColor: string
  mode: string
  predictedVsStreak: 'same' | 'opposite' | 'none'
  confidence: number
}

function runSimulation(label: string, getPrediction: (history: number[]) => 'red' | 'black' | null): SimRecord[] {
  const records: SimRecord[] = []

  for (let i = 5; i < SEQUENCE.length; i++) {
    const history = SEQUENCE.slice(0, i)
    const nextNum = SEQUENCE[i]
    const nextColor = getColor(nextNum)

    // Skip green results — don't evaluate
    if (nextColor === 'green') continue

    const prediction = getPrediction(history)
    if (prediction === null) continue

    const streak = getCurrentStreak(history)
    const mode = getMode(streak.length)

    let predictedVsStreak: 'same' | 'opposite' | 'none' = 'none'
    if (streak.color && streak.length >= 1) {
      predictedVsStreak = prediction === streak.color ? 'same' : 'opposite'
    }

    const correct = prediction === nextColor

    // Get confidence from engine (only for smart prediction)
    let confidence = 50
    if (label === 'v4.7 SMART') {
      try {
        const pred = generateSmartPrediction(history, 'color')
        confidence = pred.bestConfidence
      } catch { /* use 50 */ }
    }

    records.push({
      index: i,
      predicted: prediction,
      actual: nextColor,
      correct,
      streakLen: streak.length,
      streakColor: streak.color || '?',
      mode,
      predictedVsStreak,
      confidence
    })
  }

  return records
}

// ── Analysis ──
function analyze(records: SimRecord[], label: string) {
  console.log('\n' + '='.repeat(70))
  console.log(`  ${label} — FULL ANALYSIS`)
  console.log('='.repeat(70))

  const total = records.length
  const wins = records.filter(r => r.correct).length
  const losses = total - wins
  const accuracy = total > 0 ? (wins / total * 100) : 0

  console.log(`\n📊 OVERALL:`)
  console.log(`   Total predictions: ${total}`)
  console.log(`   Wins: ${wins} | Losses: ${losses}`)
  console.log(`   Accuracy: ${accuracy.toFixed(2)}%`)

  // By mode
  console.log(`\n📈 ACCURACY BY MODE:`)
  for (const mode of ['NORMAL', 'SOFT', 'ULTRA'] as const) {
    const subset = records.filter(r => r.mode === mode)
    const mWins = subset.filter(r => r.correct).length
    const mTotal = subset.length
    const mAcc = mTotal > 0 ? (mWins / mTotal * 100) : 0
    console.log(`   ${mode.padEnd(8)}: ${mWins}/${mTotal} = ${mAcc.toFixed(2)}%`)
  }

  // By specific streak lengths (2-10+)
  console.log(`\n📈 ACCURACY BY STREAK LENGTH:`)
  for (let s = 0; s <= 10; s++) {
    const subset = records.filter(r => r.streakLen === s)
    const sWins = subset.filter(r => r.correct).length
    const sTotal = subset.length
    const sAcc = sTotal > 0 ? (sWins / sTotal * 100) : 0
    const label2 = s === 10 ? '10+' : String(s)
    console.log(`   streak ${label2.padEnd(3)}: ${sWins}/${sTotal} = ${sAcc.toFixed(2)}%`)
  }

  // Error streak analysis
  let currentErrorStreak = 0
  let maxErrorStreak = 0
  const errorStreaks: number[] = []
  const errorStreakDist: Record<number, number> = {}

  for (const r of records) {
    if (!r.correct) {
      currentErrorStreak++
    } else {
      if (currentErrorStreak > 0) {
        errorStreaks.push(currentErrorStreak)
        errorStreakDist[currentErrorStreak] = (errorStreakDist[currentErrorStreak] || 0) + 1
      }
      maxErrorStreak = Math.max(maxErrorStreak, currentErrorStreak)
      currentErrorStreak = 0
    }
  }
  if (currentErrorStreak > 0) {
    errorStreaks.push(currentErrorStreak)
    errorStreakDist[currentErrorStreak] = (errorStreakDist[currentErrorStreak] || 0) + 1
    maxErrorStreak = Math.max(maxErrorStreak, currentErrorStreak)
  }

  console.log(`\n🔴 ERROR STREAKS:`)
  console.log(`   Max consecutive errors: ${maxErrorStreak}`)
  console.log(`   Total error streaks: ${errorStreaks.length}`)
  console.log(`   Avg error streak length: ${errorStreaks.length > 0 ? (errorStreaks.reduce((a, b) => a + b, 0) / errorStreaks.length).toFixed(2) : 0}`)

  console.log(`\n   Distribution:`)
  for (let i = 1; i <= 9; i++) {
    const count = errorStreakDist[i] || 0
    const bar = '█'.repeat(Math.min(50, count))
    console.log(`   ${i} error(s): ${String(count).padStart(5)} ${bar}`)
  }
  // 10+
  const tenPlus = Object.entries(errorStreakDist).filter(([k]) => parseInt(k) >= 10).reduce((s, [, v]) => s + v, 0)
  console.log(`   10+ errors: ${String(tenPlus).padStart(5)}`)

  // Win streak analysis
  let currentWinStreak = 0
  let maxWinStreak = 0
  const winStreakDist: Record<number, number> = {}

  for (const r of records) {
    if (r.correct) {
      currentWinStreak++
    } else {
      if (currentWinStreak > 0) {
        winStreakDist[currentWinStreak] = (winStreakDist[currentWinStreak] || 0) + 1
      }
      maxWinStreak = Math.max(maxWinStreak, currentWinStreak)
      currentWinStreak = 0
    }
  }
  if (currentWinStreak > 0) {
    winStreakDist[currentWinStreak] = (winStreakDist[currentWinStreak] || 0) + 1
    maxWinStreak = Math.max(maxWinStreak, currentWinStreak)
  }

  console.log(`\n🟢 WIN STREAKS:`)
  console.log(`   Max consecutive wins: ${maxWinStreak}`)
  for (let i = 1; i <= 10; i++) {
    const count = winStreakDist[i] || 0
    const bar = '█'.repeat(Math.min(50, count))
    console.log(`   ${i} win(s):   ${String(count).padStart(5)} ${bar}`)
  }
  const wTenPlus = Object.entries(winStreakDist).filter(([k]) => parseInt(k) >= 10).reduce((s, [, v]) => s + v, 0)
  console.log(`   10+ wins:   ${String(wTenPlus).padStart(5)}`)

  // TOP 10 longest error streaks with context
  console.log(`\n💥 TOP 10 LONGEST ERROR STREAKS:`)

  // Find error streak positions
  const errorStreakStarts: { startIdx: number; length: number }[] = []
  currentErrorStreak = 0
  let streakStartIdx = -1
  for (let i = 0; i < records.length; i++) {
    if (!records[i].correct) {
      if (currentErrorStreak === 0) streakStartIdx = i
      currentErrorStreak++
    } else {
      if (currentErrorStreak > 0) {
        errorStreakStarts.push({ startIdx: streakStartIdx, length: currentErrorStreak })
      }
      currentErrorStreak = 0
    }
  }
  if (currentErrorStreak > 0) {
    errorStreakStarts.push({ startIdx: streakStartIdx!, length: currentErrorStreak })
  }

  errorStreakStarts.sort((a, b) => b.length - a.length)
  const top10 = errorStreakStarts.slice(0, 10)

  for (let rank = 0; rank < top10.length; rank++) {
    const es = top10[rank]
    const streakRecords = records.slice(es.startIdx, es.startIdx + es.length)
    console.log(`\n   #${rank + 1}: ${es.length} consecutive errors starting at prediction #${es.startIdx + 1}`)
    console.log(`   Context: streak at prediction time = ${streakRecords[0].streakLen} of ${streakRecords[0].streakColor}, mode = ${streakRecords[0].mode}`)

    for (const rec of streakRecords) {
      const mark = '✗'
      const arrow = rec.predictedVsStreak === 'same' ? '→' : rec.predictedVsStreak === 'opposite' ? '⟵' : '·'
      console.log(
        `     ${mark} pred=${rec.predicted.padEnd(5)} actual=${rec.actual.padEnd(5)} ` +
        `streak=${rec.streakLen}@${rec.streakColor} mode=${rec.mode.padEnd(6)} ` +
        `dir=${arrow} conf=${rec.confidence}%`
      )
    }

    // Show what happened before (2 numbers before streak start for context)
    if (es.startIdx > 0) {
      const before = records[es.startIdx - 1]
      console.log(`     ... previous: pred=${before.predicted} actual=${before.actual} ${before.correct ? '✓' : '✗'}`)
    }
    if (es.startIdx + es.length < records.length) {
      const after = records[es.startIdx + es.length]
      console.log(`     ... next: pred=${after.predicted} actual=${after.actual} ${after.correct ? '✓' : '✗'}`)
    }
  }

  // SOFT mode deep analysis
  const softRecords = records.filter(r => r.mode === 'SOFT')
  const softOpposite = softRecords.filter(r => r.predictedVsStreak === 'opposite')
  const softSame = softRecords.filter(r => r.predictedVsStreak === 'same')

  console.log(`\n🔍 SOFT MODE (streak 2-4) DEEP ANALYSIS:`)
  console.log(`   Total SOFT predictions: ${softRecords.length}`)
  console.log(`   Predicted OPPOSITE to streak: ${softOpposite.length} (${softOpposite.length > 0 ? (softOpposite.filter(r => r.correct).length / softOpposite.length * 100).toFixed(1) : 0}% accuracy)`)
  console.log(`   Predicted SAME as streak:     ${softSame.length} (${softSame.length > 0 ? (softSame.filter(r => r.correct).length / softSame.length * 100).toFixed(1) : 0}% accuracy)`)

  // Break down SOFT by individual streak length
  console.log(`\n   SOFT breakdown by streak length:`)
  for (let s = 2; s <= 4; s++) {
    const sub = records.filter(r => r.streakLen === s)
    const subOpp = sub.filter(r => r.predictedVsStreak === 'opposite')
    const subSame = sub.filter(r => r.predictedVsStreak === 'same')
    const subOppAcc = subOpp.length > 0 ? (subOpp.filter(r => r.correct).length / subOpp.length * 100).toFixed(1) : 'N/A'
    const subSameAcc = subSame.length > 0 ? (subSame.filter(r => r.correct).length / subSame.length * 100).toFixed(1) : 'N/A'
    const subAcc = sub.length > 0 ? (sub.filter(r => r.correct).length / sub.length * 100).toFixed(2) : '0'
    console.log(`   streak ${s}: ${sub.length} total, acc=${subAcc}% | opp=${subOpp.length}(${subOppAcc}%) same=${subSame.length}(${subSameAcc}%)`)
  }

  // ULTRA mode deep analysis
  const ultraRecords = records.filter(r => r.mode === 'ULTRA')
  const ultraOpposite = ultraRecords.filter(r => r.predictedVsStreak === 'opposite')
  const ultraSame = ultraRecords.filter(r => r.predictedVsStreak === 'same')

  console.log(`\n🔍 ULTRA MODE (streak 5+) DEEP ANALYSIS:`)
  console.log(`   Total ULTRA predictions: ${ultraRecords.length}`)
  console.log(`   Predicted OPPOSITE to streak: ${ultraOpposite.length} (${ultraOpposite.length > 0 ? (ultraOpposite.filter(r => r.correct).length / ultraOpposite.length * 100).toFixed(1) : 0}% accuracy)`)
  console.log(`   Predicted SAME as streak:     ${ultraSame.length} (${ultraSame.length > 0 ? (ultraSame.filter(r => r.correct).length / ultraSame.length * 100).toFixed(1) : 0}% accuracy)`)

  // Break down ULTRA by individual streak length
  console.log(`\n   ULTRA breakdown by streak length:`)
  for (const s of [5, 6, 7, 8, 9, 10]) {
    const sub = s === 10
      ? records.filter(r => r.streakLen >= 10)
      : records.filter(r => r.streakLen === s)
    if (sub.length === 0) continue
    const subOpp = sub.filter(r => r.predictedVsStreak === 'opposite')
    const subSame = sub.filter(r => r.predictedVsStreak === 'same')
    const subOppAcc = subOpp.length > 0 ? (subOpp.filter(r => r.correct).length / subOpp.length * 100).toFixed(1) : 'N/A'
    const subSameAcc = subSame.length > 0 ? (subSame.filter(r => r.correct).length / subSame.length * 100).toFixed(1) : 'N/A'
    const subAcc = sub.length > 0 ? (sub.filter(r => r.correct).length / sub.length * 100).toFixed(2) : '0'
    const lbl = s === 10 ? '10+' : String(s)
    console.log(`   streak ${lbl}: ${sub.length} total, acc=${subAcc}% | opp=${subOpp.length}(${subOppAcc}%) same=${subSame.length}(${subSameAcc}%)`)
  }

  // Running accuracy over time (sampling every 200 predictions)
  console.log(`\n📈 ACCURACY OVER TIME (sampled):`)
  const step = Math.max(1, Math.floor(total / 20))
  for (let i = step; i <= total; i += step) {
    const window = records.slice(0, i)
    const w = window.filter(r => r.correct).length
    console.log(`   First ${String(i).padStart(5)}: ${w}/${i} = ${(w / i * 100).toFixed(2)}%`)
  }
  // Always include final
  console.log(`   ALL       ${String(total).padStart(5)}: ${wins}/${total} = ${accuracy.toFixed(2)}%`)

  // First half vs second half
  const half = Math.floor(total / 2)
  const firstHalf = records.slice(0, half)
  const secondHalf = records.slice(half)
  const fhAcc = firstHalf.filter(r => r.correct).length / firstHalf.length * 100
  const shAcc = secondHalf.filter(r => r.correct).length / secondHalf.length * 100
  console.log(`\n📊 FIRST HALF vs SECOND HALF:`)
  console.log(`   First half:  ${firstHalf.filter(r => r.correct).length}/${firstHalf.length} = ${fhAcc.toFixed(2)}%`)
  console.log(`   Second half: ${secondHalf.filter(r => r.correct).length}/${secondHalf.length} = ${shAcc.toFixed(2)}%`)

  return { total, wins, accuracy, maxErrorStreak }
}

// ── Run simulations ──

console.log('╔══════════════════════════════════════════════════════════════════════╗')
console.log('║       v4.7 SMART PREDICTION ENGINE — FULL SEQUENCE SIMULATION      ║')
console.log('╚══════════════════════════════════════════════════════════════════════╝')

// Validate sequence
console.log(`\n📋 Sequence validation:`)
console.log(`   Parsed: ${SEQUENCE.length} numbers`)
console.log(`   Range: ${Math.min(...SEQUENCE)} to ${Math.max(...SEQUENCE)}`)
const greens = SEQUENCE.filter(n => n === 0).length
const reds = SEQUENCE.filter(n => getColor(n) === 'red').length
const blacks = SEQUENCE.filter(n => getColor(n) === 'black').length
console.log(`   Green: ${greens}, Red: ${reds}, Black: ${blacks}`)
console.log(`   Red/Black ratio: ${(reds / Math.max(1, reds + blacks) * 100).toFixed(1)}% / ${(blacks / Math.max(1, reds + blacks) * 100).toFixed(1)}%`)

// Check for invalid numbers
const invalid = SEQUENCE.filter(n => n < 0 || n > 36 || isNaN(n))
if (invalid.length > 0) {
  console.log(`   ⚠️  Found ${invalid.length} invalid numbers: ${invalid.slice(0, 10).join(', ')}`)
}

// Count how many green results are skipped
const nonGreenCount = SEQUENCE.filter(n => n !== 0).length
console.log(`   Non-green numbers: ${nonGreenCount}`)
console.log(`   Evaluable predictions (from index 5): ~${SEQUENCE.length - 5 - SEQUENCE.slice(5).filter(n => n === 0).length}`)

// 1. Smart prediction v4.7
console.log('\n⏳ Running v4.7 Smart Prediction simulation...')
const smartRecords = runSimulation('v4.7 SMART', (history) => {
  const pred = generateSmartPrediction(history, 'color')
  if (!pred.bestValue || pred.bestValue === '') return null
  return pred.bestValue as 'red' | 'black'
})
const smartResult = analyze(smartRecords, 'v4.7 SMART PREDICTION ENGINE')

// 2. Baseline: "always predict last color"
console.log('\n⏳ Running "Always Last Color" baseline...')
const baselineRecords = runSimulation('BASELINE-LAST', (history) => {
  for (let i = history.length - 1; i >= 0; i--) {
    const c = getColor(history[i])
    if (c !== 'green') return c
  }
  return null
})
const baselineResult = analyze(baselineRecords, '"ALWAYS PREDICT LAST COLOR" BASELINE')

// 3. Baseline: "always predict opposite of last"
console.log('\n⏳ Running "Always Opposite" baseline...')
const oppositeRecords = runSimulation('BASELINE-OPP', (history) => {
  for (let i = history.length - 1; i >= 0; i--) {
    const c = getColor(history[i])
    if (c !== 'green') return c === 'red' ? 'black' : 'red'
  }
  return null
})
const oppositeResult = analyze(oppositeRecords, '"ALWAYS PREDICT OPPOSITE" BASELINE')

// ── Comparison summary ──
console.log('\n' + '═'.repeat(70))
console.log('  COMPARISON SUMMARY')
console.log('═'.repeat(70))
console.log('')
console.log('   Engine                           Accuracy     Max Err Streak')
console.log('   '.padEnd(35) + '-'.repeat(30))
const fmt = (label: string, result: { accuracy: number; maxErrorStreak: number }) => {
  console.log(`   ${label.padEnd(35)} ${result.accuracy.toFixed(2).padStart(6)}%      ${result.maxErrorStreak}`)
}
fmt('v4.7 Smart Prediction', smartResult)
fmt('"Always Last Color" baseline', baselineResult)
fmt('"Always Opposite" baseline', oppositeResult)

// Calculate improvement over baselines
const smartEdgeVsLast = smartResult.accuracy - baselineResult.accuracy
const smartEdgeVsOpp = smartResult.accuracy - oppositeResult.accuracy
console.log(`\n   Edge vs "Last Color": ${smartEdgeVsLast >= 0 ? '+' : ''}${smartEdgeVsLast.toFixed(2)}%`)
console.log(`   Edge vs "Opposite":   ${smartEdgeVsOpp >= 0 ? '+' : ''}${smartEdgeVsOpp.toFixed(2)}%`)

console.log('\n✅ Simulation complete.')
