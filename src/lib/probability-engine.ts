/**
 * Motor de Probabilidad Matemática para Ruleta
 * Basado en estadística real, distribución binomial y análisis de desviación
 * 
 * IMPORTANTE: Este motor NO predice el futuro.
 * Calcula probabilidades y desviaciones estadísticas REALES.
 */

// ==================== CONSTANTES MATEMÁTICAS ====================

export const ROULETTE_NUMBERS = 37 // 0-36

// Probabilidades teóricas
export const THEORETICAL_PROB = {
  red: 18 / 37,      // 0.4865 (48.65%)
  black: 18 / 37,    // 0.4865 (48.65%)
  green: 1 / 37,     // 0.0270 (2.70%)
  odd: 18 / 37,      // 0.4865
  even: 18 / 37,     // 0.4865
  dozen1: 12 / 37,   // 0.3243 (32.43%)
  dozen2: 12 / 37,   // 0.3243
  dozen3: 12 / 37,   // 0.3243
  column1: 12 / 37,  // 0.3243
  column2: 12 / 37,  // 0.3243
  column3: 12 / 37,  // 0.3243
  singleNumber: 1 / 37, // 0.0270
}

// Ventaja de la casa
export const HOUSE_EDGE = 1 / 37 // 2.70%

// ==================== TIPOS ====================

export interface ProbabilityResult {
  probability: number      // Probabilidad calculada (0-1)
  expectedFreq: number     // Frecuencia esperada
  observedFreq: number     // Frecuencia observada
  deviation: number        // Desviación absoluta
  zScore: number          // Z-score (desviaciones estándar)
  pValue: number          // P-valor (significancia estadística)
  isSignificant: boolean  // ¿Es estadísticamente significativo?
  confidence: number      // Nivel de confianza (0-100%)
  interpretation: string  // Interpretación en texto
}

export interface BetProbability {
  type: 'color' | 'parity' | 'dozen' | 'column'
  value: string
  probability: ProbabilityResult
  recommendation: 'strong' | 'moderate' | 'weak' | 'none'
  expectedValue: number // Valor esperado de la apuesta
}

export interface SessionStats {
  totalSpins: number
  chiSquare: number      // Test chi-cuadrado para sesgo
  chiSquarePValue: number
  hasBias: boolean       // ¿Hay sesgo estadístico?
  hotBets: BetProbability[]
  coldBets: BetProbability[]
  bestBet: BetProbability | null
  warnings: string[]
}

// ==================== FUNCIONES MATEMÁTICAS ====================

/**
 * Factorial
 */
function factorial(n: number): number {
  if (n <= 1) return 1
  let result = 1
  for (let i = 2; i <= n; i++) result *= i
  return result
}

/**
 * Combinaciones (n choose k)
 */
function combinations(n: number, k: number): number {
  if (k > n || k < 0) return 0
  if (k === 0 || k === n) return 1
  
  // Optimización para números grandes
  if (k > n - k) k = n - k
  
  let result = 1
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1)
  }
  return result
}

/**
 * Distribución Binomial: P(X = k)
 * Probabilidad de exactamente k éxitos en n intentos
 */
function binomialPMF(n: number, k: number, p: number): number {
  if (n < 0 || k < 0 || k > n || p < 0 || p > 1) return 0
  return combinations(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k)
}

/**
 * Distribución Binomial Acumulada: P(X <= k)
 */
function binomialCDF(n: number, k: number, p: number): number {
  let cumulative = 0
  for (let i = 0; i <= k; i++) {
    cumulative += binomialPMF(n, i, p)
  }
  return cumulative
}

/**
 * Media de distribución binomial
 */
function binomialMean(n: number, p: number): number {
  return n * p
}

/**
 * Desviación estándar de distribución binomial
 */
function binomialStdDev(n: number, p: number): number {
  return Math.sqrt(n * p * (1 - p))
}

/**
 * Calcular Z-Score (cuántas desviaciones estándar)
 */
function calculateZScore(observed: number, expected: number, stdDev: number): number {
  if (stdDev === 0) return 0
  return (observed - expected) / stdDev
}

/**
 * Aproximación de la función de distribución normal (para p-value)
 * Usando la aproximación de Abramowitz y Stegun
 */
