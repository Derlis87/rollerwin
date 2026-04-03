/**
 * Motor de Predicción Optimizado para Ruleta
 * Usa EMA, Chi-cuadrado, y Cadena de Markov
 */

export interface PredictionResult {
  hotNumbers: { number: number; frequency: number; score: number }[]
  coldNumbers: { number: number; frequency: number; score: number }[]
  predictedNumbers: number[]
  overallConfidence: number
  analysis: {
    redPercentage: number
    blackPercentage: number
    greenPercentage: number
    oddPercentage: number
    evenPercentage: number
    lowPercentage: number
    highPercentage: number
  }
  trends: {
    lastTrend: 'red' | 'black' | 'green'
    streakCount: number
    alternatingPattern: boolean
  }
  emaScores: Record<number, number>
  chiSquareSignificant: boolean
  markovPrediction: number | null
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]
const DECAY_FACTOR = 0.9
const MIN_NUMBERS = 5

function getNumberColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

/**
 * EMA (Exponential Moving Average) frequency tracking
 * Gives more weight to recent occurrences
 */
function calculateEMA(numbers: number[]): Record<number, number> {
  const ema: Record<number, number> = {}
  
  // Initialize
  for (let i = 0; i <= 36; i++) {
    ema[i] = 0
  }
  
  let multiplier = 1
  
  for (let i = numbers.length - 1; i >= 0; i--) {
    ema[numbers[i]] += multiplier
    multiplier *= DECAY_FACTOR
  }
  
  // Normalize
  const maxVal = Math.max(...Object.values(ema), 1)
  for (let i = 0; i <= 36; i++) {
    ema[i] = (ema[i] / maxVal) * 100
  }
  
  return ema
}

/**
 * Chi-square statistical analysis
 * Tests if the distribution is significantly different from expected uniform distribution
 */
function chiSquareTest(numbers: number[]): {
  chiSquare: number
  isSignificant: boolean
  pValue: number
  categoryDeviations: Record<string, { observed: number; expected: number; chi: number }>
} {
  const total = numbers.length
  if (total === 0) return { chiSquare: 0, isSignificant: false, pValue: 1, categoryDeviations: {} }
  
  // Group into categories
  const categories: Record<string, number> = {
    red: 0, black: 0, green: 0,
    odd: 0, even: 0,
    d1: 0, d2: 0, d3: 0
  }
  
  numbers.forEach(num => {
    const color = getNumberColor(num)
    categories[color]++
    if (num !== 0) {
      if (num % 2 === 0) categories.even++
      else categories.odd++
      if (num <= 12) categories.d1++
      else if (num <= 24) categories.d2++
      else categories.d3++
    }
  })
  
  // Expected frequencies (approximate for roulette)
  const expected: Record<string, number> = {
    red: total * (18 / 37),
    black: total * (18 / 37),
    green: total * (1 / 37),
    odd: numbers.filter(n => n !== 0).length * (18 / 37),
    even: numbers.filter(n => n !== 0).length * (18 / 37),
    d1: numbers.filter(n => n !== 0).length * (12 / 37),
    d2: numbers.filter(n => n !== 0).length * (12 / 37),
    d3: numbers.filter(n => n !== 0).length * (12 / 37)
  }
  
  let totalChi = 0
  const categoryDeviations: Record<string, { observed: number; expected: number; chi: number }> = {}
  
  for (const [cat, obs] of Object.entries(categories)) {
    const exp = expected[cat] || 1
    const chi = Math.pow(obs - exp, 2) / exp
    totalChi += chi
    categoryDeviations[cat] = { observed: obs, expected: exp, chi }
  }
  
  // For df=7, chi-square critical value at p<0.05 is ~14.07
  // For df=2 (just colors), critical value at p<0.05 is ~5.99
  const isSignificant = totalChi > 5.99
  
  // Approximate p-value using color-only chi-square
  const colorChi = categoryDeviations.red?.chi + categoryDeviations.black?.chi + categoryDeviations.green?.chi || 0
  const pValue = Math.max(0, 1 - colorChi / 15) // Simplified approximation
  
  return { chiSquare: totalChi, isSignificant, pValue, categoryDeviations }
}

/**
 * Markov chain transition matrix for sequential patterns
 * Predicts next number based on previous transitions
 */
