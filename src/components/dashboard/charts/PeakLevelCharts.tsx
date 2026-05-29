'use client'

import { useState, useMemo, useEffect } from 'react'
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
  Target,
  History
} from 'lucide-react'
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  ReferenceLine, Cell, CartesianGrid 
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PeakRecord } from '@/lib/peak-engine'

interface PeakLevelChartsProps {
  inputNumbers?: number[]
  peakHistory?: PeakRecord[]
  currentPeak?: number
  betTypeLabel?: string
}

const MAX_DISPLAY_PEAKS = 30

// Peak colors - Teal style like the reference
const PEAK_COLORS = [
  'bg-teal-300', 'bg-teal-400', 'bg-teal-400', 'bg-teal-500',
  'bg-amber-400', 'bg-amber-500', 'bg-orange-400', 'bg-orange-500',
  'bg-orange-600', 'bg-red-400', 'bg-red-500', 'bg-red-600',
  'bg-red-700', 'bg-red-800', 'bg-red-900'
]

// Inline peak calculation - no external dependency
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

function getNumColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

function makePrediction(numbers: number[]): { type: string; value: string } {
  if (numbers.length < 3) return { type: 'color', value: 'red' }
  const recent = numbers.slice(-10)
  let red = 0, black = 0
  recent.forEach((num, i) => {
    const weight = (i + 1) / recent.length
    const color = getNumColor(num)
    if (color === 'red') red += weight
    else if (color === 'black') black += weight
  })
  return { type: 'color', value: red > black ? 'black' : 'red' }
}

function matchPrediction(prediction: { type: string; value: string }, number: number): boolean {
  if (prediction.type === 'color') return getNumColor(number) === prediction.value
  return false
}

function computePeaks(numbers: number[]): PeakRecord[] {
  if (numbers.length < 6) return []
  const peaks: PeakRecord[] = []
  let pred: { type: string; value: string } | null = null
  let height = 0

  for (let i = 2; i < numbers.length; i++) {
    pred = makePrediction(numbers.slice(0, i))
    height = 0

    for (let j = i + 1; j < numbers.length; j++) {
      height++
      if (matchPrediction(pred!, numbers[j])) {
        peaks.push({
          id: `peak-${peaks.length}-${j}`,
          height: Math.min(height, 15),
          prediction: pred!,
          resultNumber: numbers[j],
          resultColor: getNumColor(numbers[j]),
          timestamp: new Date()
        })
        i = j
        break
      }
      if (height >= 15 || j === numbers.length - 1) {
        peaks.push({
          id: `peak-${peaks.length}-${j}`,
          height: Math.min(height, 15),
          prediction: pred!,
          resultNumber: numbers[j],
          resultColor: getNumColor(numbers[j]),
          timestamp: new Date()
        })
        i = j
        break
      }
    }
  }
  return peaks
}

function computeCurrentPeak(numbers: number[]): number {
  if (numbers.length < 5) return 0
  const recent = numbers.slice(-Math.min(10, numbers.length - 1))
  const pred = makePrediction(recent)
  let peak = 0
  for (let i = numbers.length - 1; i >= 0; i--) {
    if (matchPrediction(pred, numbers[i])) break
    peak++
  }
  return Math.min(peak, 15)
}

