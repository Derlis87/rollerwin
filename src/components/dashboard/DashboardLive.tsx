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
  CircleDot
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
import { ColorParityChart } from './charts/ColorParityChart'
import { PeakLevelCharts } from './charts/PeakLevelCharts'
import { UltimateSignals } from './charts/UltimateSignals'
import ProfessionalRouletteEngine from './charts/ProfessionalRouletteEngine'
import { calculatePeakHistory, getCurrentPeak, parseNumberText } from '@/lib/peak-engine'

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
const playSound = (type: 'success' | 'fail' | 'click') => {
  if (typeof window === 'undefined') return
  
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
}

interface PeakRecord {
  id: string
  height: number
  prediction: BetPrediction
  resultNumber: number
  resultColor: 'red' | 'black' | 'green'
  timestamp: Date
}

interface ImportPreview {
  numbers: number[]
  total: number
  red: number
  black: number
  green: number
}

type PeakLevel = 'low' | 'medium' | 'high'

interface BacktestResults {
  wins: number
  losses: number
  netProfit: number
  roi: number
  maxDrawdown: number
  totalBets: number
  profitCurve: number[]
  winRate: number
  maxWinStreak: number
  maxLossStreak: number
  totalInvested: number
  betType: BetType
  amount: number
  peakLevel: PeakLevel
  peakCycles: number
  avgBetsPerCycle: number
  fibonacciDetail: { cycle: number; bets: number[]; result: 'win' | 'loss'; profit: number; entryPeak: number; predicted: string[]; strategyStep?: number[] }[]
  btDozenMode: BtDozenMode
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
  const [peakHistory, setPeakHistory] = useState<PeakRecord[]>([])
  const [confidence, setConfidence] = useState(0)
  
  // UI state
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [showKeyboardHint, setShowKeyboardHint] = useState(true)
  
  // Import state
  const [importText, setImportText] = useState('')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  
  // Backtest state (independent)
  const [backtestResults, setBacktestResults] = useState<BacktestResults | null>(null)
  
  // Backtest config
  const [btBetType, setBtBetType] = useState<BetType>('color')
  const [btAmount, setBtAmount] = useState<string>('1')
  const [btPeakLevel, setBtPeakLevel] = useState<PeakLevel>('low')
  const [btDozenMode, setBtDozenMode] = useState<BtDozenMode>('single')
  const [btStrategy, setBtStrategy] = useState<'martingala' | 'paroli'>('paroli')

  // Live smart prediction
  const [smartPrediction, setSmartPrediction] = useState<SmartPrediction | null>(null)
  
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
  const smartPredictionRef = useRef<SmartPrediction | null>(null)
  // Progression arrays: Martingala increases on loss, Paroli increases on win
  const MARTINGALA = [1, 2, 4]
  const PAROLI = [1, 2, 4]
  const MAX_CALC_BETS = 3
  const [calcDisplay, setCalcDisplay] = useState<{ cycles: typeof calcHistoryRef.current; runningBankroll: number; totalProfit: number; wins: number; losses: number; isActive: boolean } | null>(null)

