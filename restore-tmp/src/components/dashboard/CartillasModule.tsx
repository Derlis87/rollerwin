'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  BookOpen, 
  ChevronRight, 
  CheckCircle, 
  Circle,
  Lightbulb,
  Target,
  TrendingUp,
  Calculator,
  AlertTriangle
} from 'lucide-react'

interface Cartilla {
  id: number
  title: string
  description: string
  category: 'beginner' | 'intermediate' | 'advanced'
  content: string[]
  completed: boolean
}

const cartillas: Cartilla[] = [
  {
    id: 1,
    title: 'Introducción a la Ruleta',
    description: 'Aprende los conceptos básicos de la ruleta europea',
    category: 'beginner',
    completed: false,
    content: [
      'La ruleta europea tiene 37 números (0-36)',
      'Los números rojos son: 1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36',
      'Los números negros son: 2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35',
      'El 0 es verde y da ventaja a la casa',
      'Cada número tiene una probabilidad de 1/37 (2.7%)'
    ]
  },
  {
    id: 2,
    title: 'Tipos de Apuestas',
    description: 'Conoce los diferentes tipos de apuestas disponibles',
    category: 'beginner',
    completed: false,
    content: [
      'Apuesta directa: Un solo número - Paga 35:1',
      'Apuesta a color: Rojo o negro - Paga 1:1',
      'Apuesta par/impar - Paga 1:1',
      'Apuesta alta/baja (1-18 o 19-36) - Paga 1:1',
      'Apuesta a docena - Paga 2:1',
      'Apuesta a columna - Paga 2:1'
    ]
  },
  {
    id: 3,
    title: 'Gestión de Capital',
    description: 'Aprende a gestionar tu dinero de forma inteligente',
    category: 'beginner',
    completed: false,
    content: [
      'Define un presupuesto máximo antes de empezar',
      'Nunca apuestes más del 5% de tu capital en una sola apuesta',
      'Establece límites de pérdida diarios',
      'No persigas pérdidas con apuestas más grandes',
      'Retírate cuando alcances tu objetivo de ganancia'
    ]
  },
  {
    id: 4,
    title: 'Análisis de Frecuencias',
    description: 'Identifica patrones en los números',
    category: 'intermediate',
    completed: false,
    content: [
      'Observa los números "calientes" que aparecen frecuentemente',
      'Identifica los números "fríos" que no han salido en mucho tiempo',
      'Analiza la distribución de colores',
      'Revisa los patrones de par/impar',
      'Considera las docenas y columnas para diversificar'
    ]
  },
  {
    id: 5,
    title: 'Estrategias de Apuesta',
    description: 'Métodos avanzados de apuesta',
    category: 'intermediate',
    completed: false,
    content: [
      'Método Martingala: Duplicar después de perder',
      'Método Paroli: Duplicar después de ganar',
      'Método D\'Alembert: Aumentar/decrementar en 1',
      'Método Fibonacci: Seguir la secuencia',
      'IMPORTANTE: Ningún sistema garantiza ganancias'
    ]
  },
  {
    id: 6,
    title: 'Uso del Software',
    description: 'Aprende a usar RollerWin eficientemente',
    category: 'beginner',
    completed: false,
    content: [
      'Ingresa los números que van saliendo en tiempo real',
      'Observa las predicciones generadas por el análisis',
      'Revisa las estadísticas de frecuencias',
      'Utiliza el módulo de gráficas para visualizar patrones',
      'Combina el análisis con tu propia estrategia'
    ]
  }
]

export function CartillasModule() {
  const [selectedCartilla, setSelectedCartilla] = useState<Cartilla | null>(null)
  const [completedCartillas, setCompletedCartillas] = useState<Set<number>>(new Set())

  const handleComplete = (id: number) => {
    setCompletedCartillas(prev => {
      const newSet = new Set(prev)
      newSet.add(id)
      return newSet
    })
    setSelectedCartilla(null)
  }

  const getCategoryIcon = (category: Cartilla['category']) => {
    switch (category) {
      case 'beginner': return Lightbulb
      case 'intermediate': return TrendingUp
      case 'advanced': return Calculator
    }
  }

  const getCategoryColor = (category: Cartilla['category']) => {
    switch (category) {
      case 'beginner': return 'text-green-500 bg-green-500/10'
      case 'intermediate': return 'text-amber-500 bg-amber-500/10'
      case 'advanced': return 'text-red-500 bg-red-500/10'
    }
  }

  const getCategoryLabel = (category: Cartilla['category']) => {
    switch (category) {
      case 'beginner': return 'Principiante'
      case 'intermediate': return 'Intermedio'
      case 'advanced': return 'Avanzado'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Módulo Cartillas</h2>
          <p className="text-zinc-400">Aprende estrategias y conceptos fundamentales</p>
        </div>
        <div className="text-right">
          <p className="text-amber-500 font-bold text-2xl">
            {completedCartillas.size}/{cartillas.length}
          </p>
          <p className="text-zinc-500 text-sm">Completadas</p>
        </div>
      </div>

      {/* Warning */}
      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-amber-200 text-sm">
              <strong>Importante:</strong> Este software es una herramienta de análisis estadístico. 
              Los resultados son probabilísticos y no garantizan ganancias. Juega responsablemente.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cartillas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cartillas.map((cartilla) => {
          const Icon = getCategoryIcon(cartilla.category)
          const colorClass = getCategoryColor(cartilla.category)
          const isCompleted = completedCartillas.has(cartilla.id)

          return (
            <motion.div
              key={cartilla.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: cartilla.id * 0.1 }}
            >
              <Card 
                className={`bg-zinc-900 border-zinc-800 cursor-pointer transition-all hover:border-amber-500/50 ${
                  selectedCartilla?.id === cartilla.id ? 'border-amber-500' : ''
                }`}
                onClick={() => setSelectedCartilla(cartilla)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg ${colorClass.split(' ')[1]}`}>
                      <Icon className={`w-5 h-5 ${colorClass.split(' ')[0]}`} />
                    </div>
                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6 text-green-500" />
                    ) : (
                      <Circle className="w-6 h-6 text-zinc-600" />
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <h3 className="text-white font-semibold mb-1">{cartilla.title}</h3>
                  <p className="text-zinc-400 text-sm mb-3">{cartilla.description}</p>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-2 py-1 rounded-full ${colorClass}`}>
                      {getCategoryLabel(cartilla.category)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-zinc-500" />
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>

      {/* Selected Cartilla Detail */}
      <AnimatePresence>
        {selectedCartilla && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
            onClick={() => setSelectedCartilla(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-zinc-900 rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white">{selectedCartilla.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${getCategoryColor(selectedCartilla.category)}`}>
                      {getCategoryLabel(selectedCartilla.category)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedCartilla(null)}
                    className="text-zinc-400 hover:text-white"
                  >
                    ✕
                  </Button>
                </div>

                <div className="space-y-4">
                  {selectedCartilla.content.map((item, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-start gap-3"
                    >
                      <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-amber-500 text-xs font-bold">{index + 1}</span>
                      </div>
                      <p className="text-zinc-300">{item}</p>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <Button
                    onClick={() => handleComplete(selectedCartilla.id)}
                    className="flex-1 bg-amber-500 hover:bg-amber-400 text-black"
                    disabled={completedCartillas.has(selectedCartilla.id)}
                  >
                    {completedCartillas.has(selectedCartilla.id) ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Completada
                      </>
                    ) : (
                      <>
                        <Target className="w-4 h-4 mr-2" />
                        Marcar como completada
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