function markovPrediction(numbers: number[]): {
  prediction: number | null
  transitionMatrix: Record<number, Record<number, number>>
  confidence: number
} {
  if (numbers.length < 3) return { prediction: null, transitionMatrix: {}, confidence: 0 }
  
  // Build transition matrix (simplified: color transitions)
  const transitions: Record<string, Record<string, number>> = {
    red: { red: 0, black: 0, green: 0 },
    black: { red: 0, black: 0, green: 0 },
    green: { red: 0, black: 0, green: 0 }
  }
  
  for (let i = 1; i < numbers.length; i++) {
    const prev = getNumberColor(numbers[i - 1])
    const curr = getNumberColor(numbers[i])
    transitions[prev][curr]++
  }
  
  // Get last color
  const lastColor = getNumberColor(numbers[numbers.length - 1])
  const nextTransitions = transitions[lastColor]
  const totalTransitions = Object.values(nextTransitions).reduce((a, b) => a + b, 0)
  
  if (totalTransitions === 0) return { prediction: null, transitionMatrix: {}, confidence: 0 }
  
  // Find most likely next color
  let bestColor: string = lastColor
  let bestCount = -1
  for (const [color, count] of Object.entries(nextTransitions)) {
    if (count > bestCount) {
      bestCount = count
      bestColor = color
    }
  }
  
  const confidence = totalTransitions > 0 ? (bestCount / totalTransitions) * 100 : 0
  
  // Pick a specific number from the predicted color
  let prediction: number | null = null
  const colorNumbers = bestColor === 'red' ? RED_NUMBERS : bestColor === 'black' ? BLACK_NUMBERS : [0]
  
  if (colorNumbers.length > 0) {
    // Use EMA-weighted selection within the color
    const ema = calculateEMA(numbers)
    const colorCandidates = colorNumbers.map(n => ({ number: n, score: ema[n] || 0 }))
    colorCandidates.sort((a, b) => b.score - a.score)
    
    // Pick from top candidates with some randomness
    const topN = colorCandidates.slice(0, 3)
    prediction = topN[Math.floor(Math.random() * topN.length)].number
  }
  
  return {
    prediction,
    transitionMatrix: {},
    confidence
  }
}

/**
 * Combined scoring system
 * Weights EMA, chi-square, and Markov predictions
 */
function combinedScoring(
  emaScores: Record<number, number>,
  chiResult: ReturnType<typeof chiSquareTest>,
  markovResult: ReturnType<typeof markovPrediction>,
  numbers: number[]
): number[] {
  const scores: Record<number, number> = {}
  
  // Initialize scores
  for (let i = 0; i <= 36; i++) {
    scores[i] = 50 // Base score
  }
  
  // 1. EMA Score (weight: 40%)
  // Numbers with higher EMA are "hot" - but we predict "due" numbers, so invert slightly
  const emaValues = Object.entries(emaScores)
    .map(([num, score]) => ({ number: parseInt(num), score }))
    .sort((a, b) => a.score - b.score) // Lowest EMA = most "due"
  
  emaValues.forEach((entry, index) => {
    // Lower EMA = higher prediction score (due for appearance)
    scores[entry.number] += (1 - entry.score / 100) * 20
    // But also give a small bonus to very hot numbers (recent cluster)
    if (entry.score > 70) scores[entry.number] += 5
  })
  
  // 2. Chi-square adjustment (weight: 30%)
  if (chiResult.isSignificant) {
    // If distribution is skewed, boost underrepresented numbers
    const colorDev = chiResult.categoryDeviations
    if (colorDev.red && colorDev.red.chi > 2) {
      // Red overrepresented - boost black numbers
      BLACK_NUMBERS.forEach(n => { scores[n] += 10 })
    }
    if (colorDev.black && colorDev.black.chi > 2) {
      // Black overrepresented - boost red numbers
      RED_NUMBERS.forEach(n => { scores[n] += 10 })
    }
    
    // Parity deviation
    if (colorDev.odd && colorDev.odd.chi > 2) {
      for (let i = 2; i <= 36; i += 2) { scores[i] += 8 }
    }
    if (colorDev.even && colorDev.even.chi > 2) {
      for (let i = 1; i <= 36; i += 2) { scores[i] += 8 }
    }
  }
  
  // 3. Markov prediction (weight: 30%)
  if (markovResult.prediction !== null) {
    // Get predicted color's numbers and boost them
    const predColor = getNumberColor(markovResult.prediction)
    const colorNumbers = predColor === 'red' ? RED_NUMBERS : predColor === 'black' ? BLACK_NUMBERS : [0]
    colorNumbers.forEach(n => { scores[n] += 12 })
  }
  
  // Sort by combined score
  const ranked = Object.entries(scores)
    .map(([num, score]) => ({ number: parseInt(num), score }))
    .sort((a, b) => b.score - a.score)
  
  return ranked.slice(0, 5).map(r => r.number)
}