  // Helper: check if peak height is in the selected calculator range
  const isCalcPeakInRange = (h: number): boolean => {
    const pl = calcPeakLevelRef.current
    if (pl === 'low') return h >= 1 && h <= 3
    if (pl === 'medium') return h >= 4 && h <= 6
    return h >= 7
  }

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
    setCalcDisplay({
      cycles: [],
      runningBankroll: bankroll,
      totalProfit: 0,
      wins: 0,
      losses: 0,
      isActive: calcEnabled
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
        setCalcDisplay({
          cycles: [],
          runningBankroll: bankroll,
          totalProfit: 0,
          wins: 0,
          losses: 0,
          isActive: true
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
  // NUEVO SISTEMA DE PREDICCIÓN AVANZADO v3.0
  // Basado en: Análisis de Varianza Múltiple,
  // Cadenas de Markov de Orden 2, Detección de
  // Sesgo Estadístico, Reversión a la Media,
  // Análisis de Ventanas Múltiples, Hot/Cold Clustering
  // ============================================
  const generateSmartPrediction = useCallback((nums: number[], betType: BetType): SmartPrediction => {
    if (nums.length < 5) return { type: betType, options: [], bestValue: '', bestConfidence: 50 }
    const nonZero = nums.filter(n => n !== 0)
    const nzTotal = nonZero.length || 1

    // --- HELPER: Multi-window frequency analysis ---
    const multiWindowFreq = (getCat: (n: number) => string | null, cats: string[]) => {
      const windows = [5, 10, 20, 37]
      const scores: Record<string, number> = {}
      cats.forEach(c => scores[c] = 0)

      windows.forEach((w, wi) => {
        const slice = nonZero.slice(-w)
        const sTotal = slice.length || 1
        const expected = (1 / cats.length) * 100
        // Weight: more recent windows matter more
        const weight = [1, 1.5, 2.5, 3][wi]
        // Count actual frequency in this window
        const freqs: Record<string, number> = {}
        cats.forEach(c => freqs[c] = 0)
        slice.forEach(n => {
          const c = getCat(n)
          if (c) freqs[c]++
        })
        // Base frequency score (weighted)
        cats.forEach(c => {
          scores[c] += freqs[c] * weight
        })
        // Mean reversion: underrepresented categories get boosted
        cats.forEach(c => {
          const actual = (freqs[c] / sTotal) * 100
          const deviation = expected - actual
          // Strong mean reversion signal for larger deviations
          scores[c] += deviation * weight * 0.6
        })
      })
      return scores
    }

    // --- HELPER: Order-2 Markov Chain ---
    const markovOrder2 = (getCat: (n: number) => string | null, cats: string[]) => {
      const trans: Record<string, Record<string, Record<string, number>>> = {}
      for (let i = 2; i < nonZero.length; i++) {
        const c0 = getCat(nonZero[i - 2])
        const c1 = getCat(nonZero[i - 1])
        const c2 = getCat(nonZero[i])
        if (c0 && c1 && c2) {
          if (!trans[c0]) trans[c0] = {}
          if (!trans[c0][c1]) trans[c0][c1] = {}
          trans[c0][c1][c2] = (trans[c0][c1][c2] || 0) + 1
        }
      }
      const scores: Record<string, number> = {}
      cats.forEach(c => scores[c] = 0)
      if (nonZero.length >= 2) {
        const c0 = getCat(nonZero[nonZero.length - 2])
        const c1 = getCat(nonZero[nonZero.length - 1])
        if (c0 && c1 && trans[c0] && trans[c0][c1]) {
          const tr = trans[c0][c1]
          const total = Object.values(tr).reduce((s, v) => s + v, 0)
          if (total > 0) {
            cats.forEach(c => {
              scores[c] = ((tr[c] || 0) / total) * 100
            })
          }
        }
      }
      // Fallback: Order-1 Markov
      if (Object.values(scores).every(v => v === 0) && nonZero.length >= 1) {
        const last = getCat(nonZero[nonZero.length - 1])
        const trans1: Record<string, Record<string, number>> = {}
        for (let i = 1; i < nonZero.length; i++) {
          const prev = getCat(nonZero[i - 1])
          const curr = getCat(nonZero[i])
          if (prev && curr) {
            if (!trans1[prev]) trans1[prev] = {}
            trans1[prev][curr] = (trans1[prev][curr] || 0) + 1
          }
        }
        if (last && trans1[last]) {
          const tr = trans1[last]
          const total = Object.values(tr).reduce((s, v) => s + v, 0)
          if (total > 0) cats.forEach(c => { scores[c] = ((tr[c] || 0) / total) * 100 })
        }
      }
      return scores
    }

    // --- HELPER: Streak analysis with smart reversion and continuation detection ---
    const streakAnalysis = (getCat: (n: number) => string | null, cats: string[], streaks: Record<string, number>) => {
      const scores: Record<string, number> = {}
      cats.forEach(c => scores[c] = 0)
      let maxStreak = 0
      let streakCat: string | null = null
      cats.forEach(c => {
        if ((streaks[c] || 0) > maxStreak) {
          maxStreak = streaks[c]
          streakCat = c
        }
      })
      if (streakCat && maxStreak >= 3) {
        const reversionStrength = Math.min(30, maxStreak * 6)
        cats.forEach(c => {
          if (c !== streakCat) scores[c] += reversionStrength / (cats.length - 1)
        })
        scores[streakCat!] -= reversionStrength
      } else if (streakCat && maxStreak === 2) {
        // Mild reversion signal for streak of 2
        cats.forEach(c => {
          if (c !== streakCat) scores[c] += 5
        })
        scores[streakCat!] -= 5
      }
      return scores
    }

    // --- HELPER: Momentum / continuation detection ---
    const momentumAnalysis = (getCat: (n: number) => string | null, cats: string[]): string | null => {
      if (nonZero.length < 8) return null
      const last8 = nonZero.slice(-8).map(n => getCat(n)).filter(Boolean)
      if (last8.length < 6) return null
      // Count last 6 occurrences
      const last6 = last8.slice(-6)
      const counts: Record<string, number> = {}
      last6.forEach(c => { if (c) counts[c] = (counts[c] || 0) + 1 })
      // If one category dominates (>60%), detect momentum
      let dominant: string | null = null
      cats.forEach(c => {
        if ((counts[c] || 0) >= 4) dominant = c
      })
      // Only signal momentum if it's the most recent trend (not reversed yet)
      if (dominant && last8[last8.length - 1] === dominant && last8[last8.length - 2] === dominant) {
        return dominant
      }
      return null
    }

    // --- HELPER: Gap/absence detection ---
    const gapAnalysis = (getCat: (n: number) => string | null, cats: string[]) => {
      const scores: Record<string, number> = {}
      cats.forEach(c => scores[c] = 0)
      const lastSeen: Record<string, number> = {}
      cats.forEach(c => lastSeen[c] = -1)
      nonZero.forEach((n, i) => {
        const c = getCat(n)
        if (c) lastSeen[c] = i
      })
      const lastIdx = nonZero.length - 1
      cats.forEach(c => {
        const gap = lastIdx - (lastSeen[c] ?? -1)
        if (gap >= 4) scores[c] += Math.min(20, gap * 3)
        else if (gap >= 2) scores[c] += gap * 2
      })
      return scores
    }

    // --- HELPER: Sector/wheel pattern (for dozens/columns) ---
    const sectorAnalysis = (getCat: (n: number) => string | null, cats: string[]) => {
      const scores: Record<string, number> = {}
      cats.forEach(c => scores[c] = 0)
      // Alternation pattern: if alternating, predict the one not in last position
      if (nonZero.length >= 4) {
        const last4raw = nonZero.slice(-4).map(n => getCat(n))
        const last4 = last4raw.filter((c): c is string => c !== null)
        if (last4.length >= 4) {
          let alternating = true
          for (let i = 1; i < last4.length; i++) {
            if (last4[i] === last4[i - 1]) { alternating = false; break }
          }
          if (alternating) {
            const lastCat = last4[last4.length - 1]
            cats.forEach(c => {
              if (c !== lastCat) scores[c] += 8
            })
          }
        }
        // Pattern: AABB detected
        if (last4.length >= 4 && last4[0] === last4[1] && last4[2] === last4[3] && last4[0] !== last4[2]) {
          scores[last4[2]] += 10 // pattern continues
        }
      }
      return scores
    }

    // --- HELPER: Chi-square significance test ---
    const chiSquareTest = (counts: number[], expected: number) => {
      return counts.reduce((sum, c) => sum + Math.pow(c - expected, 2) / Math.max(1, expected), 0)
    }

    // --- HELPER: Normalize scores to realistic confidence percentages ---
    const toConfidence = (scores: Record<string, number>, cats: string[], expectedPct: number) => {
      // Shift all scores to be non-negative
      const minScore = Math.min(...Object.values(scores))
      const shifted: Record<string, number> = {}
      cats.forEach(c => { shifted[c] = Math.max(0.01, scores[c] - minScore + 0.01) })
      const totalShifted = cats.reduce((s, c) => s + shifted[c], 0) || 1

      const confs: Record<string, number> = {}
      cats.forEach(c => {
        const weight = shifted[c] / totalShifted // 0..1
        // Dynamic spread based on how dominant the best option is
        const maxSpread = cats.length === 2 ? 28 : 20
        const conf = expectedPct + (weight * 2 - 1) * maxSpread
        confs[c] = Math.max(5, Math.min(92, conf))
      })
      // Normalize to sum exactly 100
      const sum = Object.values(confs).reduce((s, v) => s + v, 0) || 1
      cats.forEach(c => { confs[c] = Math.round((confs[c] / sum) * 100) })
      return confs
    }

    // === COLOR PREDICTION ===
    if (betType === 'color') {
      const cats = ['red', 'black']
      const getCat = (n: number) => { const c = getNumberColor(n); return c === 'green' ? null : c }
      const freq = multiWindowFreq(getCat, cats)
      const markov = markovOrder2(getCat, cats)
      const streaks: Record<string, number> = {}
      let maxR = 0, maxB = 0
      nonZero.forEach(n => {
        const c = getNumberColor(n)
        if (c === 'red') { maxR++; maxB = 0 } else if (c === 'black') { maxB++; maxR = 0 } else { maxR = 0; maxB = 0 }
      })
      streaks.red = maxR; streaks.black = maxB
      const streak = streakAnalysis(getCat, cats, streaks)
      const momentum = momentumAnalysis(getCat, cats)

      const scores: Record<string, number> = {}
      cats.forEach(c => {
        scores[c] = freq[c] * 1.0 + markov[c] * 2.5 + streak[c] * 2.0
        // Momentum override: if strong trend detected, favor continuation
        if (momentum === c) scores[c] += 12
      })

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      return {
        type: 'color',
        options: sorted.map(c => ({ value: c, label: c === 'red' ? 'Rojo' : 'Negro', confidence: Math.round(confs[c]) })),
        bestValue: sorted[0],
        bestConfidence: Math.round(confs[sorted[0]])
      }
    }

    // === PARITY PREDICTION ===
    if (betType === 'parity') {
      const cats = ['odd', 'even']
      const getCat = (n: number) => n === 0 ? null : (n % 2 === 0 ? 'even' : 'odd')
      const freq = multiWindowFreq(getCat, cats)
      const markov = markovOrder2(getCat, cats)
      const streaks: Record<string, number> = {}
      let maxO = 0, maxE = 0
      nonZero.forEach(n => {
        if (n === 0) { maxO = 0; maxE = 0; return }
        if (n % 2 === 1) { maxO++; maxE = 0 } else { maxE++; maxO = 0 }
      })
      streaks.odd = maxO; streaks.even = maxE
      const streak = streakAnalysis(getCat, cats, streaks)
      const momentum = momentumAnalysis(getCat, cats)

      const scores: Record<string, number> = {}
      cats.forEach(c => {
        scores[c] = freq[c] * 1.0 + markov[c] * 2.5 + streak[c] * 2.0
        if (momentum === c) scores[c] += 12
      })

      const confs = toConfidence(scores, cats, 48.6)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      return {
        type: 'parity',
        options: sorted.map(c => ({ value: c, label: c === 'odd' ? 'Impar' : 'Par', confidence: Math.round(confs[c]) })),
        bestValue: sorted[0],
        bestConfidence: Math.round(confs[sorted[0]])
      }
    }

    // === DOZEN PREDICTION ===
    if (betType === 'dozen') {
      const cats = ['d1', 'd2', 'd3']
      const getCat = (n: number) => n === 0 ? null : (n <= 12 ? 'd1' : n <= 24 ? 'd2' : 'd3')
      const freq = multiWindowFreq(getCat, cats)
      const markov = markovOrder2(getCat, cats)
      const gap = gapAnalysis(getCat, cats)
      const sector = sectorAnalysis(getCat, cats)

      const streaks: Record<string, number> = {}
      let maxD1 = 0, maxD2 = 0, maxD3 = 0
      nonZero.forEach(n => {
        if (n === 0) { maxD1 = 0; maxD2 = 0; maxD3 = 0; return }
        if (n <= 12) { maxD1++; maxD2 = 0; maxD3 = 0 }
        else if (n <= 24) { maxD2++; maxD1 = 0; maxD3 = 0 }
        else { maxD3++; maxD1 = 0; maxD2 = 0 }
      })
      streaks.d1 = maxD1; streaks.d2 = maxD2; streaks.d3 = maxD3
      const streak = streakAnalysis(getCat, cats, streaks)

      // Chi-square test on full history
      const d1Count = nonZero.filter(n => n <= 12).length
      const d2Count = nonZero.filter(n => n > 12 && n <= 24).length
      const d3Count = nonZero.filter(n => n > 24).length
      const expected = nzTotal / 3
      const chi = chiSquareTest([d1Count, d2Count, d3Count], expected)
      const chiScores: Record<string, number> = {}
      if (chi > 5.99) {
        const counts = [d1Count, d2Count, d3Count]
        const avg = expected
        cats.forEach((c, i) => {
          if (counts[i] < avg) chiScores[c] = ((avg - counts[i]) / avg) * 15
          else chiScores[c] = -((counts[i] - avg) / avg) * 10
        })
      } else { cats.forEach(c => chiScores[c] = 0) }

      // Hot/Cold clustering
      const hotScores: Record<string, number> = {}
      const recent15 = nonZero.slice(-15)
      cats.forEach(c => hotScores[c] = 0)
      recent15.forEach(n => { const c = getCat(n); if (c) hotScores[c]++ })
      cats.forEach(c => {
        const pct = (hotScores[c] / Math.max(1, recent15.length)) * 100
        // Cold dozen bonus (underrepresented in recent spins)
        if (pct < 20) hotScores[c] = (20 - pct) * 1.5
        else if (pct > 45) hotScores[c] = -(pct - 45) * 1.0
        else hotScores[c] = 0
      })

      const scores: Record<string, number> = {}
      const momentum = momentumAnalysis(getCat, cats)
      cats.forEach(c => {
        scores[c] = freq[c] * 1.0 + markov[c] * 2.5 + streak[c] * 2.0 + gap[c] * 1.5 + sector[c] * 1.0 + chiScores[c] * 1.2 + hotScores[c] * 1.2
        if (momentum === c) scores[c] += 8
      })

      const confs = toConfidence(scores, cats, 20)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      const labels: Record<string, string> = { d1: '1ra Docena (1-12)', d2: '2da Docena (13-24)', d3: '3ra Docena (25-36)' }
      const values: Record<string, string> = { d1: '1-12', d2: '13-24', d3: '25-36' }
      return {
        type: 'dozen',
        options: sorted.map(c => ({ value: values[c], label: labels[c], confidence: Math.round(confs[c]) })),
        bestValue: values[sorted[0]],
        bestConfidence: Math.round(confs[sorted[0]])
      }
    }

    // === COLUMN PREDICTION ===
    if (betType === 'column') {
      const cats = ['c1', 'c2', 'c3']
      const getCat = (n: number) => {
        if (n === 0) return null
        const col = n % 3 === 0 ? 3 : n % 3
        return `c${col}`
      }
      const freq = multiWindowFreq(getCat, cats)
      const markov = markovOrder2(getCat, cats)
      const gap = gapAnalysis(getCat, cats)
      const sector = sectorAnalysis(getCat, cats)

      const streaks: Record<string, number> = {}
      let maxC1 = 0, maxC2 = 0, maxC3 = 0
      nonZero.forEach(n => {
        if (n === 0) { maxC1 = 0; maxC2 = 0; maxC3 = 0; return }
        const col = n % 3 === 0 ? 3 : n % 3
        if (col === 1) { maxC1++; maxC2 = 0; maxC3 = 0 }
        else if (col === 2) { maxC2++; maxC1 = 0; maxC3 = 0 }
        else { maxC3++; maxC1 = 0; maxC2 = 0 }
      })
      streaks.c1 = maxC1; streaks.c2 = maxC2; streaks.c3 = maxC3
      const streak = streakAnalysis(getCat, cats, streaks)

      const c1Count = nonZero.filter(n => n !== 0 && n % 3 === 1).length
      const c2Count = nonZero.filter(n => n !== 0 && n % 3 === 2).length
      const c3Count = nonZero.filter(n => n !== 0 && n % 3 === 0).length
      const expected = nzTotal / 3
      const chi = chiSquareTest([c1Count, c2Count, c3Count], expected)
      const chiScores: Record<string, number> = {}
      if (chi > 5.99) {
        const counts = [c1Count, c2Count, c3Count]
        cats.forEach((c, i) => {
          if (counts[i] < expected) chiScores[c] = ((expected - counts[i]) / expected) * 15
          else chiScores[c] = -((counts[i] - expected) / expected) * 10
        })
      } else { cats.forEach(c => chiScores[c] = 0) }

      const hotScores: Record<string, number> = {}
      const recent15 = nonZero.slice(-15)
      cats.forEach(c => hotScores[c] = 0)
      recent15.forEach(n => { const c = getCat(n); if (c) hotScores[c]++ })
      cats.forEach(c => {
        const pct = (hotScores[c] / Math.max(1, recent15.length)) * 100
        if (pct < 20) hotScores[c] = (20 - pct) * 1.5
        else if (pct > 45) hotScores[c] = -(pct - 45) * 1.0
        else hotScores[c] = 0
      })

      const scores: Record<string, number> = {}
      const momentum = momentumAnalysis(getCat, cats)
      cats.forEach(c => {
        scores[c] = freq[c] * 1.0 + markov[c] * 2.5 + streak[c] * 2.0 + gap[c] * 1.5 + sector[c] * 1.0 + chiScores[c] * 1.2 + hotScores[c] * 1.2
        if (momentum === c) scores[c] += 8
      })

      const confs = toConfidence(scores, cats, 20)
      const sorted = [...cats].sort((a, b) => confs[b] - confs[a])
      const labels: Record<string, string> = { c1: 'Col 1', c2: 'Col 2', c3: 'Col 3' }
      const values: Record<string, string> = { c1: '1', c2: '2', c3: '3' }
      return {
        type: 'column',
        options: sorted.map(c => ({ value: values[c], label: labels[c], confidence: Math.round(confs[c]) })),
        bestValue: values[sorted[0]],
        bestConfidence: Math.round(confs[sorted[0]])
      }
    }

    return { type: betType, options: [], bestValue: '', bestConfidence: 50 }
  }, [calculateStats])

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

  // Calculator helpers
  const updateCalcDisplay = useCallback(() => {
    const allWins = calcHistoryRef.current.reduce((s, c) => s + c.bets.filter(b => b.result === 'win').length, 0)
    const allLosses = calcHistoryRef.current.reduce((s, c) => s + c.bets.filter(b => b.result === 'loss').length, 0)
    const totalProfit = calcHistoryRef.current.reduce((s, c) => s + c.cycleProfit, 0)
    setCalcDisplay({
      cycles: [...calcHistoryRef.current],
      runningBankroll: calcRunningBankrollRef.current,
      totalProfit,
      wins: allWins,
      losses: allLosses,
      isActive: true
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
      // Generate smart prediction — single source of truth
      const smart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
      setSmartPrediction(smart)
      prediction = { type: smart.type, value: smart.bestValue }
      setCurrentPrediction(prediction)
      setConfidence(Math.min(85, smart.bestConfidence))
    }
    
    // Check if we have a prediction to verify
    if (prediction) {
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
        
        const peakRecord: PeakRecord = {
          id: Date.now().toString(),
          height: currentPeakValue,
          prediction: prediction,
          resultNumber: num,
          resultColor: getNumberColor(num),
          timestamp: new Date()
        }
        
        // Add to history
        setPeakHistory(prev => [...prev, peakRecord])
        
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
            const singleBet = isFlatBet ? betAmount : betAmount * (progression[betIdx] || progression[progression.length - 1])
            const totalBet = isDoubleCalc ? singleBet * 2 : singleBet
            // Payout: winning bet pays profit, minus losing bets in double mode
            const payoutPerWin = isFlatBet ? singleBet : singleBet * 2
            const losingCost = isDoubleCalc ? singleBet : 0
            const payout = payoutPerWin - losingCost

            calcCurrentCycleBetsRef.current.push({ amount: totalBet, result: 'win', payout })
            calcCurrentCycleProfitRef.current += payout
            calcRunningBankrollRef.current += payout

            if (strategy === 'paroli') {
              // Paroli: WIN completes the cycle (collect winnings, reset bet index)
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
        
        // Generate new prediction for next round - single source of truth
        if (newNumbers.length >= 5) {
          const newSmart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
          setSmartPrediction(newSmart)
          setCurrentPrediction({ type: newSmart.type, value: newSmart.bestValue })
          setConfidence(Math.min(85, newSmart.bestConfidence))
        }
      } else {
        // FAILED - increment peak
        if (soundEnabledRef.current) playSound('fail')
        
        const newPeak = currentPeakValue + 1
        setCurrentPeak(newPeak)

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
            const singleBet = isFlatBet ? betAmount : betAmount * (progression[betIdx] || progression[progression.length - 1])
            const totalBet = isDoubleCalc ? singleBet * 2 : singleBet

            calcCurrentCycleBetsRef.current.push({ amount: totalBet, result: 'loss', payout: 0 })
            calcCurrentCycleProfitRef.current -= totalBet
            calcRunningBankrollRef.current -= totalBet

            if (strategy === 'paroli') {
              // Paroli: LOSS resets bet to base, closes cycle
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
                  isActive: true
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
        
        // Generate new prediction at each peak - single source of truth
        if (newNumbers.length >= 5) {
          const newSmart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
          setSmartPrediction(newSmart)
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
    setCurrentPrediction(null)
    currentPredictionRef.current = null
    setConfidence(0)
    setBacktestResults(null)
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
    setCurrentPrediction(null)
    currentPredictionRef.current = null
    setConfidence(0)
    setBacktestResults(null)
    
    // Calculate ALL historical peaks from imported numbers
    if (newNumbers.length >= 6) {
      const historicalPeaks = calculatePeakHistory(newNumbers)
      setPeakHistory(historicalPeaks)
      const currentP = getCurrentPeak(newNumbers)
      // If peak is 0 (last peak was resolved), start new cycle at 1
      const displayPeak = Math.max(1, currentP)
      setCurrentPeak(displayPeak)
      currentPeakRef.current = displayPeak
      console.log('[DashboardLive] Import: calculated', historicalPeaks.length, 'peaks from', newNumbers.length, 'numbers, current peak:', currentP, 'display:', displayPeak)
    } else {
      setPeakHistory([])
      setCurrentPeak(1)
      currentPeakRef.current = 1
    }
    
    if (newNumbers.length >= 5) {
      const smart = generateSmartPrediction(newNumbers, selectedBetTypeRef.current)
      setSmartPrediction(smart)
      const pred = { type: smart.type, value: smart.bestValue }
      setCurrentPrediction(pred)
      currentPredictionRef.current = pred
      setConfidence(Math.min(85, smart.bestConfidence))
    } else {
      setCurrentPrediction(null)
      currentPredictionRef.current = null
    }
    setIsJoined(true)
    setImportDialogOpen(false)
    setImportText('')
    setImportPreview(null)
  }, [importPreview, generatePrediction, calculateStats])

  // Handle run backtest - Martingala (sube en loss) o Paroli (sube en win)
  const handleRunBacktest = useCallback(() => {
    const nums = numbersRef.current
    if (nums.length < 6) return

    const amount = parseFloat(btAmount) || 1
    const betType = btBetType
    const peakLevel = btPeakLevel
    const dozenMode = btDozenMode
    const strategy = btStrategy
    const PROGRESSION = [1, 2, 4]
    const MAX_BETS = 3
    const isFlatBet = betType === 'color' || betType === 'parity'
    // Docenas/columnas pagan 2:1, colores/paridad pagan 1:1
    const getPayout = (bt: BetType) => bt === 'color' || bt === 'parity' ? 1 : 2
    const isTriple = betType === 'dozen' || betType === 'column'
    const useDouble = isTriple && dozenMode === 'double'

    const isPeakInRange = (h: number): boolean => {
      if (peakLevel === 'low') return h >= 1 && h <= 3
      if (peakLevel === 'medium') return h >= 4 && h <= 6
      return h >= 7
    }

    // Check match for dozen/column values
    const checkMatch = (value: string, num: number): boolean => {
      if (num === 0) return false
      if (betType === 'dozen') {
        if (value === '1-12') return num <= 12
        if (value === '13-24') return num > 12 && num <= 24
        if (value === '25-36') return num > 24
      } else if (betType === 'column') {
        const col = num % 3 === 0 ? 3 : num % 3
        return value === col.toString()
      } else if (betType === 'color') {
        return getNumberColor(num) === value
      } else if (betType === 'parity') {
        return (num % 2 === 0 ? 'even' : 'odd') === value
      }
      return false
    }

    // Estado del sistema
    let currentPeak = 1
    let predValues: string[] = []
    // Paroli state: track consecutive wins across cycles
    let paroliWinStreak = 0 // 0, 1, 2 — resets on loss, cycles back to 0 after 3 wins

    // Estado calculadora
    let cycleActive = false
    let cycleBetIndex = 0
    let cycleBets: number[] = []
    let cycleProfit = 0
    let cycleEntryPeak = 0
    let cyclePredicted: string[] = []
    let cycleStrategySteps: number[] = []

    // Contadores
    let wins = 0, losses = 0, netProfit = 0
    let maxDrawdown = 0, currentDrawdown = 0
    let maxWinStreak = 0, maxLossStreak = 0
    let currentWinStreak = 0, currentLossStreak = 0
    const profitCurve: number[] = [0]
    const detailList: BacktestResults['fibonacciDetail'] = []

    const closeCycle = (result: 'win' | 'loss') => {
      detailList.push({
        cycle: detailList.length + 1,
        bets: [...cycleBets],
        result,
        profit: cycleProfit,
        entryPeak: cycleEntryPeak,
        predicted: [...cyclePredicted],
        strategyStep: [...cycleStrategySteps]
      })
      cycleActive = false
      cycleBetIndex = 0
      cycleBets = []
      cycleProfit = 0
      cyclePredicted = []
      cycleStrategySteps = []
    }

    const getSmartPred = (n: number[]) => {
      const smart = generateSmartPrediction(n, betType)
      if (useDouble && smart.options.length >= 2) {
        const sorted = [...smart.options].sort((a, b) => b.confidence - a.confidence)
        return [sorted[0].value, sorted[1].value]
      }
      return [smart.bestValue]
    }

    // Get the current progression multiplier based on strategy
    const getCurrentMultiplier = () => {
      if (strategy === 'paroli') {
        return PROGRESSION[Math.min(paroliWinStreak, PROGRESSION.length - 1)]
      } else {
        return PROGRESSION[cycleBetIndex] || PROGRESSION[PROGRESSION.length - 1]
      }
    }

    // Simulación número por número
    for (let i = 0; i < nums.length; i++) {
      const num = nums[i]
      const numsSoFar = nums.slice(0, i + 1)

      // Generar predicción si no existe
      if (predValues.length === 0 && numsSoFar.length >= 5) {
        predValues = getSmartPred(numsSoFar)
      }
      if (predValues.length === 0) continue

      // Check si AL MENOS UNA predicción coincide (para doble apuesta)
      const anyMatch = predValues.some(v => checkMatch(v, num))
      const peakAtCheck = currentPeak

      if (anyMatch) {
        // ====== WIN ======
        if (cycleActive && isPeakInRange(peakAtCheck)) {
          const mult = getCurrentMultiplier()
          const numBets = predValues.length
          const singleBetAmt = amount * mult
          const betAmt = singleBetAmt * numBets
          // Correct payout: winning bet pays (payoutMult * singleBet), minus losing bets cost
          const winProfit = getPayout(betType) * singleBetAmt
          const losingCost = (numBets - 1) * singleBetAmt
          const payout = winProfit - losingCost
          cycleBets.push(betAmt)
          cycleProfit += payout
          netProfit += payout
          wins++
          currentWinStreak++
          currentLossStreak = 0
          currentDrawdown = Math.max(0, currentDrawdown - Math.abs(payout))
          if (currentWinStreak > maxWinStreak) maxWinStreak = currentWinStreak
          // Track predictions and strategy step
          cyclePredicted = [...new Set([...cyclePredicted, ...predValues])]
          cycleStrategySteps.push(mult)

          if (strategy === 'paroli') {
            // Paroli: WIN → increment streak, close cycle, next cycle uses higher bet
            paroliWinStreak++
            if (paroliWinStreak >= MAX_BETS) {
              // Completed 3-win Paroli cycle → collect and reset
              paroliWinStreak = 0
            }
          }

          closeCycle('win')
          profitCurve.push(netProfit)
        } else if (cycleActive && !isPeakInRange(peakAtCheck)) {
          closeCycle('loss')
        }

        currentPeak = 1

        // Regenerar predicción después de win
        predValues = getSmartPred(numsSoFar)
      } else {
        // ====== LOSS ======
        if (cycleActive && isPeakInRange(peakAtCheck)) {
          const mult = getCurrentMultiplier()
          const numBets = predValues.length
          const singleBetAmt = amount * mult
          const betAmt = singleBetAmt * numBets
          cycleBets.push(betAmt)
          cycleProfit -= betAmt
          netProfit -= betAmt
          losses++
          currentLossStreak++
          currentWinStreak = 0
          currentDrawdown += betAmt
          if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown
          if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak
          cycleStrategySteps.push(mult)

          if (strategy === 'paroli') {
            // Paroli: LOSS → reset streak to 0, close cycle
            paroliWinStreak = 0
            closeCycle('loss')
          } else {
            // Martingala: LOSS → increase bet index for next phase
            cycleBetIndex++
            if (cycleBetIndex >= MAX_BETS) {
              closeCycle('loss')
            }
          }
          profitCurve.push(netProfit)
          // Track prediction used at this bet
          cyclePredicted = [...new Set([...cyclePredicted, ...predValues])]
        } else if (cycleActive && !isPeakInRange(peakAtCheck)) {
          closeCycle('loss')
        } else if (!cycleActive && isPeakInRange(peakAtCheck)) {
          // Iniciar ciclo con esta loss
          cycleActive = true
          cycleBetIndex = 0
          cycleBets = []
          cycleProfit = 0
          cycleEntryPeak = peakAtCheck
          cyclePredicted = [...predValues]
          cycleStrategySteps = []

          const mult = getCurrentMultiplier()
          const numBets = predValues.length
          const singleBetAmt = amount * mult
          const betAmt = singleBetAmt * numBets
          cycleBets.push(betAmt)
          cycleProfit -= betAmt
          netProfit -= betAmt
          losses++
          currentLossStreak++
          currentWinStreak = 0
          currentDrawdown += betAmt
          if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown
          if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak
          cycleStrategySteps.push(mult)

          if (strategy === 'paroli') {
            // Paroli: LOSS → reset streak
            paroliWinStreak = 0
            closeCycle('loss')
          } else {
            // Martingala: increment bet index
            cycleBetIndex++
            if (cycleBetIndex >= MAX_BETS) {
              closeCycle('loss')
            }
          }
          profitCurve.push(netProfit)
        }

        currentPeak++
        // Regenerar predicción en cada nuevo pico (datos actualizados)
        if (numsSoFar.length >= 5) {
          predValues = getSmartPred(numsSoFar)
        }
      }
    }

    if (cycleActive) closeCycle('loss')

    const totalBets = wins + losses
    const winRate = totalBets > 0 ? ((wins / totalBets) * 100) : 0
    const totalInvested = detailList.reduce((s, c) => s + c.bets.reduce((a, b) => a + b, 0), 0)
    const roi = totalInvested > 0 ? ((netProfit / totalInvested) * 100) : 0
    const peakCycles = detailList.length
    const avgBetsPerCycle = peakCycles > 0 ? (totalBets / peakCycles) : 0

    setBacktestResults({
      wins, losses, netProfit, roi, maxDrawdown, totalBets, profitCurve,
      winRate, maxWinStreak, maxLossStreak, totalInvested,
      betType, amount, peakLevel, peakCycles, avgBetsPerCycle, fibonacciDetail: detailList, btDozenMode: dozenMode
    })
  }, [generateSmartPrediction, generatePrediction, checkPredictionMatch, btBetType, btAmount, btPeakLevel, btDozenMode, btStrategy])

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
            <div className="text-xs text-zinc-400 mb-2">🎯 Predicción IA v3.0:</div>
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
                <span className="text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-mono">v4.0</span>
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
                  </CardContent>
                </Card>

                {/* Current Prediction */}
                {currentPrediction && numbers.length >= 5 ? (
                  <Card className="bg-gradient-to-r from-zinc-900 to-zinc-800 border-amber-500/30">
                    <CardContent className="py-4 space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <div className="text-xs text-zinc-400 mb-1 flex items-center gap-2"><Target className="w-3 h-3" />PREDICCIÓN IA v3.0</div>
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

                {/* Charts */}
                {numbers.length >= 5 && <ColorParityChart numbers={numbers} />}

                {/* Peak Level Charts - inside main panel to avoid gap */}
                {numbers.length >= 5 && (
                  <PeakLevelCharts
                    peakHistory={peakHistory}
                    currentPeak={currentPeak}
                    inputNumbers={numbers}
                  />
                )}
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

              {/* Professional Roulette Engine - Side Panel */}
              {numbers.length >= 10 && (
                <Card className="bg-zinc-900 border-zinc-800 mt-4 overflow-hidden">
                  <CardContent className="p-4">
                    <ProfessionalRouletteEngine inputNumbers={numbers} />
                  </CardContent>
                </Card>
              )}

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
                        <button onClick={() => { calcDozenModeRef.current = 'single'; if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcDozenModeRef.current === 'single' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>1 Opcion</button>
                        <button onClick={() => { calcDozenModeRef.current = 'double'; if (calcEnabled) resetCalculator() }} className={`py-1 rounded-lg text-[10px] font-bold transition-all ${calcDozenModeRef.current === 'double' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 'bg-zinc-800/60 text-zinc-500 border border-zinc-700/50'}`}>2 Opciones</button>
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

              {/* Gráfico de Historial de Picos - Barras visuales */}
              {peakHistory.length > 0 && (
                <Card className="bg-zinc-900 border-zinc-800 mt-4">
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-white flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-amber-500" />
                        Historial de Picos
                      </span>
                      <span className="text-xs font-normal text-zinc-500">{peakHistory.length} registros</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-3">
                    {/* Gráfico de barras */}
                    <div className="relative h-40 bg-zinc-800/30 rounded-lg overflow-hidden">
                      {/* Líneas guía horizontales */}
                      <div className="absolute inset-0 flex flex-col justify-between py-2 px-2 pointer-events-none">
                        {[15, 12, 9, 6, 3, 1].map((val) => (
                          <div key={val} className="relative flex items-center">
                            <span className="text-[10px] text-zinc-600 w-5 text-right">{val}</span>
                            <div className="flex-1 border-t border-zinc-700/20" />
                          </div>
                        ))}
                      </div>
                      {/* Contenedor de barras */}
                      <div className="absolute left-7 right-2 bottom-2 top-2 flex items-end gap-[2px]">
                        {[...peakHistory].reverse().slice(0, 30).map((peak, i) => (
                          <motion.div
                            key={peak.id}
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.max(4, ((peak.height - 1) / 14) * 100)}%` }}
                            transition={{ duration: 0.3, delay: i * 0.02 }}
                            className={`flex-1 rounded-t relative cursor-pointer min-w-[6px] ${
                              peak.height <= 3 ? 'bg-green-500/80 hover:bg-green-400' :
                              peak.height <= 6 ? 'bg-amber-500/80 hover:bg-amber-400' :
                              'bg-red-500/80 hover:bg-red-400'
                            }`}
                            title={`Pico ${peak.height} → #${peak.resultNumber}`}
                          >
                            {/* Etiqueta de altura en barras grandes */}
                            {peak.height >= 4 && (
                              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold text-zinc-400 whitespace-nowrap">
                                {peak.height}
                              </span>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>

                    {/* Leyenda */}
                    <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500/80" /> Bajo (1-3)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500/80" /> Medio (4-6)</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/80" /> Alto (7+)</span>
                    </div>

                    {/* Estadísticas rápidas */}
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="text-sm font-bold text-green-400">{peakHistory.filter(p => p.height <= 3).length}</div>
                        <div className="text-[10px] text-zinc-500">Bajos</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="text-sm font-bold text-amber-400">{peakHistory.filter(p => p.height >= 4 && p.height <= 6).length}</div>
                        <div className="text-[10px] text-zinc-500">Medios</div>
                      </div>
                      <div className="bg-zinc-800/50 rounded-lg p-2 text-center">
                        <div className="text-sm font-bold text-red-400">{peakHistory.filter(p => p.height >= 7).length}</div>
                        <div className="text-[10px] text-zinc-500">Altos</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Lista detallada de Picos */}
              <Card className="bg-zinc-900 border-zinc-800 mt-4">
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-white flex items-center gap-2 text-sm">
                    <History className="w-4 h-4 text-amber-500" />
                    Historial de Picos
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {/* Stats summary */}
                  <div className="grid grid-cols-3 gap-2 text-center mb-3 pb-3 border-b border-zinc-800">
                    <div>
                      <div className="text-lg font-bold text-green-500">{successCount}</div>
                      <div className="text-xs text-zinc-500">Aciertos</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-amber-500">{avgPeakHeight}</div>
                      <div className="text-xs text-zinc-500">Promedio</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-cyan-500">
                        {peakHistory.length > 0 ? Math.round((successCount / (successCount + peakHistory.reduce((s,p) => s + p.height - 1, 0))) * 100) : 0}%
                      </div>
                      <div className="text-xs text-zinc-500">Precisión</div>
                    </div>
                  </div>
                  {/* Scrollable peak list - most recent first */}
                  <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {peakHistory.length === 0 ? (
                      <p className="text-zinc-600 text-xs text-center py-4">Sin picos registrados aún</p>
                    ) : (
                      [...peakHistory].reverse().slice(0, 50).map((peak) => (
                        <div key={peak.id} className={`flex items-center justify-between p-2 rounded text-xs ${peak.height <= 3 ? 'bg-green-500/10 border border-green-500/20' : peak.height <= 6 ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                          <div className="flex items-center gap-2">
                            <span className={`font-bold ${peak.height <= 3 ? 'text-green-400' : peak.height <= 6 ? 'text-amber-400' : 'text-red-400'}`}>
                              Pico {peak.height}
                            </span>
                            <span className="text-zinc-500">→</span>
                            <span className={`font-bold ${peak.resultColor === 'red' ? 'text-red-400' : peak.resultColor === 'black' ? 'text-zinc-300' : 'text-green-400'}`}>
                              {peak.resultNumber}
                            </span>
                          </div>
                          <span className="text-zinc-600">
                            {peak.timestamp.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Backtesting Independiente */}
        {isJoined && numbers.length >= 6 && (
          <div className="mt-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="py-3">
                <CardTitle className="text-white flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-green-500" />
                    Backtesting
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Config Row */}
                <div className={`grid gap-3 ${(btBetType === 'dozen' || btBetType === 'column') ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-sm">Tipo de Apuesta</Label>
                    <Select value={btBetType} onValueChange={(v) => { setBtBetType(v as BetType); setBacktestResults(null) }}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {BET_TYPE_OPTIONS.map(bet => (
                          <SelectItem key={bet.id} value={bet.id}>{bet.icon} {bet.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-sm">Nivel de Pico</Label>
                    <Select value={btPeakLevel} onValueChange={(v) => { setBtPeakLevel(v as PeakLevel); setBacktestResults(null) }}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                            Pico Bajo (1-3)
                          </span>
                        </SelectItem>
                        <SelectItem value="medium">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                            Pico Medio (4-6)
                          </span>
                        </SelectItem>
                        <SelectItem value="high">
                          <span className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                            Pico Alto (7+)
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(btBetType === 'dozen' || btBetType === 'column') && (
                    <div className="space-y-2">
                      <Label className="text-zinc-400 text-sm">Modo Apuesta</Label>
                      <Select value={btDozenMode} onValueChange={(v) => { setBtDozenMode(v as BtDozenMode); setBacktestResults(null) }}>
                        <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">🎯 1 Docena</SelectItem>
                          <SelectItem value="double">🎯🎯 2 Docenas (Top 2)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label className="text-zinc-400 text-sm">Monto Base ($)</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500">$</span>
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={btAmount}
                        onChange={(e) => { setBtAmount(e.target.value); setBacktestResults(null) }}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        placeholder="1.00"
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <Button onClick={handleRunBacktest} className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-black font-bold">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Ejecutar
                    </Button>
                  </div>

                  {/* Strategy selector */}
                  <div className="flex items-center gap-2 p-2 bg-zinc-800/40 rounded-lg">
                    <span className="text-[9px] text-zinc-500">Estrategia:</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setBtStrategy('paroli'); setBacktestResults(null) }}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${btStrategy === 'paroli' ? 'bg-green-500/30 text-green-300 border border-green-500/50' : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50'}`}
                      >
                        Paroli (Win+)
                      </button>
                      <button
                        onClick={() => { setBtStrategy('martingala'); setBacktestResults(null) }}
                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${btStrategy === 'martingala' ? 'bg-orange-500/30 text-orange-300 border border-orange-500/50' : 'bg-zinc-800 text-zinc-500 border border-zinc-700/50'}`}
                      >
                        Martingala (Loss+)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Info bar */}
                <div className="flex items-center gap-2 p-2 bg-zinc-800/60 rounded-lg text-xs text-zinc-500">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <span>
                    <strong className="text-white">{numbers.length}</strong> numeros · 
                    {BET_TYPE_OPTIONS.find(b => b.id === btBetType)?.icon} {BET_TYPE_OPTIONS.find(b => b.id === btBetType)?.name} · 
                    <span className={btPeakLevel === 'low' ? 'text-teal-400' : btPeakLevel === 'medium' ? 'text-amber-400' : 'text-red-400'}>
                      {btPeakLevel === 'low' ? 'Pico Bajo (1-3)' : btPeakLevel === 'medium' ? 'Pico Medio (4-6)' : 'Pico Alto (7+)'}
                    </span> · 
                    <span className={btStrategy === 'paroli' ? 'text-green-400 font-bold' : 'text-orange-400 font-bold'}>
                      {btStrategy === 'paroli' ? 'Paroli' : 'Martingala'} {'x1->x2->x4'}
                    </span>
                    {(btBetType === 'dozen' || btBetType === 'column') && (
                      <> · <span className={btDozenMode === 'double' ? 'text-yellow-400 font-bold' : 'text-white'}>{btDozenMode === 'double' ? '🎯🎯 2 Docenas' : '🎯 1 Docena'}</span></>
                    )}
                  </span>
                </div>

                {/* Results */}
                {!backtestResults ? (
                  <p className="text-zinc-500 text-sm text-center py-6">
                    Selecciona estrategia y nivel de pico, haz clic en "Ejecutar" para simular.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Main Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      <div className="text-center p-3 bg-zinc-800 rounded-lg">
                        <div className="text-2xl font-bold text-green-500">{backtestResults.wins}</div>
                        <div className="text-xs text-zinc-400">Victorias</div>
                      </div>
                      <div className="text-center p-3 bg-zinc-800 rounded-lg">
                        <div className="text-2xl font-bold text-red-500">{backtestResults.losses}</div>
                        <div className="text-xs text-zinc-400">Derrotas</div>
                      </div>
                      <div className={`text-center p-3 bg-zinc-800 rounded-lg border ${backtestResults.netProfit >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
                        <div className={`text-2xl font-bold flex items-center justify-center gap-1 ${backtestResults.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {backtestResults.netProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          ${backtestResults.netProfit.toFixed(2)}
                        </div>
                        <div className="text-xs text-zinc-400">Ganancia Neta</div>
                      </div>
                      <div className="text-center p-3 bg-zinc-800 rounded-lg">
                        <div className={`text-2xl font-bold ${backtestResults.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {backtestResults.roi.toFixed(1)}%
                        </div>
                        <div className="text-xs text-zinc-400">ROI</div>
                      </div>
                      <div className="text-center p-3 bg-zinc-800 rounded-lg">
                        <div className="text-2xl font-bold text-amber-400">{backtestResults.peakCycles}</div>
                        <div className="text-xs text-zinc-400">Ciclos de Pico</div>
                      </div>
                    </div>

                    {/* Extended Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="text-center p-2.5 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-amber-400">{backtestResults.winRate.toFixed(1)}%</div>
                        <div className="text-xs text-zinc-500">Tasa de Acierto</div>
                      </div>
                      <div className="text-center p-2.5 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-white">{backtestResults.avgBetsPerCycle.toFixed(1)}</div>
                        <div className="text-xs text-zinc-500">Promedio Jugadas/Ciclo</div>
                      </div>
                      <div className="text-center p-2.5 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-white">{backtestResults.maxWinStreak}</div>
                        <div className="text-xs text-zinc-500">Racha Ganadora</div>
                      </div>
                      <div className="text-center p-2.5 bg-zinc-800/50 rounded-lg">
                        <div className="text-sm font-bold text-amber-400">${backtestResults.maxDrawdown.toFixed(2)}</div>
                        <div className="text-xs text-zinc-500">Max Drawdown</div>
                      </div>
                    </div>

                    {/* Strategy Info */}
                    <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                      <div className="text-xs text-zinc-400 mb-2 font-bold">
                        {btStrategy === 'paroli' ? '🟢 Paroli — Sube al ganar, baja al perder' : '🟠 Martingala — Sube al perder, baja al ganar'}
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex gap-1.5">
                          {[1, 2, 4].map((f, i) => (
                            <div key={i} className={`px-2.5 py-1 rounded text-xs text-white font-mono font-bold ${i === 0 ? 'bg-cyan-600/60' : i === 1 ? 'bg-orange-600/60' : 'bg-red-600/60'}`}>
                              x{f}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          {btStrategy === 'paroli'
                            ? 'Win: x1 -> x2 -> x4 (3 wins max = cobrar). Loss: reset a x1'
                            : 'Loss: x1 -> x2 -> x4 (3 fases max). Win: reset a x1'
                          }
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="text-sm font-bold text-white">${backtestResults.totalInvested.toFixed(2)}</div>
                          <div className="text-xs text-zinc-500">Total Invertido</div>
                        </div>
                        <div>
                          <div className={`text-sm font-bold ${backtestResults.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>${backtestResults.netProfit.toFixed(2)}</div>
                          <div className="text-xs text-zinc-500">Resultado Neto</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{backtestResults.totalBets}</div>
                          <div className="text-xs text-zinc-500">Total Apuestas</div>
                        </div>
                      </div>
                    </div>

                    {/* Fibonacci Detail Cycles */}
                    {backtestResults.fibonacciDetail && backtestResults.fibonacciDetail.length > 0 && (
                      <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                        <div className="text-xs text-zinc-400 mb-2 font-bold">📋 Detalle por Ciclo de Pico</div>
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                          {backtestResults.fibonacciDetail.map((detail) => (
                            <div key={detail.cycle} className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                              detail.result === 'win' 
                                ? 'bg-green-500/10 border border-green-500/20' 
                                : 'bg-red-500/10 border border-red-500/20'
                            }`}>
                              <div className="flex items-center gap-3">
                                <span className="text-zinc-500 font-mono w-8">#{detail.cycle}</span>
                                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                                  detail.entryPeak <= 3 ? 'bg-teal-500/20 text-teal-400' :
                                  detail.entryPeak <= 6 ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  Pico {detail.entryPeak}
                                </span>
                                <div className="flex gap-1">
                                  {detail.predicted.length > 0 && detail.predicted.map((p, pi) => (
                                    <span key={pi} className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      pi === 0 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-500/10 text-yellow-300'
                                    }`}>
                                      {pi === 0 ? '⭐' : '🎯'} {p}
                                    </span>
                                  ))}
                                </div>
                                <div className="flex gap-1">
                                  {detail.bets.map((bet, bi) => (
                                    <span key={bi} className={`px-1.5 py-0.5 rounded text-[10px] text-zinc-300 font-mono ${(detail.strategyStep?.[bi] || 1) === 4 ? 'bg-red-500/20 text-red-400' : (detail.strategyStep?.[bi] || 1) === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-zinc-700'}`}>
                                      x{detail.strategyStep?.[bi] || 1} ${bet.toFixed(2)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${detail.result === 'win' ? 'text-green-400' : 'text-red-400'}`}>
                                  {detail.result === 'win' ? 'WIN' : 'LOSS'}
                                </span>
                                <span className={`font-mono ${detail.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {detail.profit >= 0 ? '+' : ''}{detail.profit.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Profit Curve (mini chart) */}
                    {backtestResults.profitCurve.length > 1 && (
                      <div className="p-3 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-zinc-300">📈 Curva de Ganancias</span>
                          <span className={`text-xs font-bold ${backtestResults.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {backtestResults.netProfit >= 0 ? 'Rentable' : 'Perdedero'}
                          </span>
                        </div>
                        <div className="flex items-end gap-px h-12">
                          {backtestResults.profitCurve.filter((_, i) => i % Math.max(1, Math.floor(backtestResults.profitCurve.length / 60)) === 0).map((val, i) => {
                            const min = Math.min(...backtestResults.profitCurve)
                            const max = Math.max(...backtestResults.profitCurve)
                            const range = max - min || 1
                            const height = ((val - min) / range) * 100
                            return (
                              <div key={i} className="flex-1 rounded-t-sm min-h-[2px]" style={{
                                height: `${Math.max(2, height)}%`,
                                backgroundColor: val >= 0 ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)',
                                opacity: 0.7
                              }} />
                            )
                          })}
                        </div>
                        <div className="flex justify-between text-xs text-zinc-600 mt-1">
                          <span>${Math.min(...backtestResults.profitCurve).toFixed(2)}</span>
                          <span>${Math.max(...backtestResults.profitCurve).toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
