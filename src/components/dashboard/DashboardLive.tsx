'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ArrowLeft,
  Trash2,
  ExternalLink,
  Activity,
  LogOut,
  User,
  Radio,
  Minimize2,
  Maximize2,
  Volume2,
  VolumeX,
  Target,
  AlertTriangle,
  CheckCircle,
  Copy,
  Check,
  Zap,
  Bot,
  Keyboard,
  Timer,
  TrendingUp,
  Import,
  History,
  DollarSign,
  TrendingDown,
  BarChart3,
  X,
  ClipboardPaste,
  Wallet,
  Calculator,
  RotateCcw,
  CircleDot,
  Wifi,
  Scan,
  FileDown
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { useAppStore, getNumberColor } from '@/store/app-store'
import { CASINO_CONFIGS, openCasino, getTableUrl } from '@/lib/casino-urls'

import { calculatePeakHistory, getCurrentPeak, parseNumberText, type PeakRecord as EnginePeakRecord } from '@/lib/peak-engine'
import { useRouletteCapturer } from '@/hooks/useRouletteCapturer'
import { generateSmartPrediction as generateSmartPredictionV4, recordPredictionFeedback, resetRecoveryHistory, type SmartPrediction as SmartPredictionV4, type BetType as BetTypeV4 } from '@/lib/smart-prediction-v4'

const BET_TYPE_OPTIONS = [
  { id: 'color', name: 'Colores (Rojo/Negro)', icon: '🎨' },
  { id: 'parity', name: 'Par/Impar', icon: '🔢' },
  { id: 'dozen', name: 'Docenas', icon: '📊' },
  { id: 'column', name: 'Columnas', icon: '📈' }
]

const MAX_PEAKS = 15

// Peak colors from green (low) to red (high)
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
  'bg-red-900',    // 15+
]

// Sound effects
const playSound = (type: 'success' | 'fail' | 'click' | 'signal') => {
  if (typeof window === 'undefined') return

  // 'signal' = 3 ascending tones (SKIP → SEÑAL alert)
  if (type === 'signal') {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const freqs = [660, 880, 1100]
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12)
        gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.12)
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.12 + 0.15)
        osc.start(ctx.currentTime + i * 0.12)
        osc.stop(ctx.currentTime + i * 0.12 + 0.15)
      })
    } catch (e) { /* audio not available */ }
    return
  }

  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    if (type === 'success') {
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime)
      oscillator.frequency.setValueAtTime(1100, audioContext.currentTime + 0.1)
    } else if (type === 'fail') {
      oscillator.frequency.setValueAtTime(300, audioContext.currentTime)
    } else {
      oscillator.frequency.setValueAtTime(600, audioContext.currentTime)
    }
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
    
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)
  } catch (e) {
    // Audio not available
  }
}

// Types
type BetType = 'color' | 'parity' | 'dozen' | 'column'
type BtDozenMode = 'single' | 'double'

interface BetPrediction {
  type: BetType
  value: string
}

interface SmartPrediction {
  type: BetType
  options: { value: string; label: string; confidence: number }[]
  bestValue: string
  bestConfidence: number
  shouldSkip?: boolean
  signalStrength?: number
  dealerSignal?: { targetNumber: number; reliability: number }
}

interface ImportPreview {
  numbers: number[]
  total: number
  red: number
  black: number
  green: number
}

type PeakLevel = 'low' | 'medium' | 'high'

// Advanced Backtesting V6.0 Results
interface AdvBacktestResults {
  totalSpins: number
  signals: number
  accuracy: number
  netProfit: number
  busts: number
  skips: number
  skipRate: number
  profitPerSignal: number
  profitPer100Spins: number
  roi: number
  maxDrawdown: number
  maxPeak: number
  totalPeaks: number
  martingalaCycles: number
  streaks: { maxWin: number; maxLoss: number }
  peakHistogram: { height: number; count: number }[]
  accuracyByWindow: { window: number; accuracy: number }[]
  profitCurve: { index: number; profit: number }[]
  isProfitable: boolean
}

