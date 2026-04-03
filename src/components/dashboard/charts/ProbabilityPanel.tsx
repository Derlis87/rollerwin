'use client'

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Calculator, 
  AlertTriangle, 
  Info,
  ChevronDown,
  ChevronUp,
  Target,
  TrendingDown,
  TrendingUp,
  Minus
} from 'lucide-react'
import { 
  getProbabilityEngine,
  THEORETICAL_PROB
} from '@/lib/probability-engine'

interface ProbabilityPanelProps {
  numbers: number[]
  betType: 'color' | 'parity' | 'dozen' | 'column'
  currentPeak: number
}

export function ProbabilityPanel({ numbers, betType, currentPeak }: ProbabilityPanelProps) {
  const [showMore, setShowMore] = useState(false)
  
  // Obtener motor de probabilidad
  const engine = useMemo(() => getProbabilityEngine(numbers), [numbers])
  
  // Obtener predicción matemática
  const mathPrediction = useMemo(() => 
    engine.getMathematicalPrediction(betType), 
    [engine, betType]
  )
  
  // Calcular probabilidad del pico actual
  const peakProb = useMemo(() => 
    engine.calculatePeakProbability(currentPeak, betType),
    [engine, currentPeak, betType]
  )
  
  // Conteos simples
  const counts = useMemo(() => {
    let red = 0, black = 0, green = 0
    let odd = 0, even = 0
    let d1 = 0, d2 = 0, d3 = 0
    let c1 = 0, c2 = 0, c3 = 0
    
    for (const num of numbers) {
      const redNums = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]
      if (num === 0) green++
      else if (redNums.includes(num)) red++
      else black++
      
      if (num !== 0) {
        if (num % 2 === 0) even++
        else odd++
        
        if (num <= 12) d1++
        else if (num <= 24) d2++
        else d3++
        
        if (num % 3 === 1) c1++
        else if (num % 3 === 2) c2++
        else c3++
      }
    }
    
    return { red, black, green, odd, even, d1, d2, d3, c1, c2, c3 }
  }, [numbers])
  
  // Estadísticas según tipo de apuesta
  const betStats = useMemo(() => {
    if (betType === 'color') {
      return [
        { label: '🔴 Rojo', count: counts.red, expected: numbers.length * 0.486 },
        { label: '⚫ Negro', count: counts.black, expected: numbers.length * 0.486 }
      ]
    } else if (betType === 'parity') {
      return [
        { label: 'Impar', count: counts.odd, expected: numbers.filter(n => n !== 0).length * 0.486 },
        { label: 'Par', count: counts.even, expected: numbers.filter(n => n !== 0).length * 0.486 }
      ]
    } else if (betType === 'dozen') {
      const nonZero = numbers.filter(n => n !== 0).length
      return [
        { label: '1-12', count: counts.d1, expected: nonZero * 0.324 },
        { label: '13-24', count: counts.d2, expected: nonZero * 0.324 },
        { label: '25-36', count: counts.d3, expected: nonZero * 0.324 }
      ]
    } else {
      const nonZero = numbers.filter(n => n !== 0).length
      return [
        { label: 'Columna 1', count: counts.c1, expected: nonZero * 0.324 },
        { label: 'Columna 2', count: counts.c2, expected: nonZero * 0.324 },
        { label: 'Columna 3', count: counts.c3, expected: nonZero * 0.324 }
      ]
    }
  }, [betType, numbers, counts])
  
  // Probabilidad teórica según tipo
  const theoreticalProb = betType === 'color' || betType === 'parity' ? 48.6 : 32.4
  
  // Nivel de pico simplificado
  const getPeakStatus = () => {
    if (currentPeak <= 2) return { level: '✅ SEGURO', color: 'text-green-400', desc: 'Todo normal' }
    if (currentPeak <= 4) return { level: '⚡ PRECAUCIÓN', color: 'text-amber-400', desc: 'Racha de fallos moderada' }
    if (currentPeak <= 7) return { level: '⚠️ PELIGRO', color: 'text-orange-400', desc: 'Racha inusual pero posible' }
    return { level: '🔴 CRÍTICO', color: 'text-red-400', desc: 'Racha muy rara (puede ocurrir)' }
  }
  
  const peakStatus = getPeakStatus()
  
  // Determinar qué opción tiene menos
  const getColdestOption = () => {
    const sorted = [...betStats].sort((a, b) => a.count - b.count)
    return sorted[0]
  }
  
  const coldest = getColdestOption()
  
  // Si hay pocos datos
  if (numbers.length < 10) {
    return (
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-lg">
            <Calculator className="w-5 h-5 text-purple-500" />
            Probabilidades
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
            <p className="text-blue-300 text-sm mb-2">
              Ingresa <strong>al menos 10 números</strong> para ver el análisis
            </p>
            <div className="flex items-center justify-center gap-2 text-zinc-400 text-xs">
              <span>Actual: {numbers.length}/10</span>
              <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-purple-500 transition-all" 
                  style={{ width: `${(numbers.length / 10) * 100}%` }}
                />
              </div>
            </div>
          </div>
          
          {/* Info básica de probabilidad */}
          <div className="mt-4 p-3 bg-zinc-800/50 rounded-lg">
            <p className="text-zinc-400 text-xs text-center">
              💡 La probabilidad de ganar en {betType === 'color' ? 'colores' : betType === 'parity' ? 'par/impar' : 'docenas/columnas'} 
              es siempre <strong className="text-white">{theoreticalProb}%</strong>
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center justify-between text-lg">
          <span className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-purple-500" />
            Probabilidades
          </span>
          <span className="text-sm font-normal text-zinc-500">{numbers.length} números</span>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Predicción simple */}
        <div className="bg-zinc-800/50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-zinc-400 text-sm">Sugerencia basada en datos:</span>
            <span className={`text-xs px-2 py-0.5 rounded ${
              mathPrediction.confidence >= 50 ? 'bg-green-500/20 text-green-400' :
              mathPrediction.confidence >= 20 ? 'bg-amber-500/20 text-amber-400' :
              'bg-zinc-600/50 text-zinc-400'
            }`}>
              Confianza: {mathPrediction.confidence}%
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold text-white">{mathPrediction.prediction}</span>
            <span className="text-lg text-purple-400">{theoreticalProb}% prob.</span>
          </div>
          
          <p className="text-xs text-zinc-500 mt-2">
            {coldest.label} apareció {coldest.count} veces (esperado: ~{coldest.expected.toFixed(0)})
          </p>
        </div>

        {/* Estado del pico */}
        <div className={`p-4 rounded-lg border ${
          currentPeak <= 2 ? 'border-green-500/30 bg-green-500/5' :
          currentPeak <= 4 ? 'border-amber-500/30 bg-amber-500/5' :
          currentPeak <= 7 ? 'border-orange-500/30 bg-orange-500/5' :
          'border-red-500/30 bg-red-500/5'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <span className="text-zinc-400 text-sm">Tu pico actual:</span>
              <span className={`text-3xl font-bold ml-2 ${peakStatus.color}`}>{currentPeak}</span>
            </div>
            <div className="text-right">
              <div className={`font-bold ${peakStatus.color}`}>{peakStatus.level}</div>
              <div className="text-xs text-zinc-500">{peakStatus.desc}</div>
            </div>
          </div>
          
          <div className="mt-3 grid grid-cols-2 gap-3 text-center text-xs">
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="text-white font-bold">{theoreticalProb}%</div>
              <div className="text-zinc-500">Prob. de acertar</div>
            </div>
            <div className="bg-zinc-800/50 rounded p-2">
              <div className="text-white font-bold">~{peakProb.expectedPeak}</div>
              <div className="text-zinc-500">Pico normal</div>
            </div>
          </div>
        </div>

        {/* Comparación visual */}
        <div className="space-y-2">
          {betStats.map((stat, idx) => {
            const diff = stat.count - stat.expected
            const isColdest = stat.label === coldest.label
            
            return (
              <div 
                key={idx}
                className={`p-2 rounded-lg ${isColdest ? 'bg-purple-500/10 border border-purple-500/30' : 'bg-zinc-800/30'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white">
                    {stat.label}
                    {isColdest && <span className="ml-2 text-purple-400 text-xs">← menos frecuente</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{stat.count}</span>
                    <span className="text-xs text-zinc-500">de ~{stat.expected.toFixed(0)}</span>
                    {diff < -2 && <TrendingDown className="w-4 h-4 text-teal-400" />}
                    {diff > 2 && <TrendingUp className="w-4 h-4 text-amber-400" />}
                    {Math.abs(diff) <= 2 && <Minus className="w-4 h-4 text-zinc-500" />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Ver más info */}
        <button
          onClick={() => setShowMore(!showMore)}
          className="w-full flex items-center justify-center gap-1 text-zinc-400 text-xs hover:text-zinc-300"
        >
          {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          {showMore ? 'Menos info' : 'Más info'}
        </button>

        <AnimatePresence>
          {showMore && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {/* Explicación simple */}
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  <strong className="text-white">¿Qué significa esto?</strong><br/>
                  • La sugerencia se basa en qué opción ha salido <strong>menos veces</strong>.<br/>
                  • Esto NO garantiza que vaya a salir.<br/>
                  • La ruleta es aleatoria: cada tirada es independiente.<br/>
                  • Un pico alto es mala suerte, no indica que "va a salir".
                </p>
              </div>
              
              {/* Probabilidades reales */}
              <div className="bg-zinc-800/50 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-2"><strong className="text-white">Probabilidades reales:</strong></p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Color:</span>
                    <span className="text-white">48.6%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Docena:</span>
                    <span className="text-white">32.4%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Columna:</span>
                    <span className="text-white">32.4%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Cero:</span>
                    <span className="text-white">2.7%</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recordatorio final */}
        <div className="text-center text-xs text-zinc-600 pt-2 border-t border-zinc-800">
          🎰 La ruleta es aleatoria. Los resultados pasados NO afectan los futuros.
        </div>
      </CardContent>
    </Card>
  )
}