function normalCDF(z: number): number {
  const sign = z < 0 ? -1 : 1
  z = Math.abs(z) / Math.sqrt(2)
  
  const t = 1.0 / (1.0 + 0.3275911 * z)
  const y = 1.0 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  
  return 0.5 * (1.0 + sign * y)
}

/**
 * Calcular p-value para z-score (dos colas)
 */
function zScoreToPValue(z: number): number {
  return 2 * (1 - normalCDF(Math.abs(z)))
}

/**
 * Test Chi-Cuadrado para detectar sesgo en la ruleta
 */
function chiSquareTest(observed: number[], expected: number[]): { chiSquare: number; pValue: number } {
  let chiSq = 0
  const minExpected = 5 // Regla de cochran
  
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] >= minExpected) {
      chiSq += Math.pow(observed[i] - expected[i], 2) / expected[i]
    }
  }
  
  // Aproximación de p-value para chi-cuadrado con gl = k-1
  const df = observed.length - 1
  const pValue = 1 - chiSquareCDF(chiSq, df)
  
  return { chiSquare: chiSq, pValue }
}

/**
 * Aproximación de CDF Chi-Cuadrado
 */
function chiSquareCDF(x: number, df: number): number {
  if (x <= 0) return 0
  
  // Aproximación de Wilson-Hilferty
  const z = (Math.pow(x / df, 1/3) - (1 - 2/(9*df))) / Math.sqrt(2/(9*df))
  return normalCDF(z)
}

// ==================== MOTOR DE PROBABILIDAD ====================

export class ProbabilityEngine {
  private numbers: number[] = []
  
  constructor(numbers: number[] = []) {
    this.numbers = numbers
  }
  
  /**
   * Actualizar números
   */
  updateNumbers(numbers: number[]): void {
    this.numbers = numbers
  }
  
  /**
   * Contar ocurrencias por tipo de apuesta
   */
  private getCounts() {
    const counts = {
      red: 0, black: 0, green: 0,
      odd: 0, even: 0,
      dozen1: 0, dozen2: 0, dozen3: 0,
      column1: 0, column2: 0, column3: 0
    }
    
    for (const num of this.numbers) {
      // Color
      if (num === 0) counts.green++
      else if (this.isRed(num)) counts.red++
      else counts.black++
      
      // Paridad (excluyendo 0)
      if (num !== 0) {
        if (num % 2 === 0) counts.even++
        else counts.odd++
        
        // Docenas
        if (num <= 12) counts.dozen1++
        else if (num <= 24) counts.dozen2++
        else counts.dozen3++
        
        // Columnas
        if (num % 3 === 1) counts.column1++
        else if (num % 3 === 2) counts.column2++
        else counts.column3++
      }
    }
    
    return counts
  }
  
  /**
   * Verificar si un número es rojo
   */
  private isRed(num: number): boolean {
    const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
    return redNumbers.includes(num)
  }
  
