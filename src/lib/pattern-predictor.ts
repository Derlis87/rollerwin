/**
 * Sistema Neuronal de Detección de Patrones para Ruleta
 * Aprende a detectar patrones repetidos en los picos y hace predicciones
 * TOTALMENTE INDEPENDIENTE del sistema principal de predicciones
 */

export type PeakLevel = 'low' | 'medium' | 'high'

export interface PeakSequence {
  peaks: number[]
  timestamps: number[]
}

export interface PatternRule {
  id: string
  name: string
  description: string
  condition: (history: number[]) => boolean
  prediction: PeakLevel
  confidence: number
  occurrences: number
  successRate: number
  lastTriggered?: number
}

export interface PatternMatch {
  rule: PatternRule
  matched: boolean
  predictedLevel: PeakLevel
  confidence: number
}

export interface PatternStats {
  lowToMedium: number // Veces que un pico bajo precedió a uno medio
  mediumToHigh: number // Veces que un pico medio precedió a uno alto
  consecutiveLows: number[] // Conteo de secuencias de picos bajos
  consecutiveMediums: number[] // Conteo de secuencias de picos medios
  patternHistory: PatternMatch[]
  totalPatterns: number
  successfulPatterns: number
}

/**
 * Clasifica un pico en nivel
 */
export function classifyPeak(peak: number): PeakLevel {
  if (peak <= 3) return 'low'
  if (peak <= 6) return 'medium'
  return 'high'
}

/**
 * Sistema Neuronal de Predicción de Patrones
 */
export class PatternPredictor {
  private peakHistory: number[] = []
  private rules: PatternRule[] = []
  private stats: PatternStats
  private learningRate: number = 0.1
  private minOccurrencesForConfidence: number = 3

  constructor() {
    this.stats = this.initializeStats()
    this.initializeRules()
  }

  private initializeStats(): PatternStats {
    return {
      lowToMedium: 0,
      mediumToHigh: 0,
      consecutiveLows: [],
      consecutiveMediums: [],
      patternHistory: [],
      totalPatterns: 0,
      successfulPatterns: 0
    }
  }

  private initializeRules(): void {
    // Regla 1: Después de varios picos bajos, probablemente viene uno medio
    this.rules.push({
      id: 'low_sequence_to_medium',
      name: 'Secuencia Baja → Media',
      description: 'Después de 8+ picos bajos consecutivos, aumenta probabilidad de pico medio',
      condition: (history) => {
        const lows = this.countConsecutiveLow(history)
        return lows >= 8 && lows <= 12
      },
      prediction: 'medium',
      confidence: 0.55,
      occurrences: 0,
      successRate: 0
    })

    // Regla 2: Secuencia muy larga de picos bajos → pico alto probable
    this.rules.push({
      id: 'extended_low_to_high',
      name: 'Racha Baja Extendida → Alta',
      description: 'Después de 13+ picos bajos, alta probabilidad de pico alto',
      condition: (history) => {
        const lows = this.countConsecutiveLow(history)
        return lows >= 13
      },
      prediction: 'high',
      confidence: 0.65,
      occurrences: 0,
      successRate: 0
    })

    // Regla 3: Alternancia de niveles - detector de patrones de oscilación
    this.rules.push({
      id: 'oscillation_pattern',
      name: 'Patrón de Oscilación',
      description: 'Detecta oscilación entre niveles bajos y medios',
      condition: (history) => {
        if (history.length < 6) return false
        const recent = history.slice(-6).map(classifyPeak)
        const lowCount = recent.filter(p => p === 'low').length
        const mediumCount = recent.filter(p => p === 'medium').length
        return lowCount >= 4 && mediumCount >= 2
      },
      prediction: 'low',
      confidence: 0.60,
      occurrences: 0,
      successRate: 0
    })

    // Regla 4: Racha de medios → alto inminente
    this.rules.push({
      id: 'medium_sequence_to_high',
      name: 'Secuencia Media → Alta',
      description: 'Después de 3+ picos medios consecutivos, probable pico alto',
      condition: (history) => {
        const mediums = this.countConsecutiveMedium(history)
        return mediums >= 3
      },
      prediction: 'high',
      confidence: 0.70,
      occurrences: 0,
      successRate: 0
    })

    // Regla 5: Patrón de recuperación - después de alto, suele venir bajo
    this.rules.push({
      id: 'recovery_pattern',
      name: 'Patrón de Recuperación',
      description: 'Después de un pico alto, suele seguir uno bajo',
      condition: (history) => {
        if (history.length < 1) return false
        const lastPeak = history[history.length - 1]
        return lastPeak >= 7
      },
      prediction: 'low',
      confidence: 0.75,
      occurrences: 0,
      successRate: 0
    })

    // Regla 6: Ciclo natural - después de muchos bajos, tiende a subir
    this.rules.push({
      id: 'natural_cycle',
      name: 'Ciclo Natural',
      description: 'Después de 10 picos bajos totales, tendencia a subir',
      condition: (history) => {
        const recentLows = history.slice(-15).filter(p => classifyPeak(p) === 'low').length
        return recentLows >= 10
      },
      prediction: 'medium',
      confidence: 0.55,
      occurrences: 0,
      successRate: 0
    })

    // Regla 7: Detección de racha caliente (muchos bajos seguidos)
    this.rules.push({
      id: 'hot_streak',
      name: 'Racha Caliente',
      description: 'Muchos aciertos consecutivos (picos bajos)',
      condition: (history) => {
        const recent = history.slice(-5)
        return recent.length >= 5 && recent.every(p => p <= 3)
      },
      prediction: 'low',
      confidence: 0.80,
      occurrences: 0,
      successRate: 0
    })

    // Regla 8: Detector de "ruptura de patrón"
    this.rules.push({
      id: 'pattern_break',
      name: 'Ruptura de Patrón',
      description: 'Cuando un patrón estable se rompe, predice cambio',
      condition: (history) => {
        if (history.length < 8) return false
        const last8 = history.slice(-8).map(classifyPeak)
        const beforeLast = last8.slice(0, 7)
        const last = last8[7]
        const wasStable = beforeLast.filter(p => p === 'low').length >= 5
        const broke = last !== 'low'
        return wasStable && broke
      },
      prediction: 'medium',
      confidence: 0.50,
      occurrences: 0,
      successRate: 0
    })

    // Regla 9: Aprendizaje adaptativo - picos altos tienden a agruparse
    this.rules.push({
      id: 'high_clustering',
      name: 'Agrupamiento de Altos',
      description: 'Los picos altos tienden a aparecer en grupos',
      condition: (history) => {
        if (history.length < 3) return false
        const recent = history.slice(-3).map(classifyPeak)
        const highCount = recent.filter(p => p === 'high').length
        return highCount >= 2
      },
      prediction: 'high',
      confidence: 0.60,
      occurrences: 0,
      successRate: 0
    })

    // Regla 10: Patrón de Fibonacci-like en intervalos
    this.rules.push({
      id: 'interval_pattern',
      name: 'Patrón de Intervalos',
      description: 'Detecta patrones de intervalo entre picos altos',
      condition: (history) => {
        const highs = history.map((p, i) => ({ p, i })).filter(x => classifyPeak(x.p) === 'high')
        if (highs.length < 3) return false
        const intervals = []
        for (let i = 1; i < highs.length; i++) {
          intervals.push(highs[i].i - highs[i - 1].i)
        }
        if (intervals.length < 2) return false
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const currentIndex = history.length - 1
        const lastHighIndex = highs[highs.length - 1].i
        return (currentIndex - lastHighIndex) >= avgInterval
      },
      prediction: 'high',
      confidence: 0.55,
      occurrences: 0,
      successRate: 0
    })
  }

