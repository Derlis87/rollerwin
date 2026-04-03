/**
 * Motor de Cálculo de Picos (Peak Engine)
 * Calcula el historial de picos y el pico actual a partir de una secuencia de números
 */

export interface PeakRecord {
  id: string
  height: number
  prediction: { type: string; value: string }
  resultNumber: number
  resultColor: 'red' | 'black' | 'green'
  timestamp: Date
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
 * Check if a prediction matches a number
 */
function checkMatch(prediction: { type: string; value: string }, number: number): boolean {
  if (prediction.type === 'color') {
    return getNumberColor(number) === prediction.value
  }
  return false
}

/**
 * Calculate peak history from a sequence of numbers
 * Walk through the sequence, making color predictions, tracking spins until correct
 */
export function calculatePeakHistory(numbers: number[]): PeakRecord[] {
  if (numbers.length < 6) return []
  
  const peaks: PeakRecord[] = []
  let currentPrediction: { type: string; value: string } | null = null
  let currentPeakHeight = 0
  
  for (let i = 2; i < numbers.length; i++) {
    // Generate prediction from previous numbers
    const prevNumbers = numbers.slice(0, i)
    currentPrediction = generateSimplePrediction(prevNumbers)
    currentPeakHeight = 0
    
    // Check how many spins until prediction matches
    for (let j = i + 1; j < numbers.length; j++) {
      currentPeakHeight++
      
      if (checkMatch(currentPrediction, numbers[j])) {
        // Peak resolved!
        peaks.push({
          id: `peak-${peaks.length}-${Date.now()}`,
          height: Math.min(currentPeakHeight, 15), // Cap at 15
          prediction: currentPrediction,
          resultNumber: numbers[j],
          resultColor: getNumberColor(numbers[j]),
          timestamp: new Date()
        })
        
        // Skip ahead - next prediction starts after this match
        i = j
        break
      }
      
      // If peak reaches 15 or we run out of numbers, record unresolved
      if (currentPeakHeight >= 15 || j === numbers.length - 1) {
        peaks.push({
          id: `peak-${peaks.length}-${Date.now()}`,
          height: Math.min(currentPeakHeight, 15),
          prediction: currentPrediction,
          resultNumber: numbers[j],
          resultColor: getNumberColor(numbers[j]),
          timestamp: new Date()
        })
        i = j
        break
      }
    }
  }
  
  return peaks
}

/**
 * Get current unresolved peak from a sequence of numbers
 */
export function getCurrentPeak(numbers: number[]): number {
  if (numbers.length < 5) return 0
  
  // Generate prediction from the last 10 numbers
  const recent = numbers.slice(-Math.min(10, numbers.length - 1))
  const prediction = generateSimplePrediction(recent)
  
  // Count how many of the last numbers don't match the prediction
  let peak = 0
  for (let i = numbers.length - 1; i >= 0; i--) {
    if (checkMatch(prediction, numbers[i])) {
      break
    }
    peak++
  }
  
  return Math.min(peak, 15)
}
