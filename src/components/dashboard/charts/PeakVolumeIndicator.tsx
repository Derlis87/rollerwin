'use client'

import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, BarChart3, Zap, Target } from 'lucide-react'

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

interface PeakVolumeIndicatorProps {
  peakHistory: PeakRecord[]
  currentPeak: number
  maxBars?: number
}

// Colores de gradiente para cada nivel
const LEVEL_GRADIENTS = {
  low: {
    from: '#14b8a6', // teal-500
    to: '#2dd4bf', // teal-400
    glow: 'shadow-teal-500/30'
  },
  medium: {
    from: '#f59e0b', // amber-500
    to: '#fbbf24', // amber-400
    glow: 'shadow-amber-500/30'
  },
  high: {
    from: '#ef4444', // red-500
    to: '#f87171', // red-400
    glow: 'shadow-red-500/30'
  }
}

// Función para obtener el nivel del pico
function getPeakLevel(peak: number): 'low' | 'medium' | 'high' {
  if (peak <= 3) return 'low'
  if (peak <= 6) return 'medium'
  return 'high'
}

// Función para obtener el color del pico
function getPeakColor(peak: number): string {
  const level = getPeakLevel(peak)
  const gradients = LEVEL_GRADIENTS[level]
  return `linear-gradient(to top, ${gradients.from}, ${gradients.to})`
}

