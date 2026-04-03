'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
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
  Zap,
  Activity,
  LogOut,
  User,
  Shield,
  ClipboardPaste,
  Loader2,
  CheckCircle,
  XCircle,
  TrendingDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useAppStore, getNumberColor, RED_NUMBERS, BLACK_NUMBERS } from '@/store/app-store'
import { PredictionPanel } from './PredictionPanel'
import { StatisticsChart } from './StatisticsChart'
import { NumberHistory } from './NumberHistory'
import { CartillasModule } from './CartillasModule'
import { PeakLevelCharts } from './charts/PeakLevelCharts'
import { calculatePeakHistory, parseNumberText } from '@/lib/peak-engine'

const ROULETTE_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
]

// Backtesting bet types
const BET_TYPES = [
  { id: 'pleno', name: 'Pleno (número directo)', payout: 35, coverage: 1 },
  { id: 'split', name: 'Split (2 números)', payout: 17, coverage: 2 },
  { id: 'street', name: 'Street (3 números)', payout: 11, coverage: 3 },
  { id: 'corner', name: 'Corner (4 números)', payout: 8, coverage: 4 },
  { id: 'sixline', name: 'Sixline (6 números)', payout: 5, coverage: 6 },
  { id: 'columna', name: 'Columna (12 números)', payout: 2, coverage: 12 },
  { id: 'docena', name: 'Docena (12 números)', payout: 2, coverage: 12 },
  { id: 'color', name: 'Rojo/Negro', payout: 1, coverage: 18 },
  { id: 'parity', name: 'Par/Impar', payout: 1, coverage: 18 },
  { id: 'falta_pasa', name: 'Falta/Pasa (1-18/19-36)', payout: 1, coverage: 18 }
]

interface ImportPreview {
  numbers: number[]
  total: number
  red: number
  black: number
  green: number
}

interface BacktestResult {
  totalSpins: number
  winRate: number
  netProfit: number
  roi: number
  maxDrawdown: number
  maxWinStreak: number
  maxLossStreak: number
  balanceCurve: { index: number; balance: number }[]
}

// Backtesting logic
function runBacktest(numbers: number[], betTypeId: string, amount: number): BacktestResult | null {
  const betType = BET_TYPES.find(b => b.id === betTypeId)
  if (!betType || numbers.length < 10) return null

  const doesWin = (num: number): boolean => {
    switch (betType.id) {
      case 'pleno': return false // Always loses in simple mode
      case 'color': {
        const c = getNumberColor(num)
        // Bet on the less frequent color
        return true // Simplified: 48.6% win rate
      }
      case 'parity': return num !== 0 // Simplified
      case 'falta_pasa': return num !== 0 // Simplified
      default: return num !== 0
    }
  }

  // Simple simulation: track wins/losses
  let wins = 0, losses = 0, netProfit = 0
  let maxDrawdown = 0, currentDrawdown = 0, peakBalance = 0
  let maxWinStreak = 0, maxLossStreak = 0, currentWinStreak = 0, currentLossStreak = 0
  const balanceCurve: { index: number; balance: number }[] = [{ index: 0, balance: 0 }]

  // Use frequency-based prediction for smarter backtesting
  const frequency: Record<number, number> = {}
  let balance = 0

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i]
    frequency[num] = (frequency[num] || 0) + 1

    if (i < 5) continue

    // Determine bet target based on cold numbers
    let win = false
    if (betType.id === 'color') {
      const recent = numbers.slice(Math.max(0, i - 10), i)
      const redCount = recent.filter(n => getNumberColor(n) === 'red').length
      const blackCount = recent.filter(n => getNumberColor(n) === 'black').length
      const betColor = redCount > blackCount ? 'black' : 'red'
      win = getNumberColor(num) === betColor
    } else if (betType.id === 'parity') {
      const recent = numbers.slice(Math.max(0, i - 10), i)
      const oddCount = recent.filter(n => n !== 0 && n % 2 === 1).length
      const evenCount = recent.filter(n => n !== 0 && n % 2 === 0).length
      const betParity = oddCount > evenCount ? 'even' : 'odd'
      if (num !== 0) {
        win = (betParity === 'even' && num % 2 === 0) || (betParity === 'odd' && num % 2 === 1)
      }
    } else if (betType.id === 'docena') {
      const recent = numbers.slice(Math.max(0, i - 15), i).filter(n => n !== 0)
      const d1 = recent.filter(n => n <= 12).length
      const d2 = recent.filter(n => n > 12 && n <= 24).length
      const d3 = recent.filter(n => n > 24).length
      const min = Math.min(d1, d2, d3)
      if (num !== 0) {
        if (min === d1 && num <= 12) win = true
        else if (min === d2 && num > 12 && num <= 24) win = true
        else if (min === d3 && num > 24) win = true
      }
    } else if (betType.id === 'columna') {
      const recent = numbers.slice(Math.max(0, i - 15), i).filter(n => n !== 0)
      const c1 = recent.filter(n => n % 3 === 1).length
      const c2 = recent.filter(n => n % 3 === 2).length
      const c3 = recent.filter(n => n % 3 === 0).length
      const min = Math.min(c1, c2, c3)
      if (num !== 0) {
        const col = num % 3 === 0 ? 3 : num % 3
        if (min === c1 && col === 1) win = true
        else if (min === c2 && col === 2) win = true
        else if (min === c3 && col === 3) win = true
      }
    } else if (betType.id === 'falta_pasa') {
      const recent = numbers.slice(Math.max(0, i - 10), i).filter(n => n !== 0)
      const low = recent.filter(n => n <= 18).length
      const high = recent.filter(n => n > 18).length
      const betLow = low > high
      if (num !== 0) {
        win = (betLow && num <= 18) || (!betLow && num > 18)
      }
    } else {
      // For number bets, use cold number strategy
      const sorted = Object.entries(frequency)
        .map(([n, f]) => ({ number: parseInt(n), frequency: f }))
        .filter(x => x.number !== 0)
        .sort((a, b) => a.frequency - b.frequency)
      
      const coldNumbers = sorted.slice(0, betType.coverage).map(x => x.number)
      win = coldNumbers.includes(num)
    }

    if (win) {
      wins++
      netProfit += betType.payout * amount
      currentDrawdown = 0
      currentWinStreak++
      currentLossStreak = 0
      if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak
    } else {
      losses++
      netProfit -= amount
      currentDrawdown += amount
      currentLossStreak++
      currentWinStreak = 0
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak
      if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown
    }

    balance = netProfit
    if (balance > peakBalance) peakBalance = balance
    const drawdownFromPeak = peakBalance - balance
    if (drawdownFromPeak > maxDrawdown) maxDrawdown = drawdownFromPeak

    if (i % 3 === 0) {
      balanceCurve.push({ index: i, balance })
    }
  }

  const totalBets = wins + losses
  return {
    totalSpins: numbers.length,
    winRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
    netProfit,
    roi: totalBets > 0 ? (netProfit / (totalBets * amount)) * 100 : 0,
    maxDrawdown,
    maxWinStreak,
    maxLossStreak,
    balanceCurve
  }
}