  /**
   * Calcular probabilidad para un tipo de apuesta
   */
  calculateProbability(
    betType: 'red' | 'black' | 'odd' | 'even' | 'dozen1' | 'dozen2' | 'dozen3' | 'column1' | 'column2' | 'column3',
    theoreticalProb: number
  ): ProbabilityResult {
    const n = this.numbers.length
    if (n === 0) {
      return {
        probability: theoreticalProb,
        expectedFreq: 0,
        observedFreq: 0,
        deviation: 0,
        zScore: 0,
        pValue: 1,
        isSignificant: false,
        confidence: 0,
        interpretation: 'Sin datos suficientes'
      }
    }
    
    const counts = this.getCounts()
    const observed = counts[betType]
    const expected = binomialMean(n, theoreticalProb)
    const stdDev = binomialStdDev(n, theoreticalProb)
    const zScore = calculateZScore(observed, expected, stdDev)
    const pValue = zScoreToPValue(zScore)
    
    // Probabilidad ajustada basada en la desviación observada
    // Si hay desviación significativa, ajustamos la probabilidad
    let adjustedProb = theoreticalProb
    
    if (n >= 30) {
      // Solo ajustamos si hay suficientes datos y desviación significativa
      if (pValue < 0.05) {
        // Hay desviación significativa
        // Ajustamos hacia la desviación observada (pero con cautela)
        const observedRatio = observed / n
        const adjustment = (observedRatio - theoreticalProb) * 0.3 // 30% de peso a lo observado
        adjustedProb = theoreticalProb + adjustment
      }
    }
    
    // Interpretación
    let interpretation = ''
    const deviationPercent = ((observed - expected) / expected) * 100
    
    if (Math.abs(zScore) < 1) {
      interpretation = 'Dentro de lo esperado (normal)'
    } else if (Math.abs(zScore) < 2) {
      interpretation = deviationPercent > 0 
        ? `Ligeramente arriba de lo esperado (+${deviationPercent.toFixed(1)}%)`
        : `Ligeramente abajo de lo esperado (${deviationPercent.toFixed(1)}%)`
    } else if (Math.abs(zScore) < 3) {
      interpretation = deviationPercent > 0
        ? `Desviación notable hacia arriba (+${deviationPercent.toFixed(1)}%)`
        : `Desviación notable hacia abajo (${deviationPercent.toFixed(1)}%)`
    } else {
      interpretation = deviationPercent > 0
        ? `Desviación MUY significativa (+${deviationPercent.toFixed(1)}%) - ¿Posible sesgo?`
        : `Desviación MUY significativa (${deviationPercent.toFixed(1)}%) - ¿Posible sesgo?`
    }
    
    // Confianza basada en tamaño de muestra y consistencia
    let confidence = 0
    if (n >= 10) confidence = 20
    if (n >= 30) confidence = 40
    if (n >= 50) confidence = 55
    if (n >= 100) confidence = 70
    if (n >= 200) confidence = 85
    
    // Ajustar confianza por significancia estadística
    if (pValue < 0.01) confidence = Math.min(confidence + 10, 95)
    
    return {
      probability: Math.max(0.01, Math.min(0.99, adjustedProb)),
      expectedFreq: expected,
      observedFreq: observed,
      deviation: Math.abs(observed - expected),
      zScore: Math.round(zScore * 100) / 100,
      pValue: Math.round(pValue * 1000) / 1000,
      isSignificant: pValue < 0.05,
      confidence,
      interpretation
    }
  }
  
  /**
   * Calcular probabilidad de que ocurra un evento después de N intentos fallidos
   * (Probabilidad condicional - NO aumenta, pero útil para contexto)
   */
  calculateStreakProbability(streakLength: number, eventProb: number): {
    probNext: number         // Probabilidad del próximo evento (NO cambia)
    probStreakEnds: number   // Probabilidad de que la racha termine
    expectedRemaining: number // Esperanza de tiradas restantes
  } {
    // La probabilidad NO aumenta por rachas previas (eventos independientes)
    const probNext = eventProb
    
    // Probabilidad de que la racha termine en las próximas k tiradas
    // P(terminar en <= k tiradas) = 1 - (1-p)^k
    const probStreakEnds = 1 - Math.pow(1 - eventProb, 10) // Próximas 10 tiradas
    
    // Esperanza de tiradas hasta el éxito (distribución geométrica)
    const expectedRemaining = 1 / eventProb
    
    return {
      probNext,
      probStreakEnds,
      expectedRemaining: Math.round(expectedRemaining * 10) / 10
    }
  }
  
