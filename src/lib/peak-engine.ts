/**
 * Motor de Cálculo de Picos (Peak Engine)
 * Calcula el historial de picos y el pico actual a partir de una secuencia de números
 * Soporta cualquier tipo de apuesta: color, paridad, docenas, columnas (single/double)
 */

export interface PeakRecord {
  id: string
  height: number
  prediction: { type: string; value: string }
  resultNumber: number
  resultColor: 'red' | 'black' | 'green'
  timestamp: Date
}

export interface PeakCalcOptions {
  /** Custom prediction function — receives numbers so far, returns prediction or null */
  getPrediction?: (nums: number[]) => { type: string; value: string; extraValues?: string[] } | null
  /** Custom match function — receives prediction with optional extra values and a number */
  matchFn?: (prediction: { type: string; value: string; extraValues?: string[] }, number: number) => boolean
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

function getNumberColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

/**
 * Parse pasted text into valid roulette numbers
 * Supports: comma, space, newline, semicolon, pipe separated
 */
export function parseNumberText(text: string): number[] {
  if (!text || !text.trim()) return []

  const parsed = text
    .replace(/[,\n\t;|/\\]+/g, ' ')
    .split(/\s+/)
    .map(s => parseInt(s.trim()))
    .filter(n => !isNaN(n) && n >= 0 && n <= 36)

  return parsed
}

/**
 * Generate a simple prediction based on the last numbers
 * Uses basic color frequency analysis with recent weighting
 * (legacy fallback — used when no custom getPrediction is provided)
 */
function generateSimplePrediction(numbers: number[]): { type: string; value: string } {
  if (numbers.length < 3) {
    return { type: 'color', value: 'red' }
  }

  const recent = numbers.slice(-10)
  let red = 0, black = 0

  recent.forEach((num, i) => {
    const weight = (i + 1) / recent.length // More weight to recent
    const color = getNumberColor(num)
    if (color === 'red') red += weight
    else if (color === 'black') black += weight
  })

  // Predict the less frequent color (due)
  return { type: 'color', value: red > black ? 'black' : 'red' }
}

/**
 * Check if a prediction matches a number (legacy — color only)
 */
function checkMatch(prediction: { type: string; value: string }, number: number): boolean {
  if (prediction.type === 'color') {
    return getNumberColor(number) === prediction.value
  }
  return false
}

/**
 * Calculate peak history from a sequence of numbers
 * Supports custom prediction and match functions for any bet type.
 * When no options are provided, defaults to color-based prediction (backward compatible).
 *
 * @param numbers - Sequence of roulette numbers
 * @param options - Optional: custom prediction/match functions for bet-type-aware peaks
 */
export function calculatePeakHistory(numbers: number[], options?: PeakCalcOptions): PeakRecord[] {
  if (numbers.length < 6) return []

  const getPred = options?.getPrediction || ((nums: number[]) => generateSimplePrediction(nums))
  const match = options?.matchFn || ((pred: { type: string; value: string; extraValues?: string[] }, num: number) => checkMatch(pred, num))

  const peaks: PeakRecord[] = []
  let i = 2

  while (i < numbers.length) {
    const prevNumbers = numbers.slice(0, i)
    const currentPrediction = getPred(prevNumbers)
    if (!currentPrediction) { i++; continue }

    let currentPeakHeight = 0
    let resolved = false

    for (let j = i; j < numbers.length; j++) {
      currentPeakHeight++

      if (match(currentPrediction, numbers[j])) {
        // Peak resolved!
        peaks.push({
          id: `peak-${peaks.length}-${j}`,
          height: Math.min(currentPeakHeight, 15),
          prediction: { type: currentPrediction.type, value: currentPrediction.value },
          resultNumber: numbers[j],
          resultColor: getNumberColor(numbers[j]),
          timestamp: new Date()
        })
        i = j + 1
        resolved = true
        break
      }

      // If peak reaches 15 or we run out of numbers, record unresolved
      if (currentPeakHeight >= 15 || j === numbers.length - 1) {
        peaks.push({
          id: `peak-${peaks.length}-${j}`,
          height: Math.min(currentPeakHeight, 15),
          prediction: { type: currentPrediction.type, value: currentPrediction.value },
          resultNumber: numbers[j],
          resultColor: getNumberColor(numbers[j]),
          timestamp: new Date()
        })
        i = j + 1
        resolved = true
        break
      }
    }

    if (!resolved) break
  }

  return peaks
}

/**
 * Get current unresolved peak from a sequence of numbers
 * Supports custom prediction and match functions for any bet type.
 */
export function getCurrentPeak(numbers: number[], options?: PeakCalcOptions): number {
  if (numbers.length < 5) return 0

  const getPred = options?.getPrediction || ((nums: number[]) => generateSimplePrediction(nums))
  const match = options?.matchFn || ((pred: { type: string; value: string; extraValues?: string[] }, num: number) => checkMatch(pred, num))

  // Generate prediction from the last 10 numbers
  const recent = numbers.slice(-Math.min(10, numbers.length - 1))
  const prediction = getPred(recent)
  if (!prediction) return 0

  // Count how many of the last numbers don't match the prediction
  let peak = 0
  for (let i = numbers.length - 1; i >= 0; i--) {
    if (match(prediction, numbers[i])) {
      break
    }
    peak++
  }

  return Math.min(peak, 15)
}
