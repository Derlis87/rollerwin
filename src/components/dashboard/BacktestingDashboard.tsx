'use client'

import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend, AreaChart, Area
} from 'recharts'

interface SimResult {
  totalNumbers: number
  totalPredictions: number
  skipped: number
  skippedByEngine: number
  skippedByCooldown: number
  betted: number
  correct: number
  incorrect: number
  accuracy: number
  peaks: number[]
  peakStats: { low: number; medium: number; high: number }
  maxPeak: number
  normalMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  softMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  ultraMode: { predictions: number; correct: number; incorrect: number; accuracy: number; skipped: number }
  skipZone: { streak3: number; streak4: number; streak5: number; streak6: number }
  streakBreakdown: Record<string, { total: number; correct: number; accuracy: number; skipped: number }>
  martingale: { totalBet: number; totalWin: number; netResult: number; roi: number; maxConsecutiveLoss: number; lossStreaks: Record<string, number>; bustCount: number }
  greenCount: number
  recoveryFlips: number
  recoveryCorrectAfterFlip: number
  recoveryIncorrectAfterFlip: number
  cooldownStats: { lossCooldowns: number; bustCooldowns: number; greenCooldowns: number; spinsSkippedByCooldown: number; winsAfterCooldown: number; lossesAfterCooldown: number }
  balanceCurve: number[]
  steps: any[]
  totalSteps: number
  parsedNumbers: number
}

const SAMPLE_SEQUENCES = [
  { name: 'Secuencia Demo (200 nums)', data: '' },
]

function generateDemoSequence(): string {
  const reds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
  const blacks = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]
  const all = [...reds, ...blacks]
  const nums: number[] = []
  for (let i = 0; i < 200; i++) {
    const r = Math.random()
    if (r < 0.027) nums.push(0)
    else nums.push(all[Math.floor(Math.random() * all.length)])
  }
  return nums.join(', ')
}

function getPeakColor(height: number): string {
  if (height <= 3) return '#22c55e'
  if (height <= 6) return '#eab308'
  return '#ef4444'
}

function getModeLabel(mode: string): string {
  switch (mode) {
    case 'normal': return 'NORMAL'
    case 'soft': return 'SOFT'
    case 'skipzone': return 'SKIP ZONE'
    case 'ultra': return 'ULTRA'
    default: return mode
  }
}

function getModeColor(mode: string): string {
  switch (mode) {
    case 'normal': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'soft': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    case 'skipzone': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    case 'ultra': return 'bg-red-500/20 text-red-400 border-red-500/30'
    default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
  }
}