  /**
   * Analizar toda la sesión y generar recomendaciones
   */
  analyzeSession(): SessionStats {
    const n = this.numbers.length
    const warnings: string[] = []
    
    if (n < 10) {
      return {
        totalSpins: n,
        chiSquare: 0,
        chiSquarePValue: 1,
        hasBias: false,
        hotBets: [],
        coldBets: [],
        bestBet: null,
        warnings: ['Se necesitan al menos 10 tiradas para análisis']
      }
    }
    
    // Calcular probabilidades para todas las apuestas
    const colorBets: BetProbability[] = [
      { type: 'color', value: 'red', probability: this.calculateProbability('red', THEORETICAL_PROB.red), recommendation: 'none', expectedValue: 0 },
      { type: 'color', value: 'black', probability: this.calculateProbability('black', THEORETICAL_PROB.black), recommendation: 'none', expectedValue: 0 }
    ]
    
    const parityBets: BetProbability[] = [
      { type: 'parity', value: 'odd', probability: this.calculateProbability('odd', THEORETICAL_PROB.odd), recommendation: 'none', expectedValue: 0 },
      { type: 'parity', value: 'even', probability: this.calculateProbability('even', THEORETICAL_PROB.even), recommendation: 'none', expectedValue: 0 }
    ]
    
    const dozenBets: BetProbability[] = [
      { type: 'dozen', value: '1-12', probability: this.calculateProbability('dozen1', THEORETICAL_PROB.dozen1), recommendation: 'none', expectedValue: 0 },
      { type: 'dozen', value: '13-24', probability: this.calculateProbability('dozen2', THEORETICAL_PROB.dozen2), recommendation: 'none', expectedValue: 0 },
      { type: 'dozen', value: '25-36', probability: this.calculateProbability('dozen3', THEORETICAL_PROB.dozen3), recommendation: 'none', expectedValue: 0 }
    ]
    
    const columnBets: BetProbability[] = [
      { type: 'column', value: '1', probability: this.calculateProbability('column1', THEORETICAL_PROB.column1), recommendation: 'none', expectedValue: 0 },
      { type: 'column', value: '2', probability: this.calculateProbability('column2', THEORETICAL_PROB.column2), recommendation: 'none', expectedValue: 0 },
      { type: 'column', value: '3', probability: this.calculateProbability('column3', THEORETICAL_PROB.column3), recommendation: 'none', expectedValue: 0 }
    ]
    
    const allBets = [...colorBets, ...parityBets, ...dozenBets, ...columnBets]
    
    // Calcular valor esperado y recomendación
    for (const bet of allBets) {
      // Valor esperado = Prob * Pago - Prob_losing * Stake
      // Para color: pago 2x, para docena: pago 3x
      const payout = bet.type === 'color' || bet.type === 'parity' ? 2 : 3
      const prob = bet.probability.probability
      bet.expectedValue = prob * payout - (1 - prob) * 1
      
      // Recomendación basada en significancia estadística y valor esperado
      if (bet.probability.isSignificant && bet.probability.zScore < -2) {
        bet.recommendation = 'strong' // Frío, podría estar "vació"
      } else if (bet.probability.isSignificant && bet.probability.zScore > 2) {
        bet.recommendation = 'weak' // Caliente, NO significa que seguirá
      } else if (Math.abs(bet.probability.zScore) > 1) {
        bet.recommendation = 'moderate'
      } else {
        bet.recommendation = 'none'
      }
    }
    
    // Test Chi-Cuadrado para detectar sesgo general
    const counts = this.getCounts()
    const observed = [counts.red, counts.black, counts.green]
    const nonZero = this.numbers.filter(n => n !== 0).length
    const expected = [nonZero * 18/37, nonZero * 18/37, n * 1/37]
    
    const { chiSquare, pValue: chiPValue } = chiSquareTest(observed, expected)
    const hasBias = chiPValue < 0.05 && n >= 50
    
    if (hasBias) {
      warnings.push('⚠️ Posible sesgo detectado. Los datos muestran desviación estadísticamente significativa.')
    }
    
    if (n < 30) {
      warnings.push('ℹ️ Muestra pequeña. Las probabilidades son menos confiables.')
    }
    
    // Identificar apuestas frías (desviación negativa significativa)
    const coldBets = allBets
      .filter(b => b.probability.zScore < -1.5)
      .sort((a, b) => a.probability.zScore - b.probability.zScore)
      .slice(0, 3)
    
    // Identificar apuestas calientes (desviación positiva)
    const hotBets = allBets
      .filter(b => b.probability.zScore > 1.5)
      .sort((a, b) => b.probability.zScore - a.probability.zScore)
      .slice(0, 3)
    
    // Mejor apuesta (la que tiene mayor desviación negativa - "más vacía")
    const bestBet = allBets.reduce((best, current) => {
      if (current.probability.zScore < best.probability.zScore && current.probability.isSignificant) {
        return current
      }
      return best
    }, allBets[0])
    
    return {
      totalSpins: n,
      chiSquare: Math.round(chiSquare * 100) / 100,
      chiSquarePValue: Math.round(chiPValue * 1000) / 1000,
      hasBias,
      hotBets,
      coldBets,
      bestBet: bestBet.probability.zScore < -1.5 ? bestBet : null,
      warnings
    }
  }
  