  /**
   * Cuenta picos bajos consecutivos
   */
  private countConsecutiveLow(history: number[]): number {
    let count = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (classifyPeak(history[i]) === 'low') {
        count++
      } else {
        break
      }
    }
    return count
  }

  /**
   * Cuenta picos medios consecutivos
   */
  private countConsecutiveMedium(history: number[]): number {
    let count = 0
    for (let i = history.length - 1; i >= 0; i--) {
      if (classifyPeak(history[i]) === 'medium') {
        count++
      } else {
        break
      }
    }
    return count
  }

  /**
   * Añade un nuevo pico al historial y actualiza estadísticas
   */
  addPeak(peak: number): void {
    const previousLevel = this.peakHistory.length > 0 
      ? classifyPeak(this.peakHistory[this.peakHistory.length - 1])
      : null
    const currentLevel = classifyPeak(peak)

    // Actualizar estadísticas de transiciones
    if (previousLevel) {
      if (previousLevel === 'low' && currentLevel === 'medium') {
        this.stats.lowToMedium++
      }
      if (previousLevel === 'medium' && currentLevel === 'high') {
        this.stats.mediumToHigh++
      }
    }

    // Registrar secuencias consecutivas
    if (currentLevel === 'low') {
      const lastLength = this.stats.consecutiveLows.length > 0 
        ? this.stats.consecutiveLows[this.stats.consecutiveLows.length - 1]
        : 0
      if (previousLevel === 'low') {
        this.stats.consecutiveLows[this.stats.consecutiveLows.length - 1]++
      } else {
        this.stats.consecutiveLows.push(1)
      }
    }

    if (currentLevel === 'medium') {
      if (previousLevel === 'medium') {
        this.stats.consecutiveMediums[this.stats.consecutiveMediums.length - 1]++
      } else {
        this.stats.consecutiveMediums.push(1)
      }
    }

    // Añadir al historial
    this.peakHistory.push(peak)
    
    // Mantener solo los últimos 100 picos
    if (this.peakHistory.length > 100) {
      this.peakHistory.shift()
    }
  }

  /**
   * Registra el resultado de una predicción (para aprendizaje)
   */
  recordResult(actualPeak: number, predictedLevel: PeakLevel): void {
    const actualLevel = classifyPeak(actualPeak)
    const lastMatch = this.stats.patternHistory[this.stats.patternHistory.length - 1]
    
    if (lastMatch) {
      const success = actualLevel === predictedLevel
      this.stats.totalPatterns++
      if (success) {
        this.stats.successfulPatterns++
        
        // Actualizar tasa de éxito de la regla
        const rule = this.rules.find(r => r.id === lastMatch.rule.id)
        if (rule) {
          rule.occurrences++
          rule.successRate = (rule.successRate * (rule.occurrences - 1) + 1) / rule.occurrences
          // Incrementar confianza con el aprendizaje
          rule.confidence = Math.min(0.95, rule.confidence + this.learningRate * 0.1)
        }
      } else {
        // Decrementar confianza si falló
        const rule = this.rules.find(r => r.id === lastMatch.rule.id)
        if (rule && rule.occurrences >= this.minOccurrencesForConfidence) {
          rule.confidence = Math.max(0.3, rule.confidence - this.learningRate * 0.05)
        }
      }
    }
  }

  /**
   * Analiza el historial y detecta patrones activos
   */
  detectPatterns(): PatternMatch[] {
    const matches: PatternMatch[] = []

    for (const rule of this.rules) {
      try {
        const matched = rule.condition(this.peakHistory)
        if (matched) {
          rule.occurrences++
          rule.lastTriggered = Date.now()
          
          matches.push({
            rule: { ...rule },
            matched: true,
            predictedLevel: rule.prediction,
            confidence: rule.occurrences >= this.minOccurrencesForConfidence 
              ? rule.confidence 
              : rule.confidence * 0.5
          })
        }
      } catch {
        // Skip rules that error
      }
    }

    // Ordenar por confianza
    matches.sort((a, b) => b.confidence - a.confidence)

    // Guardar en historial
    if (matches.length > 0) {
      this.stats.patternHistory.push(matches[0])
      if (this.stats.patternHistory.length > 50) {
        this.stats.patternHistory.shift()
      }
    }

    return matches
  }

  /**
   * Obtiene la mejor predicción basada en patrones
   */
  getBestPrediction(): PatternMatch | null {
    const matches = this.detectPatterns()
    
    if (matches.length === 0) {
      return null
    }

    // Retornar la predicción con mayor confianza
    return matches[0]
  }

  /**
   * Obtiene todas las predicciones activas
   */
  getAllActivePredictions(): PatternMatch[] {
    return this.detectPatterns()
  }

  /**
   * Obtiene estadísticas del sistema
   */
  getStats(): PatternStats {
    return { ...this.stats }
  }

  /**
   * Obtiene el historial de picos
   */
  getPeakHistory(): number[] {
    return [...this.peakHistory]
  }

  /**
   * Obtiene las reglas con sus estadísticas
   */
  getRules(): PatternRule[] {
    return this.rules.map(rule => ({ ...rule }))
  }

  /**
   * Obtiene resumen de aprendizaje
   */
  getLearningSummary(): {
    totalPatterns: number
    successRate: number
    mostReliableRule: PatternRule | null
    recentTrend: 'improving' | 'stable' | 'declining'
  } {
    const successRate = this.stats.totalPatterns > 0 
      ? this.stats.successfulPatterns / this.stats.totalPatterns 
      : 0

    // Encontrar la regla más confiable
    const reliableRule = this.rules.reduce((best, rule) => {
      if (rule.occurrences >= this.minOccurrencesForConfidence) {
        if (!best || rule.successRate > best.successRate) {
          return rule
        }
      }
      return best
    }, null as PatternRule | null)

    // Calcular tendencia reciente
    const recentMatches = this.stats.patternHistory.slice(-10)
    let trend: 'improving' | 'stable' | 'declining' = 'stable'
    if (recentMatches.length >= 5) {
      const first5 = recentMatches.slice(0, 5)
      const last5 = recentMatches.slice(-5)
      const firstAvg = first5.reduce((s, m) => s + m.confidence, 0) / 5
      const lastAvg = last5.reduce((s, m) => s + m.confidence, 0) / 5
      if (lastAvg > firstAvg + 0.05) trend = 'improving'
      else if (lastAvg < firstAvg - 0.05) trend = 'declining'
    }

    return {
      totalPatterns: this.stats.totalPatterns,
      successRate,
      mostReliableRule: reliableRule,
      recentTrend: trend
    }
  }

  /**
   * Resetea el sistema
   */
  reset(): void {
    this.peakHistory = []
    this.stats = this.initializeStats()
    this.initializeRules()
  }
}

// Instancia singleton para uso global
let globalPatternPredictor: PatternPredictor | null = null

export function getPatternPredictor(): PatternPredictor {
  if (!globalPatternPredictor) {
    globalPatternPredictor = new PatternPredictor()
  }
  return globalPatternPredictor
}

export function resetPatternPredictor(): void {
  if (globalPatternPredictor) {
    globalPatternPredictor.reset()
  }
}