export function DashboardLive() {
  const { setCurrentView, user, isAuthenticated, logout } = useAppStore()
  
  // Casino selection
  const [selectedCasino, setSelectedCasino] = useState(CASINO_CONFIGS[0].id)
  const [selectedTable, setSelectedTable] = useState(CASINO_CONFIGS[0].tables[0].id)
  const [selectedBetType, setSelectedBetType] = useState<BetType>('color')
  
  // Game state
  const [numbers, setNumbers] = useState<number[]>([])
  const [casinoWindow, setCasinoWindow] = useState<Window | null>(null)
  const [isJoined, setIsJoined] = useState(false)
  const [isCompactMode, setIsCompactMode] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  
  // Peak system state
  const [currentPeak, setCurrentPeak] = useState(1)
  const [currentPrediction, setCurrentPrediction] = useState<BetPrediction | null>(null)
  const [peakHistory, setPeakHistory] = useState<EnginePeakRecord[]>([])
  const [confidence, setConfidence] = useState(0)
  const [peakDozenMode, setPeakDozenMode] = useState<BtDozenMode>('single') // tracks single/double for peak recalc

  // Signal-only peak tracking (V6.0) — independent from general peak history
  // This ONLY records peaks when the engine gives an actual SEÑAL (not SKIP)
  const [signalPeak, setSignalPeak] = useState(1)
  const [signalPeakHistory, setSignalPeakHistory] = useState<EnginePeakRecord[]>([])
  const signalPeakRef = useRef(1)
  
  // UI state
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [showKeyboardHint, setShowKeyboardHint] = useState(true)
  
  // Import state
  const [importText, setImportText] = useState('')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  
  // Advanced Backtesting V6.0 state
  const [advBtSequence, setAdvBtSequence] = useState('')
  const [advBtAnalyzed, setAdvBtAnalyzed] = useState<{ total: number; red: number; black: number; green: number } | null>(null)
  const [advBtRunning, setAdvBtRunning] = useState(false)
  const [advBtResults, setAdvBtResults] = useState<AdvBacktestResults | null>(null)

  // Live smart prediction
  const [smartPrediction, setSmartPrediction] = useState<SmartPrediction | null>(null)
  // V6.0: Track engine skip status
  const [isEngineSkip, setIsEngineSkip] = useState(false)
  const isEngineSkipRef = useRef(false)
  useEffect(() => { isEngineSkipRef.current = isEngineSkip }, [isEngineSkip])

  // V6.0: Signal/Skip counter
  const [totalSignals, setTotalSignals] = useState(0)
  const [totalSkips, setTotalSkips] = useState(0)
  const totalSignalsRef = useRef(0)
  const totalSkipsRef = useRef(0)

  // V6.0: Helper - update engine skip status + counters + sound alert
  const updateEngineStatus = useCallback((shouldSkip: boolean) => {
    const wasSkip = isEngineSkipRef.current
    setIsEngineSkip(shouldSkip)
    if (shouldSkip) {
      totalSkipsRef.current++
      setTotalSkips(totalSkipsRef.current)
    } else {
      totalSignalsRef.current++
      setTotalSignals(totalSignalsRef.current)
      // Play ascending tone alert when transitioning from SKIP → SEÑAL
      if (wasSkip && soundEnabledRef.current) {
        playSound('signal')
      }
    }
  }, [])
  
  // Demo mode
  const [isDemoMode, setIsDemoMode] = useState(false)
  const demoIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  // Calculator / Bankroll Tracker state
  const [calcEnabled, setCalcEnabled] = useState(false)
  const [calcBankroll, setCalcBankroll] = useState<string>('100')
  const [calcBetAmount, setCalcBetAmount] = useState<string>('1')
  const [calcPeakLevel, setCalcPeakLevel] = useState<PeakLevel>('low')
  const calcHistoryRef = useRef<{ cycle: number; bets: { amount: number; result: 'win' | 'loss'; payout: number }[]; cycleProfit: number; entryPeak: number; runningBankroll: number }[]>([])
  const calcCyclesRef = useRef(0)
  const calcCurrentBetIndexRef = useRef(0)
  const calcCurrentCycleBetsRef = useRef<{ amount: number; result: 'win' | 'loss'; payout: number }[]>([])
  const calcCurrentCycleProfitRef = useRef(0)
  const calcCurrentCycleEntryPeakRef = useRef(0)
  const calcRunningBankrollRef = useRef(0)
  const calcIsActiveRef = useRef(false)
  const calcBetTypeRef = useRef<BetType>('color')
  const calcBetAmountRef = useRef<string>('1')
  const calcWaitNewCycleRef = useRef(false)
  const calcPeakLevelRef = useRef<PeakLevel>('low')
  const calcCycleActiveRef = useRef(false) // whether a cycle is actively being tracked
  const calcCyclePredictionRef = useRef<BetPrediction | null>(null) // fixed prediction for the entire cycle
  const calcDozenModeRef = useRef<BtDozenMode>('single')
  const calcStrategyRef = useRef<'martingala' | 'paroli'>('paroli')
  const calcParoliStreakRef = useRef(0) // tracks consecutive Paroli wins across cycles (0, 1, 2)
  const smartPredictionRef = useRef<SmartPrediction | null>(null)
  // Progression arrays: Martingala increases on loss, Paroli increases on win
  const MARTINGALA = [1, 2, 4]
  const PAROLI = [1, 2, 4]
  const MAX_CALC_BETS = 3
  const [calcDisplay, setCalcDisplay] = useState<{ cycles: typeof calcHistoryRef.current; runningBankroll: number; totalProfit: number; wins: number; losses: number; isActive: boolean; paroliStreak: number; nextBetMultiplier: number } | null>(null)

  // Helper: check if peak height is in the selected calculator range
  const isCalcPeakInRange = (h: number): boolean => {
    const pl = calcPeakLevelRef.current
    if (pl === 'low') return h >= 1 && h <= 3
    if (pl === 'medium') return h >= 4 && h <= 6
    return h >= 7
  }

  // Helper: get a human-readable label for the current peak bet type
  const getPeakBetTypeLabel = useCallback((bt: BetType, dm: BtDozenMode): string => {
    const labels: Record<string, string> = {
      color: 'Color (R/N)',
      parity: 'Par/Impar',
      dozen: dm === 'double' ? '2 Docenas' : '1 Docena',
      column: dm === 'double' ? '2 Columnas' : '1 Columna'
    }
    return labels[bt] || bt
  }, [])

  // Reset calculator
  const resetCalculator = useCallback(() => {
    const bankroll = parseFloat(calcBankroll) || 100
    calcBetAmountRef.current = calcBetAmount
    calcPeakLevelRef.current = calcPeakLevel
    calcHistoryRef.current = []
    calcCyclesRef.current = 0
    calcCurrentBetIndexRef.current = 0
    calcCurrentCycleBetsRef.current = []
    calcCurrentCycleProfitRef.current = 0
    calcCurrentCycleEntryPeakRef.current = 0
    calcRunningBankrollRef.current = bankroll
    calcIsActiveRef.current = calcEnabled
    calcBetTypeRef.current = selectedBetTypeRef.current
    calcWaitNewCycleRef.current = false
    calcCycleActiveRef.current = false
    calcCyclePredictionRef.current = null
    calcParoliStreakRef.current = 0
    setCalcDisplay({
      cycles: [],
      runningBankroll: bankroll,
      totalProfit: 0,
      wins: 0,
      losses: 0,
      isActive: calcEnabled,
      paroliStreak: 0,
      nextBetMultiplier: 1
    })
  }, [calcBankroll, calcEnabled, calcBetAmount, calcPeakLevel])

  // Toggle calculator
  const toggleCalculator = useCallback(() => {
    setCalcEnabled(prev => {
      const next = !prev
      if (next) {
        calcBetAmountRef.current = calcBetAmount
        calcPeakLevelRef.current = calcPeakLevel
        const bankroll = parseFloat(calcBankroll) || 100
        calcHistoryRef.current = []
        calcCyclesRef.current = 0
        calcCurrentBetIndexRef.current = 0
        calcCurrentCycleBetsRef.current = []
        calcCurrentCycleProfitRef.current = 0
        calcCurrentCycleEntryPeakRef.current = 0
        calcRunningBankrollRef.current = bankroll
        calcIsActiveRef.current = true
        calcBetTypeRef.current = selectedBetTypeRef.current
        calcWaitNewCycleRef.current = false
        calcCycleActiveRef.current = false
        calcCyclePredictionRef.current = null
        calcParoliStreakRef.current = 0
        setCalcDisplay({
          cycles: [],
          runningBankroll: bankroll,
          totalProfit: 0,
          wins: 0,
          losses: 0,
          isActive: true,
          paroliStreak: 0,
          nextBetMultiplier: 1
        })
      } else {
        calcIsActiveRef.current = false
        setCalcDisplay(prev => prev ? { ...prev, isActive: false } : null)
      }
      return next
    })
  }, [calcBankroll, calcBetAmount, calcPeakLevel])
  
  // Refs for callback access
  const numbersRef = useRef<number[]>([])
  const soundEnabledRef = useRef(true)
  const currentPredictionRef = useRef<BetPrediction | null>(null)
  const currentPeakRef = useRef(1)
  const selectedBetTypeRef = useRef<BetType>('color')

  // Keep refs in sync
  useEffect(() => {
    numbersRef.current = numbers
  }, [numbers])
  
  useEffect(() => {
    soundEnabledRef.current = soundEnabled
  }, [soundEnabled])
  
  useEffect(() => {
    currentPredictionRef.current = currentPrediction
  }, [currentPrediction])
  
  useEffect(() => {
    currentPeakRef.current = currentPeak
  }, [currentPeak])

  useEffect(() => {
    signalPeakRef.current = signalPeak
  }, [signalPeak])
  
  useEffect(() => {
    selectedBetTypeRef.current = selectedBetType
  }, [selectedBetType])
  
  useEffect(() => {
    smartPredictionRef.current = smartPrediction
  }, [smartPrediction])

  // Get current casino config
  const currentCasino = CASINO_CONFIGS.find(c => c.id === selectedCasino)
  const currentTable = currentCasino?.tables.find(t => t.id === selectedTable)

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentView('landing')
    }
  }, [isAuthenticated, setCurrentView])

  // Calculate advanced statistics from numbers
  const calculateStats = useCallback((nums: number[]) => {
    const stats = {
      red: 0, black: 0, green: 0,
      odd: 0, even: 0,
      dozen1: 0, dozen2: 0, dozen3: 0,
      col1: 0, col2: 0, col3: 0,
      // Advanced stats
      lastRedStreak: 0,
      lastBlackStreak: 0,
      lastOddStreak: 0,
      lastEvenStreak: 0,
      lastDozen1Streak: 0,
      lastDozen2Streak: 0,
      lastDozen3Streak: 0,
      lastCol1Streak: 0,
      lastCol2Streak: 0,
      lastCol3Streak: 0,
      redStreaks: [] as number[],
      blackStreaks: [] as number[],
      hotNumbers: new Map<number, number>(),
      coldNumbers: new Map<number, number>()
    }
    
    // Initialize all numbers as cold
    for (let i = 0; i <= 36; i++) {
      stats.coldNumbers.set(i, 0)
    }
    
    nums.forEach((num, index) => {
      const color = getNumberColor(num)
      if (color === 'red') {
        stats.red++
        stats.lastRedStreak++
        stats.lastBlackStreak = 0
        stats.redStreaks.push(stats.lastRedStreak)
      } else if (color === 'black') {
        stats.black++
        stats.lastBlackStreak++
        stats.lastRedStreak = 0
        stats.blackStreaks.push(stats.lastBlackStreak)
      } else {
        stats.green++
        stats.lastRedStreak = 0
        stats.lastBlackStreak = 0
      }
      
      if (num !== 0) {
        if (num % 2 === 0) {
          stats.even++
          stats.lastEvenStreak++
          stats.lastOddStreak = 0
        } else {
          stats.odd++
          stats.lastOddStreak++
          stats.lastEvenStreak = 0
        }
        
        const dozen = num <= 12 ? 1 : num <= 24 ? 2 : 3
        if (dozen === 1) { stats.dozen1++; stats.lastDozen1Streak++; stats.lastDozen2Streak = 0; stats.lastDozen3Streak = 0 }
        else if (dozen === 2) { stats.dozen2++; stats.lastDozen2Streak++; stats.lastDozen1Streak = 0; stats.lastDozen3Streak = 0 }
        else { stats.dozen3++; stats.lastDozen3Streak++; stats.lastDozen1Streak = 0; stats.lastDozen2Streak = 0 }
        
        const col = num % 3 === 0 ? 3 : num % 3
        if (col === 1) { stats.col1++; stats.lastCol1Streak++; stats.lastCol2Streak = 0; stats.lastCol3Streak = 0 }
        else if (col === 2) { stats.col2++; stats.lastCol2Streak++; stats.lastCol1Streak = 0; stats.lastCol3Streak = 0 }
        else { stats.col3++; stats.lastCol3Streak++; stats.lastCol1Streak = 0; stats.lastCol2Streak = 0 }
      }
      
      // Track hot numbers (last 20 spins)
      if (index >= nums.length - 20) {
        stats.hotNumbers.set(num, (stats.hotNumbers.get(num) || 0) + 1)
      }
      
      // Track cold numbers
      stats.coldNumbers.set(num, (stats.coldNumbers.get(num) || 0) + 1)
    })
    
    return stats
  }, [])

  // ============================================
  // SISTEMA DE PREDICCIÓN AVANZADO V6.0 Ultra-Selective + Streak-Aware Filtering
  // Motor externalizado en smart-prediction-v4.ts
  // V6.0: Consensus Markov (3w), SKIP ZONE (streaks 3-6),
  // ULTRA SELECT (streaks 7+), Cooldown System, Payout fix
  // Validado: 57% accuracy, +94-98 neto, 0 busts en 9,600 spins
  // ============================================
  const generateSmartPrediction = useCallback((nums: number[], betType: BetType): SmartPrediction => {
    // Delegate to V6.0 engine (pure function, no React deps needed)
    return generateSmartPredictionV4(nums, betType as BetTypeV4)
  }, [])

  // Legacy wrapper for live system compatibility
  const generatePrediction = useCallback((nums: number[], betType: BetType): BetPrediction => {
    const smart = generateSmartPrediction(nums, betType)
    return { type: smart.type, value: smart.bestValue }
  }, [generateSmartPrediction])

  // Check if a number matches a prediction
  const checkPredictionMatch = useCallback((prediction: BetPrediction, number: number): boolean => {
    switch (prediction.type) {
      case 'color': {
        const color = getNumberColor(number)
        return color === prediction.value
      }
      case 'parity': {
        if (number === 0) return false
        const isEven = number % 2 === 0
        return (isEven && prediction.value === 'even') || (!isEven && prediction.value === 'odd')
      }
      case 'dozen': {
        if (number === 0) return false
        if (prediction.value === '1-12') return number <= 12
        if (prediction.value === '13-24') return number > 12 && number <= 24
        if (prediction.value === '25-36') return number > 24
        return false
      }
      case 'column': {
        if (number === 0) return false
        const col = number % 3
        if (prediction.value === '1') return col === 1
        if (prediction.value === '2') return col === 2
        if (prediction.value === '3') return col === 0
        return false
      }
      default:
        return false
    }
  }, [])

  // Helper: build peak calculation options based on current bet type and dozen mode
  // (placed after generateSmartPrediction and checkPredictionMatch to avoid "used before declaration")
  const getPeakCalcOptions = useCallback((bt: BetType, dm: BtDozenMode) => {
    const predict = (nums: number[]): { type: string; value: string; extraValues?: string[] } | null => {
      if (nums.length < 5) return null
      const smart = generateSmartPrediction(nums, bt)
      const isDouble = (bt === 'dozen' || bt === 'column') && dm === 'double'
      const extraValues = isDouble && smart.options.length >= 2
        ? [smart.options[1].value]
        : undefined
      return { type: smart.type, value: smart.bestValue, extraValues }
    }
    const match = (pred: { type: string; value: string; extraValues?: string[] }, num: number): boolean => {
      const values = [pred.value, ...(pred.extraValues || [])]
      return values.some(v => checkPredictionMatch({ type: pred.type as BetType, value: v }, num))
    }
    return { getPrediction: predict, matchFn: match }
  }, [generateSmartPrediction, checkPredictionMatch])

  // Calculator helpers
  const updateCalcDisplay = useCallback(() => {
    const allWins = calcHistoryRef.current.reduce((s, c) => s + c.bets.filter(b => b.result === 'win').length, 0)
    const allLosses = calcHistoryRef.current.reduce((s, c) => s + c.bets.filter(b => b.result === 'loss').length, 0)
    const totalProfit = calcHistoryRef.current.reduce((s, c) => s + c.cycleProfit, 0)
    const strategy = calcStrategyRef.current
    const paroliStreak = calcParoliStreakRef.current
    const nextBetMultiplier = strategy === 'paroli'
      ? PAROLI[Math.min(paroliStreak, PAROLI.length - 1)]
      : MARTINGALA[calcCurrentBetIndexRef.current] || MARTINGALA[MARTINGALA.length - 1]
    setCalcDisplay({
      cycles: [...calcHistoryRef.current],
      runningBankroll: calcRunningBankrollRef.current,
      totalProfit,
      wins: allWins,
      losses: allLosses,
      isActive: true,
      paroliStreak,
      nextBetMultiplier
    })
  }, [])

  const resetCalcCycle = useCallback(() => {
    calcCurrentBetIndexRef.current = 0
    calcCurrentCycleBetsRef.current = []
    calcCurrentCycleProfitRef.current = 0
    calcCurrentCycleEntryPeakRef.current = 1
  }, [])

  // Handle number input
  const handleNumberInput = useCallback((num: number, fromDemo = false) => {
    if (soundEnabledRef.current && !fromDemo) playSound('click')
    
    // Add number to history
    const newNumbers = [...numbersRef.current, num]
    setNumbers(newNumbers)
    
    // Get current prediction (generate if needed) - MINIMO 5 NUMEROS
    let prediction = currentPredictionRef.current
    
    if (!prediction && newNumbers.length >= 5) {
      // Generate smart prediction — V6.0 single source of truth
      const smart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
      setSmartPrediction(smart)
      updateEngineStatus(smart.shouldSkip === true)
      prediction = { type: smart.type, value: smart.bestValue }
      setCurrentPrediction(prediction)
      setConfidence(Math.min(85, smart.bestConfidence))
    }
    
    // Check if we have a prediction to verify
    if (prediction) {
      // V6.0: If engine says SKIP, don't count this for peaks/calculator
      if (isEngineSkipRef.current) {
        // SKIP mode: generate new prediction but don't track peak
        if (newNumbers.length >= 5) {
          const newSmart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
          setSmartPrediction(newSmart)
          updateEngineStatus(newSmart.shouldSkip === true)
          setCurrentPrediction({ type: newSmart.type, value: newSmart.bestValue })
          setConfidence(Math.min(85, newSmart.bestConfidence))
        }
        return
      }
      // In double dozen/column mode, check against top 2 predictions
      const isDoubleBet = (selectedBetTypeRef.current === 'dozen' || selectedBetTypeRef.current === 'column') && calcDozenModeRef.current === 'double'
      const sp = smartPredictionRef.current
      let matched: boolean
      if (isDoubleBet && sp && sp.options.length >= 2) {
        matched = sp.options.slice(0, 2).some(opt => checkPredictionMatch({ type: selectedBetTypeRef.current, value: opt.value }, num))
      } else {
        matched = checkPredictionMatch(prediction, num)
      }
      const currentPeakValue = currentPeakRef.current
      
      if (matched) {
        // SUCCESS! Record the peak and reset
        if (soundEnabledRef.current) playSound('success')
        
        const peakRecord: EnginePeakRecord = {
          id: Date.now().toString(),
          height: currentPeakValue,
          prediction: { type: prediction.type, value: prediction.value },
          resultNumber: num,
          resultColor: getNumberColor(num),
          timestamp: new Date()
        }
        
        // Add to general history
        setPeakHistory(prev => [...prev, peakRecord])

        // === SIGNAL-ONLY PEAK TRACKING (V6.0) ===
        // This code only runs when engine is NOT in SKIP mode (line 637 returns early if skip)
        const signalPeakValue = signalPeakRef.current
        const signalPeakRecord: EnginePeakRecord = {
          id: `sig-${Date.now().toString()}`,
          height: signalPeakValue,
          prediction: { type: prediction.type, value: prediction.value },
          resultNumber: num,
          resultColor: getNumberColor(num),
          timestamp: new Date()
        }
        setSignalPeakHistory(prev => [...prev, signalPeakRecord])
        setSignalPeak(1)
        signalPeakRef.current = 1
        
        // === CALCULATOR TRACKING ===
        if (calcIsActiveRef.current) {
          if (isCalcPeakInRange(currentPeakValue)) {
            // Peak was in selected range — this win is a valid bet
            // Start cycle if not already active — lock the current prediction
            if (!calcCycleActiveRef.current) {
              calcCycleActiveRef.current = true
              calcCurrentCycleEntryPeakRef.current = currentPeakValue
              calcCyclePredictionRef.current = prediction // lock prediction for this cycle
            }

            const betAmount = parseFloat(calcBetAmountRef.current) || 1
            const bt = calcBetTypeRef.current
            const isFlatBet = bt === 'color' || bt === 'parity'
            const isDoubleCalc = !isFlatBet && calcDozenModeRef.current === 'double'
            const strategy = calcStrategyRef.current
            const betIdx = calcCurrentBetIndexRef.current
            const progression = strategy === 'paroli' ? PAROLI : MARTINGALA
            const mult = progression[betIdx] || progression[progression.length - 1]
            const singleBet = betAmount * mult
            const totalBet = isDoubleCalc ? singleBet * 2 : singleBet
            // Payout: color/parity pay 1:1, dozen/column pay 2:1
            const payoutPerWin = isFlatBet ? singleBet : singleBet * 2
            const losingCost = isDoubleCalc ? singleBet : 0
            const payout = payoutPerWin - losingCost

            calcCurrentCycleBetsRef.current.push({ amount: totalBet, result: 'win', payout })
            calcCurrentCycleProfitRef.current += payout
            calcRunningBankrollRef.current += payout

            if (strategy === 'paroli') {
              // Paroli: WIN — increment streak, carry multiplier to next cycle
              calcParoliStreakRef.current++
              const completedParoli = calcParoliStreakRef.current >= MAX_CALC_BETS
              if (completedParoli) {
                // Completed 3-win cycle — collect full Paroli, reset to base
                calcParoliStreakRef.current = 0
              }
              calcCyclesRef.current++
              calcHistoryRef.current.push({
                cycle: calcCyclesRef.current,
                bets: [...calcCurrentCycleBetsRef.current],
                cycleProfit: calcCurrentCycleProfitRef.current,
                entryPeak: calcCurrentCycleEntryPeakRef.current,
                runningBankroll: calcRunningBankrollRef.current
              })
              updateCalcDisplay()
              resetCalcCycle()
              // Carry streak forward — set bet index for next cycle
              if (!completedParoli && calcParoliStreakRef.current > 0) {
                calcCurrentBetIndexRef.current = calcParoliStreakRef.current
              }
              calcCycleActiveRef.current = false
              calcCyclePredictionRef.current = null
            } else {
              // Martingala: WIN completes the cycle (reset bet index)
              calcCyclesRef.current++
              calcHistoryRef.current.push({
                cycle: calcCyclesRef.current,
                bets: [...calcCurrentCycleBetsRef.current],
                cycleProfit: calcCurrentCycleProfitRef.current,
                entryPeak: calcCurrentCycleEntryPeakRef.current,
                runningBankroll: calcRunningBankrollRef.current
              })
              updateCalcDisplay()
              resetCalcCycle()
              calcCycleActiveRef.current = false
              calcCyclePredictionRef.current = null
            }
          } else {
            // Peak out of range — close partial cycle if any, wait for next in-range peak
            if (calcCycleActiveRef.current) {
              // Had an active cycle that went out of range — save partial as loss
              calcCyclesRef.current++
              calcHistoryRef.current.push({
                cycle: calcCyclesRef.current,
                bets: [...calcCurrentCycleBetsRef.current],
                cycleProfit: calcCurrentCycleProfitRef.current,
                entryPeak: calcCurrentCycleEntryPeakRef.current,
                runningBankroll: calcRunningBankrollRef.current
              })
              updateCalcDisplay()
            }
            resetCalcCycle()
            calcCycleActiveRef.current = false
            calcCyclePredictionRef.current = null
          }
        }

        // Reset peak to 1
        setCurrentPeak(1)
        
        // Generate new prediction for next round - V6.0 single source of truth
        if (newNumbers.length >= 5) {
          const newSmart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
          setSmartPrediction(newSmart)
          updateEngineStatus(newSmart.shouldSkip === true)
          setCurrentPrediction({ type: newSmart.type, value: newSmart.bestValue })
          setConfidence(Math.min(85, newSmart.bestConfidence))
        }
      } else {
        // FAILED - increment peak
        if (soundEnabledRef.current) playSound('fail')
        
        const newPeak = currentPeakValue + 1
        setCurrentPeak(newPeak)

        // === SIGNAL-ONLY PEAK TRACKING (V6.0) ===
        const newSignalPeak = signalPeakRef.current + 1
        setSignalPeak(newSignalPeak)
        signalPeakRef.current = newSignalPeak

        // === CALCULATOR TRACKING ===
        if (calcIsActiveRef.current) {
          if (isCalcPeakInRange(currentPeakValue)) {
            // Peak is in range — we placed a bet here, it lost
            // Start cycle if not already active — lock the current prediction
            if (!calcCycleActiveRef.current) {
              calcCycleActiveRef.current = true
              calcCurrentCycleEntryPeakRef.current = currentPeakValue
              calcCyclePredictionRef.current = prediction // lock prediction for this cycle
            }

            const betAmount = parseFloat(calcBetAmountRef.current) || 1
            const bt = calcBetTypeRef.current
            const isFlatBet = bt === 'color' || bt === 'parity'
            const isDoubleCalc = !isFlatBet && calcDozenModeRef.current === 'double'
            const strategy = calcStrategyRef.current
            const betIdx = calcCurrentBetIndexRef.current
            const progression = strategy === 'paroli' ? PAROLI : MARTINGALA
            const mult = progression[betIdx] || progression[progression.length - 1]
            const singleBet = betAmount * mult
            const totalBet = isDoubleCalc ? singleBet * 2 : singleBet

            calcCurrentCycleBetsRef.current.push({ amount: totalBet, result: 'loss', payout: 0 })
            calcCurrentCycleProfitRef.current -= totalBet
            calcRunningBankrollRef.current -= totalBet

            if (strategy === 'paroli') {
              // Paroli: LOSS — reset streak to 0, back to base bet
              calcParoliStreakRef.current = 0
              calcCyclesRef.current++
              calcHistoryRef.current.push({
                cycle: calcCyclesRef.current,
                bets: [...calcCurrentCycleBetsRef.current],
                cycleProfit: calcCurrentCycleProfitRef.current,
                entryPeak: calcCurrentCycleEntryPeakRef.current,
                runningBankroll: calcRunningBankrollRef.current
              })
              updateCalcDisplay()
              resetCalcCycle()
              calcCycleActiveRef.current = false
              calcCyclePredictionRef.current = null
            } else {
              // Martingala: LOSS increases bet index
              calcCurrentBetIndexRef.current++

              // Close cycle if reached max bets (3)
              if (calcCurrentBetIndexRef.current >= MAX_CALC_BETS) {
                calcCyclesRef.current++
                calcHistoryRef.current.push({
                  cycle: calcCyclesRef.current,
                  bets: [...calcCurrentCycleBetsRef.current],
                  cycleProfit: calcCurrentCycleProfitRef.current,
                  entryPeak: calcCurrentCycleEntryPeakRef.current,
                  runningBankroll: calcRunningBankrollRef.current
                })

                updateCalcDisplay()
                resetCalcCycle()
                calcCycleActiveRef.current = false
                calcCyclePredictionRef.current = null
              } else {
                // Still in cycle, update display
                const allWins = calcHistoryRef.current.reduce((s, c) => s + c.bets.filter(b => b.result === 'win').length, 0)
                const allLosses = calcHistoryRef.current.reduce((s, c) => s + c.bets.filter(b => b.result === 'loss').length, 0) + calcCurrentCycleBetsRef.current.filter(b => b.result === 'loss').length
                const totalProfit = calcHistoryRef.current.reduce((s, c) => s + c.cycleProfit, 0) + calcCurrentCycleProfitRef.current
                setCalcDisplay({
                  cycles: [...calcHistoryRef.current, {
                    cycle: calcCyclesRef.current + 1,
                    bets: [...calcCurrentCycleBetsRef.current],
                    cycleProfit: calcCurrentCycleProfitRef.current,
                    entryPeak: calcCurrentCycleEntryPeakRef.current,
                    runningBankroll: calcRunningBankrollRef.current
                  }],
                  runningBankroll: calcRunningBankrollRef.current,
                  totalProfit,
                  wins: allWins,
                  losses: allLosses,
                  isActive: true,
                  paroliStreak: calcParoliStreakRef.current,
                  nextBetMultiplier: MARTINGALA[calcCurrentBetIndexRef.current] || MARTINGALA[MARTINGALA.length - 1]
                })
              }
            }
          } else {
            // Peak out of range — no bet was placed
            // If we had an active cycle, close it (peak went out of range)
            if (calcCycleActiveRef.current) {
              calcCyclesRef.current++
              calcHistoryRef.current.push({
                cycle: calcCyclesRef.current,
                bets: [...calcCurrentCycleBetsRef.current],
                cycleProfit: calcCurrentCycleProfitRef.current,
                entryPeak: calcCurrentCycleEntryPeakRef.current,
                runningBankroll: calcRunningBankrollRef.current
              })
              updateCalcDisplay()
              resetCalcCycle()
              calcCycleActiveRef.current = false
              calcCyclePredictionRef.current = null
            }
          }
        }
        
        // Generate new prediction at each peak - V6.0 single source of truth
        if (newNumbers.length >= 5) {
          const newSmart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
          setSmartPrediction(newSmart)
          updateEngineStatus(newSmart.shouldSkip === true)
          setCurrentPrediction({ type: newSmart.type, value: newSmart.bestValue })
          setConfidence(Math.min(85, newSmart.bestConfidence))
        }
      }
    }
  }, [generatePrediction, generateSmartPrediction, checkPredictionMatch, calculateStats])

  // Start demo mode
  const startDemoMode = useCallback(() => {
    setIsDemoMode(true)
    
    demoIntervalRef.current = setInterval(() => {
      const num = Math.floor(Math.random() * 37)
      handleNumberInput(num, true)
    }, 3000)
  }, [handleNumberInput])

  // Stop demo mode
  const stopDemoMode = useCallback(() => {
    setIsDemoMode(false)
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current)
      demoIntervalRef.current = null
    }
  }, [])

  // Ref to keep latest handleNumberInput accessible from capturer callbacks
  const handleNumberInputRef = useRef(handleNumberInput)
  useEffect(() => { handleNumberInputRef.current = handleNumberInput }, [handleNumberInput])

  // Auto Capture — polls /api/capture/latest for numbers sent by the Tampermonkey userscript
  const [isAutoCapture, setIsAutoCapture] = useState(false)

  const {
    isConnected: capturerConnected,
    isCapturing: capturerActive,
    totalCaptured: capturerTotal,
    connect: capturerConnect,
    disconnect: capturerDisconnect,
    startCapture: capturerStart,
    stopCapture: capturerStop,
  } = useRouletteCapturer({
    onNumberDetected: (captured) => {
      handleNumberInputRef.current(captured.number)
    },
    onCaptureError: (err) => {
      console.error('[AutoCapture] Error:', err)
    }
  })

  // Toggle auto capture — simple on/off, no Socket.IO needed
  const toggleAutoCapture = useCallback(() => {
    if (isAutoCapture) {
      capturerStop()
      capturerDisconnect()
      setIsAutoCapture(false)
    } else {
      capturerConnect()
      setIsAutoCapture(true)
    }
  }, [isAutoCapture, capturerConnect, capturerDisconnect, capturerStop])

  // Handle join table
  const handleJoinTable = useCallback(() => {
    const newWindow = openCasino(selectedCasino, selectedTable)
    setCasinoWindow(newWindow)
    setIsJoined(true)
    
    localStorage.setItem('currentSession', JSON.stringify({
      casino: selectedCasino,
      table: selectedTable,
      tableUrl: getTableUrl(selectedCasino, selectedTable),
      startedAt: new Date().toISOString()
    }))
  }, [selectedCasino, selectedTable])

  // Copy casino URL
  const handleCopyUrl = useCallback(() => {
    const url = getTableUrl(selectedCasino, selectedTable)
    navigator.clipboard.writeText(url)
    setCopiedUrl(true)
    setTimeout(() => setCopiedUrl(false), 2000)
  }, [selectedCasino, selectedTable])

  // Clear all data
  const handleClear = useCallback(() => {
    setNumbers([])
    numbersRef.current = []
    setPeakHistory([])
    setCurrentPeak(1)
    currentPeakRef.current = 1
    // Reset signal-only peak tracking
    setSignalPeakHistory([])
    setSignalPeak(1)
    signalPeakRef.current = 1
    setCurrentPrediction(null)
    currentPredictionRef.current = null
    setConfidence(0)
    setIsEngineSkip(false)
    isEngineSkipRef.current = false
    // Reset signal/skip counters on clear
    totalSignalsRef.current = 0
    totalSkipsRef.current = 0
    setTotalSignals(0)
    setTotalSkips(0)
    setSmartPrediction(null)
  }, [])

  // Leave table
  const handleLeaveTable = useCallback(() => {
    if (casinoWindow && !casinoWindow.closed) {
      casinoWindow.close()
    }
    setCasinoWindow(null)
    setIsJoined(false)
    stopDemoMode()
    handleClear()
    localStorage.removeItem('currentSession')
  }, [casinoWindow, stopDemoMode, handleClear])

  // Logout
  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/me', { method: 'DELETE' })
      handleLeaveTable()
      logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }, [handleLeaveTable, logout])

  // Handle analyze import - only parse and preview, no backtesting
  const handleAnalyzeImport = useCallback(() => {
    if (!importText.trim()) return
    const parsed = importText.replace(/[,\n\t;|]/g, ' ').split(/\s+/).map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 36)
    if (parsed.length === 0) return
    const red = parsed.filter(n => getNumberColor(n) === 'red').length
    const black = parsed.filter(n => getNumberColor(n) === 'black').length
    const green = parsed.filter(n => getNumberColor(n) === 'green').length
    setImportPreview({ numbers: parsed, total: parsed.length, red, black, green })
  }, [importText])

  // Handle apply import - load numbers into panel and calculate historical peaks
  const handleApplyImport = useCallback(() => {
    if (!importPreview) return
    const newNumbers = importPreview.numbers
    setNumbers(newNumbers)
    numbersRef.current = newNumbers
    setCurrentPeak(1)
    currentPeakRef.current = 1
    // Reset signal-only peak tracking on import (signals are live-only)
    setSignalPeakHistory([])
    setSignalPeak(1)
    signalPeakRef.current = 1
    setCurrentPrediction(null)
    currentPredictionRef.current = null
    setConfidence(0)
    // Recalculate general peak history from ALL imported numbers (includes SKIP peaks)
    if (newNumbers.length >= 6) {
      const peakOpts = getPeakCalcOptions(selectedBetTypeRef.current, calcDozenModeRef.current)
      const historicalPeaks = calculatePeakHistory(newNumbers, peakOpts)
      setPeakHistory(historicalPeaks)
    } else {
      setPeakHistory([])
    }

    console.log('[DashboardLive] Import:', newNumbers.length, 'numbers loaded. General peaks recalculated.')
    
    if (newNumbers.length >= 5) {
      const smart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
      setSmartPrediction(smart)
      const pred = { type: smart.type, value: smart.bestValue }
      setCurrentPrediction(pred)  // Visual display only
      // DO NOT set currentPredictionRef.current — import prediction must NOT
      // be used for live peak tracking (causes phantom peaks without signal count)
      setConfidence(Math.min(85, smart.bestConfidence))
      // Only show skip state, do NOT count — counters start from first LIVE number
      setIsEngineSkip(smart.shouldSkip === true)
      // Also sync the ref directly to avoid timing gap with useEffect
      isEngineSkipRef.current = smart.shouldSkip === true
    } else {
      setCurrentPrediction(null)
      currentPredictionRef.current = null
    }
    setIsJoined(true)
    setImportDialogOpen(false)
    setImportText('')
    setImportPreview(null)
  }, [importPreview, generatePrediction, calculateStats, getPeakCalcOptions])

  // Recalculate peaks when bet type or dozen mode changes (keeps peak history consistent)
  useEffect(() => {
    const nums = numbersRef.current
    if (nums.length >= 6) {
      const peakOpts = getPeakCalcOptions(selectedBetTypeRef.current, calcDozenModeRef.current)
      const historicalPeaks = calculatePeakHistory(nums, peakOpts)
      setPeakHistory(historicalPeaks)
      // Reset current peak and prediction when bet type changes
      setCurrentPeak(1)
      currentPeakRef.current = 1
      // Also reset signal-only peak tracking
      setSignalPeakHistory([])
      setSignalPeak(1)
      signalPeakRef.current = 1
      setCurrentPrediction(null)
      currentPredictionRef.current = null
      setConfidence(0)
      // Generate new prediction for the current bet type
      if (nums.length >= 5) {
        const smart = generateSmartPrediction(nums, selectedBetTypeRef.current)
        setSmartPrediction(smart)
        const pred = { type: smart.type, value: smart.bestValue }
        setCurrentPrediction(pred)
        currentPredictionRef.current = pred
        setConfidence(Math.min(85, smart.bestConfidence))
      }
    }
  }, [selectedBetType, peakDozenMode, getPeakCalcOptions, generateSmartPrediction])

  // ════════════════════════════════════════════════════════════════
  // ADVANCED BACKTESTING V6.0 — Motor V6.0 Full Simulation
  // ════════════════════════════════════════════════════════════════

  // Parse pasted sequence into numbers
  const parseAdvBtSequence = useCallback((text: string): number[] => {
    return text
      .split(/[,\s\n\r;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => parseInt(s, 10))
      .filter(n => !isNaN(n) && n >= 0 && n <= 36)
  }, [])

  // Analyze sequence preview
  const handleAdvBtAnalyze = useCallback(() => {
    const nums = parseAdvBtSequence(advBtSequence)
    if (nums.length === 0) return
    let red = 0, black = 0, green = 0
    nums.forEach(n => {
      const c = getNumberColor(n)
      if (c === 'red') red++
      else if (c === 'black') black++
      else green++
    })
    setAdvBtAnalyzed({ total: nums.length, red, black, green })
    setAdvBtResults(null)
  }, [advBtSequence, parseAdvBtSequence])

  // ════════════════════════════════════════════════════════════════
  // ADVANCED BACKTESTING V6.0 — Motor V6.0 Full Simulation
  // Faithfully replicates simulate-v60.ts logic inline in React
  // ════════════════════════════════════════════════════════════════
  const handleAdvBtRun = useCallback(() => {
    const nums = parseAdvBtSequence(advBtSequence)
    if (nums.length < 10) return

    setAdvBtRunning(true)
    setAdvBtResults(null)

    setTimeout(() => {
      try {
        // Reset engine state so predictions are clean
        resetRecoveryHistory()

        const MIN_HISTORY = 10
        const MARTINGALA = [1, 2, 4]
        const MAX_MART = MARTINGALA.length // 3
        const BASE_BET = 1
        const COOLDOWN_AFTER_LOSS = 1
        const COOLDOWN_AFTER_BUST = 3
        const COOLDOWN_AFTER_GREEN = 1

        // Simulation counters
        let signals = 0
        let wins = 0
        let losses = 0
        let busts = 0
        let greenCount = 0
        let totalSkips = 0
        let totalProcessed = 0

        // Profit tracking
        let runningProfit = 0
        let peakRunningProfit = 0
        let maxDrawdown = 0

        // Martingala state
        let martingalaStep = 0

        // Cooldown
        let cooldownRemaining = 0

        // Peak tracking (only on SIGNAL bets, not SKIP)
        let currentPeakHeight = 0
        const peakHeights: number[] = []
        // maxPeak computed from peakHeights at end (per simulate-v60.ts)
        // totalPeaks derived from peakHeights.length (matches simulate-v60.ts)
        // martingalaCycles derived from peakHeights.length

        // Streak tracking
        let maxWinStreak = 0
        let maxLossStreak = 0
        let currentWinStreak = 0
        let currentLossStreak = 0

        // Data for charts
        const profitCurve: { index: number; profit: number }[] = []
        const signalResults: { signal: number; win: boolean }[] = []

        // ═══ SINGLE PASS SIMULATION ═══
        // At each step i: use nums[0..i-1] as history, nums[i] is the actual result
        for (let i = MIN_HISTORY; i < nums.length; i++) {
          const history = nums.slice(0, i)     // numbers before the result
          const nextNumber = nums[i]            // the actual spin result
          totalProcessed++

          // 1. Check cooldown first (priority over engine skip)
          if (cooldownRemaining > 0) {
            cooldownRemaining--
            totalSkips++
            // Cooldown does NOT reset martingala, does NOT advance peak
            continue
          }

          // 2. Generate prediction using Motor V6.0
          const pred = generateSmartPrediction(history, 'color' as BetTypeV4)
          if (!pred.bestValue) continue

          // 3. Check engine SKIP ZONE
          if (pred.shouldSkip === true) {
            totalSkips++
            // Engine SKIP: resets martingala, does NOT advance peak, does NOT count as signal
            martingalaStep = 0
            // Note: currentPeakHeight is NOT reset on skip (per simulate-v60.ts)
            continue
          }

          // ═══ THIS IS A SIGNAL — we bet ═══
          signals++
          const predictedColor = pred.bestValue
          const actualColor = getNumberColor(nextNumber)
          const betMult = MARTINGALA[Math.min(martingalaStep, MAX_MART - 1)]

          // 4. Handle GREEN (0) — special loss
          if (actualColor === 'green') {
            greenCount++
            runningProfit -= BASE_BET * betMult
            martingalaStep++

            // Green = loss for streaks
            currentLossStreak++
            currentWinStreak = 0
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak

            // Check bust
            if (martingalaStep >= MAX_MART) {
              busts++
              // NOTE: Bust does NOT record a peak, does NOT reset currentPeakHeight (per simulate-v60.ts)
              signalResults.push({ signal: signals, win: false })
              profitCurve.push({ index: i, profit: runningProfit })
              martingalaStep = 0
              currentLossStreak = 0
              cooldownRemaining = COOLDOWN_AFTER_BUST
            } else {
              cooldownRemaining = COOLDOWN_AFTER_GREEN
            }

            // Drawdown check
            if (runningProfit < peakRunningProfit) {
              const dd = peakRunningProfit - runningProfit
              if (dd > maxDrawdown) maxDrawdown = dd
            }

            // Feedback to engine
            recordPredictionFeedback(false, ['markov'], predictedColor)
            continue
          }

          // 5. Check WIN (predicted color matches actual)
          if (predictedColor === actualColor) {
            wins++

            // Profit: for color (even money 1:1), win profit = bet amount
            // Losses were ALREADY subtracted individually in the loss branch.
            // Just add the win payout — do NOT re-subtract losses.
            runningProfit += BASE_BET * betMult

            // Peak closes: record height (losses before this win + the win)
            const peakHeight = currentPeakHeight + 1
            peakHeights.push(peakHeight)

            signalResults.push({ signal: signals, win: true })
            profitCurve.push({ index: i, profit: runningProfit })

            // Streaks
            currentWinStreak++
            currentLossStreak = 0
            if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak

            // Reset for next cycle
            martingalaStep = 0
            currentPeakHeight = 0

            // Drawdown / peak profit tracking
            if (runningProfit > peakRunningProfit) peakRunningProfit = runningProfit
          } else {
            // 6. LOSS
            losses++
            runningProfit -= BASE_BET * betMult

            currentLossStreak++
            currentWinStreak = 0
            if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak

            currentPeakHeight++
            martingalaStep++

            // Check bust
            if (martingalaStep >= MAX_MART) {
              busts++
              // NOTE: Bust does NOT record a peak, does NOT reset currentPeakHeight (per simulate-v60.ts)
              signalResults.push({ signal: signals, win: false })
              profitCurve.push({ index: i, profit: runningProfit })

              martingalaStep = 0
              currentLossStreak = 0
              cooldownRemaining = COOLDOWN_AFTER_BUST
            } else {
              cooldownRemaining = COOLDOWN_AFTER_LOSS
            }

            // Drawdown check
            if (runningProfit < peakRunningProfit) {
              const dd = peakRunningProfit - runningProfit
              if (dd > maxDrawdown) maxDrawdown = dd
            }
          }

          // Feedback to engine (for both win and loss)
          recordPredictionFeedback(predictedColor === actualColor, ['markov'], predictedColor)
        }

        // Close unfinished peak at end of data (matches simulate-v60.ts)
        // Only pushes the peak — does NOT add extra losses or cycles
        if (currentPeakHeight > 0) {
          peakHeights.push(currentPeakHeight)
          if (runningProfit < peakRunningProfit) {
            const dd = peakRunningProfit - runningProfit
            if (dd > maxDrawdown) maxDrawdown = dd
          }
        }

        // ═══ BUILD RESULTS ═══

        // Peak histogram
        const histogramMap = new Map<number, number>()
        peakHeights.forEach(h => {
          histogramMap.set(h, (histogramMap.get(h) || 0) + 1)
        })
        const peakHistogram = Array.from(histogramMap.entries())
          .map(([height, count]) => ({ height, count }))
          .sort((a, b) => a.height - b.height)

        // Accuracy by window (every 200 signals)
        const accuracyByWindow: { window: number; accuracy: number }[] = []
        const WINDOW_SIZE = 200
        for (let w = 0; w < signalResults.length; w += WINDOW_SIZE) {
          const chunk = signalResults.slice(w, w + WINDOW_SIZE)
          const chunkWins = chunk.filter(r => r.win).length
          const acc = chunk.length > 0 ? (chunkWins / chunk.length) * 100 : 0
          accuracyByWindow.push({ window: Math.floor(w / WINDOW_SIZE) + 1, accuracy: Math.round(acc * 10) / 10 })
        }

        // Derived metrics
        const totalBets = wins + losses + greenCount
        const accuracy = totalBets > 0 ? (wins / totalBets) * 100 : 0
        const profitPerSignal = signals > 0 ? runningProfit / signals : 0
        const profitPer100Spins = nums.length > 0 ? (runningProfit / nums.length) * 100 : 0
        const roi = signalResults.length > 0 ? (runningProfit / (signalResults.length * BASE_BET)) * 100 : 0
        const skipRate = totalProcessed > 0 ? (totalSkips / totalProcessed) * 100 : 0

        const results: AdvBacktestResults = {
          totalSpins: nums.length,
          signals,
          accuracy: Math.round(accuracy * 10) / 10,
          netProfit: Math.round(runningProfit * 100) / 100,
          busts,
          skips: totalSkips,
          skipRate: Math.round(skipRate * 10) / 10,
          profitPerSignal: Math.round(profitPerSignal * 100) / 100,
          profitPer100Spins: Math.round(profitPer100Spins * 100) / 100,
          roi: Math.round(roi * 10) / 10,
          maxDrawdown: Math.round(maxDrawdown * 100) / 100,
          maxPeak: peakHeights.length > 0 ? Math.max(...peakHeights) : 0,
          totalPeaks: peakHeights.length,
          martingalaCycles: peakHeights.length,
          streaks: { maxWin: maxWinStreak, maxLoss: maxLossStreak },
          peakHistogram,
          accuracyByWindow,
          profitCurve,
          isProfitable: runningProfit > 0,
        }

        setAdvBtResults(results)
      } catch (err) {
        console.error('[AdvBacktestV6] Error:', err)
      } finally {
        setAdvBtRunning(false)
      }
    }, 50)
  }, [advBtSequence, parseAdvBtSequence])

  // Get number button style
  const getNumberButtonStyle = (num: number) => {
    const color = getNumberColor(num)
    const baseStyle = 'w-10 h-10 md:w-11 md:h-11 rounded-lg font-bold text-sm transition-all duration-200 hover:scale-110 active:scale-95 '
    
    if (color === 'red') {
      return baseStyle + 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
    } else if (color === 'black') {
      return baseStyle + 'bg-zinc-700 hover:bg-zinc-600 text-white shadow-lg shadow-zinc-700/30'
    } else {
      return baseStyle + 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-600/30'
    }
  }

  // Get prediction display text
  const getPredictionDisplay = () => {
    if (!currentPrediction) return null
    
    const labels: Record<string, string> = {
      'color-red': '🔴 ROJO',
      'color-black': '⚫ NEGRO',
      'parity-odd': '🔢 IMPAR',
      'parity-even': '🔢 PAR',
      'dozen-1-12': '📊 1ra Docena (1-12)',
      'dozen-13-24': '📊 2da Docena (13-24)',
      'dozen-25-36': '📊 3ra Docena (25-36)',
      'column-1': '📈 Columna 1',
      'column-2': '📈 Columna 2',
      'column-3': '📈 Columna 3'
    }
    
    return labels[`${currentPrediction.type}-${currentPrediction.value}`] || currentPrediction.value
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
      
      if (e.key >= '0' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey && isJoined) {
        e.preventDefault()
        const num = parseInt(e.key)
        handleNumberInput(num)
      }
      
      if (e.key === 'Escape') {
        setIsCompactMode(prev => !prev)
      }
      
      if (e.key === 'd' && isJoined && !isDemoMode) {
        startDemoMode()
      }
      
      if (e.key === 's' && isDemoMode) {
        stopDemoMode()
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isJoined, handleNumberInput, startDemoMode, stopDemoMode, isDemoMode])

  // Cleanup demo on unmount
  useEffect(() => {
    return () => {
      if (demoIntervalRef.current) {
        clearInterval(demoIntervalRef.current)
      }
    }
  }, [])

  // Stats calculations
  const successCount = peakHistory.length
  const totalAttempts = peakHistory.reduce((sum, p) => sum + p.height, 0)
  const avgPeakHeight = peakHistory.length > 0 
    ? (peakHistory.reduce((sum, p) => sum + p.height, 0) / peakHistory.length).toFixed(1)
    : '0'

  if (!isAuthenticated || !user) {
    return null
  }

  // Compact mode overlay
  if (isCompactMode && isJoined) {
    return (
      <div className="fixed bottom-4 right-4 z-50 w-80 bg-zinc-900/95 backdrop-blur-sm border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-3 bg-zinc-800 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-sm">RollerWin</span>
            {isDemoMode && <Badge className="bg-amber-500 text-black text-xs animate-pulse">DEMO</Badge>}
          </div>
          <Button variant="ghost" size="icon" onClick={() => setIsCompactMode(false)} className="w-7 h-7 text-zinc-400 hover:text-white">
            <Maximize2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Current Peak */}
        <div className="p-3 border-b border-zinc-700">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">Pico Actual:</span>
            <span className={`text-2xl font-bold ${currentPeak >= 5 ? 'text-red-500' : currentPeak >= 3 ? 'text-amber-500' : 'text-green-500'}`}>
              {currentPeak}
            </span>
          </div>
        </div>

        {/* Prediction with confidence */}
        {currentPrediction && numbers.length >= 5 && (
          <div className="p-3 border-b border-zinc-700">
            {/* V6.0: Signal/Skip Counter (compact) */}
            <div className="text-xs text-zinc-500 mb-1.5">
              Señales: <span className="text-green-400 font-bold">{totalSignals}</span> | Skips: <span className="text-zinc-300 font-bold">{totalSkips}</span>
              {(totalSignals + totalSkips) > 0 && (
                <span className="ml-1.5 text-zinc-600">{Math.round((totalSignals / (totalSignals + totalSkips)) * 100)}%</span>
              )}
            </div>
            {/* V6.0: Skip indicator */}
            {isEngineSkip && (
              <div className="text-xs font-bold text-zinc-500 mb-1.5 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full" /> SKIP — sin apuesta
              </div>
            )}
            <div className="text-xs text-zinc-400 mb-2">🎯 Predicción IA V6.0:</div>
            <div className="text-lg font-bold text-amber-500">{getPredictionDisplay()}</div>
            {/* Smart prediction options with confidence */}
            {smartPrediction && smartPrediction.options.length > 1 && (
              <div className="mt-2 space-y-1.5">
                {smartPrediction.options.map((opt, oi) => (
                  <div key={oi} className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                    oi < 2 ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-zinc-800/50'
                  }`}>
                    <span className={oi < 2 ? 'text-yellow-400 font-bold' : 'text-zinc-400'}>
                      {oi === 0 ? '⭐' : oi === 1 ? '🎯' : '   '} {opt.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${oi < 2 ? 'bg-yellow-400' : 'bg-zinc-500'}`}
                          style={{ width: `${opt.confidence}%` }}
                        />
                      </div>
                      <span className={`font-mono font-bold w-8 text-right ${oi < 2 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                        {opt.confidence}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <Progress value={confidence} className="h-1.5 flex-1" />
              <span className="text-xs text-zinc-400">{confidence}%</span>
            </div>
          </div>
        )}

        {/* Quick number input */}
        <div className="p-3">
          <div className="grid grid-cols-6 gap-1">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <button key={num} onClick={() => handleNumberInput(num)} className={`w-full h-8 rounded text-sm font-bold transition-transform hover:scale-105 ${getNumberColor(num) === 'red' ? 'bg-red-600 text-white' : getNumberColor(num) === 'black' ? 'bg-zinc-600 text-white' : 'bg-green-600 text-white'}`}>
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Peak History Mini */}
        <div className="px-3 pb-3">
          <div className="flex gap-1 h-8 items-end">
            {[...peakHistory].reverse().slice(0, 15).map((peak, i) => (
              <div key={peak.id} className={`w-3 rounded-t ${PEAK_COLORS[Math.min(peak.height - 1, 14)]}`} style={{ height: `${(peak.height / 15) * 100}%` }} title={`Pico ${peak.height}`} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setCurrentView('landing')} className="text-white hover:text-amber-500">
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-lg md:text-xl font-bold">
                <span className="text-white">Roller</span>
                <span className="text-amber-500">Win</span>
                <span className="text-xs text-zinc-500 ml-2">LIVE CASINO</span>
                <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono">V6.0</span>
              </h1>
            </div>
            
            <div className="flex items-center gap-3">
              {isJoined && <Badge className="bg-green-500 text-black animate-pulse"><Radio className="w-3 h-3 mr-1" />EN SESIÓN</Badge>}
              {isDemoMode && <Badge className="bg-amber-500 text-black"><Bot className="w-3 h-3 mr-1" />DEMO</Badge>}
              

              <Button variant="ghost" size="icon" onClick={() => setSoundEnabled(!soundEnabled)} className="text-zinc-400 hover:text-white">
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </Button>

              {isJoined && (
                <Button variant="ghost" size="icon" onClick={() => setIsCompactMode(true)} className="text-zinc-400 hover:text-white">
                  <Minimize2 className="w-4 h-4" />
                </Button>
              )}

              <div className="flex items-center gap-2 bg-zinc-800 rounded-full px-3 py-1">
                <User className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-white hidden md:inline">{user.name}</span>
              </div>

              <Button variant="ghost" size="icon" onClick={handleLogout} className="text-white hover:text-red-500">
                <LogOut className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
          <div className="xl:col-span-3 space-y-4">
            
            {/* Casino Setup Card */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="py-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Radio className="w-4 h-4 text-amber-500" />
                  Configuración del Casino
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!isJoined ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div className="space-y-2">
                        <Label className="text-zinc-400">Casino</Label>
                        <Select value={selectedCasino} onValueChange={(v) => {
                          setSelectedCasino(v)
                          const casino = CASINO_CONFIGS.find(c => c.id === v)
                          if (casino) setSelectedTable(casino.tables[0].id)
                        }}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CASINO_CONFIGS.map(casino => (
                              <SelectItem key={casino.id} value={casino.id}>{casino.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-zinc-400">Mesa de Ruleta</Label>
                        <Select value={selectedTable} onValueChange={setSelectedTable}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {currentCasino?.tables.map(table => (
                              <SelectItem key={table.id} value={table.id}>{table.name} {table.provider && `(${table.provider})`}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-zinc-400">Tipo de Apuesta</Label>
                        <Select value={selectedBetType} onValueChange={(v) => setSelectedBetType(v as BetType)}>
                          <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {BET_TYPE_OPTIONS.map(bet => (
                              <SelectItem key={bet.id} value={bet.id}>{bet.icon} {bet.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="bg-zinc-800 rounded-lg p-3 mb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-500 mb-1">URL directa a la mesa:</p>
                          <p className="text-sm text-cyan-400 truncate font-mono">{getTableUrl(selectedCasino, selectedTable)}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={handleCopyUrl} className="text-zinc-400 hover:text-white">
                          {copiedUrl ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <Button onClick={handleJoinTable} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold py-6 text-lg">
                      <ExternalLink className="w-5 h-5 mr-2" />Abrir Casino y Unirse a Mesa
                    </Button>

                    <div className="mt-4">
                      <Button
                        onClick={() => window.open('/api/download?file=estrategia-rentable-v52.pdf', '_blank')}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 text-sm flex items-center justify-center gap-2"
                      >
                        <FileDown className="w-4 h-4" />
                        Descargar Estrategia Rentable (PDF)
                      </Button>
                    </div>

                    <div className="mt-4 p-4 bg-gradient-to-r from-amber-500/10 to-cyan-500/10 border border-amber-500/30 rounded-lg">
                      <h4 className="text-amber-500 font-bold mb-3 flex items-center gap-2"><Zap className="w-4 h-4" />¿Cómo Funciona?</h4>
                      <ol className="text-sm text-zinc-400 space-y-2">
                        <li className="flex items-start gap-2"><span className="text-amber-500 font-bold">1.</span> Selecciona el casino y la mesa de ruleta</li>
                        <li className="flex items-start gap-2"><span className="text-amber-500 font-bold">2.</span> Haz clic en &quot;Abrir Casino&quot; para ir a la mesa</li>
                        <li className="flex items-start gap-2"><span className="text-amber-500 font-bold">3.</span> Ingresa los números que van saliendo en la ruleta</li>
                        <li className="flex items-start gap-2"><span className="text-amber-500 font-bold">4.</span> El sistema generará predicciones basadas en estadísticas avanzadas</li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-500">{successCount}</div>
                        <div className="text-xs text-zinc-500">Aciertos</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-amber-500">{avgPeakHeight}</div>
                        <div className="text-xs text-zinc-500">Pico Promedio</div>
                      </div>
                      <div className="text-center">
                        <div className={`text-2xl font-bold ${currentPeak >= 5 ? 'text-red-500' : currentPeak >= 3 ? 'text-amber-500' : 'text-green-500'}`}>
                          {currentPeak}
                        </div>
                        <div className="text-xs text-zinc-500">Pico Actual</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {showKeyboardHint && (
                        <div className="flex items-center justify-between p-2 bg-cyan-500/10 border border-cyan-500/30 rounded text-xs">
                          <div className="flex items-center gap-2 text-cyan-400">
                            <Keyboard className="w-4 h-4" />
                            <span>Usa las teclas <strong>0-9</strong> para ingreso rápido</span>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setShowKeyboardHint(false)} className="h-6 text-xs text-zinc-400">Ocultar</Button>
                        </div>
                      )}
                    </div>

                    {/* Auto Capture Button */}
                    <div className="mt-2">
                      <Button
                        onClick={toggleAutoCapture}
                        className={`w-full font-bold py-2.5 text-sm transition-all ${
                          isAutoCapture
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-500/20'
                            : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 hover:border-zinc-600'
                        }`}
                      >
                        {isAutoCapture ? (
                          <>
                            <Scan className="w-4 h-4 mr-2 animate-pulse" />
                            Auto Captura ACTIVA
                            <span className="ml-2 w-2 h-2 rounded-full bg-green-300 animate-pulse" />
                          </>
                        ) : (
                          <>
                            <Wifi className="w-4 h-4 mr-2" />
                            Activar Auto Captura
                          </>
                        )}
                      </Button>
                      {isAutoCapture && (
                        <div className="mt-1.5 space-y-1">
                          <div className="flex items-center justify-center gap-2 text-[10px]">
                            <span className="flex items-center gap-1 text-green-400">
                              <Wifi className="w-3 h-3" />
                              Monitoreando...
                            </span>
                            {capturerTotal > 0 && (
                              <>
                                <span className="text-zinc-600">|</span>
                                <span className="text-zinc-400">
                                  {capturerTotal} numeros capturados
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-[9px] text-zinc-500 text-center leading-tight px-1">
                            Asegurate de tener el userscript de Tampermonkey activo en la pagina del casino
                          </p>
                        </div>
                      )}
                      {!isAutoCapture && (
                        <p className="text-[9px] text-zinc-500 mt-1 text-center leading-tight px-1">
                          Requiere Tampermonkey con el userscript instalado en la pagina del casino
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Number Input Grid */}
            {isJoined && (
              <>
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="py-3">
                    <CardTitle className="text-white flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-amber-500" />
                        Ingreso de Números
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-normal text-zinc-400">{numbers.length} números</span>
                        <Button variant="ghost" size="sm" onClick={handleClear} className="text-zinc-400 hover:text-red-500">
                          <Trash2 className="w-4 h-4 mr-1" />Limpiar
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-10 sm:grid-cols-12 md:grid-cols-13 gap-1.5 mb-4">
                      {[...Array(37)].map((_, i) => (
                        <button key={i} onClick={() => handleNumberInput(i)} className={getNumberButtonStyle(i)}>{i}</button>
                      ))}
                    </div>

                    {/* Import Numbers Button & Dialog */}
                    <div className="mb-4">
                      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" className="w-full border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10">
                            <ClipboardPaste className="w-4 h-4 mr-2" />
                            Importar Números (Copiar y Pegar)
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-zinc-900 border-zinc-700 max-w-lg max-h-[85vh] flex flex-col">
                          <DialogHeader>
                            <DialogTitle className="text-white flex items-center gap-2">
                              <Import className="w-5 h-5 text-cyan-400" />
                              Importar Números de Ruleta
                            </DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 overflow-y-auto flex-1 min-h-0 custom-scrollbar-y pr-1">
                            <div>
                              <p className="text-sm text-zinc-400 mb-2">
                                Pega los números que han salido en la ruleta. Puedes usar cualquier formato: separados por coma, espacio, o saltos de línea.
                              </p>
                              <Textarea
                                value={importText}
                                onChange={(e) => { setImportText(e.target.value); setImportPreview(null) }}
                                placeholder="Ejemplo: 5, 14, 32, 0, 17, 8, 21, 3, 25, 10..."
                                className="bg-zinc-800 border-zinc-700 text-white min-h-[120px] resize-y"
                              />
                            </div>
                            
                            <Button onClick={handleAnalyzeImport} disabled={!importText.trim()} className="w-full bg-cyan-500 hover:bg-cyan-400 text-black font-bold">
                              <BarChart3 className="w-4 h-4 mr-2" />
                              Analizar Números
                            </Button>

                            {importPreview && (
                              <div className="space-y-3">
                                {/* Preview Summary */}
                                <div className="bg-zinc-800 rounded-lg p-4">
                                  <h4 className="text-sm font-bold text-white mb-3">📊 Vista Previa de Importación</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="text-center p-2 bg-zinc-700/50 rounded">
                                      <div className="text-2xl font-bold text-white">{importPreview.total}</div>
                                      <div className="text-xs text-zinc-400">Números encontrados</div>
                                    </div>
                                    <div className="text-center p-2 bg-zinc-700/50 rounded">
                                      <div className="text-lg font-bold">
                                        <span className="text-red-400">{importPreview.red}</span>
                                        <span className="text-zinc-500 mx-1">/</span>
                                        <span className="text-zinc-300">{importPreview.black}</span>
                                        <span className="text-zinc-500 mx-1">/</span>
                                        <span className="text-green-400">{importPreview.green}</span>
                                      </div>
                                      <div className="text-xs text-zinc-400">R/N/V</div>
                                    </div>
                                  </div>
                                  <p className="text-xs text-cyan-400 mt-3 text-center">
                                    Estos números se agregarán al panel para mejorar las predicciones.
                                  </p>
                                </div>

                                <Button onClick={handleApplyImport} className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold">
                                  <CheckCircle className="w-4 h-4 mr-2" />
                                  Aplicar Números ({importPreview.total} números)
                                </Button>
                              </div>
                            )}
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>

                    <div className="pt-4 border-t border-zinc-800">
                      <p className="text-zinc-500 text-xs mb-2">Secuencia actual:</p>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        <AnimatePresence>
                          {numbers.map((num, index) => (
                            <motion.span key={`${num}-${index}`} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`px-2 py-0.5 rounded text-xs font-bold ${getNumberColor(num) === 'red' ? 'bg-red-600 text-white' : getNumberColor(num) === 'black' ? 'bg-zinc-700 text-white' : 'bg-green-600 text-white'}`}>{num}</motion.span>
                          ))}
                        </AnimatePresence>
                        {numbers.length === 0 && <p className="text-zinc-600 text-xs">{isDemoMode ? 'El modo demo generará números automáticamente...' : 'Ingresa números haciendo clic o usando el teclado...'}</p>}
                      </div>
                    </div>

                    {/* ═══ V6.0 Signal Peak Indicator ═══ */}
                    {signalPeakHistory.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="text-xs font-bold text-zinc-300">Picos de Señales</span>
                            <span className="text-[9px] bg-cyan-500/15 text-cyan-400 px-1.5 py-0.5 rounded-full">V6.0</span>
                          </div>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-zinc-500">Señales: <span className="text-white font-bold">{signalPeakHistory.length}</span></span>
                            <span className="text-zinc-500">Prom: <span className="text-cyan-400 font-bold">{signalPeakHistory.length > 0 ? (signalPeakHistory.reduce((s, p) => s + p.height, 0) / signalPeakHistory.length).toFixed(1) : '0'}</span></span>
                            <span className="text-zinc-500">Actual: <span className={`font-bold ${signalPeak >= 5 ? 'text-red-400' : signalPeak >= 3 ? 'text-amber-400' : 'text-green-400'}`}>{signalPeak}</span></span>
                          </div>
                        </div>
                        {/* Horizontal bars */}
                        <div className="flex items-end gap-[2px] h-10 bg-zinc-800/30 rounded-lg px-2 py-1.5">
                          {[...signalPeakHistory].reverse().slice(0, 40).map((peak, i) => (
                            <motion.div
                              key={peak.id}
                              initial={{ height: 0 }}
                              animate={{ height: `${Math.max(3, ((peak.height - 1) / 9) * 100)}%` }}
                              transition={{ duration: 0.2, delay: i * 0.01 }}
                              className={`flex-1 rounded-t min-w-[3px] ${
                                peak.height <= 3 ? 'bg-green-500/70 hover:bg-green-400' :
                                peak.height <= 6 ? 'bg-amber-500/70 hover:bg-amber-400' :
                                'bg-red-500/70 hover:bg-red-400'
                              }`}
                              title={`Pico ${peak.height} → #${peak.resultNumber}`}
                            />
                          ))}
                        </div>
                        {/* Quick stats row */}
                        <div className="flex items-center gap-4 mt-1.5 text-[9px]">
                          <span className="text-green-400">
                            Bajos (1-3): {signalPeakHistory.filter(p => p.height <= 3).length}
                          </span>
                          <span className="text-amber-400">
                            Medios (4-6): {signalPeakHistory.filter(p => p.height >= 4 && p.height <= 6).length}
                          </span>
                          {signalPeakHistory.filter(p => p.height >= 7).length > 0 && (
                            <span className="text-red-400">
                              Altos (7+): {signalPeakHistory.filter(p => p.height >= 7).length}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Current Prediction */}
                {currentPrediction && numbers.length >= 5 ? (
                  <Card className={`bg-gradient-to-r from-zinc-900 to-zinc-800 ${isEngineSkip ? 'border-zinc-600' : 'border-amber-500/30'}`}>
                    <CardContent className="py-4 space-y-3">
                      {/* V6.0: Signal/Skip Counter */}
                      <div className="text-xs text-zinc-500">
                        Señales: <span className="text-green-400 font-bold">{totalSignals}</span> | Skips: <span className="text-zinc-300 font-bold">{totalSkips}</span>
                        {(totalSignals + totalSkips) > 0 && (
                          <span className="ml-2 text-zinc-600">Ratio: {Math.round((totalSignals / (totalSignals + totalSkips)) * 100)}%</span>
                        )}
                      </div>
                      {/* V6.0: SKIP indicator */}
                      {isEngineSkip && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-600 rounded-lg">
                          <span className="text-xs font-bold text-zinc-400">⏸ SKIP</span>
                          <span className="text-xs text-zinc-500">— Señal débil, sin apuesta recomendada</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <div className="text-xs text-zinc-400 mb-1 flex items-center gap-2"><Target className="w-3 h-3" />PREDICCIÓN IA V6.0</div>
                          <div className="text-2xl md:text-3xl font-bold text-amber-500">{getPredictionDisplay()}</div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-400">Confianza:</span>
                            <span className="text-lg font-bold text-white">{confidence}%</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-400">Pico:</span>
                            <span className={`text-lg font-bold ${currentPeak >= 5 ? 'text-red-500' : currentPeak >= 3 ? 'text-amber-500' : 'text-green-500'}`}>
                              {currentPeak}
                            </span>
                            {currentPeak >= 5 && <AlertTriangle className="w-4 h-4 text-red-500 animate-pulse" />}
                          </div>
                        </div>
                      </div>

                      {/* Smart prediction options with confidence bars */}
                      {smartPrediction && smartPrediction.options.length > 1 && (
                        <div className="grid gap-1.5">
                          {smartPrediction.options.map((opt, oi) => (
                            <div key={oi} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                              oi < 2 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-zinc-800/60 border border-zinc-700/30'
                            }`}>
                              <span className={`font-bold ${oi < 2 ? 'text-yellow-400' : 'text-zinc-400'}`}>
                                {oi === 0 ? '⭐' : oi === 1 ? '🎯' : '   '} {opt.label}
                              </span>
                              <div className="flex items-center gap-3">
                                <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-300 ${oi < 2 ? 'bg-yellow-400' : 'bg-zinc-500'}`}
                                    style={{ width: `${opt.confidence}%` }}
                                  />
                                </div>
                                <span className={`font-mono font-bold w-10 text-right ${oi < 2 ? 'text-yellow-400' : 'text-zinc-500'}`}>
                                  {opt.confidence}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ) : numbers.length > 0 && numbers.length < 5 ? (
                  <Card className="bg-zinc-900 border-zinc-700">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-zinc-400 mb-1 flex items-center gap-2"><Target className="w-3 h-3" />PREDICCIÓN</div>
                          <div className="text-lg font-bold text-zinc-500">
                            Ingresa {5 - numbers.length} número{5 - numbers.length !== 1 ? 's' : ''} más para comenzar
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-500 transition-all duration-300" 
                              style={{ width: `${(numbers.length / 5) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-zinc-400">{numbers.length}/5</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}


              </>
            )}
          </div>

          {/* Current Peak Display - Compact Side Panel */}
          {isJoined && (
            <div className="xl:col-span-1">
              {/* Current Peak */}
              <Card className="bg-zinc-900 border-zinc-800">
                <CardContent className="py-4">
                  <div className="text-center">
                    <div className="text-xs text-zinc-400 mb-1">PICO ACTUAL</div>
                    <div className={`text-6xl font-bold ${currentPeak >= 7 ? 'text-red-500 animate-pulse' : currentPeak >= 4 ? 'text-amber-500' : 'text-green-500'}`}>
                      {currentPeak}
                    </div>
                    <div className={`text-xs mt-1 ${currentPeak >= 7 ? 'text-red-400' : currentPeak >= 4 ? 'text-amber-400' : 'text-green-400'}`}>
                      {currentPeak >= 7 ? '⚠️ Nivel Alto' : currentPeak >= 4 ? '⚡ Nivel Medio' : '✅ Nivel Bajo'}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bankroll Calculator - Side Panel */}
              <Card className="bg-gradient-to-br from-zinc-900 to-zinc-800 border-emerald-500/30 mt-4">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-white flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-emerald-500" />
                      Calculadora Bankroll
                    </span>
                    <div className="flex items-center gap-3">
                      {calcDisplay && calcDisplay.isActive && (
                        <Badge variant="outline" className={`text-xs px-2 py-0 ${calcDisplay.totalProfit > 0 ? 'border-green-500 text-green-400' : calcDisplay.totalProfit < 0 ? 'border-red-500 text-red-400' : 'border-zinc-500 text-zinc-400'}`}>
                          {calcDisplay.totalProfit > 0 ? '+' : ''}{calcDisplay.totalProfit.toFixed(2)}
                        </Badge>
                      )}
                      <Switch checked={calcEnabled} onCheckedChange={toggleCalculator} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1">Bankroll</label>
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                        <Input type="number" value={calcBankroll} onChange={(e) => { setCalcBankroll(e.target.value); if (!calcEnabled) return; }} className="h-7 bg-zinc-800 border-zinc-700 text-white text-xs pl-6" disabled={calcEnabled} />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1">Apuesta Base</label>
                      <div className="relative">
                        <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                        <Input type="number" value={calcBetAmount} onChange={(e) => { setCalcBetAmount(e.target.value); calcBetAmountRef.current = e.target.value }} className="h-7 bg-zinc-800 border-zinc-700 text-white text-xs pl-6" disabled={calcEnabled} />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-zinc-500 block mb-1">Jugar en Picos</label>
                    <div className="grid grid-cols-3 gap-1">
                      <button onClick={() => { setCalcPeakLevel('low'); calcPeakLevelRef.current = 'low'; if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcPeakLevel === 'low' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>🟢 Bajo</button>
                      <button onClick={() => { setCalcPeakLevel('medium'); calcPeakLevelRef.current = 'medium'; if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcPeakLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>🟡 Medio</button>
                      <button onClick={() => { setCalcPeakLevel('high'); calcPeakLevelRef.current = 'high'; if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcPeakLevel === 'high' ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>🔴 Alto</button>
                    </div>
                  </div>

                  {(selectedBetType === 'dozen' || selectedBetType === 'column') && (
                    <div>
                      <label className="text-[10px] text-zinc-500 block mb-1">Modo Apuesta</label>
                      <div className="grid grid-cols-2 gap-1">
                        <button onClick={() => { calcDozenModeRef.current = 'single'; setPeakDozenMode('single'); if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcDozenModeRef.current === 'single' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>1 Opcion</button>
                        <button onClick={() => { calcDozenModeRef.current = 'double'; setPeakDozenMode('double'); if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcDozenModeRef.current === 'double' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>2 Opciones</button>
                      </div>
                    </div>
                  )}

                  {/* Strategy selector */}
                  <div>
                    <label className="text-[10px] text-zinc-500 block mb-1">Estrategia</label>
                    <div className="grid grid-cols-2 gap-1">
                      <button onClick={() => { calcStrategyRef.current = 'paroli'; if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcStrategyRef.current === 'paroli' ? 'bg-green-500/20 text-green-400 border border-green-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>Paroli (Win+)</button>
                      <button onClick={() => { calcStrategyRef.current = 'martingala'; if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcStrategyRef.current === 'martingala' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>Martingala</button>
                    </div>
                  </div>

                  {/* Strategy visual indicator */}
                  <div className="flex items-center gap-1.5 p-1.5 bg-zinc-800/40 rounded-lg">
                    <span className="text-[9px] text-zinc-500">{calcStrategyRef.current === 'paroli' ? 'Paroli:' : 'Martingala:'}</span>
                    <div className="flex gap-0.5">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-600/40 text-cyan-300">x1</span>
                      <span className="text-zinc-600">{'->'}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-orange-600/40 text-orange-300">x2</span>
                      <span className="text-zinc-600">{'->'}</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-600/40 text-red-300">x4</span>
                    </div>
                    <span className="text-[9px] text-zinc-600">({calcStrategyRef.current === 'paroli' ? 'sube al ganar' : 'sube al perder'})</span>
                  </div>

                  {calcEnabled && (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-zinc-800/60 rounded-lg p-1.5 text-center">
                          <div className={`text-sm font-bold ${calcDisplay ? (calcDisplay.totalProfit >= 0 ? 'text-green-400' : 'text-red-400') : 'text-white'}`}>{calcDisplay ? calcDisplay.runningBankroll.toFixed(1) : '0'}</div>
                          <div className="text-[8px] text-zinc-500">Bankroll</div>
                        </div>
                        <div className="bg-zinc-800/60 rounded-lg p-1.5 text-center">
                          <div className={`text-sm font-bold ${calcDisplay ? (calcDisplay.totalProfit >= 0 ? 'text-green-400' : 'text-red-400') : 'text-white'}`}>{calcDisplay ? (calcDisplay.totalProfit > 0 ? '+' : '') + calcDisplay.totalProfit.toFixed(2) : '0'}</div>
                          <div className="text-[8px] text-zinc-500">Profit</div>
                        </div>
                      </div>
                      <div className="flex justify-between text-[10px] px-1">
                        <span className="text-green-400 font-bold">W: {calcDisplay?.wins ?? 0}</span>
                        <span className="text-red-400 font-bold">L: {calcDisplay?.losses ?? 0}</span>
                        <span className="text-amber-400 font-bold">C: {calcDisplay?.cycles.length ?? 0}</span>
                      </div>
                      {/* Paroli streak indicator */}
                      {calcDisplay && calcStrategyRef.current === 'paroli' && (
                        <div className="mt-1.5 px-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[9px] text-zinc-500">Paroli</span>
                            <div className="flex gap-1">
                              {[1, 2, 4].map((mult, i) => (
                                <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold transition-all ${
                                  calcDisplay.paroliStreak > i
                                    ? 'bg-green-500 text-white shadow-sm shadow-green-500/50'
                                    : i === calcDisplay.paroliStreak && calcDisplay.isActive
                                    ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500/50'
                                    : 'bg-zinc-800 text-zinc-600 border border-zinc-700/50'
                                }`}>
                                  {mult}x
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="text-[9px] text-center">
                            {calcDisplay.paroliStreak === 0 ? (
                              <span className="text-zinc-500">Prox: <span className="text-white font-bold">{calcDisplay.nextBetMultiplier}x</span> base</span>
                            ) : calcDisplay.paroliStreak >= 3 ? (
                              <span className="text-green-400 font-bold">Ciclo completo! Reset</span>
                            ) : (
                              <span className="text-green-400">Racha {calcDisplay.paroliStreak} — Prox: <span className="text-white font-bold">{calcDisplay.nextBetMultiplier}x</span></span>
                            )}
                          </div>
                        </div>
                      )}
                      <div className="max-h-40 overflow-y-auto custom-scrollbar-y space-y-1">
                        {calcDisplay && calcDisplay.cycles.map((cycle) => (
                          <div key={cycle.cycle} className={`flex items-center justify-between px-2 py-1.5 rounded-lg text-[10px] ${cycle.cycleProfit > 0 ? 'bg-green-500/10 border border-green-500/20' : cycle.cycleProfit < 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-zinc-800/50 border border-zinc-700/30'}`}>
                            <div className="flex items-center gap-1">
                              <span className="text-zinc-500 font-mono">#{cycle.cycle}</span>
                              <div className="flex gap-0.5">
                                {cycle.bets.map((bet, bi) => (
                                  <span key={bi} className={`px-1 py-0.5 rounded text-[9px] font-bold ${bet.result === 'win' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{bet.result === 'win' ? `+$${bet.payout}` : `-$${bet.amount}`}</span>
                                ))}
                              </div>
                            </div>
                            <span className={`font-bold ${cycle.cycleProfit > 0 ? 'text-green-400' : cycle.cycleProfit < 0 ? 'text-red-400' : 'text-zinc-400'}`}>{cycle.cycleProfit > 0 ? '+' : ''}{cycle.cycleProfit.toFixed(2)}</span>
                          </div>
                        ))}
                        {(!calcDisplay || calcDisplay.cycles.length === 0) && (
                          <p className="text-center text-zinc-600 text-[10px] py-3">Activado — ingresa números</p>
                        )}
                      </div>
                      <Button onClick={resetCalculator} variant="outline" size="sm" className="w-full border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 h-7 text-xs">
                        <RotateCcw className="w-3 h-3 mr-1" /> Reiniciar
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>



              {/* Historial de Picos de Señales V6.0 — Solo registros de señales reales */}
              <Card className="bg-zinc-900 border border-cyan-800/50 mt-4">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-white flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-cyan-400" />
                      <span>Picos de Señales</span>
                      <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full font-normal">V6.0 Solo Señales</span>
                    </span>
                    <span className="text-xs font-normal text-zinc-500">{signalPeakHistory.length} registros</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-3">
                  {/* Pico actual de señales */}
                  <div className="flex items-center gap-3 bg-zinc-800/50 rounded-lg p-3">
                    <div className="text-xs text-zinc-400">Pico Señal Actual</div>
                    <div className="flex-1" />
                    <span className={`text-2xl font-bold ${signalPeak >= 5 ? 'text-red-500' : signalPeak >= 3 ? 'text-amber-500' : 'text-green-500'}`}>
                      {signalPeak}
                    </span>
                  </div>

                  {/* Barras visuales de picos de señales */}
                  {signalPeakHistory.length > 0 && (
                    <>
                      <div className="relative h-32 bg-zinc-800/30 rounded-lg overflow-hidden">
                        {/* Líneas guía horizontales */}
                        <div className="absolute inset-0 flex flex-col justify-between py-2 px-2 pointer-events-none">
                          {[15, 12, 9, 6, 3, 1].map((val) => (
                            <div key={val} className="relative flex items-center">
                              <span className="text-[10px] text-zinc-600 w-5 text-right">{val}</span>
                              <div className="flex-1 border-t border-zinc-700/20" />
                            </div>
                          ))}
                        </div>
                        {/* Barras */}
                        <div className="absolute left-7 right-2 bottom-2 top-2 flex items-end gap-[2px]">
                          {[...signalPeakHistory].reverse().slice(0, 30).map((peak, i) => (
                            <motion.div
                              key={peak.id}
                              initial={{ height: 0 }}
                              animate={{ height: `${Math.max(4, ((peak.height - 1) / 14) * 100)}%` }}
                              transition={{ duration: 0.3, delay: i * 0.02 }}
                              className={`flex-1 rounded-t relative cursor-pointer min-w-[6px] ${
                                peak.height <= 3 ? 'bg-cyan-400/80 hover:bg-cyan-300' :
                                peak.height <= 6 ? 'bg-amber-500/80 hover:bg-amber-400' :
                                'bg-red-500/80 hover:bg-red-400'
                              }`}
                              title={`Pico Señal ${peak.height} → #${peak.resultNumber}`}
                            >
                              {peak.height >= 4 && (
                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold text-zinc-400 whitespace-nowrap">
                                  {peak.height}
                                </span>
                              )}
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      {/* Estadísticas de señales */}
                      <div className="grid grid-cols-4 gap-2">
                        <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold text-cyan-400">{signalPeakHistory.length}</div>
                          <div className="text-[10px] text-zinc-500">Señales</div>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold text-cyan-400">
                            {signalPeakHistory.length > 0
                              ? (signalPeakHistory.reduce((s, p) => s + p.height, 0) / signalPeakHistory.length).toFixed(1)
                              : '0'}
                          </div>
                          <div className="text-[10px] text-zinc-500">Promedio</div>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold text-green-400">{signalPeakHistory.filter(p => p.height <= 3).length}</div>
                          <div className="text-[10px] text-zinc-500">Bajos</div>
                        </div>
                        <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                          <div className="text-sm font-bold text-amber-400">{signalPeakHistory.filter(p => p.height >= 4).length}</div>
                          <div className="text-[10px] text-zinc-500">Medios/Altos</div>
                        </div>
                      </div>

                      {/* Lista detallada de picos de señales */}
                      <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                        {[...signalPeakHistory].reverse().slice(0, 50).map((peak) => (
                          <div key={peak.id} className={`flex items-center justify-between p-2 rounded text-xs ${
                            peak.height <= 3 ? 'bg-cyan-500/10 border border-cyan-500/20' :
                            peak.height <= 6 ? 'bg-amber-500/10 border border-amber-500/20' :
                            'bg-red-500/10 border border-red-500/20'
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${
                                peak.height <= 3 ? 'text-cyan-400' :
                                peak.height <= 6 ? 'text-amber-400' : 'text-red-400'
                              }`}>
                                Pico {peak.height}
                              </span>
                              <span className="text-zinc-500">→</span>
                              <span className={`font-bold ${
                                peak.resultColor === 'red' ? 'text-red-400' :
                                peak.resultColor === 'black' ? 'text-zinc-300' : 'text-green-400'
                              }`}>
                                {peak.resultNumber}
                              </span>
                            </div>
                            <span className="text-zinc-600">
                              {peak.timestamp.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {signalPeakHistory.length === 0 && (
                    <p className="text-zinc-600 text-xs text-center py-4">
                      Sin picos de señales registrados aún — solo registra cuando el motor V6.0 da SEÑAL
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* ═══ Advanced Backtesting V6.0 ═══ */}
        {isJoined && (
          <div className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="py-3">
                <CardTitle className="text-white flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    Backtesting Avanzado V6.0
                  </span>
                  <Badge variant="outline" className="text-amber-500 border-amber-500/40 text-[10px] font-mono">
                    Motor V6.0 · Martingala 3
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Textarea to paste sequence */}
                <div className="space-y-2">
                  <Label className="text-zinc-400 text-sm flex items-center gap-1.5">
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    Pegar Secuencia Histórica
                  </Label>
                  <Textarea
                    value={advBtSequence}
                    onChange={(e) => { setAdvBtSequence(e.target.value); setAdvBtAnalyzed(null); setAdvBtResults(null) }}
                    placeholder="Pega números aquí: 14, 32, 0, 7, 25, 10, 33...&#10;(separados por coma, espacio o salto de línea)"
                    className="bg-zinc-800 border-zinc-700 text-white text-sm min-h-[80px] max-h-[160px] resize-y placeholder:text-zinc-600"
                  />
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleAdvBtAnalyze}
                    disabled={!advBtSequence.trim()}
                    variant="outline"
                    className="flex-1 border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 hover:text-cyan-300 text-sm"
                  >
                    <Scan className="w-4 h-4 mr-1.5" />
                    Analizar Secuencia
                  </Button>
                  <Button
                    onClick={handleAdvBtRun}
                    disabled={!advBtAnalyzed || advBtRunning || (advBtAnalyzed?.total ?? 0) < 10}
                    className="flex-1 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-black font-bold text-sm"
                    title={advBtAnalyzed && advBtAnalyzed.total < 10 ? 'Se necesitan al menos 10 números' : ''}
                  >
                    {advBtRunning ? (
                      <>
                        <div className="w-4 h-4 mr-1.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Simulando...
                      </>
                    ) : (
                      <>
                        <Zap className="w-4 h-4 mr-1.5" />
                        Ejecutar Backtesting V6.0
                      </>
                    )}
                  </Button>
                </div>

                {/* Analysis preview */}
                {advBtAnalyzed && !advBtResults && !advBtRunning && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50"
                  >
                    <div className="text-xs text-zinc-400 mb-2 font-bold">📊 Vista Previa</div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-zinc-800 rounded-lg">
                        <div className="text-lg font-bold text-white">{advBtAnalyzed.total}</div>
                        <div className="text-[10px] text-zinc-500">Total</div>
                      </div>
                      <div className="p-2 bg-zinc-800 rounded-lg">
                        <div className="text-lg font-bold text-red-400">{advBtAnalyzed.red}</div>
                        <div className="text-[10px] text-zinc-500">Rojos</div>
                      </div>
                      <div className="p-2 bg-zinc-800 rounded-lg">
                        <div className="text-lg font-bold text-zinc-300">{advBtAnalyzed.black}</div>
                        <div className="text-[10px] text-zinc-500">Negros</div>
                      </div>
                      <div className="p-2 bg-zinc-800 rounded-lg">
                        <div className="text-lg font-bold text-green-400">{advBtAnalyzed.green}</div>
                        <div className="text-[10px] text-zinc-500">Verdes</div>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-500 text-center mt-2">
                      Listo para simular con Motor V6.0 · Martingala 3 niveles
                    </p>
                  </motion.div>
                )}

                {/* ═══ V6.0 Results ═══ */}
                {advBtResults && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    {/* ── VEREDICTO ── */}
                    <div className={`p-4 rounded-xl border-2 text-center ${
                      advBtResults.isProfitable
                        ? 'bg-green-500/15 border-green-500/40'
                        : 'bg-red-500/15 border-red-500/40'
                    }`}>
                      <div className="text-2xl mb-1">
                        {advBtResults.isProfitable ? '✅' : '❌'}
                      </div>
                      <div className={`text-xl font-black ${
                        advBtResults.isProfitable ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {advBtResults.isProfitable ? 'RENTABLE' : 'NO RENTABLE'}
                      </div>
                      <div className={`text-lg font-bold font-mono mt-1 ${
                        advBtResults.netProfit >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {advBtResults.netProfit >= 0 ? '+' : ''}{advBtResults.netProfit.toFixed(2)} u
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-2 leading-relaxed">
                        {advBtResults.totalSpins.toLocaleString()} spins | {advBtResults.accuracy.toFixed(1)}% accuracy | {advBtResults.signals.toLocaleString()} señales | {advBtResults.busts} busts | Proyección: {advBtResults.profitPer100Spins >= 0 ? '+' : ''}{advBtResults.profitPer100Spins.toFixed(1)} u/100spins
                      </div>
                    </div>

                    {/* ── Main Metrics Cards ── */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {/* Giros totales */}
                      <div className="text-center p-2.5 bg-zinc-800 rounded-lg">
                        <div className="text-lg font-bold text-white">{advBtResults.totalSpins.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-500">Giros Totales</div>
                      </div>
                      {/* Señales */}
                      <div className="text-center p-2.5 bg-zinc-800 rounded-lg">
                        <div className="text-lg font-bold text-cyan-400">{advBtResults.signals.toLocaleString()}</div>
                        <div className="text-[10px] text-zinc-500">Señales</div>
                      </div>
                      {/* Precisión */}
                      <div className={`text-center p-2.5 bg-zinc-800 rounded-lg border ${advBtResults.accuracy >= 55 ? 'border-green-500/30' : 'border-amber-500/30'}`}>
                        <div className={`text-lg font-bold ${advBtResults.accuracy >= 55 ? 'text-green-400' : 'text-amber-400'}`}>
                          {advBtResults.accuracy.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-zinc-500">% Precisión</div>
                      </div>
                      {/* Neto */}
                      <div className={`text-center p-2.5 bg-zinc-800 rounded-lg border ${advBtResults.netProfit >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
                        <div className={`text-lg font-bold flex items-center justify-center gap-1 ${advBtResults.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {advBtResults.netProfit >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                          ${advBtResults.netProfit.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-zinc-500">Neto ($)</div>
                      </div>
                      {/* Bustos */}
                      <div className={`text-center p-2.5 bg-zinc-800 rounded-lg ${advBtResults.busts === 0 ? 'border border-green-500/30' : 'border border-red-500/30'}`}>
                        <div className={`text-lg font-bold ${advBtResults.busts === 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {advBtResults.busts}
                        </div>
                        <div className="text-[10px] text-zinc-500">Bustos</div>
                      </div>
                      {/* $/señal */}
                      <div className={`text-center p-2.5 bg-zinc-800 rounded-lg`}>
                        <div className={`text-lg font-bold ${advBtResults.profitPerSignal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${advBtResults.profitPerSignal.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500">$/señal</div>
                      </div>
                      {/* $/100spins */}
                      <div className={`text-center p-2.5 bg-zinc-800 rounded-lg`}>
                        <div className={`text-lg font-bold ${advBtResults.profitPer100Spins >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          ${advBtResults.profitPer100Spins.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-zinc-500">$/100spins</div>
                      </div>
                      {/* ROI */}
                      <div className={`text-center p-2.5 bg-zinc-800 rounded-lg`}>
                        <div className={`text-lg font-bold ${advBtResults.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {advBtResults.roi.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-zinc-500">ROI</div>
                      </div>
                    </div>

                    {/* ── Extended Metrics ── */}
                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                      {/* Max Drawdown */}
                      <div className="text-center p-2 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-red-400">${advBtResults.maxDrawdown.toFixed(1)}</div>
                        <div className="text-[10px] text-zinc-500">Max Drawdown</div>
                      </div>
                      {/* Skips */}
                      <div className="text-center p-2 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-zinc-300">{advBtResults.skips.toLocaleString()} <span className="text-[9px] text-zinc-500">({advBtResults.skipRate.toFixed(1)}%)</span></div>
                        <div className="text-[10px] text-zinc-500">Skips</div>
                      </div>
                      {/* Pico máximo */}
                      <div className="text-center p-2 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-amber-400">{advBtResults.maxPeak}</div>
                        <div className="text-[10px] text-zinc-500">Pico Máximo</div>
                      </div>
                      {/* Picos totales */}
                      <div className="text-center p-2 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-white">{advBtResults.totalPeaks}</div>
                        <div className="text-[10px] text-zinc-500">Picos Totales</div>
                      </div>
                      {/* Ciclos martingala */}
                      <div className="text-center p-2 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-orange-400">{advBtResults.martingalaCycles}</div>
                        <div className="text-[10px] text-zinc-500">Ciclos Martingala</div>
                      </div>
                      {/* Rachas */}
                      <div className="text-center p-2 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold">
                          <span className="text-green-400">{advBtResults.streaks.maxWin}W</span>
                          <span className="text-zinc-600">/</span>
                          <span className="text-red-400">{advBtResults.streaks.maxLoss}L</span>
                        </div>
                        <div className="text-[10px] text-zinc-500">Rachas</div>
                      </div>
                    </div>

                    {/* ── Distribución de Picos ── */}
                    {advBtResults.peakHistogram.length > 0 && (
                      <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                        <div className="text-xs text-zinc-400 mb-2 font-bold">📊 Distribución de Picos</div>
                        {/* Individual bars per peak height */}
                        <div className="space-y-1.5">
                          {(() => {
                            const maxCount = Math.max(...advBtResults.peakHistogram.map(p => p.count), 1)
                            return advBtResults.peakHistogram.map(p => {
                              const pct = (p.count / maxCount) * 100
                              const isLow = p.height <= 3
                              const barColor = isLow ? 'bg-green-500' : 'bg-orange-500'
                              const textColor = isLow ? 'text-green-400' : 'text-orange-400'
                              return (
                                <div key={p.height} className="flex items-center gap-2">
                                  <span className="text-[10px] text-zinc-400 w-14 shrink-0">Pico {p.height}</span>
                                  <div className="flex-1 h-4 bg-zinc-800 rounded overflow-hidden">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${pct}%` }}
                                      transition={{ duration: 0.6, ease: 'easeOut' }}
                                      className={`h-full ${barColor} rounded opacity-80`}
                                    />
                                  </div>
                                  <span className={`text-xs font-bold font-mono w-8 text-right ${textColor}`}>{p.count}</span>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      </div>
                    )}

                    {/* ── Precisión por Ventana (every 200 signals) ── */}
                    {advBtResults.accuracyByWindow.length > 0 && (
                      <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                        <div className="text-xs text-zinc-400 mb-2 font-bold">🎯 Precisión por Ventana (cada 200 señales)</div>
                        <div className="flex items-end gap-1 h-14">
                          {advBtResults.accuracyByWindow.map((w, i) => {
                            const pct = Math.max(5, w.accuracy) // min 5% height for visibility
                            const isGood = w.accuracy >= 55
                            return (
                              <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                                <span className="text-[8px] font-mono text-zinc-500">{w.accuracy.toFixed(0)}%</span>
                                <div
                                  className={`w-full rounded-t-sm min-h-[4px] transition-all duration-500 ${isGood ? 'bg-green-500' : 'bg-red-500'} opacity-70`}
                                  style={{ height: `${pct * 0.13}px` }}
                                />
                                <span className="text-[7px] text-zinc-600">{w.window}</span>
                              </div>
                            )
                          })}
                        </div>
                        {/* 50% reference line */}
                        <div className="relative h-px bg-amber-500/30 mt-0.5">
                          <span className="absolute right-0 -top-3 text-[7px] text-amber-500/60">50%</span>
                        </div>
                      </div>
                    )}

                    {/* ── Curva de Ganancias ── */}
                    {advBtResults.profitCurve.length > 1 && (
                      <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-400 font-bold">📈 Curva de Ganancias</span>
                          <span className={`text-xs font-bold font-mono ${advBtResults.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            ${advBtResults.netProfit.toFixed(2)}
                          </span>
                        </div>
                        {/* Zero line */}
                        <div className="relative">
                          {(() => {
                            const curve = advBtResults.profitCurve
                            const minVal = Math.min(...curve.map(c => c.profit))
                            const maxVal = Math.max(...curve.map(c => c.profit))
                            const range = maxVal - minVal || 1

                            // Sample max 80 bars for visual clarity
                            const maxBars = 80
                            const step = Math.max(1, Math.floor(curve.length / maxBars))
                            const sampled = curve.filter((_, i) => i % step === 0)

                            return (
                              <>
                                {/* Zero reference line */}
                                {minVal < 0 && maxVal > 0 && (
                                  <div
                                    className="absolute left-0 right-0 h-px bg-zinc-600"
                                    style={{ bottom: `${((0 - minVal) / range) * 100}%` }}
                                  >
                                    <span className="absolute right-0 -top-2.5 text-[7px] text-zinc-600">$0</span>
                                  </div>
                                )}
                                <div className="flex items-end gap-px h-16">
                                  {sampled.map((pt, i) => {
                                    const height = ((pt.profit - minVal) / range) * 100
                                    const isProfit = pt.profit >= 0
                                    return (
                                      <div key={i} className="flex-1 rounded-t-sm min-h-[1px] transition-all duration-300"
                                        style={{
                                          height: `${Math.max(1, height)}%`,
                                          backgroundColor: isProfit ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                                          opacity: 0.75
                                        }}
                                      />
                                    )
                                  })}
                                </div>
                                <div className="flex justify-between text-[9px] text-zinc-600 mt-1 font-mono">
                                  <span>${minVal.toFixed(1)}</span>
                                  <span>${maxVal.toFixed(1)}</span>
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    )}

                    {/* Motor info */}
                    <div className="p-2 bg-zinc-800/40 rounded-lg text-center">
                      <p className="text-[9px] text-zinc-600 leading-relaxed">
                        Motor V6.0 · Consensus Markov (3w) · Zona de Salto (streaks 3-6) · Martingala 3 niveles [1,2,4] · Cooldown · Base $1
                      </p>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