export function PeakLevelCharts({ inputNumbers, peakHistory: peakHistoryFromParent, currentPeak: currentPeakFromParent, betTypeLabel }: PeakLevelChartsProps) {
  const [expandedLevel, setExpandedLevel] = useState<string | null>(null)
  const [calcCount, setCalcCount] = useState(0)

  // Calculate peaks locally as fallback (always computed, but only used if parent doesn't provide)
  const localPeakHistory = useMemo(() => {
    const nums = inputNumbers || []
    const peaks = computePeaks(nums)
    console.log('[PeakLevelCharts] Computed locally', nums.length, 'numbers →', peaks.length, 'peaks')
    return peaks
  }, [inputNumbers])

  // Use peakHistory from parent (DashboardLive) when available, otherwise use local calculation
  const peakHistory = peakHistoryFromParent || localPeakHistory

  // Use the current peak from parent (DashboardLive) for perfect synchronization
  const currentPeak = currentPeakFromParent ?? 0

  // Force recalculation counter for debug
  useEffect(() => {
    setCalcCount(c => c + 1)
  }, [peakHistory, currentPeak])

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
      {/* Historial Completo de Picos — Señales V6.0 */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center justify-between text-lg">
            <span className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-500" />
              Historial de Picos — Señales V6.0
            </span>
            <div className="flex items-center gap-2">
              <div className="bg-zinc-700 text-white px-2 py-1 rounded text-xs font-bold">
                {peakHistory.length} REGISTROS
              </div>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {peakHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
              <History className="w-10 h-10 mb-2" />
              <span className="text-sm">Sin registros de picos aún</span>
            </div>
          ) : (
            <>
              {/* Summary Section */}
              <div className="bg-zinc-800/50 rounded-lg p-4 mb-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold text-white">{peakHistory.length}</span>
                    <div>
                      <div className="text-xs text-zinc-500">Total de Picos</div>
                      <div className="text-sm text-zinc-400">Promedio: <span className="text-white font-bold">{(peakHistory.reduce((sum, p) => sum + p.height, 0) / peakHistory.length).toFixed(1)}</span></div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 bg-teal-500/15 border border-teal-500/30 rounded-full px-3 py-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                    <span className="text-teal-400 text-xs font-semibold">{levelStats.low.count} Bajos</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/30 rounded-full px-3 py-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="text-amber-400 text-xs font-semibold">{levelStats.medium.count} Medios</span>
                  </div>
                  <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/30 rounded-full px-3 py-1">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="text-red-400 text-xs font-semibold">{levelStats.high.count} Altos</span>
                  </div>
                </div>
              </div>

              {/* Scrollable Chart Container */}
              <div 
                className="overflow-x-auto custom-scrollbar-x rounded-lg bg-zinc-800/30 p-2"
              >
                <BarChart 
                  width={Math.max(800, peakHistory.length * 12)}
                  height={310}
                  data={peakHistory.map((p, i) => ({
                    index: i + 1,
                    height: p.height,
                    resultNumber: p.resultNumber,
                    category: p.height <= 3 ? 'Bajo' : p.height <= 6 ? 'Medio' : 'Alto'
                  }))}
                  margin={{ top: 30, right: 20, left: 0, bottom: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" vertical={false} />
                  <XAxis 
                    dataKey="index" 
                    stroke="#71717a" 
                    tick={{ fontSize: 10, fill: '#a1a1aa' }}
                    interval={peakHistory.length > 60 ? Math.floor(peakHistory.length / 20) : 0}
                  />
                  <YAxis 
                    domain={[0, 15]} 
                    stroke="#71717a" 
                    tick={{ fontSize: 11, fill: '#a1a1aa' }}
                    ticks={[1, 3, 6, 9, 12, 15]}
                  />
                  <Tooltip 
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const data = payload[0].payload
                      return (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
                          <div className="text-white font-bold text-sm mb-1">Pico #{data.index}</div>
                          <div className="text-zinc-400 text-xs space-y-0.5">
                            <div>Altura: <span className="text-white font-semibold">{data.height}</span></div>
                            <div>Número resultado: <span className="text-white font-semibold">{data.resultNumber}</span></div>
                            <div>Categoría: <span className={`font-semibold ${
                              data.category === 'Bajo' ? 'text-teal-400' : 
                              data.category === 'Medio' ? 'text-amber-400' : 'text-red-400'
                            }`}>{data.category}</span></div>
                          </div>
                        </div>
                      )
                    }}
                  />
                  <ReferenceLine 
                    y={3} 
                    stroke="#2dd4bf" 
                    strokeDasharray="6 4" 
                    strokeWidth={1.5}
                  />
                  <ReferenceLine 
                    y={6} 
                    stroke="#fbbf24" 
                    strokeDasharray="6 4" 
                    strokeWidth={1.5}
                  />
                  <Bar 
                    dataKey="height" 
                    radius={[2, 2, 0, 0]}
                    maxBarSize={peakHistory.length > 200 ? 4 : peakHistory.length > 100 ? 6 : peakHistory.length > 50 ? 10 : 16}
                    isAnimationActive={false}
                    label={{
                      position: 'top',
                      fill: '#d4d4d8',
                      fontSize: peakHistory.length > 200 ? 7 : peakHistory.length > 100 ? 8 : peakHistory.length > 50 ? 9 : 10,
                      fontWeight: 700,
                      formatter: (value: number) => value
                    }}
                  >
                    {peakHistory.map((p, i) => (
                      <Cell 
                        key={`cell-${i}`} 
                        fill={
                          p.height <= 3 ? '#2dd4bf' : 
                          p.height <= 6 ? '#fbbf24' : 
                          '#f87171'
                        }
                        fillOpacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-6 text-xs text-zinc-400 mt-3">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#2dd4bf' }} />
                  <span>Bajo (1-3)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#fbbf24' }} />
                  <span>Medio (4-6)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#f87171' }} />
                  <span>Alto (7+)</span>
                </div>
              </div>

              {/* Scroll hint for large datasets */}
              {peakHistory.length > 30 && (
                <div className="text-center mt-2 text-zinc-600 text-xs">
                  ← Desplaza horizontalmente para ver todos los {peakHistory.length} picos →
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