  /**
   * Obtener la mejor predicción matemática
   */
  getMathematicalPrediction(betType: 'color' | 'parity' | 'dozen' | 'column'): {
    prediction: string
    probability: number
    confidence: number
    reasoning: string
    zScore: number
    streakInfo?: {
      currentStreak: number
      streakProb: number
      expectedRemaining: number
    }
  } {
    const session = this.analyzeSession()
    const n = this.numbers.length
    
    if (n < 10) {
      return {
        prediction: betType === 'color' ? 'red' : betType === 'parity' ? 'odd' : '1-12',
        probability: betType === 'color' ? THEORETICAL_PROB.red : betType === 'parity' ? THEORETICAL_PROB.odd : THEORETICAL_PROB.dozen1,
        confidence: 0,
        reasoning: 'Datos insuficientes para análisis estadístico',
        zScore: 0
      }
    }
    
    // Obtener todas las apuestas del tipo solicitado
    const relevantBets = session.coldBets
      .filter(b => b.type === betType)
      .concat(session.hotBets.filter(b => b.type === betType))
    
    // Si hay una apuesta fría significativa
    if (relevantBets.length > 0 && relevantBets[0].probability.zScore < -1.5) {
      const coldBet = relevantBets[0]
      return {
        prediction: coldBet.value,
        probability: coldBet.probability.probability,
        confidence: coldBet.probability.confidence,
        reasoning: `${coldBet.value} tiene desviación negativa significativa (z=${coldBet.probability.zScore}). ` +
          `Observado: ${coldBet.probability.observedFreq}, Esperado: ${coldBet.probability.expectedFreq.toFixed(1)}. ` +
          `RECUERDE: Esto NO garantiza que vaya a salir.`,
        zScore: coldBet.probability.zScore
      }
    }
    
    // Análisis de racha si aplica
    const lastNums = this.numbers.slice(-10)
    let streakInfo = undefined
    
    // Calcular racha actual del tipo de apuesta
    if (betType === 'color' || betType === 'parity') {
      let currentStreak = 0
      const targetValue = betType === 'color' ? 'red' : 'odd'
      
      for (let i = lastNums.length - 1; i >= 0; i--) {
        const num = lastNums[i]
        const matches = betType === 'color' 
          ? (targetValue === 'red' ? this.isRed(num) : !this.isRed(num) && num !== 0)
          : (targetValue === 'odd' ? num % 2 === 1 : num % 2 === 0 && num !== 0)
        
        if (matches) currentStreak++
        else break
      }
      
      if (currentStreak >= 3) {
        const prob = betType === 'color' ? THEORETICAL_PROB.red : THEORETICAL_PROB.odd
        const streakProb = this.calculateStreakProbability(currentStreak, prob)
        streakInfo = {
          currentStreak,
          streakProb: streakProb.probStreakEnds,
          expectedRemaining: streakProb.expectedRemaining
        }
      }
    }
    
    // Predicción por defecto basada en menor frecuencia observada
    const counts = this.getCounts()
    
    if (betType === 'color') {
      const pick = counts.red < counts.black ? 'red' : 'black'
      const prob = this.calculateProbability(pick === 'red' ? 'red' : 'black', THEORETICAL_PROB.red)
      return {
        prediction: pick,
        probability: prob.probability,
        confidence: prob.confidence,
        reasoning: `${pick} ha aparecido menos (${prob.observedFreq} vs ${pick === 'red' ? counts.black : counts.red}). ` +
          `Probabilidad teórica: ${(THEORETICAL_PROB.red * 100).toFixed(1)}%`,
        zScore: prob.zScore,
        streakInfo
      }
    }
    
    if (betType === 'parity') {
      const pick = counts.odd < counts.even ? 'odd' : 'even'
      const prob = this.calculateProbability(pick === 'odd' ? 'odd' : 'even', THEORETICAL_PROB.odd)
      return {
        prediction: pick,
        probability: prob.probability,
        confidence: prob.confidence,
        reasoning: `${pick === 'odd' ? 'Impar' : 'Par'} ha aparecido menos (${prob.observedFreq} vs ${pick === 'odd' ? counts.even : counts.odd}). ` +
          `Probabilidad teórica: ${(THEORETICAL_PROB.odd * 100).toFixed(1)}%`,
        zScore: prob.zScore,
        streakInfo
      }
    }
    
    if (betType === 'dozen') {
      const dozenCounts = [
        { value: '1-12', count: counts.dozen1, prob: this.calculateProbability('dozen1', THEORETICAL_PROB.dozen1) },
        { value: '13-24', count: counts.dozen2, prob: this.calculateProbability('dozen2', THEORETICAL_PROB.dozen2) },
        { value: '25-36', count: counts.dozen3, prob: this.calculateProbability('dozen3', THEORETICAL_PROB.dozen3) }
      ]
      
      // Ordenar por z-score (menor = más "vacía")
      dozenCounts.sort((a, b) => a.prob.zScore - b.prob.zScore)
      
      const pick = dozenCounts[0]
      return {
        prediction: pick.value,
        probability: pick.prob.probability,
        confidence: pick.prob.confidence,
        reasoning: `Docena ${pick.value} tiene menor frecuencia observada (${pick.count}) vs esperado (${pick.prob.expectedFreq.toFixed(1)}). ` +
          `Z-Score: ${pick.prob.zScore}`,
        zScore: pick.prob.zScore
      }
    }
    
    if (betType === 'column') {
      const colCounts = [
        { value: '1', count: counts.column1, prob: this.calculateProbability('column1', THEORETICAL_PROB.column1) },
        { value: '2', count: counts.column2, prob: this.calculateProbability('column2', THEORETICAL_PROB.column2) },
        { value: '3', count: counts.column3, prob: this.calculateProbability('column3', THEORETICAL_PROB.column3) }
      ]
      
      colCounts.sort((a, b) => a.prob.zScore - b.prob.zScore)
      
      const pick = colCounts[0]
      return {
        prediction: pick.value,
        probability: pick.prob.probability,
        confidence: pick.prob.confidence,
        reasoning: `Columna ${pick.value} tiene menor frecuencia observada (${pick.count}) vs esperado (${pick.prob.expectedFreq.toFixed(1)}). ` +
          `Z-Score: ${pick.prob.zScore}`,
        zScore: pick.prob.zScore
      }
    }
    
    // Fallback
    return {
      prediction: 'red',
      probability: THEORETICAL_PROB.red,
      confidence: 0,
      reasoning: 'Análisis no disponible',
      zScore: 0
    }
  }
  
