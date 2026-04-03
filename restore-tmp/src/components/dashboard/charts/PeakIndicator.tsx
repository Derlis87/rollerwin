'use client'

import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Target, AlertTriangle, CheckCircle } from 'lucide-react'

export type BetType = 'color' | 'parity' | 'dozen' | 'column'
export type BetPrediction = {
  type: BetType
  value: string // 'red', 'black', 'odd', 'even', '1-12', etc.
}

export interface PeakData {
  id: string
  prediction: BetPrediction
  peakLevel: number // 1-15
  success: boolean
  timestamp: Date
  resultNumber?: number
  resultColor?: 'red' | 'black' | 'green'
}

interface PeakIndicatorProps {
  peaks: PeakData[]
  currentPeak: number
  currentPrediction: BetPrediction | null
  lastResult: { number: number; color: 'red' | 'black' | 'green' } | null
  onPredictionResult?: (success: boolean, peak: number) => void
}

const MAX_PEAKS = 15

const PEAK_COLORS = [
  'bg-green-500', // 1
  'bg-green-400', // 2
  'bg-lime-500',  // 3
  'bg-lime-400',  // 4
  'bg-yellow-500', // 5
  'bg-yellow-400', // 6
  'bg-orange-500', // 7
  'bg-orange-400', // 8
  'bg-orange-600', // 9
  'bg-red-400',    // 10
  'bg-red-500',    // 11
  'bg-red-600',    // 12
  'bg-red-700',    // 13
  'bg-red-800',    // 14
  'bg-red-900',    // 15
]

export function PeakIndicator({ 
  peaks, 
  currentPeak, 
  currentPrediction, 
  lastResult 
}: PeakIndicatorProps) {
  const [animatedPeak, setAnimatedPeak] = useState(0)

  useEffect(() => {
    if (currentPeak !== animatedPeak) {
      const timer = setTimeout(() => {
        setAnimatedPeak(currentPeak)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [currentPeak])

  const getBetTypeLabel = (type: BetType, value: string) => {
    const labels: Record<string, string> = {
      color: value === 'red' ? 'ROJO' : 'NEGRO',
      parity: value === 'odd' ? 'IMPAR' : 'PAR',
      dozen: value,
      column: `COLUMNA ${value}`
    }
    return labels[type] || value
  }

  const getBetTypeIcon = (type: BetType) => {
    switch (type) {
      case 'color': return '🎨'
      case 'parity': return '🔢'
      case 'dozen': return '📊'
      case 'column': return '📈'
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center gap-2 text-lg">
          <TrendingUp className="w-5 h-5 text-amber-500" />
          Indicador de Picos
          <span className="text-xs text-zinc-500 font-normal ml-auto">
            Volumen de Predicción
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Current Prediction */}
        {currentPrediction && (
          <div className="mb-4 p-3 bg-zinc-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-zinc-400 text-sm">Predicción Actual:</span>
              <span className="text-lg">
                {getBetTypeIcon(currentPrediction.type)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xl font-bold ${
                currentPrediction.type === 'color' 
                  ? currentPrediction.value === 'red' ? 'text-red-500' : 'text-zinc-300'
                  : 'text-amber-500'
              }`}>
                {getBetTypeLabel(currentPrediction.type, currentPrediction.value)}
              </span>
              <Target className="w-4 h-4 text-amber-500" />
            </div>
            
            {/* Last Result */}
            {lastResult && (
              <div className="mt-2 pt-2 border-t border-zinc-700 flex items-center gap-2">
                <span className="text-zinc-500 text-xs">Último resultado:</span>
                <span className={`px-2 py-0.5 rounded text-sm font-bold ${
                  lastResult.color === 'red' ? 'bg-red-600 text-white' :
                  lastResult.color === 'black' ? 'bg-zinc-700 text-white' :
                  'bg-green-600 text-white'
                }`}>
                  {lastResult.number}
                </span>
                {currentPeak > 1 && (
                  <span className="text-red-400 text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Falló
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Peak Bars */}
        <div className="relative h-64 bg-zinc-800/50 rounded-lg p-4 overflow-hidden">
          {/* Grid lines */}
          <div className="absolute inset-4 flex flex-col justify-between pointer-events-none">
            {[...Array(16)].map((_, i) => (
              <div key={i} className="border-t border-zinc-700/50 relative">
                <span className="absolute -left-2 -top-2 text-xs text-zinc-600">
                  {15 - i}
                </span>
              </div>
            ))}
          </div>

          {/* Peak Bars Container */}
          <div className="absolute bottom-4 left-8 right-4 h-[calc(100%-2rem)] flex items-end gap-1">
            <AnimatePresence mode="popLayout">
              {peaks.slice(-15).map((peak, index) => (
                <motion.div
                  key={peak.id}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: `${(peak.peakLevel / MAX_PEAKS) * 100}%`, opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`flex-1 rounded-t-sm relative group cursor-pointer ${
                    peak.success ? PEAK_COLORS[0] : PEAK_COLORS[Math.min(peak.peakLevel - 1, 14)]
                  }`}
                >
                  {/* Peak number */}
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-white">
                    {peak.peakLevel}
                  </div>

                  {/* Success/Fail indicator */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2">
                    {peak.success ? (
                      <CheckCircle className="w-3 h-3 text-white" />
                    ) : (
                      <AlertTriangle className="w-3 h-3 text-white/50" />
                    )}
                  </div>

                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs whitespace-nowrap">
                      <div className="text-white font-medium">
                        {getBetTypeLabel(peak.prediction.type, peak.prediction.value)}
                      </div>
                      <div className="text-zinc-400">
                        Pico: {peak.peakLevel} | {peak.success ? '✓ Acertó' : '✗ Falló'}
                      </div>
                      {peak.resultNumber !== undefined && (
                        <div className={`text-sm font-bold ${
                          peak.resultColor === 'red' ? 'text-red-500' :
                          peak.resultColor === 'black' ? 'text-zinc-300' : 'text-green-500'
                        }`}>
                          Resultado: {peak.resultNumber}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* Current peak (in progress) */}
            {currentPeak > 0 && currentPrediction && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: `${(currentPeak / MAX_PEAKS) * 100}%`, opacity: 1 }}
                className="flex-1 rounded-t-sm border-2 border-dashed border-amber-500/50 bg-amber-500/20 relative"
              >
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-amber-500">
                  {currentPeak}
                </div>
                <div className="absolute top-1 left-1/2 -translate-x-1/2">
                  <Target className="w-3 h-3 text-amber-500 animate-pulse" />
                </div>
              </motion.div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-green-500" />
            <span>Acertó (Pico 1)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-yellow-500" />
            <span>Advertencia (5-6)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm bg-red-600" />
            <span>Peligro (10+)</span>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="bg-zinc-800 rounded-lg p-2">
            <div className="text-2xl font-bold text-white">
              {peaks.filter(p => p.success).length}
            </div>
            <div className="text-xs text-zinc-500">Aciertos</div>
          </div>
          <div className="bg-zinc-800 rounded-lg p-2">
            <div className="text-2xl font-bold text-red-500">
              {peaks.filter(p => !p.success && p.peakLevel >= 5).length}
            </div>
            <div className="text-xs text-zinc-500">Alto Riesgo</div>
          </div>
          <div className="bg-zinc-800 rounded-lg p-2">
            <div className="text-2xl font-bold text-amber-500">
              {peaks.length > 0 
                ? (peaks.filter(p => p.success).length / peaks.length * 100).toFixed(0) 
                : 0}%
            </div>
            <div className="text-xs text-zinc-500">Tasa Éxito</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