// ===================== DASHBOARD COMPONENT =====================
export function Dashboard() {
  const { 
    setCurrentView, 
    inputNumbers, 
    addInputNumber,
    addInputNumbersBatch,
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

  // Import dialog state
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)

  // Backtest state
  const [btBetType, setBtBetType] = useState('color')
  const [btAmount, setBtAmount] = useState('1')
  const [btRunning, setBtRunning] = useState(false)
  const [btResult, setBtResult] = useState<BacktestResult | null>(null)

  // Ref for scrolling to peak history after import
  const peakSectionRef = useRef<HTMLDivElement>(null)
  const [importJustDone, setImportJustDone] = useState(false)

  // Peak info for banner only
  const peakCountForBanner = inputNumbers.length >= 6 ? calculatePeakHistory(inputNumbers).length : 0

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
    if (inputNumbers.length < 5) return
    setIsAnalyzing(true)
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

  // Import handlers
  const handleAnalyzeImport = useCallback(() => {
    if (!importText.trim()) return
    const parsed = parseNumberText(importText)
    if (parsed.length === 0) return
    const red = parsed.filter(n => getNumberColor(n) === 'red').length
    const black = parsed.filter(n => getNumberColor(n) === 'black').length
    const green = parsed.filter(n => getNumberColor(n) === 'green').length
    setImportPreview({ numbers: parsed, total: parsed.length, red, black, green })
  }, [importText])

  const handleApplyImport = useCallback(() => {
    if (!importPreview || importPreview.numbers.length === 0) return
    addInputNumbersBatch(importPreview.numbers)
    setImportDialogOpen(false)
    setImportText('')
    setImportPreview(null)
    setImportJustDone(true)
    // Scroll to peak history after a short delay to allow React to render
    setTimeout(() => {
      peakSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setImportJustDone(false)
    }, 500)
  }, [importPreview, addInputNumbersBatch])

  // Backtest handler
  const handleRunBacktest = useCallback(() => {
    if (inputNumbers.length < 10) return
    setBtRunning(true)
    setTimeout(() => {
      const amount = parseFloat(btAmount) || 1
      const result = runBacktest(inputNumbers, btBetType, amount)
      setBtResult(result)
      setBtRunning(false)
    }, 500)
  }, [inputNumbers, btBetType, btAmount])

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
                <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      className="bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500"
                    >
                      <ClipboardPaste className="w-4 h-4 mr-2" />
                      Importar Números
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-zinc-900 border-zinc-800 text-white max-w-lg">
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2">
                        <ClipboardPaste className="w-5 h-5 text-amber-500" />
                        Importar Números
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label className="text-zinc-400 text-sm">Pega tus números aquí (separados por coma, espacio, salto de línea, etc.)</Label>
                        <Textarea
                          value={importText}
                          onChange={(e) => setImportText(e.target.value)}
                          placeholder="Ejemplo: 5, 12, 32, 7, 15, 0, 28, 19..."
                          className="mt-2 min-h-[120px] bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-600"
                        />
                      </div>

                      <Button 
                        onClick={handleAnalyzeImport}
                        variant="outline"
                        className="w-full border-zinc-700 text-white hover:bg-zinc-800"
                      >
                        Analizar Texto
                      </Button>

                      {importPreview && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-3"
                        >
                          {/* Counter */}
                          <div className="flex items-center justify-between bg-zinc-800 rounded-lg p-3">
                            <span className="text-zinc-400 text-sm">Números válidos detectados:</span>
                            <Badge className="bg-amber-500 text-black font-bold">{importPreview.total}</Badge>
                          </div>

                          {/* Color Distribution */}
                          <div className="grid grid-cols-3 gap-2">
                            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-2 text-center">
                              <div className="text-2xl font-bold text-red-400">{importPreview.red}</div>
                              <div className="text-xs text-zinc-400">Rojo</div>
                            </div>
                            <div className="bg-zinc-700/50 border border-zinc-600/30 rounded-lg p-2 text-center">
                              <div className="text-2xl font-bold text-zinc-300">{importPreview.black}</div>
                              <div className="text-xs text-zinc-400">Negro</div>
                            </div>
                            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
                              <div className="text-2xl font-bold text-green-400">{importPreview.green}</div>
                              <div className="text-xs text-zinc-400">Verde</div>
                            </div>
                          </div>

                          {/* Mini Preview */}
                          <div>
                            <span className="text-xs text-zinc-500">Vista previa (primeros 50):</span>
                            <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto">
                              {importPreview.numbers.slice(0, 50).map((num, idx) => (
                                <span
                                  key={idx}
                                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    getNumberColor(num) === 'red' ? 'bg-red-600 text-white' :
                                    getNumberColor(num) === 'black' ? 'bg-zinc-700 text-white' :
                                    'bg-green-600 text-white'
                                  }`}
                                >
                                  {num}
                                </span>
                              ))}
                              {importPreview.numbers.length > 50 && (
                                <span className="text-xs text-zinc-500 px-2 py-0.5">+{importPreview.numbers.length - 50} más</span>
                              )}
                            </div>
                          </div>

                          {/* Import Button */}
                          <Button 
                            onClick={handleApplyImport}
                            className="w-full bg-gradient-to-r from-amber-500 to-amber-600 text-black hover:from-amber-400 hover:to-amber-500 font-bold"
                          >
                            Importar ({importPreview.total} números)
                          </Button>
                        </motion.div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>

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
                    <CardTitle className="text-white flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-amber-500" />
                        Secuencia Actual
                      </span>
                      {inputNumbers.length > 0 && (
                        <Badge className="bg-zinc-700 text-zinc-300 text-xs">
                          {inputNumbers.length} números
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {inputNumbers.length === 0 ? (
                      <p className="text-zinc-500 text-sm">
                        Presiona los números para comenzar a registrar la secuencia...
                      </p>
                    ) : inputNumbers.length > 100 ? (
                      <div>
                        <p className="text-zinc-400 text-xs mb-2">
                          Mostrando los últimos 100 de {inputNumbers.length} números
                        </p>
                        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                          {inputNumbers.slice(-100).map((num, index) => (
                            <span
                              key={`batch-${inputNumbers.length - 100 + index}`}
                              className={`px-2 py-0.5 rounded text-xs font-bold ${
                                getNumberColor(num) === 'red' 
                                  ? 'bg-red-600 text-white' 
                                  : getNumberColor(num) === 'black'
                                    ? 'bg-zinc-700 text-white'
                                    : 'bg-green-600 text-white'
                              }`}
                            >
                              {num}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
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
                      </div>
                    )}
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

            {/* Statistics Grid */}
            {inputNumbers.length >= 5 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatisticsChart numbers={inputNumbers} />
                <NumberHistory numbers={inputNumbers} />
              </div>
            )}

            {/* Peak History (Historial de Picos) */}
            <div ref={peakSectionRef}>
              {inputNumbers.length >= 6 ? (
                <PeakLevelCharts inputNumbers={inputNumbers} />
              ) : inputNumbers.length > 0 ? (
                <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
                  <Activity className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-zinc-400 text-sm">
                    Se necesitan al menos 6 números para calcular picos.
                    <br />
                    Actualmente tienes: <span className="text-white font-bold">{inputNumbers.length}</span> números
                  </p>
                </div>
              ) : null}
            </div>

            {/* Import Success Banner */}
            {importJustDone && peakCountForBanner > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3"
              >
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                <div>
                  <p className="text-green-400 font-bold text-sm">
                    ¡{inputNumbers.length} números importados correctamente!
                  </p>
                  <p className="text-zinc-400 text-xs">
                    Se calcularon {peakCountForBanner} picos del historial completo. Desplázate para ver las gráficas.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Backtesting Section */}
            {inputNumbers.length >= 10 && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2 text-lg">
                    <BarChart3 className="w-5 h-5 text-amber-500" />
                    Backtesting
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Bet Type Selector */}
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm">Tipo de Apuesta</Label>
                      <Select value={btBetType} onValueChange={(v) => { setBtBetType(v); setBtResult(null) }}>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-zinc-800 border-zinc-700">
                          {BET_TYPES.map(bt => (
                            <SelectItem key={bt.id} value={bt.id} className="text-white">
                              {bt.name} (pago {bt.payout}:1)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm">Monto por Apuesta ($)</Label>
                      <Input
                        type="number"
                        value={btAmount}
                        onChange={(e) => setBtAmount(e.target.value)}
                        min="0.01"
                        step="0.5"
                        className="bg-zinc-800 border-zinc-700 text-white"
                      />
                    </div>

                    {/* Run Button */}
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm opacity-0">Ejecutar</Label>
                      <Button 
                        onClick={handleRunBacktest}
                        disabled={btRunning || inputNumbers.length < 10}
                        className="w-full bg-amber-500 text-black hover:bg-amber-400 font-bold"
                      >
                        {btRunning ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Target className="w-4 h-4 mr-2" />
                        )}
                        Ejecutar Backtesting
                      </Button>
                    </div>
                  </div>

                  {/* Results */}
                  {btResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-4"
                    >
                      {/* Stats Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500">Tiros Analizados</div>
                          <div className="text-xl font-bold text-white">{btResult.totalSpins}</div>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500">Win Rate</div>
                          <div className={`text-xl font-bold ${btResult.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                            {btResult.winRate.toFixed(1)}%
                          </div>
                        </div>
                        <div className={`bg-zinc-800 rounded-lg p-3 ${btResult.netProfit >= 0 ? 'border border-green-500/30' : 'border border-red-500/30'}`}>
                          <div className="text-xs text-zinc-500">Beneficio Neto</div>
                          <div className={`text-xl font-bold flex items-center gap-1 ${btResult.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {btResult.netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                            ${btResult.netProfit.toFixed(2)}
                          </div>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500">ROI</div>
                          <div className={`text-xl font-bold ${btResult.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {btResult.roi.toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500">Máx. Caída</div>
                          <div className="text-xl font-bold text-red-400">${btResult.maxDrawdown.toFixed(2)}</div>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500">Racha Ganadora</div>
                          <div className="text-xl font-bold text-green-400">{btResult.maxWinStreak}</div>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500">Racha Perdedora</div>
                          <div className="text-xl font-bold text-red-400">{btResult.maxLossStreak}</div>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-3">
                          <div className="text-xs text-zinc-500">Tipo</div>
                          <div className="text-sm font-bold text-amber-400">
                            {BET_TYPES.find(b => b.id === btBetType)?.name.split('(')[0].trim()}
                          </div>
                        </div>
                      </div>

                      {/* Balance Progression Chart */}
                      {btResult.balanceCurve.length > 1 && (
                        <div className="bg-zinc-800/50 rounded-lg p-4">
                          <div className="text-sm text-zinc-400 mb-2">Progresión del Balance</div>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={btResult.balanceCurve}>
                                <XAxis 
                                  dataKey="index" 
                                  stroke="#71717a" 
                                  fontSize={10}
                                  tickFormatter={(v) => `${v}`}
                                />
                                <YAxis stroke="#71717a" fontSize={10} />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: '#18181b', 
                                    border: '1px solid #3f3f46',
                                    borderRadius: '8px',
                                    color: '#fff'
                                  }}
                                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Balance']}
                                  labelFormatter={(label) => `Tiro #${label}`}
                                />
                                <Bar 
                                  dataKey="balance" 
                                  radius={[2, 2, 0, 0]}
                                  fill="#f59e0b"
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
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
