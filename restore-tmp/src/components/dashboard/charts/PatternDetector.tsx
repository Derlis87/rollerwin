'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Brain, 
  Sparkles, 
  Target, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Zap,
  Activity,
  Info
} from 'lucide-react'
import { 
  PatternPredictor, 
  PatternMatch, 
  PatternRule,
  PeakLevel,
  getPatternPredictor,
  classifyPeak 
} from '@/lib/pattern-predictor'

interface PatternDetectorProps {
  peakHistory: { height: number }[]
  currentPeak: number
  onPrediction?: (prediction: PatternMatch | null) => void
}

// Colores para cada nivel
const LEVEL_STYLES = {
  low: {
    bg: 'bg-teal-500/10',
    border: 'border-teal-500/30',
    text: 'text-teal-400',
    badge: 'bg-teal-500 text-black',
    icon: '🟢'
  },
  medium: {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    text: 'text-amber-400',
    badge: 'bg-amber-500 text-black',
    icon: '🟡'
  },
  high: {
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    badge: 'bg-red-500 text-white',
    icon: '🔴'
  }
}

export function PatternDetector({ 
  peakHistory, 
  currentPeak,
  onPrediction 
}: PatternDetectorProps) {
  const [predictor] = useState<PatternPredictor>(() => getPatternPredictor())
  const [activePatterns, setActivePatterns] = useState<PatternMatch[]>([])
  const [bestPrediction, setBestPrediction] = useState<PatternMatch | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showRules, setShowRules] = useState(false)
  
  // Sincronizar el predictor con el historial de picos
  useEffect(() => {
    // Resetear y reconstruir el predictor con el historial actual
    predictor.reset()
    peakHistory.forEach(peak => {
      predictor.addPeak(peak.height)
    })
    
    // Detectar patrones después de sincronizar
    const patterns = predictor.getAllActivePredictions()
    const prediction = predictor.getBestPrediction()
    
    // Usar timeout para evitar cascading renders
    const timer = setTimeout(() => {
      setActivePatterns(patterns)
      setBestPrediction(prediction)
      onPrediction?.(prediction)
    }, 0)
    
    return () => clearTimeout(timer)
  }, [peakHistory, predictor, onPrediction])

  // Obtener reglas con estadísticas
  const rules = useMemo(() => {
    return predictor.getRules()
  }, [peakHistory, predictor])

  // Obtener resumen de aprendizaje
  const learningSummary = useMemo(() => {
    return predictor.getLearningSummary()
  }, [peakHistory, predictor])

  // Obtener estadísticas
  const stats = useMemo(() => {
    return predictor.getStats()
  }, [peakHistory, predictor])

  // Nivel actual
  const currentLevel = classifyPeak(currentPeak)

  // Resetear el sistema
  const handleReset = useCallback(() => {
    predictor.reset()
    setActivePatterns([])
    setBestPrediction(null)
  }, [predictor])

  return (
    <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-purple-500" />
            Detector de Patrones
            <Badge className="bg-purple-500/20 text-purple-400 text-xs border border-purple-500/30">
              NEURAL
            </Badge>
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-zinc-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Estado del Sistema */}
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              Estado del Sistema Neuronal
            </span>
            <div className={`px-2 py-0.5 rounded text-xs font-medium ${
              learningSummary.recentTrend === 'improving' ? 'bg-green-500/20 text-green-400' :
              learningSummary.recentTrend === 'declining' ? 'bg-red-500/20 text-red-400' :
              'bg-zinc-700 text-zinc-300'
            }`}>
              {learningSummary.recentTrend === 'improving' ? '📈 Mejorando' :
               learningSummary.recentTrend === 'declining' ? '📉 Declinando' : '➡️ Estable'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{learningSummary.totalPatterns}</div>
              <div className="text-xs text-zinc-500">Patrones Detectados</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-400">
                {(learningSummary.successRate * 100).toFixed(0)}%
              </div>
              <div className="text-xs text-zinc-500">Tasa de Éxito</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{stats.patternHistory.length}</div>
              <div className="text-xs text-zinc-500">Historial</div>
            </div>
          </div>
        </div>

        {/* Predicción Principal */}
        {bestPrediction ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${LEVEL_STYLES[bestPrediction.predictedLevel].bg} border ${LEVEL_STYLES[bestPrediction.predictedLevel].border} rounded-lg p-4`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className={`w-5 h-5 ${LEVEL_STYLES[bestPrediction.predictedLevel].text}`} />
                <span className="text-white font-bold">Predicción Neural</span>
              </div>
              <Badge className={LEVEL_STYLES[bestPrediction.predictedLevel].badge}>
                {LEVEL_STYLES[bestPrediction.predictedLevel].icon} {bestPrediction.predictedLevel.toUpperCase()}
              </Badge>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">{bestPrediction.rule.name}</span>
                <span className={`font-bold ${LEVEL_STYLES[bestPrediction.predictedLevel].text}`}>
                  {(bestPrediction.confidence * 100).toFixed(0)}%
                </span>
              </div>
              
              <p className="text-zinc-300 text-sm">{bestPrediction.rule.description}</p>

              {/* Barra de confianza */}
              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${bestPrediction.confidence * 100}%` }}
                  className={`h-full ${
                    bestPrediction.predictedLevel === 'low' ? 'bg-teal-500' :
                    bestPrediction.predictedLevel === 'medium' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                />
              </div>

              {/* Info adicional */}
              <div className="flex items-center gap-4 text-xs text-zinc-500 mt-2">
                <span>Ocurrencias: {bestPrediction.rule.occurrences}</span>
                <span>•</span>
                <span>Tasa: {(bestPrediction.rule.successRate * 100).toFixed(0)}%</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="bg-zinc-800/50 rounded-lg p-4 text-center">
            <Info className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 text-sm">Sin patrones detectados actualmente</p>
            <p className="text-zinc-600 text-xs mt-1">El sistema aprenderá con más datos</p>
          </div>
        )}

        {/* Patrones Activos */}
        {activePatterns.length > 1 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <span className="text-zinc-400 text-sm flex items-center gap-2">
                <Target className="w-4 h-4" />
                Otros Patrones Activos ({activePatterns.length - 1})
              </span>
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="space-y-2 overflow-hidden"
                >
                  {activePatterns.slice(1, 5).map((pattern, index) => (
                    <div 
                      key={`pattern-${pattern.rule.id}-${index}`}
                      className={`${LEVEL_STYLES[pattern.predictedLevel].bg} border ${LEVEL_STYLES[pattern.predictedLevel].border} rounded-lg p-3`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white text-sm font-medium">{pattern.rule.name}</span>
                        <span className={`${LEVEL_STYLES[pattern.predictedLevel].text} text-sm font-bold`}>
                          {(pattern.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Reglas del Sistema */}
        <div className="space-y-2">
          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full flex items-center justify-between p-2 bg-zinc-800/50 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <span className="text-zinc-400 text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Reglas de Detección ({rules.length})
            </span>
            {showRules ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          <AnimatePresence>
            {showRules && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="max-h-64 overflow-y-auto space-y-1"
              >
                {rules.map((rule, index) => {
                  const level = rule.prediction
                  return (
                    <div 
                      key={`rule-${rule.id}-${index}`}
                      className={`p-2 rounded-lg ${LEVEL_STYLES[level].bg} border ${LEVEL_STYLES[level].border}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm">{rule.name}</span>
                          <Badge className={`${LEVEL_STYLES[level].badge} text-xs`}>
                            {level.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                          <span>{rule.occurrences}x</span>
                          {rule.occurrences > 0 && (
                            <span className={rule.successRate > 0.5 ? 'text-green-400' : 'text-red-400'}>
                              {(rule.successRate * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-zinc-400 text-xs mt-1">{rule.description}</p>
                    </div>
                  )
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Estadísticas de Transiciones */}
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="text-zinc-400 text-xs mb-2">Estadísticas de Transiciones</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Bajo → Medio:</span>
              <span className="text-amber-400 font-bold">{stats.lowToMedium}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Medio → Alto:</span>
              <span className="text-red-400 font-bold">{stats.mediumToHigh}</span>
            </div>
          </div>
          
          {/* Promedios de secuencias */}
          {stats.consecutiveLows.length > 0 && (
            <div className="mt-2 pt-2 border-t border-zinc-700">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">Sec. Bajas Promedio:</span>
                <span className="text-teal-400 font-bold">
                  {(stats.consecutiveLows.reduce((a, b) => a + b, 0) / stats.consecutiveLows.length).toFixed(1)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Leyenda */}
        <div className="flex items-center justify-center gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-teal-500" />
            <span>Bajo</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-amber-500" />
            <span>Medio</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded bg-red-500" />
            <span>Alto</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
