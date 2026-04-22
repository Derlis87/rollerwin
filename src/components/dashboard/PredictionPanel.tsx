'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, TrendingUp, Target, AlertCircle, Loader2, Pause } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { getNumberColor, RED_NUMBERS, BLACK_NUMBERS } from '@/store/app-store'

interface PredictionPanelProps {
  numbers: number[]
  isAnalyzing: boolean
  onAnalyze: () => void
}

interface PredictionResult {
  hotNumbers: { number: number; frequency: number }[]
  coldNumbers: { number: number; frequency: number }[]
  predictedNumbers: number[]
  confidence: number
  analysis: {
    redPercentage: number
    blackPercentage: number
    oddPercentage: number
    evenPercentage: number
    lowPercentage: number
    highPercentage: number
  }
}

export function PredictionPanel({ numbers, isAnalyzing, onAnalyze }: PredictionPanelProps) {
  const [prediction, setPrediction] = useState<PredictionResult | null>(null)
  const [showPrediction, setShowPrediction] = useState(false)

  useEffect(() => {
    if (numbers.length >= 10) {
      analyzeNumbers()
    } else {
      setPrediction(null)
      setShowPrediction(false)
    }
  }, [numbers])

  const analyzeNumbers = () => {
    // Count frequencies
    const frequency: Record<number, number> = {}
    numbers.forEach(num => {
      frequency[num] = (frequency[num] || 0) + 1
    })

    // Sort by frequency
    const sorted = Object.entries(frequency)
      .map(([num, freq]) => ({ number: parseInt(num), frequency: freq }))
      .sort((a, b) => b.frequency - a.frequency)

    // Hot and cold numbers
    const hotNumbers = sorted.slice(0, 5)
    const coldNumbers = sorted.slice(-5).reverse()

    // Calculate percentages
    let redCount = 0, blackCount = 0, oddCount = 0, evenCount = 0, lowCount = 0, highCount = 0
    
    numbers.forEach(num => {
      if (num !== 0) {
        if (RED_NUMBERS.includes(num)) redCount++
        else blackCount++
        if (num % 2 === 1) oddCount++
        else evenCount++
        if (num >= 1 && num <= 18) lowCount++
        else highCount++
      }
    })

    const nonZeroTotal = numbers.filter(n => n !== 0).length

    // Generate predictions based on patterns
    const predictedNumbers: number[] = []
    
    // Add some hot numbers
    hotNumbers.slice(0, 2).forEach(h => predictedNumbers.push(h.number))
    
    // Add some cold numbers (due for appearance)
    coldNumbers.slice(0, 2).forEach(c => {
      if (!predictedNumbers.includes(c.number)) {
        predictedNumbers.push(c.number)
      }
    })

    // Add numbers based on color probability
    const redPercentage = (redCount / nonZeroTotal) * 100
    if (redPercentage > 55) {
      const blackNums = BLACK_NUMBERS.filter(n => !predictedNumbers.includes(n))
      if (blackNums.length > 0) {
        predictedNumbers.push(blackNums[Math.floor(Math.random() * blackNums.length)])
      }
    } else if (redPercentage < 45) {
      const redNums = RED_NUMBERS.filter(n => !predictedNumbers.includes(n))
      if (redNums.length > 0) {
        predictedNumbers.push(redNums[Math.floor(Math.random() * redNums.length)])
      }
    }

    // Ensure we have exactly 5 predictions
    while (predictedNumbers.length < 5) {
      const randomNum = Math.floor(Math.random() * 37)
      if (!predictedNumbers.includes(randomNum)) {
        predictedNumbers.push(randomNum)
      }
    }

    // Calculate confidence based on data patterns
    const confidence = Math.min(95, Math.max(60, 
      70 + (numbers.length / 10) * 2 + (Math.abs(redPercentage - 50) / 2)
    ))

    setPrediction({
      hotNumbers,
      coldNumbers,
      predictedNumbers: predictedNumbers.slice(0, 5),
      confidence,
      analysis: {
        redPercentage: nonZeroTotal > 0 ? redPercentage : 50,
        blackPercentage: nonZeroTotal > 0 ? (blackCount / nonZeroTotal) * 100 : 50,
        oddPercentage: nonZeroTotal > 0 ? (oddCount / nonZeroTotal) * 100 : 50,
        evenPercentage: nonZeroTotal > 0 ? (evenCount / nonZeroTotal) * 100 : 50,
        lowPercentage: nonZeroTotal > 0 ? (lowCount / nonZeroTotal) * 100 : 50,
        highPercentage: nonZeroTotal > 0 ? (highCount / nonZeroTotal) * 100 : 50,
      }
    })
    setShowPrediction(true)
  }

  const getNumberStyle = (num: number) => {
    const color = getNumberColor(num)
    const baseStyle = 'w-10 h-10 rounded-full font-bold text-lg flex items-center justify-center '
    
    if (color === 'red') {
      return baseStyle + 'bg-red-600 text-white shadow-lg shadow-red-600/30'
    } else if (color === 'black') {
      return baseStyle + 'bg-zinc-700 text-white shadow-lg shadow-zinc-700/30'
    } else {
      return baseStyle + 'bg-green-600 text-white shadow-lg shadow-green-600/30'
    }
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-500" />
          Predicciones
          <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono ml-auto">V6.0</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {numbers.length < 10 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 mx-auto text-zinc-600 mb-4" />
            <p className="text-zinc-400 text-sm">
              Ingresa al menos 10 números para generar predicciones
            </p>
            <p className="text-zinc-600 text-xs mt-2">
              Actual: {numbers.length}/10
            </p>
            <Progress value={(numbers.length / 10) * 100} className="mt-4 h-2" />
          </div>
        ) : isAnalyzing ? (
          <div className="text-center py-8">
            <Loader2 className="w-12 h-12 mx-auto text-amber-500 animate-spin mb-4" />
            <p className="text-zinc-400">Analizando patrones...</p>
          </div>
        ) : prediction && (
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Confidence */}
              <div className="text-center">
                <p className="text-zinc-400 text-sm mb-2">Confianza de predicción</p>
                <div className="text-4xl font-bold text-amber-500">
                  {prediction.confidence.toFixed(1)}%
                </div>
              </div>

              {/* Predicted Numbers */}
              <div>
                <p className="text-zinc-400 text-sm mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-500" />
                  Números recomendados
                </p>
                <div className="flex justify-center gap-2">
                  {prediction.predictedNumbers.map((num, index) => (
                    <motion.div
                      key={num}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: index * 0.1 }}
                      className={getNumberStyle(num)}
                    >
                      {num}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Hot Numbers */}
              <div>
                <p className="text-zinc-400 text-sm mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-red-500" />
                  Números calientes
                </p>
                <div className="flex flex-wrap gap-2">
                  {prediction.hotNumbers.map(({ number, frequency }) => (
                    <div key={number} className="flex items-center gap-1">
                      <span className={getNumberStyle(number) + ' w-8 h-8 text-sm'}>
                        {number}
                      </span>
                      <span className="text-xs text-zinc-500">x{frequency}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cold Numbers */}
              <div>
                <p className="text-zinc-400 text-sm mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-500 rotate-180" />
                  Números fríos
                </p>
                <div className="flex flex-wrap gap-2">
                  {prediction.coldNumbers.map(({ number, frequency }) => (
                    <div key={number} className="flex items-center gap-1">
                      <span className={getNumberStyle(number) + ' w-8 h-8 text-sm'}>
                        {number}
                      </span>
                      <span className="text-xs text-zinc-500">x{frequency}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-zinc-800 rounded-lg p-2">
                  <p className="text-zinc-500">Rojo/Negro</p>
                  <p className="text-white font-medium">
                    {prediction.analysis.redPercentage.toFixed(1)}% / {prediction.analysis.blackPercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <p className="text-zinc-500">Par/Impar</p>
                  <p className="text-white font-medium">
                    {prediction.analysis.evenPercentage.toFixed(1)}% / {prediction.analysis.oddPercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <p className="text-zinc-500">Bajo/Alto</p>
                  <p className="text-white font-medium">
                    {prediction.analysis.lowPercentage.toFixed(1)}% / {prediction.analysis.highPercentage.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-zinc-800 rounded-lg p-2">
                  <p className="text-zinc-500">Total analizados</p>
                  <p className="text-white font-medium">{numbers.length}</p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </CardContent>
    </Card>
  )
}
