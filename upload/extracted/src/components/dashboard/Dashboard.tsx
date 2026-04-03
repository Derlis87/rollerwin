'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft, 
  BarChart3, 
  BookOpen, 
  TrendingUp, 
  Trash2,
  Play,
  History,
  Target,
  ChevronDown,
  Zap,
  Activity,
  LogOut,
  User,
  Shield
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore, getNumberColor, RED_NUMBERS, BLACK_NUMBERS } from '@/store/app-store'
import { PredictionPanel } from './PredictionPanel'
import { StatisticsChart } from './StatisticsChart'
import { NumberHistory } from './NumberHistory'
import { CartillasModule } from './CartillasModule'

const ROULETTE_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
]

export function Dashboard() {
  const { 
    setCurrentView, 
    inputNumbers, 
    addInputNumber, 
    clearInputNumbers,
    currentSession,
    createSession,
    activeTab,
    setActiveTab,
    user,
    isAuthenticated,
    logout
  } = useAppStore()
  
  const [selectedPlatform, setSelectedPlatform] = useState<'Azure' | 'Bet365' | 'Evolution'>('Azure')
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentView('landing')
    }
  }, [isAuthenticated, setCurrentView])

  const handleNumberClick = useCallback((num: number) => {
    addInputNumber(num)
  }, [addInputNumber])

  const handleStartSession = () => {
    if (!currentSession) {
      createSession(`Sesión ${selectedPlatform}`, selectedPlatform)
    }
  }

  const handleAnalyze = async () => {
    if (inputNumbers.length < 10) {
      return
    }
    setIsAnalyzing(true)
    // Simulate analysis
    await new Promise(resolve => setTimeout(resolve, 1500))
    setIsAnalyzing(false)
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/me', { method: 'DELETE' })
      logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const getNumberButtonStyle = (num: number) => {
    const color = getNumberColor(num)
    const baseStyle = 'w-10 h-10 md:w-12 md:h-12 rounded-lg font-bold text-sm md:text-base transition-all duration-200 hover:scale-110 '
    
    if (color === 'red') {
      return baseStyle + 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
    } else if (color === 'black') {
      return baseStyle + 'bg-zinc-800 hover:bg-zinc-700 text-white shadow-lg shadow-zinc-800/30'
    } else {
      return baseStyle + 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/30'
    }
  }

  if (!isAuthenticated || !user) {
    return null
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setCurrentView('landing')}
                className="text-white hover:text-amber-500"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl md:text-2xl font-bold">
                <span className="text-white">Roller</span>
                <span className="text-amber-500">Win</span>
              </h1>
            </div>
            
            {/* User Info & Platform Selector */}
            <div className="flex items-center gap-4">
              {/* Platform Selector */}
              <div className="hidden md:flex items-center gap-2">
                {(['Azure', 'Bet365', 'Evolution'] as const).map((platform) => (
                  <Button
                    key={platform}
                    variant={selectedPlatform === platform ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedPlatform(platform)}
                    className={selectedPlatform === platform 
                      ? 'bg-amber-500 text-black hover:bg-amber-400' 
                      : 'border-zinc-700 text-white hover:bg-zinc-800'
                    }
                  >
                    {platform}
                  </Button>
                ))}
              </div>

              {/* User Badge */}
              <div className="flex items-center gap-2 bg-zinc-800 rounded-full px-3 py-1.5">
                <User className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-white hidden sm:inline">{user.name}</span>
              </div>

              {/* IP Badge */}
              <div className="hidden sm:flex items-center gap-1 bg-green-500/20 rounded-full px-3 py-1.5">
                <Shield className="w-4 h-4 text-green-500" />
                <span className="text-xs text-green-400">IP Protegida</span>
              </div>

              {/* Logout Button */}
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleLogout}
                className="text-white hover:text-red-500"
                title="Cerrar sesión"
              >
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Mobile Platform Selector */}
          <div className="flex md:hidden items-center gap-2 mt-4 overflow-x-auto pb-2">
            {(['Azure', 'Bet365', 'Evolution'] as const).map((platform) => (
              <Button
                key={platform}
                variant={selectedPlatform === platform ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedPlatform(platform)}
                className={selectedPlatform === platform 
                  ? 'bg-amber-500 text-black hover:bg-amber-400' 
                  : 'border-zinc-700 text-white hover:bg-zinc-800'
                }
              >
                {platform}
              </Button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6 bg-zinc-900 border border-zinc-800">
            <TabsTrigger value="analisis" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              <Target className="w-4 h-4 mr-2" />
              Análisis
            </TabsTrigger>
            <TabsTrigger value="historial" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              <History className="w-4 h-4 mr-2" />
              Historial
            </TabsTrigger>
            <TabsTrigger value="cartillas" className="data-[state=active]:bg-amber-500 data-[state=active]:text-black">
              <BookOpen className="w-4 h-4 mr-2" />
              Cartillas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analisis" className="space-y-6">
            {/* Session Info */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">Análisis de Ruleta</h2>
                <p className="text-zinc-400">Plataforma: {selectedPlatform}</p>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  onClick={clearInputNumbers}
                  className="border-zinc-700 text-white hover:bg-zinc-800"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Limpiar
                </Button>
                <Button 
                  onClick={handleStartSession}
                  className="bg-amber-500 text-black hover:bg-amber-400"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Nueva Sesión
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Number Input Grid */}
              <div className="lg:col-span-2">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-white flex items-center gap-2">
                        <Activity className="w-5 h-5 text-amber-500" />
                        Ingreso de Números
                      </span>
                      <span className="text-sm font-normal text-zinc-400">
                        {inputNumbers.length} números ingresados
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-6 sm:grid-cols-7 md:grid-cols-9 lg:grid-cols-10 gap-2">
                      {[0, ...Array(36).fill(0).map((_, i) => i + 1)].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleNumberClick(num)}
                          className={getNumberButtonStyle(num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                    
                    {/* Quick Input */}
                    <div className="mt-6 flex flex-wrap gap-2">
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Add random numbers for testing
                          for (let i = 0; i < 10; i++) {
                            handleNumberClick(Math.floor(Math.random() * 37))
                          }
                        }}
                        className="border-zinc-700 text-white hover:bg-zinc-800"
                      >
                        <Zap className="w-4 h-4 mr-2" />
                        Generar 10 aleatorios
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Input History */}
                <Card className="bg-zinc-900 border-zinc-800 mt-6">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-amber-500" />
                      Secuencia Actual
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      <AnimatePresence>
                        {inputNumbers.map((num, index) => (
                          <motion.span
                            key={`${num}-${index}`}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            className={`px-3 py-1 rounded-full text-sm font-bold ${
                              getNumberColor(num) === 'red' 
                                ? 'bg-red-600 text-white' 
                                : getNumberColor(num) === 'black'
                                  ? 'bg-zinc-700 text-white'
                                  : 'bg-green-600 text-white'
                            }`}
                          >
                            {num}
                          </motion.span>
                        ))}
                      </AnimatePresence>
                      {inputNumbers.length === 0 && (
                        <p className="text-zinc-500 text-sm">
                          Presiona los números para comenzar a registrar la secuencia...
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Prediction Panel */}
              <div className="lg:col-span-1">
                <PredictionPanel 
                  numbers={inputNumbers} 
                  isAnalyzing={isAnalyzing}
                  onAnalyze={handleAnalyze}
                />
              </div>
            </div>

            {/* Statistics */}
            {inputNumbers.length >= 5 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatisticsChart numbers={inputNumbers} />
                <NumberHistory numbers={inputNumbers} />
              </div>
            )}
          </TabsContent>

          <TabsContent value="historial">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-amber-500" />
                  Historial de Sesiones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-zinc-500">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>No hay sesiones guardadas</p>
                  <p className="text-sm mt-2">Comienza una nueva sesión para ver el historial</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cartillas">
            <CartillasModule />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