export function BacktestingDashboard() {
  const { setCurrentView, isAuthenticated } = useAppStore()
  const [sequence, setSequence] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<SimResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('resumen')
  const [cooldownLoss, setCooldownLoss] = useState('1')
  const [cooldownBust, setCooldownBust] = useState('3')
  const [cooldownGreen, setCooldownGreen] = useState('1')
  const [strategy, setStrategy] = useState('1-2-4')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setSequence(text)
    }
    reader.readAsText(file)
  }, [])

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText()
      setSequence(text)
    } catch {
      setError('No se pudo acceder al portapapeles. Pega los numeros manualmente.')
    }
  }, [])

  const runBacktest = useCallback(async () => {
    if (!sequence.trim()) {
      setError('Pega o ingresa una secuencia de numeros de ruleta primero.')
      return
    }

    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      const bets = strategy === '1-2-4' ? [1, 2, 4] : strategy === '1-3-9' ? [1, 3, 9] : strategy === '1-2' ? [1, 2] : [1, 2, 4, 8]

      const response = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence,
          options: {
            cooldownAfterLoss: parseInt(cooldownLoss),
            cooldownAfterBust: parseInt(cooldownBust),
            cooldownAfterGreen: parseInt(cooldownGreen),
            martingaleBets: bets,
          },
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Error en la simulacion')
        return
      }

      setResult(data)
      setActiveTab('resumen')
    } catch (err: any) {
      setError(err.message || 'Error de conexion con el servidor')
    } finally {
      setIsRunning(false)
    }
  }, [sequence, cooldownLoss, cooldownBust, cooldownGreen, strategy])

  const loadDemo = useCallback(() => {
    setSequence(generateDemoSequence())
  }, [])

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Acceso Requerido</h2>
          <p className="text-zinc-400 mb-6">Inicia sesion para acceder al backtesting avanzado</p>
          <Button onClick={() => setCurrentView('landing')} className="bg-amber-600 hover:bg-amber-700">
            Iniciar Sesion
          </Button>
        </div>
      </div>
    )
  }

  // Prepare chart data
  const balanceData = result?.balanceCurve?.map((val, i) => ({ index: i, balance: val })) || []
  const peakHistogram: { peak: number; count: number; color: string }[] = []
  if (result?.peaks) {
    const hist: Record<number, number> = {}
    result.peaks.forEach(p => { hist[p] = (hist[p] || 0) + 1 })
    for (let i = 1; i <= Math.max(result.maxPeak, 10); i++) {
      if (hist[i]) {
        peakHistogram.push({ peak: i, count: hist[i], color: getPeakColor(i) })
      }
    }
  }

  const modeData = result ? [
    { name: 'NORMAL', predictions: result.normalMode.predictions, correct: result.normalMode.correct, incorrect: result.normalMode.incorrect, skipped: result.normalMode.skipped, accuracy: result.normalMode.accuracy, fill: '#3b82f6' },
    { name: 'SOFT', predictions: result.softMode.predictions, correct: result.softMode.correct, incorrect: result.softMode.incorrect, skipped: result.softMode.skipped, accuracy: result.softMode.accuracy, fill: '#f59e0b' },
    { name: 'ULTRA', predictions: result.ultraMode.predictions, correct: result.ultraMode.correct, incorrect: result.ultraMode.incorrect, skipped: result.ultraMode.skipped, accuracy: result.ultraMode.accuracy, fill: '#ef4444' },
  ] : []

  const peakPieData = result ? [
    { name: 'Bajos (1-3)', value: result.peakStats.low, fill: '#22c55e' },
    { name: 'Medios (4-6)', value: result.peakStats.medium, fill: '#eab308' },
    { name: 'Altos (7+)', value: result.peakStats.high, fill: '#ef4444' },
  ] : []

  const skipData = result ? [
    { name: 'Motor', value: result.skippedByEngine, fill: '#6366f1' },
    { name: 'Cooldown', value: result.skippedByCooldown, fill: '#f59e0b' },
  ] : []

  const streakData = result ? Object.entries(result.streakBreakdown)
    .map(([key, val]) => ({
      streak: parseInt(key),
      total: val.total,
      correct: val.correct,
      skipped: val.skipped,
      accuracy: val.accuracy,
    }))
    .sort((a, b) => a.streak - b.streak) : []

  const lossStreakData = result ? Object.entries(result.martingale.lossStreaks)
    .map(([len, count]) => ({
      length: parseInt(len),
      count,
      color: parseInt(len) <= 3 ? '#22c55e' : '#ef4444',
    }))
    .sort((a, b) => a.length - b.length) : []

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => setCurrentView('dashboard-live')} className="text-zinc-400 hover:text-white transition">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <div>
              <h1 className="text-lg font-bold">Backtesting Avanzado V6.0</h1>
              <p className="text-xs text-zinc-500">Motor Ultra-Selective + Cooldown System</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-500/50 text-amber-400">V6.0</Badge>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column — Input */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Secuencia de Numeros</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  value={sequence}
                  onChange={(e) => setSequence(e.target.value)}
                  placeholder="Pega aqui los numeros de ruleta separados por comas, espacios o saltos de linea...&#10;&#10;Ejemplo: 7, 14, 32, 0, 5, 19, 8, 23, 1, 36"
                  className="min-h-[200px] bg-zinc-800 border-zinc-700 text-sm font-mono text-zinc-300 placeholder:text-zinc-600 resize-y"
                />
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePaste} className="border-zinc-700 text-zinc-400 hover:text-white">
                    Portapapeles
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="border-zinc-700 text-zinc-400 hover:text-white">
                    Archivo
                  </Button>
                  <Button variant="outline" size="sm" onClick={loadDemo} className="border-zinc-700 text-zinc-400 hover:text-white">
                    Demo
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".txt,.csv,.text" onChange={handleFileUpload} className="hidden" />
                </div>
                {sequence && (
                  <p className="text-xs text-zinc-500">
                    {sequence.split(/[,\s;\n\r|]+/).filter(s => s.trim()).length} numeros detectados
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Configuracion</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">Estrategia Martingala</label>
                  <Select value={strategy} onValueChange={setStrategy}>
                    <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1-2">1-2 (Conservadora)</SelectItem>
                      <SelectItem value="1-2-4">1-2-4 (Estandar)</SelectItem>
                      <SelectItem value="1-3-9">1-3-9 (Agresiva)</SelectItem>
                      <SelectItem value="1-2-4-8">1-2-4-8 (Muy Agresiva)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Cooldown Perdida</label>
                    <Select value={cooldownLoss} onValueChange={setCooldownLoss}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0</SelectItem>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Cooldown Bust</label>
                    <Select value={cooldownBust} onValueChange={setCooldownBust}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                        <SelectItem value="3">3</SelectItem>
                        <SelectItem value="5">5</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-zinc-400">Cooldown Verde</label>
                    <Select value={cooldownGreen} onValueChange={setCooldownGreen}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0</SelectItem>
                        <SelectItem value="1">1</SelectItem>
                        <SelectItem value="2">2</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button
                  onClick={runBacktest}
                  disabled={isRunning || !sequence.trim()}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-medium"
                >
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Simulando...
                    </span>
                  ) : (
                    'Ejecutar Backtesting'
                  )}
                </Button>
              </CardContent>
            </Card>

            {error && (
              <Card className="bg-red-950/50 border-red-800">
                <CardContent className="py-3">
                  <p className="text-sm text-red-400">{error}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column — Results */}
          <div className="lg:col-span-2">
            {!result ? (
              <Card className="bg-zinc-900 border-zinc-800 h-full min-h-[400px] flex items-center justify-center">
                <div className="text-center space-y-4 px-8">
                  <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto">
                    <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </div>
                  <h3 className="text-lg font-medium text-zinc-400">Sin Resultados</h3>
                  <p className="text-sm text-zinc-600 max-w-sm">
                    Ingresa una secuencia de numeros de ruleta y configura los parametros para ejecutar el backtesting del motor V6.0
                  </p>
                </div>
              </Card>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-zinc-900 border border-zinc-800 p-1 w-full flex">
                  <TabsTrigger value="resumen" className="flex-1 text-xs data-[state=active]:bg-amber-600 data-[state=active]:text-white">Resumen</TabsTrigger>
                  <TabsTrigger value="graficos" className="flex-1 text-xs data-[state=active]:bg-amber-600 data-[state=active]:text-white">Graficos</TabsTrigger>
                  <TabsTrigger value="modos" className="flex-1 text-xs data-[state=active]:bg-amber-600 data-[state=active]:text-white">Modos</TabsTrigger>
                  <TabsTrigger value="martingala" className="flex-1 text-xs data-[state=active]:bg-amber-600 data-[state=active]:text-white">Martingala</TabsTrigger>
                  <TabsTrigger value="detalle" className="flex-1 text-xs data-[state=active]:bg-amber-600 data-[state=active]:text-white">Detalle</TabsTrigger>
                </TabsList>

                {/* RESUMEN TAB */}
                <TabsContent value="resumen" className="space-y-4">
                  {/* KPI Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">Accuracy</p>
                        <p className={`text-2xl font-bold ${result.accuracy >= 55 ? 'text-green-400' : result.accuracy >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                          {result.accuracy.toFixed(1)}%
                        </p>
                        <p className="text-xs text-zinc-600">{result.correct}W / {result.incorrect}L</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">Resultado Neto</p>
                        <p className={`text-2xl font-bold ${result.martingale.netResult >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {result.martingale.netResult >= 0 ? '+' : ''}{result.martingale.netResult}
                        </p>
                        <p className="text-xs text-zinc-600">{result.martingale.roi.toFixed(2)}% ROI</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">Selectividad</p>
                        <p className="text-2xl font-bold text-blue-400">
                          {(result.skipped / result.totalPredictions * 100).toFixed(1)}%
                        </p>
                        <p className="text-xs text-zinc-600">{result.betted} bet / {result.skipped} skip</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">Busts</p>
                        <p className={`text-2xl font-bold ${result.martingale.bustCount === 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {result.martingale.bustCount}
                        </p>
                        <p className="text-xs text-zinc-600">Pico max: {result.maxPeak}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Balance Curve */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Curva de Balance</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={balanceData}>
                            <defs>
                              <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={result.martingale.netResult >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={result.martingale.netResult >= 0 ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="index" tick={{ fontSize: 10, fill: '#71717a' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                              labelStyle={{ color: '#a1a1aa' }}
                            />
                            <Area
                              type="monotone"
                              dataKey="balance"
                              stroke={result.martingale.netResult >= 0 ? '#22c55e' : '#ef4444'}
                              fill="url(#balanceGradient)"
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>

                  {/* General Stats */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Estadisticas Generales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-zinc-500 text-xs">Numeros totales</p>
                          <p className="font-semibold">{result.totalNumbers}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Predicciones</p>
                          <p className="font-semibold">{result.totalPredictions}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Skip por motor</p>
                          <p className="font-semibold text-indigo-400">{result.skippedByEngine}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Skip por cooldown</p>
                          <p className="font-semibold text-amber-400">{result.skippedByCooldown}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Verdes (cero)</p>
                          <p className="font-semibold text-green-500">{result.greenCount}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Picos totales</p>
                          <p className="font-semibold">{result.peaks.length}</p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Ratio bajos/(med+alt)</p>
                          <p className={`font-semibold ${result.peakStats.low / Math.max(1, result.peakStats.medium + result.peakStats.high) >= 7 ? 'text-green-400' : 'text-red-400'}`}>
                            {(result.peakStats.low / Math.max(1, result.peakStats.medium + result.peakStats.high)).toFixed(2)}:1
                          </p>
                        </div>
                        <div>
                          <p className="text-zinc-500 text-xs">Recovery flips</p>
                          <p className="font-semibold">{result.recoveryFlips}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Skip Zone + Cooldown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Skip Zone (streaks 3-6)</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {[
                          { label: 'Streak 3', value: result.skipZone.streak3 },
                          { label: 'Streak 4', value: result.skipZone.streak4 },
                          { label: 'Streak 5', value: result.skipZone.streak5 },
                          { label: 'Streak 6', value: result.skipZone.streak6 },
                        ].map(s => (
                          <div key={s.label} className="flex items-center justify-between text-sm">
                            <span className="text-zinc-400">{s.label}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-zinc-600 rounded-full" style={{ width: `${Math.min(100, (s.value / Math.max(1, result.totalPredictions)) * 300)}%` }} />
                              </div>
                              <span className="text-zinc-300 font-mono text-xs w-8 text-right">{s.value}</span>
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 border-t border-zinc-800 flex justify-between text-sm">
                          <span className="text-zinc-500">Total</span>
                          <span className="font-semibold">{result.skipZone.streak3 + result.skipZone.streak4 + result.skipZone.streak5 + result.skipZone.streak6}</span>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Cooldown System</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Cooldowns por perdida</span>
                          <span>{result.cooldownStats.lossCooldowns}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Cooldowns por bust</span>
                          <span>{result.cooldownStats.bustCooldowns}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-zinc-400">Cooldowns por verde</span>
                          <span>{result.cooldownStats.greenCooldowns}</span>
                        </div>
                        <div className="pt-2 border-t border-zinc-800">
                          <div className="flex justify-between">
                            <span className="text-zinc-400">Spins skipeados</span>
                            <span className="font-semibold">{result.cooldownStats.spinsSkippedByCooldown}</span>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-zinc-400">Wins post-cooldown</span>
                            <span className="text-green-400">{result.cooldownStats.winsAfterCooldown}</span>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-zinc-400">Losses post-cooldown</span>
                            <span className="text-red-400">{result.cooldownStats.lossesAfterCooldown}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* GRAFICOS TAB */}
                <TabsContent value="graficos" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Peak Histogram */}
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Distribucion de Picos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={peakHistogram}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="peak" tick={{ fontSize: 10, fill: '#71717a' }} label={{ value: 'Pico', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#71717a' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                {peakHistogram.map((entry, idx) => (
                                  <Cell key={idx} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Peak Pie */}
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Clasificacion de Picos</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={peakPieData.filter(d => d.value > 0)}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={90}
                                paddingAngle={5}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              >
                                {peakPieData.filter(d => d.value > 0).map((entry, idx) => (
                                  <Cell key={idx} fill={entry.fill} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Skip Distribution */}
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Distribucion de Skips</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={skipData.filter(d => d.value > 0)}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={90}
                                paddingAngle={5}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                              >
                                {skipData.filter(d => d.value > 0).map((entry, idx) => (
                                  <Cell key={idx} fill={entry.fill} />
                                ))}
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Streak Accuracy */}
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Accuracy por Streak</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="h-[250px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={streakData.filter(d => d.streak >= 0)}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="streak" tick={{ fontSize: 10, fill: '#71717a' }} label={{ value: 'Streak', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#71717a' }} />
                              <YAxis tick={{ fontSize: 10, fill: '#71717a' }} domain={[0, 100]} />
                              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                              <Bar dataKey="accuracy" fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* MODOS TAB */}
                <TabsContent value="modos" className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {modeData.map(mode => (
                      <Card key={mode.name} className="bg-zinc-900 border-zinc-800">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">{mode.name}</CardTitle>
                            <Badge variant="outline" className={mode.name === 'NORMAL' ? 'border-blue-500/50 text-blue-400' : mode.name === 'SOFT' ? 'border-amber-500/50 text-amber-400' : 'border-red-500/50 text-red-400'}>
                              {mode.accuracy.toFixed(1)}%
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="text-center">
                            <div className="text-3xl font-bold" style={{ color: mode.fill }}>{mode.predictions}</div>
                            <p className="text-xs text-zinc-500">apuestas realizadas</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-green-950/30 border border-green-800/30 rounded-lg p-2 text-center">
                              <p className="text-green-400 font-bold">{mode.correct}</p>
                              <p className="text-xs text-zinc-500">Correctas</p>
                            </div>
                            <div className="bg-red-950/30 border border-red-800/30 rounded-lg p-2 text-center">
                              <p className="text-red-400 font-bold">{mode.incorrect}</p>
                              <p className="text-xs text-zinc-500">Incorrectas</p>
                            </div>
                          </div>
                          <div className="text-sm">
                            <div className="flex justify-between text-zinc-400">
                              <span>Skipeados</span>
                              <span>{mode.skipped}</span>
                            </div>
                            {mode.predictions > 0 && (
                              <>
                                <div className="flex justify-between text-zinc-400 mt-1">
                                  <span>Skip rate</span>
                                  <span>{(mode.skipped / (mode.predictions + mode.skipped) * 100).toFixed(1)}%</span>
                                </div>
                                <Progress value={mode.accuracy} className="mt-2 h-1.5" />
                              </>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Skip Zone Detail */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Skip Zone — Razon: Sin Edge Demostrado</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-4 gap-4">
                        {[
                          { streak: 3, count: result.skipZone.streak3 },
                          { streak: 4, count: result.skipZone.streak4 },
                          { streak: 5, count: result.skipZone.streak5 },
                          { streak: 6, count: result.skipZone.streak6 },
                        ].map(s => (
                          <div key={s.streak} className="bg-zinc-800/50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-zinc-300">{s.count}</p>
                            <p className="text-xs text-zinc-500">Streak {s.streak}</p>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-zinc-600 mt-3 text-center">
                        Los streaks 3-6 tienen accuracy demostrada &lt;50% (peor que random). El motor los skipea completamente.
                      </p>
                    </CardContent>
                  </Card>

                  {/* Streak Breakdown Table */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Breakdown por Streak</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-zinc-800 text-zinc-500">
                              <th className="text-left py-2 px-2">Streak</th>
                              <th className="text-right py-2 px-2">Total</th>
                              <th className="text-right py-2 px-2">Correct</th>
                              <th className="text-right py-2 px-2">Skipped</th>
                              <th className="text-right py-2 px-2">Accuracy</th>
                              <th className="text-right py-2 px-2">Modo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {streakData.map(s => (
                              <tr key={s.streak} className="border-b border-zinc-800/50">
                                <td className="py-1.5 px-2 font-mono">{s.streak}</td>
                                <td className="py-1.5 px-2 text-right">{s.total}</td>
                                <td className="py-1.5 px-2 text-right text-green-400">{s.correct}</td>
                                <td className="py-1.5 px-2 text-right text-zinc-500">{s.skipped}</td>
                                <td className="py-1.5 px-2 text-right">
                                  <span className={s.accuracy >= 55 ? 'text-green-400' : s.accuracy >= 48 ? 'text-amber-400' : 'text-red-400'}>
                                    {s.accuracy.toFixed(1)}%
                                  </span>
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getModeColor(s.streak >= 7 ? 'ultra' : s.streak >= 3 ? 'skipzone' : s.streak >= 2 ? 'soft' : 'normal')}`}>
                                    {getModeLabel(s.streak >= 7 ? 'ultra' : s.streak >= 3 ? 'skipzone' : s.streak >= 2 ? 'soft' : 'normal')}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* MARTINGALA TAB */}
                <TabsContent value="martingala" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">Total Apostado</p>
                        <p className="text-xl font-bold">{result.martingale.totalBet}u</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">Total Ganado</p>
                        <p className="text-xl font-bold text-green-400">{result.martingale.totalWin}u</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">Neto</p>
                        <p className={`text-xl font-bold ${result.martingale.netResult >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {result.martingale.netResult >= 0 ? '+' : ''}{result.martingale.netResult}u
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-zinc-900 border-zinc-800">
                      <CardContent className="py-3 px-4">
                        <p className="text-xs text-zinc-500 mb-1">ROI</p>
                        <p className={`text-xl font-bold ${result.martingale.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {result.martingale.roi.toFixed(2)}%
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Loss Streak Distribution */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Distribucion de Rachas de Perdida</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={lossStreakData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis dataKey="length" tick={{ fontSize: 10, fill: '#71717a' }} label={{ value: 'Racha', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#71717a' }} />
                            <YAxis tick={{ fontSize: 10, fill: '#71717a' }} />
                            <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }} />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {lossStreakData.map((entry, idx) => (
                                <Cell key={idx} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-green-950/30 border border-green-800/30 rounded-lg p-3">
                          <p className="text-green-400 font-bold">{Object.entries(result.martingale.lossStreaks).filter(([k]) => parseInt(k) <= 3).reduce((s, [, v]) => s + v, 0)}</p>
                          <p className="text-xs text-zinc-500">Rachas seguras (1-3)</p>
                        </div>
                        <div className="bg-red-950/30 border border-red-800/30 rounded-lg p-3">
                          <p className="text-red-400 font-bold">{Object.entries(result.martingale.lossStreaks).filter(([k]) => parseInt(k) >= 4).reduce((s, [, v]) => s + v, 0)}</p>
                          <p className="text-xs text-zinc-500">Rachas fatales (4+)</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Bust Analysis */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Analisis de Busts</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Total busts (martingala completa)</span>
                        <span className={result.martingale.bustCount === 0 ? 'text-green-400' : 'text-red-400'}>{result.martingale.bustCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Costo por bust</span>
                        <span className="font-mono">-7u</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Costo total de busts</span>
                        <span className="text-red-400 font-mono">{result.martingale.bustCount * -7}u</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Max racha de perdidas consecutivas</span>
                        <span className={result.martingale.maxConsecutiveLoss <= 3 ? 'text-green-400' : 'text-red-400'}>{result.martingale.maxConsecutiveLoss}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Recovery System */}
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Recovery System</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Total recovery flips</span>
                        <span>{result.recoveryFlips}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Correctos post-flip</span>
                        <span className="text-green-400">{result.recoveryCorrectAfterFlip} ({result.recoveryFlips > 0 ? (result.recoveryCorrectAfterFlip / result.recoveryFlips * 100).toFixed(1) : 0}%)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-zinc-400">Incorrectos post-flip</span>
                        <span className="text-red-400">{result.recoveryIncorrectAfterFlip} ({result.recoveryFlips > 0 ? (result.recoveryIncorrectAfterFlip / result.recoveryFlips * 100).toFixed(1) : 0}%)</span>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* DETALLE TAB */}
                <TabsContent value="detalle" className="space-y-4">
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">Detalle por Spin</CardTitle>
                        <span className="text-xs text-zinc-500">
                          Mostrando {result.steps.length} de {result.totalSteps} spins
                        </span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar-y">
                        <table className="w-full text-xs font-mono">
                          <thead className="sticky top-0 bg-zinc-900 z-10">
                            <tr className="border-b border-zinc-800 text-zinc-500">
                              <th className="text-left py-2 px-1.5">#</th>
                              <th className="text-center py-2 px-1.5">Num</th>
                              <th className="text-left py-2 px-1.5">Prediccion</th>
                              <th className="text-left py-2 px-1.5">Modo</th>
                              <th className="text-center py-2 px-1.5">Streak</th>
                              <th className="text-left py-2 px-1.5">Estado</th>
                              <th className="text-right py-2 px-1.5">Bet</th>
                              <th className="text-right py-2 px-1.5">Balance</th>
                              <th className="text-center py-2 px-1.5">Pico</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.steps.map((step, idx) => (
                              <tr key={idx} className={`border-b border-zinc-800/30 ${step.shouldSkip ? 'opacity-40' : ''}`}>
                                <td className="py-1 px-1.5 text-zinc-600">{step.index}</td>
                                <td className="py-1 px-1.5 text-center">
                                  <span className={`inline-block w-5 h-5 rounded-full text-[10px] leading-5 text-white font-bold ${step.color === 'red' ? 'bg-red-600' : step.color === 'black' ? 'bg-zinc-700' : 'bg-green-600'}`}>
                                    {step.number}
                                  </span>
                                </td>
                                <td className="py-1 px-1.5">
                                  <span className={step.predictedColor === 'red' ? 'text-red-400' : 'text-zinc-400'}>
                                    {step.predictedColor === 'red' ? 'ROJO' : 'NEGRO'}
                                  </span>
                                </td>
                                <td className="py-1 px-1.5">
                                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ${getModeColor(step.mode)}`}>
                                    {getModeLabel(step.mode)}
                                  </Badge>
                                </td>
                                <td className="py-1 px-1.5 text-center">{step.streakLength}</td>
                                <td className="py-1 px-1.5">
                                  {step.shouldSkip ? (
                                    <span className="text-zinc-600">{step.skipReason}</span>
                                  ) : step.isCorrect ? (
                                    <span className="text-green-400">WIN</span>
                                  ) : (
                                    <span className="text-red-400">LOSS</span>
                                  )}
                                </td>
                                <td className="py-1 px-1.5 text-right">{step.shouldSkip ? '-' : `${step.martingaleBet}u`}</td>
                                <td className={`py-1 px-1.5 text-right ${step.balance > 0 ? 'text-green-400' : step.balance < 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                                  {step.shouldSkip ? '-' : (step.balance >= 0 ? '+' : '') + step.balance}
                                </td>
                                <td className="py-1 px-1.5 text-center">
                                  {!step.shouldSkip && step.peakHeight > 0 && (
                                    <span style={{ color: getPeakColor(step.peakHeight) }} className="font-bold">
                                      {step.peakHeight}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