export function PeakVolumeIndicator({ 
  peakHistory, 
  currentPeak,
  maxBars = 20 
}: PeakVolumeIndicatorProps) {
  // Calcular estadísticas
  const stats = useMemo(() => {
    const total = peakHistory.length || 1
    const lowPeaks = peakHistory.filter(p => p.height >= 1 && p.height <= 3)
    const mediumPeaks = peakHistory.filter(p => p.height >= 4 && p.height <= 6)
    const highPeaks = peakHistory.filter(p => p.height >= 7)

    // Calcular altura máxima para escalar
    const maxHeight = Math.max(15, ...peakHistory.map(p => p.height), currentPeak)

    // Calcular promedio de altura
    const avgHeight = peakHistory.length > 0
      ? peakHistory.reduce((sum, p) => sum + p.height, 0) / peakHistory.length
      : 0

    return {
      total,
      lowCount: lowPeaks.length,
      mediumCount: mediumPeaks.length,
      highCount: highPeaks.length,
      maxHeight,
      avgHeight: avgHeight.toFixed(1),
      lowPercent: ((lowPeaks.length / total) * 100).toFixed(0),
      mediumPercent: ((mediumPeaks.length / total) * 100).toFixed(0),
      highPercent: ((highPeaks.length / total) * 100).toFixed(0)
    }
  }, [peakHistory, currentPeak])

  // Barras visibles (historial + actual)
  const visibleBars = useMemo(() => {
    const historyBars = peakHistory.slice(-maxBars)
    return historyBars
  }, [peakHistory, maxBars])

  // Nivel actual
  const currentLevel = getPeakLevel(currentPeak)

  return (
    <Card className="bg-zinc-900 border-zinc-800 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-white flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg">
            <BarChart3 className="w-5 h-5 text-amber-500" />
            Indicador de Volumen
          </span>
          <div className="flex items-center gap-2">
            <Badge className={`${
              currentLevel === 'low' ? 'bg-teal-500' :
              currentLevel === 'medium' ? 'bg-amber-500' :
              'bg-red-500 animate-pulse'
            } text-black font-bold`}>
              ACTUAL: {currentPeak}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Contenedor del gráfico de columnas */}
        <div className="relative bg-zinc-800/50 rounded-xl p-4 overflow-hidden">
          {/* Líneas de grid horizontales */}
          <div className="absolute left-8 right-4 top-4 bottom-8 pointer-events-none">
            {[15, 12, 9, 6, 3, 1].map((val) => (
              <div 
                key={val} 
                className="absolute w-full border-t border-zinc-700/30 flex items-center" 
                style={{ bottom: `${((val - 1) / 14) * 100}%` }}
              >
                <span className="absolute -left-7 -top-2 text-[10px] text-zinc-500 w-5 text-right">{val}</span>
              </div>
            ))}
          </div>

          {/* Zona de peligro (rojo) */}
          <div 
            className="absolute left-8 right-4 bg-red-500/5 border-t border-red-500/20"
            style={{ top: '4px', height: `${((15 - 7) / 14) * 100}%` }}
          >
            <span className="absolute right-2 top-1 text-[9px] text-red-400/50 font-medium">
              ZONA ALTA
            </span>
          </div>

          {/* Zona de precaución (amarillo) */}
          <div 
            className="absolute left-8 right-4 bg-amber-500/5 border-t border-amber-500/20"
            style={{ top: `${4 + ((15 - 7) / 14) * 100}%`, height: `${((7 - 4) / 14) * 100}%` }}
          >
            <span className="absolute right-2 top-1 text-[9px] text-amber-400/50 font-medium">
              ZONA MEDIA
            </span>
          </div>

          {/* Contenedor de barras */}
          <div className="relative h-56 ml-8 mr-4">
            <div className="absolute inset-0 flex items-end gap-1">
              <AnimatePresence mode="popLayout">
                {visibleBars.map((peak, index) => {
                  const level = getPeakLevel(peak.height)
                  const gradient = LEVEL_GRADIENTS[level]
                  const heightPercent = ((peak.height - 1) / 14) * 100
                  
                  return (
                    <motion.div
                      key={peak.id}
                      initial={{ height: 0, opacity: 0, scaleY: 0 }}
                      animate={{ 
                        height: `${heightPercent}%`, 
                        opacity: 1,
                        scaleY: 1
                      }}
                      exit={{ height: 0, opacity: 0, scaleY: 0 }}
                      transition={{ 
                        type: 'spring',
                        stiffness: 300,
                        damping: 20,
                        delay: index * 0.02
                      }}
                      className="flex-1 min-w-[10px] max-w-[30px] relative group cursor-pointer rounded-t-sm"
                      style={{ 
                        background: `linear-gradient(to top, ${gradient.from}, ${gradient.to})`,
                        boxShadow: `0 0 20px ${gradient.glow.replace('shadow-', '').replace('/30', '')}40`
                      }}
                    >
                      {/* Número del pico grabado */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-bold text-xs drop-shadow-lg">
                          {peak.height}
                        </span>
                      </div>

                      {/* Indicador de resultado */}
                      <div className="absolute -top-5 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                        <div className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs whitespace-nowrap shadow-lg">
                          <div className="flex items-center gap-1">
                            <span className="text-zinc-400">→</span>
                            <span className={`font-bold ${
                              peak.resultColor === 'red' ? 'text-red-400' :
                              peak.resultColor === 'black' ? 'text-zinc-300' : 'text-green-400'
                            }`}>
                              #{peak.resultNumber}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Efecto de brillo en la parte superior */}
                      <div className="absolute top-0 left-0 right-0 h-2 bg-white/20 rounded-t-sm" />
                    </motion.div>
                  )
                })}

                {/* Barra actual (en progreso) */}
                {currentPeak > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ 
                      height: `${((currentPeak - 1) / 14) * 100}%`, 
                      opacity: 1 
                    }}
                    className="flex-1 min-w-[10px] max-w-[30px] relative rounded-t-sm"
                    style={{
                      background: `linear-gradient(to top, ${LEVEL_GRADIENTS[currentLevel].from}80, ${LEVEL_GRADIENTS[currentLevel].to}80)`,
                      border: `2px dashed ${LEVEL_GRADIENTS[currentLevel].from}`,
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`font-bold text-sm ${
                        currentLevel === 'low' ? 'text-teal-300' :
                        currentLevel === 'medium' ? 'text-amber-300' :
                        'text-red-300 animate-pulse'
                      }`}>
                        {currentPeak}
                      </span>
                    </div>
                    
                    {/* Indicador de predicción pendiente */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2">
                      <Target className={`w-4 h-4 ${
                        currentLevel === 'low' ? 'text-teal-400' :
                        currentLevel === 'medium' ? 'text-amber-400' :
                        'text-red-400 animate-pulse'
                      }`} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Leyenda del eje X */}
          <div className="flex justify-between mt-2 ml-8 mr-4 text-[10px] text-zinc-500">
            <span>← Historial de Picos</span>
            <span>Actual →</span>
          </div>
        </div>

        {/* Panel de estadísticas */}
        <div className="grid grid-cols-3 gap-3">
          {/* Picos Bajos */}
          <div className="bg-gradient-to-br from-teal-500/10 to-teal-500/5 border border-teal-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-teal-500 to-teal-400" />
              <span className="text-teal-400 text-xs font-medium">BAJOS (1-3)</span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.lowCount}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-zinc-500 text-xs">{stats.lowPercent}%</span>
              <Zap className="w-3 h-3 text-teal-400" />
            </div>
          </div>

          {/* Picos Medios */}
          <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-amber-500 to-amber-400" />
              <span className="text-amber-400 text-xs font-medium">MEDIOS (4-6)</span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.mediumCount}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-zinc-500 text-xs">{stats.mediumPercent}%</span>
              <TrendingUp className="w-3 h-3 text-amber-400" />
            </div>
          </div>

          {/* Picos Altos */}
          <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-sm bg-gradient-to-t from-red-500 to-red-400" />
              <span className="text-red-400 text-xs font-medium">ALTOS (7+)</span>
            </div>
            <div className="text-3xl font-bold text-white">{stats.highCount}</div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-zinc-500 text-xs">{stats.highPercent}%</span>
              <div className="w-3 h-3 rounded-full bg-red-500/50 animate-pulse" />
            </div>
          </div>
        </div>

        {/* Barra de progreso del nivel actual */}
        <div className="bg-zinc-800 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-sm">Distribución de Niveles</span>
            <span className="text-white text-sm font-bold">Total: {stats.total}</span>
          </div>
          
          <div className="h-4 rounded-full overflow-hidden flex bg-zinc-700">
            <motion.div 
              className="bg-gradient-to-r from-teal-500 to-teal-400"
              initial={{ width: 0 }}
              animate={{ width: `${stats.lowPercent}%` }}
              transition={{ duration: 0.5 }}
            />
            <motion.div 
              className="bg-gradient-to-r from-amber-500 to-amber-400"
              initial={{ width: 0 }}
              animate={{ width: `${stats.mediumPercent}%` }}
              transition={{ duration: 0.5 }}
            />
            <motion.div 
              className="bg-gradient-to-r from-red-500 to-red-400"
              initial={{ width: 0 }}
              animate={{ width: `${stats.highPercent}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          
          <div className="flex justify-between mt-2 text-[10px] text-zinc-500">
            <span>Promedio: {stats.avgHeight}</span>
            <span>Max: {stats.maxHeight}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