  /**
   * Calcular probabilidad de alcanzar un pico dado
   */
  calculatePeakProbability(currentPeak: number, betType: 'color' | 'parity' | 'dozen' | 'column'): {
    probOfHitting: number      // Probabilidad de alcanzar el pico
    probOfRecovery: number     // Probabilidad de recuperarse (acertar)
    expectedPeak: number       // Pico esperado
    warningLevel: 'safe' | 'caution' | 'danger' | 'critical'
  } {
    const prob = betType === 'color' || betType === 'parity' 
      ? THEORETICAL_PROB.red 
      : THEORETICAL_PROB.dozen1
    
    // Probabilidad de que la racha de fallos llegue a currentPeak o más
    // P(X >= currentPeak) donde X es el número de fallos antes del éxito
    // Para distribución geométrica: P(X >= k) = (1-p)^k
    const probOfHitting = Math.pow(1 - prob, currentPeak)
    
    // Probabilidad de acertar en la próxima
    const probOfRecovery = prob
    
    // Pico esperado (media de distribución geométrica inversa)
    const expectedPeak = 1 / prob
    
    // Nivel de advertencia
    let warningLevel: 'safe' | 'caution' | 'danger' | 'critical'
    if (currentPeak <= 3) warningLevel = 'safe'
    else if (currentPeak <= 5) warningLevel = 'caution'
    else if (currentPeak <= 8) warningLevel = 'danger'
    else warningLevel = 'critical'
    
    return {
      probOfHitting: Math.round(probOfHitting * 10000) / 10000,
      probOfRecovery: Math.round(probOfRecovery * 10000) / 10000,
      expectedPeak: Math.round(expectedPeak * 10) / 10,
      warningLevel
    }
  }
}

// Instancia singleton
let globalEngine: ProbabilityEngine | null = null

export function getProbabilityEngine(numbers: number[] = []): ProbabilityEngine {
  if (!globalEngine) {
    globalEngine = new ProbabilityEngine(numbers)
  } else {
    globalEngine.updateNumbers(numbers)
  }
  return globalEngine
}
