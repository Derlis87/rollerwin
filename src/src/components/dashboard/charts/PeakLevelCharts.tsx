'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Minus, 
  ChevronDown, 
  ChevronUp,
  BarChart3,
  Flame,
  Snowflake,
  Target
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface PeakRecord {
  id: string
  height: number
  prediction: {
    type: string
    value: string
  }
  resultNumber: number
  resultColor: 'red' | 'black' | 'green'
  timestamp: Date
}

interface PeakLevelChartsProps {
  peakHistory: PeakRecord[]
  currentPeak: number
}

const MAX_PEAKS = 15

// Peak colors - Teal style like the reference
const PEAK_COLORS = [
  'bg-teal-300', 'bg-teal-400', 'bg-teal-400', 'bg-teal-500',
  'bg-amber-400', 'bg-amber-500', 'bg-orange-400', 'bg-orange-500',
  'bg-orange-600', 'bg-red-400', 'bg-red-500', 'bg-red-600',
  'bg-red-700', 'bg-red-800', 'bg-red-900'
]

export function PeakLevelCharts({ peakHistory, currentPeak }: PeakLevelChartsProps) {
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null)

  // Calculate statistics for each level
  const levelStats = useMemo(() => {
    const total = peakHistory.length || 1

    const lowPeaks = peakHistory.filter(p => p.height >= 1 && p.height <= 3)
    const mediumPeaks = peakHistory.filter(p => p.height >= 4 && p.height <= 6)
    const highPeaks = peakHistory.filter(p => p.height >= 7)

    // Find most frequent heights in each level
    const getMostFrequent = (peaks: PeakRecord[]) => {
      const freq: Record<number, number> = {}
      peaks.forEach(p => { freq[p.height] = (freq[p.height] || 0) + 1 })
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([height]) => parseInt(height))
    }

    return {
      low: {
        count: lowPeaks.length,
        percentage: (lowPeaks.length / total) * 100,
        avgHeight: lowPeaks.length > 0 ? lowPeaks.reduce((sum, p) => sum + p.height, 0) / lowPeaks.length : 0,
        maxHeight: lowPeaks.length > 0 ? Math.max(...lowPeaks.map(p => p.height)) : 0,
        peaks: lowPeaks,
        heights: lowPeaks.map(p => p.height),
        mostFrequent: getMostFrequent(lowPeaks),
        color: 'teal',
        textColor: 'text-teal-400',
        bgColor: 'bg-teal-500/10',
        borderColor: 'border-teal-500/30',
        barColor: 'bg-teal-400'
      },
      medium: {
        count: mediumPeaks.length,
        percentage: (mediumPeaks.length / total) * 100,
        avgHeight: mediumPeaks.length > 0 ? mediumPeaks.reduce((sum, p) => sum + p.height, 0) / mediumPeaks.length : 0,
        maxHeight: mediumPeaks.length > 0 ? Math.max(...mediumPeaks.map(p => p.height)) : 0,
        peaks: mediumPeaks,
        heights: mediumPeaks.map(p => p.height),
        mostFrequent: getMostFrequent(mediumPeaks),
        color: 'amber',
        textColor: 'text-amber-400',
        bgColor: 'bg-amber-500/10',
        borderColor: 'border-amber-500/30',
        barColor: 'bg-amber-400'
      },
      high: {
        count: highPeaks.length,
        percentage: (highPeaks.length / total) * 100,
        avgHeight: highPeaks.length > 0 ? highPeaks.reduce((sum, p) => sum + p.height, 0) / highPeaks.length : 0,
        maxHeight: highPeaks.length > 0 ? Math.max(...highPeaks.map(p => p.height)) : 0,
        peaks: highPeaks,
        heights: highPeaks.map(p => p.height),
        mostFrequent: getMostFrequent(highPeaks),
        color: 'red',
        textColor: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        barColor: 'bg-red-400'
      }
    }
  }, [peakHistory])

  // Get bar color based on height
  const getBarColor = (height: number): string => {
    if (height <= 3) return 'bg-teal-400'
    if (height <= 6) return 'bg-amber-400'
    return 'bg-red-400'
  }

  // Get current level
  const getCurrentLevel = (): 'low' | 'medium' | 'high' => {
    if (currentPeak <= 3) return 'low'
    if (currentPeak <= 6) return 'medium'
    return 'high'
  }

  const currentLevel = getCurrentLevel()

  return (
    <div className="space-y-4">
      {/* Main Peak History Chart - Reference Style */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-500" />
              Indicador de Picos
            </span>
            {/* Status Labels - Yellow Style */}
            <div className="flex items-center gap-2">
              <div className="bg-amber-500 text-black px-2 py-1 rounded text-xs font-bold">
                ACTUAL: {currentPeak}
              </div>
              <div className={`px-2 py-1 rounded text-xs font-bold ${
                currentLevel === 'low' ? 'bg-teal-500 text-black' :
                currentLevel === 'medium' ? 'bg-amber-500 text-black' :
                'bg-red-500 text-white animate-pulse'
              }`}>
                {currentLevel === 'low' ? 'BAJO' : currentLevel === 'medium' ? 'MEDIO' : 'ALTO'}
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Peak Volume Chart - Teal Style */}
          <div className="relative h-44 bg-zinc-800/30 rounded-lg p-4 overflow-hidden mb-4">
            {/* Y-Axis Labels */}
            <div className="absolute left-0 top-4 bottom-4 w-6 flex flex-col justify-between text-xs text-zinc-500">
              {[15, 12, 9, 6, 3, 1].map((val) => (
                <span key={val} className="text-right">{val}</span>
              ))}
            </div>

            {/* Grid Lines */}
            <div className="absolute left-8 right-4 top-4 bottom-4">
              {[15, 12, 9, 6, 3, 1].map((val) => (
                <div key={val} className="absolute w-full border-t border-zinc-700/30" style={{ bottom: `${((val - 1) / 14) * 100}%` }} />
              ))}
            </div>

            {/* Bars Container */}
            <div className="absolute left-10 right-4 bottom-4 top-4 flex items-end gap-1">
              <AnimatePresence mode="popLayout">
                {peakHistory.slice(-18).map((peak, index) => (
                  <motion.div
                    key={peak.id}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: `${((peak.height - 1) / 14) * 100}%`, opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.02 }}
                    className={`flex-1 rounded-t ${getBarColor(peak.height)} relative group cursor-pointer min-w-[12px]`}
                  >
                    {/* Número grabado en la barra */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-white font-bold text-xs drop-shadow-lg">
                        {peak.height}
                      </span>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-zinc-900 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-zinc-700 shadow-lg">
                      Pico {peak.height} → #{peak.resultNumber}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Current peak indicator */}
              {currentPeak > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: `${((currentPeak - 1) / 14) * 100}%`, opacity: 1 }}
                  className={`flex-1 rounded-t border-2 border-dashed min-w-[12px] ${
                    currentPeak <= 3 ? 'border-teal-400 bg-teal-400/20' :
                    currentPeak <= 6 ? 'border-amber-400 bg-amber-400/20' :
                    'border-red-400 bg-red-400/20 animate-pulse'
                  } relative`}
                >
                  <div className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${
                    currentPeak <= 3 ? 'text-teal-400' :
                    currentPeak <= 6 ? 'text-amber-400' :
                    'text-red-400'
                  }`}>
                    {currentPeak}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 text-xs text-zinc-400 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-teal-400" />
              <span>Bajo (1-3)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-amber-400" />
              <span>Medio (4-6)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-3 rounded-sm bg-red-400" />
              <span>Alto (7+)</span>
            </div>
          </div>

          {/* Stats Summary - Reference Style */}
          <div className="bg-zinc-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-4xl font-bold text-white">{peakHistory.length}</span>
              <span className="text-xs text-zinc-500">TOTAL ACIERTOS</span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-sm">
              {/* Calientes */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Flame className="w-3 h-3 text-teal-400" />
                  <span className="text-zinc-400 text-xs">{levelStats.low.count} - BAJOS</span>
                </div>
                <div className="text-teal-400 font-bold underline decoration-teal-400/50">
                  {levelStats.low.mostFrequent.slice(0, 4).join(', ') || '-'}
                </div>
              </div>
              
              {/* Fríos */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <Minus className="w-3 h-3 text-amber-400" />
                  <span className="text-zinc-400 text-xs">{levelStats.medium.count} - MEDIOS</span>
                </div>
                <div className="text-amber-400 font-bold underline decoration-amber-400/50">
                  {levelStats.medium.mostFrequent.slice(0, 4).join(', ') || '-'}
                </div>
              </div>
              
              {/* Más Probable */}
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3 h-3 text-red-400" />
                  <span className="text-zinc-400 text-xs">{levelStats.high.count} - ALTOS</span>
                </div>
                <div className="text-red-400 font-bold underline decoration-red-400/50">
                  {levelStats.high.mostFrequent.slice(0, 4).join(', ') || '-'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expandable Section for Detailed Level Charts - INDEPENDENT BELOW */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            Gráficos por Nivel de Pico
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          
          {/* LOW PEAKS - Desplegable */}
          <div className={`${levelStats.low.bgColor} border ${levelStats.low.borderColor} rounded-lg overflow-hidden`}>
            <button
              onClick={() => setExpandedLevel(expandedLevel === 'low' ? null : 'low')}
              className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="bg-teal-500 text-black px-2 py-0.5 rounded text-xs font-bold">
                  1-3
                </div>
                <span className={`font-bold ${levelStats.low.textColor}`}>Picos Bajos</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white">{levelStats.low.count}</span>
                {expandedLevel === 'low' ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </div>
            </button>
            
            <AnimatePresence>
              {expandedLevel === 'low' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 pt-0 space-y-3">
                    {/* Histogram - Reference Style */}
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-400 mb-2">Distribución de frecuencias</div>
                      <div className="relative h-20">
                        {/* Y-axis */}
                        <div className="absolute left-0 top-0 bottom-0 w-5 flex flex-col justify-between text-[10px] text-zinc-500">
                          <span>8</span>
                          <span>4</span>
                          <span>1</span>
                        </div>
                        {/* Bars */}
                        <div className="absolute left-6 right-0 bottom-0 top-0 flex items-end gap-1">
                          {[1, 2, 3].map((height) => {
                            const count = levelStats.low.heights.filter(h => h === height).length
                            const maxCount = Math.max(1, ...[1, 2, 3].map(h => levelStats.low.heights.filter(x => x === h).length))
                            return (
                              <div key={height} className="flex-1 flex flex-col items-center">
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${(count / maxCount) * 100}%` }}
                                  className="w-full bg-teal-400 rounded-t relative"
                                >
                                  {count > 0 && (
                                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                                      {count}
                                    </span>
                                  )}
                                </motion.div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      {/* X-axis labels */}
                      <div className="flex justify-around mt-1 ml-6 text-[10px] text-zinc-500">
                        <span>1</span>
                        <span>2</span>
                        <span>3</span>
                      </div>
                    </div>
                    
                    {/* Quick Stats */}
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-zinc-500">Promedio: </span>
                        <span className={`font-bold ${levelStats.low.textColor}`}>{levelStats.low.avgHeight.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Porcentaje: </span>
                        <span className={`font-bold ${levelStats.low.textColor}`}>{levelStats.low.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* MEDIUM PEAKS - Desplegable */}
          <div className={`${levelStats.medium.bgColor} border ${levelStats.medium.borderColor} rounded-lg overflow-hidden`}>
            <button
              onClick={() => setExpandedLevel(expandedLevel === 'medium' ? null : 'medium')}
              className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="bg-amber-500 text-black px-2 py-0.5 rounded text-xs font-bold">
                  4-6
                </div>
                <span className={`font-bold ${levelStats.medium.textColor}`}>Picos Medios</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white">{levelStats.medium.count}</span>
                {expandedLevel === 'medium' ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </div>
            </button>
            
            <AnimatePresence>
              {expandedLevel === 'medium' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 pt-0 space-y-3">
                    {/* Histogram */}
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-400 mb-2">Distribución de frecuencias</div>
                      <div className="relative h-20">
                        <div className="absolute left-0 top-0 bottom-0 w-5 flex flex-col justify-between text-[10px] text-zinc-500">
                          <span>8</span>
                          <span>4</span>
                          <span>1</span>
                        </div>
                        <div className="absolute left-6 right-0 bottom-0 top-0 flex items-end gap-1">
                          {[4, 5, 6].map((height) => {
                            const count = levelStats.medium.heights.filter(h => h === height).length
                            const maxCount = Math.max(1, ...[4, 5, 6].map(h => levelStats.medium.heights.filter(x => x === h).length))
                            return (
                              <div key={height} className="flex-1 flex flex-col items-center">
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${(count / maxCount) * 100}%` }}
                                  className="w-full bg-amber-400 rounded-t relative"
                                >
                                  {count > 0 && (
                                    <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">
                                      {count}
                                    </span>
                                  )}
                                </motion.div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex justify-around mt-1 ml-6 text-[10px] text-zinc-500">
                        <span>4</span>
                        <span>5</span>
                        <span>6</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-zinc-500">Promedio: </span>
                        <span className={`font-bold ${levelStats.medium.textColor}`}>{levelStats.medium.avgHeight.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Porcentaje: </span>
                        <span className={`font-bold ${levelStats.medium.textColor}`}>{levelStats.medium.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* HIGH PEAKS - Desplegable */}
          <div className={`${levelStats.high.bgColor} border ${levelStats.high.borderColor} rounded-lg overflow-hidden`}>
            <button
              onClick={() => setExpandedLevel(expandedLevel === 'high' ? null : 'high')}
              className="w-full p-3 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="bg-red-500 text-white px-2 py-0.5 rounded text-xs font-bold">
                  7+
                </div>
                <span className={`font-bold ${levelStats.high.textColor}`}>Picos Altos</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-bold text-white">{levelStats.high.count}</span>
                {expandedLevel === 'high' ? (
                  <ChevronUp className="w-4 h-4 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                )}
              </div>
            </button>
            
            <AnimatePresence>
              {expandedLevel === 'high' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 pt-0 space-y-3">
                    {/* Histogram for high peaks */}
                    <div className="bg-zinc-800/50 rounded-lg p-3">
                      <div className="text-xs text-zinc-400 mb-2">Distribución de frecuencias</div>
                      <div className="relative h-20">
                        <div className="absolute left-0 top-0 bottom-0 w-5 flex flex-col justify-between text-[10px] text-zinc-500">
                          <span>8</span>
                          <span>4</span>
                          <span>1</span>
                        </div>
                        <div className="absolute left-6 right-0 bottom-0 top-0 flex items-end gap-0.5">
                          {[7, 8, 9, 10, 11, 12, 13, 14, 15].map((height) => {
                            const count = levelStats.high.heights.filter(h => h === height).length
                            const maxCount = Math.max(1, ...[7, 8, 9, 10, 11, 12, 13, 14, 15].map(h => levelStats.high.heights.filter(x => x === h).length))
                            return (
                              <div key={height} className="flex-1 flex flex-col items-center min-w-[8px]">
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: `${(count / maxCount) * 100}%` }}
                                  className="w-full bg-red-400 rounded-t relative"
                                >
                                  {count > 0 && (
                                    <span className="absolute inset-0 flex items-center justify-center text-white text-[10px] font-bold">
                                      {count}
                                    </span>
                                  )}
                                </motion.div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex justify-between mt-1 ml-6 text-[10px] text-zinc-500">
                        <span>7</span>
                        <span>11</span>
                        <span>15</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-zinc-500">Promedio: </span>
                        <span className={`font-bold ${levelStats.high.textColor}`}>{levelStats.high.avgHeight.toFixed(1)}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500">Porcentaje: </span>
                        <span className={`font-bold ${levelStats.high.textColor}`}>{levelStats.high.percentage.toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}