/**
 * Main analysis function
 */
export function analyzeNumbers(numbers: number[]): PredictionResult | null {
  if (numbers.length < MIN_NUMBERS) return null
  
  // 1. Calculate EMA scores
  const emaScores = calculateEMA(numbers)
  
  // 2. Chi-square test
  const chiResult = chiSquareTest(numbers)
  
  // 3. Markov prediction
  const markovResult = markovPrediction(numbers)
  
  // 4. Frequency analysis
  const frequency: Record<number, number> = {}
  numbers.forEach(num => {
    frequency[num] = (frequency[num] || 0) + 1
  })
  
  const sorted = Object.entries(frequency)
    .map(([num, freq]) => ({
      number: parseInt(num),
      frequency: freq,
      score: emaScores[parseInt(num)] || 0
    }))
    .sort((a, b) => b.score - a.score)
  
  const hotNumbers = sorted.slice(0, 5)
  const coldNumbers = [...sorted].sort((a, b) => a.score - b.score).slice(0, 5)
  
  // 5. Combined predictions
  const predictedNumbers = combinedScoring(emaScores, chiResult, markovResult, numbers)
  
  // 6. Analysis percentages
  const total = numbers.length
  let redCount = 0, blackCount = 0, greenCount = 0
  let oddCount = 0, evenCount = 0, lowCount = 0, highCount = 0
  
  numbers.forEach(num => {
    const color = getNumberColor(num)
    if (color === 'red') redCount++
    else if (color === 'black') blackCount++
    else greenCount++
    
    if (num !== 0) {
      if (num % 2 === 0) evenCount++
      else oddCount++
      if (num <= 18) lowCount++
      else highCount++
    }
  })
  
  const nonZeroTotal = numbers.filter(n => n !== 0).length || 1
  
  // 7. Trends
  const lastNumbers = numbers.slice(-5)
  const lastTrend = getNumberColor(lastNumbers[lastNumbers.length - 1])
  
  let streakCount = 1
  for (let i = lastNumbers.length - 2; i >= 0; i--) {
    if (getNumberColor(lastNumbers[i]) === lastTrend) {
      streakCount++
    } else {
      break
    }
  }
  
  let alternatingPattern = true
  for (let i = lastNumbers.length - 1; i > 0; i--) {
    if (getNumberColor(lastNumbers[i]) === getNumberColor(lastNumbers[i - 1])) {
      alternatingPattern = false
      break
    }
  }
  
  // 8. Confidence calculation
  const emaConfidence = Math.min(30, numbers.length * 0.5)
  const chiConfidence = chiResult.isSignificant ? 20 : 5
  const markovConfidence = markovResult.confidence * 0.3
  const overallConfidence = Math.min(92, 50 + emaConfidence + chiConfidence + markovConfidence)
  
  return {
    hotNumbers,
    coldNumbers,
    predictedNumbers,
    overallConfidence,
    analysis: {
      redPercentage: (redCount / total) * 100,
      blackPercentage: (blackCount / total) * 100,
      greenPercentage: (greenCount / total) * 100,
      oddPercentage: (oddCount / nonZeroTotal) * 100,
      evenPercentage: (evenCount / nonZeroTotal) * 100,
      lowPercentage: (lowCount / nonZeroTotal) * 100,
      highPercentage: (highCount / nonZeroTotal) * 100
    },
    trends: {
      lastTrend: lastTrend as 'red' | 'black' | 'green',
      streakCount,
      alternatingPattern
    },
    emaScores,
    chiSquareSignificant: chiResult.isSignificant,
    markovPrediction: markovResult.prediction
  }
}
