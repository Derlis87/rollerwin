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
  TrendingUp
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { useAppStore, getNumberColor } from '@/store/app-store'
import { CASINO_CONFIGS, openCasino, getTableUrl } from '@/lib/casino-urls'
import { ColorParityChart } from './charts/ColorParityChart'
import { PeakLevelCharts } from './charts/PeakLevelCharts'
import { PeakVolumeIndicator } from './charts/PeakVolumeIndicator'
import { PatternDetector } from './charts/PatternDetector'
import { ProbabilityPanel } from './charts/ProbabilityPanel'

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

interface BetPrediction {
  type: BetType
  value: string
}

interface PeakRecord {
  id: string
  height: number
  prediction: BetPrediction
  resultNumber: number
  resultColor: 'red' | 'black' | 'green'
  timestamp: Date
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
  
  // Peak system state - CORRECTED LOGIC
  const [currentPeak, setCurrentPeak] = useState(1) // Starts at 1
  const [currentPrediction, setCurrentPrediction] = useState<BetPrediction | null>(null)
  const [peakHistory, setPeakHistory] = useState<PeakRecord[]>([]) // Completed peaks
  const [confidence, setConfidence] = useState(0)
  
  // UI state
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [showKeyboardHint, setShowKeyboardHint] = useState(true)
  
  // Demo mode
  const [isDemoMode, setIsDemoMode] = useState(false)
  const demoIntervalRef = useRef<NodeJS.Timeout | null>(null)
  
  
  
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
        
        if (num <= 12) stats.dozen1++
        else if (num <= 24) stats.dozen2++
        else stats.dozen3++
        
        if (num % 3 === 1) stats.col1++
        else if (num % 3 === 2) stats.col2++
        else stats.col3++
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

  // Advanced prediction algorithm
  const generatePrediction = useCallback((nums: number[], betType: BetType): BetPrediction => {
    const stats = calculateStats(nums)
    const total = nums.length || 1
    const nonZeroTotal = nums.filter(n => n !== 0).length || 1
    
    // Calculate trend weight (recent numbers have more weight)
    const recentWeight = nums.slice(-10).length > 0 ? 1.5 : 1
    
    switch (betType) {
      case 'color': {
        const redPct = (stats.red / total) * 100
        const blackPct = (stats.black / total) * 100
        
        // Streak analysis - if streak is long, predict opposite
        const streakThreshold = 4
        if (stats.lastRedStreak >= streakThreshold) {
          return { type: 'color', value: 'black' }
        }
        if (stats.lastBlackStreak >= streakThreshold) {
          return { type: 'color', value: 'red' }
        }
        
        // Law of large numbers - predict opposite of dominant
        const threshold = 5 * recentWeight
        if (redPct > blackPct + threshold) {
          return { type: 'color', value: 'black' }
        } else if (blackPct > redPct + threshold) {
          return { type: 'color', value: 'red' }
        }
        
        // Recent trend analysis
        const recentRed = nums.slice(-5).filter(n => getNumberColor(n) === 'red').length
        const recentBlack = nums.slice(-5).filter(n => getNumberColor(n) === 'black').length
        if (recentRed >= 4) return { type: 'color', value: 'black' }
        if (recentBlack >= 4) return { type: 'color', value: 'red' }
        
        // Default - predict opposite of last color
        const lastColor = nums.length > 0 ? getNumberColor(nums[nums.length - 1]) : 'red'
        return { type: 'color', value: lastColor === 'red' ? 'black' : 'red' }
      }
      
      case 'parity': {
        const oddPct = (stats.odd / nonZeroTotal) * 100
        const evenPct = (stats.even / nonZeroTotal) * 100
        
        // Streak analysis
        if (stats.lastOddStreak >= 4) {
          return { type: 'parity', value: 'even' }
        }
        if (stats.lastEvenStreak >= 4) {
          return { type: 'parity', value: 'odd' }
        }
        
        // Percentage analysis
        const threshold = 5 * recentWeight
        if (oddPct > evenPct + threshold) {
          return { type: 'parity', value: 'even' }
        } else if (evenPct > oddPct + threshold) {
          return { type: 'parity', value: 'odd' }
        }
        
        // Recent trend
        const recentOdd = nums.slice(-5).filter(n => n !== 0 && n % 2 === 1).length
        const recentEven = nums.slice(-5).filter(n => n !== 0 && n % 2 === 0).length
        if (recentOdd >= 4) return { type: 'parity', value: 'even' }
        if (recentEven >= 4) return { type: 'parity', value: 'odd' }
        
        // Default
        return { type: 'parity', value: 'odd' }
      }
      
      case 'dozen': {
        const d1 = (stats.dozen1 / nonZeroTotal) * 100
        const d2 = (stats.dozen2 / nonZeroTotal) * 100
        const d3 = (stats.dozen3 / nonZeroTotal) * 100
        
        // Analyze recent trends (last 10 spins)
        const recentNums = nums.slice(-10).filter(n => n !== 0)
        const d1Recent = recentNums.filter(n => n <= 12).length
        const d2Recent = recentNums.filter(n => n > 12 && n <= 24).length
        const d3Recent = recentNums.filter(n => n > 24).length
        
        // Last number's dozen
        const lastNum = nums[nums.length - 1]
        const lastDozen = lastNum === 0 ? null : 
          lastNum <= 12 ? 1 : lastNum <= 24 ? 2 : 3
        
        // Check for racha (same dozen appearing multiple times)
        const last5 = nums.slice(-5).filter(n => n !== 0)
        let currentDozenStreak = 0
        if (last5.length > 0) {
          const lastDozenVal = last5[last5.length - 1] <= 12 ? 1 : 
            last5[last5.length - 1] <= 24 ? 2 : 3
          for (let i = last5.length - 1; i >= 0; i--) {
            const d = last5[i] <= 12 ? 1 : last5[i] <= 24 ? 2 : 3
            if (d === lastDozenVal) currentDozenStreak++
            else break
          }
        }
        
        // If a dozen has appeared 3+ times in a row, predict one of the others
        if (currentDozenStreak >= 3) {
          const streakDozen = last5[last5.length - 1] <= 12 ? 1 : 
            last5[last5.length - 1] <= 24 ? 2 : 3
          const others = [1, 2, 3].filter(d => d !== streakDozen)
          // Choose the one that has appeared less recently
          const recentCounts = others.map(d => 
            d === 1 ? d1Recent : d === 2 ? d2Recent : d3Recent
          )
          const minRecentIdx = recentCounts.indexOf(Math.min(...recentCounts))
          const predictedDozen = others[minRecentIdx]
          return { type: 'dozen', value: predictedDozen === 1 ? '1-12' : predictedDozen === 2 ? '13-24' : '25-36' }
        }
        
        // Check for complete absence in last 8 spins (strong signal)
        const last8Nums = nums.slice(-8).filter(n => n !== 0)
        const d1Last8 = last8Nums.filter(n => n <= 12).length
        const d2Last8 = last8Nums.filter(n => n > 12 && n <= 24).length
        const d3Last8 = last8Nums.filter(n => n > 24).length
        
        // If a dozen hasn't appeared in 8+ spins, predict it
        if (d1Last8 === 0 && last8Nums.length >= 6) return { type: 'dozen', value: '1-12' }
        if (d2Last8 === 0 && last8Nums.length >= 6) return { type: 'dozen', value: '13-24' }
        if (d3Last8 === 0 && last8Nums.length >= 6) return { type: 'dozen', value: '25-36' }
        
        // Analyze last 3 spins pattern
        const last3 = nums.slice(-3).filter(n => n !== 0)
        if (last3.length >= 3) {
          const dozens3 = last3.map(n => n <= 12 ? 1 : n <= 24 ? 2 : 3)
          const allDifferent = new Set(dozens3).size === 3
          
          // If last 3 were all different dozens, predict opposite of last
          if (allDifferent && lastDozen !== null) {
            const others = [1, 2, 3].filter(d => d !== lastDozen)
            // Choose based on which has better recent vs expected ratio
            const ratios = others.map(d => {
              const recent = d === 1 ? d1Recent : d === 2 ? d2Recent : d3Recent
              const expected = recentNums.length / 3
              return recent / expected
            })
            // Predict the one that's underperforming recently
            const minIdx = ratios.indexOf(Math.min(...ratios))
            const predictedDozen = others[minIdx]
            return { type: 'dozen', value: predictedDozen === 1 ? '1-12' : predictedDozen === 2 ? '13-24' : '25-36' }
          }
        }
        
        // Hot zone analysis - predict based on recent trend
        const recentTrend = [
          { dozen: 1, count: d1Recent, pct: (d1Recent / Math.max(1, recentNums.length)) * 100 },
          { dozen: 2, count: d2Recent, pct: (d2Recent / Math.max(1, recentNums.length)) * 100 },
          { dozen: 3, count: d3Recent, pct: (d3Recent / Math.max(1, recentNums.length)) * 100 }
        ]
        
        // Find the "coldest" dozen recently (least appearances in last 10)
        const coldest = recentTrend.reduce((min, curr) => curr.count < min.count ? curr : min)
        
        // If there's a clear cold dozen (less than 20% of recent spins)
        if (coldest.pct < 20 && recentNums.length >= 5) {
          return { type: 'dozen', value: coldest.dozen === 1 ? '1-12' : coldest.dozen === 2 ? '13-24' : '25-36' }
        }
        
        // Alternation pattern - if last two were same dozen, predict different
        if (last3.length >= 2) {
          const dLast2 = last3.slice(-2).map(n => n <= 12 ? 1 : n <= 24 ? 2 : 3)
          if (dLast2[0] === dLast2[1]) {
            const sameDozen = dLast2[0]
            const others = [1, 2, 3].filter(d => d !== sameDozen)
            // Pick the one with least global appearances
            const globalCounts = others.map(d => d === 1 ? stats.dozen1 : d === 2 ? stats.dozen2 : stats.dozen3)
            const minIdx = globalCounts.indexOf(Math.min(...globalCounts))
            const predictedDozen = others[minIdx]
            return { type: 'dozen', value: predictedDozen === 1 ? '1-12' : predictedDozen === 2 ? '13-24' : '25-36' }
          }
        }
        
        // Default: predict based on combination of recent absence and global underperformance
        const scores = [
          { dozen: 1, score: (33.3 - d1) + (33.3 - (d1Recent / Math.max(1, recentNums.length)) * 100) * 1.5 },
          { dozen: 2, score: (33.3 - d2) + (33.3 - (d2Recent / Math.max(1, recentNums.length)) * 100) * 1.5 },
          { dozen: 3, score: (33.3 - d3) + (33.3 - (d3Recent / Math.max(1, recentNums.length)) * 100) * 1.5 }
        ]
        
        // Avoid predicting the same dozen that just appeared
        if (lastDozen !== null) {
          scores[lastDozen - 1].score -= 10
        }
        
        const best = scores.reduce((max, curr) => curr.score > max.score ? curr : max)
        return { type: 'dozen', value: best.dozen === 1 ? '1-12' : best.dozen === 2 ? '13-24' : '25-36' }
      }
      
      case 'column': {
        const c1 = (stats.col1 / nonZeroTotal) * 100
        const c2 = (stats.col2 / nonZeroTotal) * 100
        const c3 = (stats.col3 / nonZeroTotal) * 100
        
        // Analyze recent trends (last 10 spins)
        const recentNums = nums.slice(-10).filter(n => n !== 0)
        const c1Recent = recentNums.filter(n => n % 3 === 1).length
        const c2Recent = recentNums.filter(n => n % 3 === 2).length
        const c3Recent = recentNums.filter(n => n % 3 === 0 && n !== 0).length
        
        // Last number's column
        const lastNum = nums[nums.length - 1]
        const lastCol = lastNum === 0 ? null : 
          lastNum % 3 === 1 ? 1 : lastNum % 3 === 2 ? 2 : 3
        
        // Check for racha (same column appearing multiple times)
        const last5 = nums.slice(-5).filter(n => n !== 0)
        let currentColStreak = 0
        if (last5.length > 0) {
          const lastColVal = last5[last5.length - 1] % 3 === 0 ? 3 : last5[last5.length - 1] % 3
          for (let i = last5.length - 1; i >= 0; i--) {
            const c = last5[i] % 3 === 0 ? 3 : last5[i] % 3
            if (c === lastColVal) currentColStreak++
            else break
          }
        }
        
        // If a column has appeared 3+ times in a row, predict one of the others
        if (currentColStreak >= 3) {
          const streakCol = last5[last5.length - 1] % 3 === 0 ? 3 : last5[last5.length - 1] % 3
          const others = [1, 2, 3].filter(c => c !== streakCol)
          const recentCounts = others.map(c => 
            c === 1 ? c1Recent : c === 2 ? c2Recent : c3Recent
          )
          const minRecentIdx = recentCounts.indexOf(Math.min(...recentCounts))
          const predictedCol = others[minRecentIdx]
          return { type: 'column', value: predictedCol.toString() }
        }
        
        // Check for complete absence in last 8 spins
        const last8Nums = nums.slice(-8).filter(n => n !== 0)
        const c1Last8 = last8Nums.filter(n => n % 3 === 1).length
        const c2Last8 = last8Nums.filter(n => n % 3 === 2).length
        const c3Last8 = last8Nums.filter(n => n % 3 === 0).length
        
        // If a column hasn't appeared in 6+ spins, predict it
        if (c1Last8 === 0 && last8Nums.length >= 6) return { type: 'column', value: '1' }
        if (c2Last8 === 0 && last8Nums.length >= 6) return { type: 'column', value: '2' }
        if (c3Last8 === 0 && last8Nums.length >= 6) return { type: 'column', value: '3' }
        
        // Hot zone analysis
        const recentTrend = [
          { col: 1, count: c1Recent, pct: (c1Recent / Math.max(1, recentNums.length)) * 100 },
          { col: 2, count: c2Recent, pct: (c2Recent / Math.max(1, recentNums.length)) * 100 },
          { col: 3, count: c3Recent, pct: (c3Recent / Math.max(1, recentNums.length)) * 100 }
        ]
        
        // Find the "coldest" column recently
        const coldest = recentTrend.reduce((min, curr) => curr.count < min.count ? curr : min)
        
        // If there's a clear cold column (less than 20% of recent spins)
        if (coldest.pct < 20 && recentNums.length >= 5) {
          return { type: 'column', value: coldest.col.toString() }
        }
        
        // Alternation pattern
        const last3 = nums.slice(-3).filter(n => n !== 0)
        if (last3.length >= 2) {
          const cLast2 = last3.slice(-2).map(n => n % 3 === 0 ? 3 : n % 3)
          if (cLast2[0] === cLast2[1]) {
            const sameCol = cLast2[0]
            const others = [1, 2, 3].filter(c => c !== sameCol)
            const globalCounts = others.map(c => c === 1 ? stats.col1 : c === 2 ? stats.col2 : stats.col3)
            const minIdx = globalCounts.indexOf(Math.min(...globalCounts))
            const predictedCol = others[minIdx]
            return { type: 'column', value: predictedCol.toString() }
          }
        }
        
        // Default: predict based on combination of recent and global
        const scores = [
          { col: 1, score: (33.3 - c1) + (33.3 - (c1Recent / Math.max(1, recentNums.length)) * 100) * 1.5 },
          { col: 2, score: (33.3 - c2) + (33.3 - (c2Recent / Math.max(1, recentNums.length)) * 100) * 1.5 },
          { col: 3, score: (33.3 - c3) + (33.3 - (c3Recent / Math.max(1, recentNums.length)) * 100) * 1.5 }
        ]
        
        // Avoid predicting the same column that just appeared
        if (lastCol !== null) {
          scores[lastCol - 1].score -= 10
        }
        
        const best = scores.reduce((max, curr) => curr.score > max.score ? curr : max)
        return { type: 'column', value: best.col.toString() }
      }
      
      default:
        return { type: 'color', value: 'red' }
    }
  }, [calculateStats])

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

  // Handle number input - CORRECTED PEAK LOGIC
  const handleNumberInput = useCallback((num: number, fromDemo = false) => {
    if (soundEnabledRef.current && !fromDemo) playSound('click')
    
    // Add number to history
    const newNumbers = [...numbersRef.current, num].slice(-100)
    setNumbers(newNumbers)
    
    // Get current prediction (generate if needed) - MINIMO 10 NUMEROS
    let prediction = currentPredictionRef.current
    
    if (!prediction && newNumbers.length >= 10) {
      // Generate first prediction
      prediction = generatePrediction(newNumbers, selectedBetTypeRef.current)
      setCurrentPrediction(prediction)
      
      // Calculate confidence
      const stats = calculateStats(newNumbers)
      const total = newNumbers.length
      let conf = 50
      
      if (prediction.type === 'color') {
        const redPct = (stats.red / total) * 100
        const blackPct = (stats.black / total) * 100
        conf = 50 + Math.abs(redPct - blackPct)
      } else if (prediction.type === 'parity') {
        const nonZeroTotal = newNumbers.filter(n => n !== 0).length || 1
        const oddPct = (stats.odd / nonZeroTotal) * 100
        const evenPct = (stats.even / nonZeroTotal) * 100
        conf = 50 + Math.abs(oddPct - evenPct)
      }
      
      setConfidence(Math.min(85, conf))
    }
    
    // Check if we have a prediction to verify
    if (prediction) {
      const matched = checkPredictionMatch(prediction, num)
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
        setPeakHistory(prev => [...prev, peakRecord].slice(-20))
        
        // Reset peak to 1
        setCurrentPeak(1)
        
        // Generate new prediction for next round - MINIMO 10 NUMEROS
        if (newNumbers.length >= 10) {
          const newPrediction = generatePrediction(newNumbers, selectedBetTypeRef.current)
          setCurrentPrediction(newPrediction)
        }
      } else {
        // FAILED - increment peak
        if (soundEnabledRef.current) playSound('fail')
        
        const newPeak = currentPeakValue + 1
        setCurrentPeak(newPeak)
        
        // Generate new prediction (might change based on new data) - MINIMO 10 NUMEROS
        if (newNumbers.length >= 10) {
          const newPrediction = generatePrediction(newNumbers, selectedBetTypeRef.current)
          setCurrentPrediction(newPrediction)
        }
      }
    }
  }, [generatePrediction, checkPredictionMatch, calculateStats])

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
    setPeakHistory([])
    setCurrentPeak(1)
    setCurrentPrediction(null)
    setConfidence(0)
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

        {/* Prediction */}
        {currentPrediction && (
          <div className="p-3 border-b border-zinc-700">
            <div className="text-xs text-zinc-400 mb-1">Predicción:</div>
            <div className="text-lg font-bold text-amber-500">{getPredictionDisplay()}</div>
            <div className="flex items-center gap-2 mt-1">
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
            {peakHistory.slice(-10).map((peak, i) => (
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
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
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
                      <h4 className="text-amber-500 font-bold mb-3 flex items-center gap-2"><Zap className="w-4 h-4" />Instrucciones:</h4>
                      <ol className="text-sm text-zinc-300 space-y-2">
                        <li className="flex items-start gap-2"><span className="bg-amber-500 text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">1</span><span>Elige el <strong>casino</strong> y la <strong>mesa de ruleta</strong></span></li>
                        <li className="flex items-start gap-2"><span className="bg-amber-500 text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">2</span><span>Haz clic en <strong>"Abrir Casino"</strong></span></li>
                        <li className="flex items-start gap-2"><span className="bg-amber-500 text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">3</span><span>Haz <strong>login</strong> en el casino</span></li>
                        <li className="flex items-start gap-2"><span className="bg-amber-500 text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">4</span><span>Ingresa los números que salen (teclado 0-9 o botones)</span></li>
                        <li className="flex items-start gap-2"><span className="bg-cyan-500 text-black rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold shrink-0">5</span><span>El software te dará <strong>predicciones</strong> y mostrará los <strong>picos</strong></span></li>
                      </ol>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                          <span className="text-green-400 font-medium">{currentCasino?.name}</span>
                        </div>
                        <span className="text-zinc-500">|</span>
                        <span className="text-zinc-300">{currentTable?.name}</span>
                        {currentTable?.provider && <Badge className="bg-zinc-700 text-zinc-300 text-xs">{currentTable.provider}</Badge>}
                      </div>
                      
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openCasino(selectedCasino, selectedTable)} className="border-zinc-700 text-zinc-300 hover:text-white">
                          <ExternalLink className="w-4 h-4 mr-2" />Reabrir Casino
                        </Button>
                        
                        {!isDemoMode ? (
                          <Button variant="outline" onClick={startDemoMode} className="border-amber-500 text-amber-500 hover:bg-amber-500/20">
                            <Bot className="w-4 h-4 mr-2" />Modo Demo
                          </Button>
                        ) : (
                          <Button variant="destructive" onClick={stopDemoMode}>
                            <Timer className="w-4 h-4 mr-2" />Detener Demo
                          </Button>
                        )}
                        
                        <Button variant="destructive" onClick={handleLeaveTable}>Abandonar Mesa</Button>
                      </div>
                    </div>

                    {/* Stats Bar */}
                    <div className="grid grid-cols-4 gap-4 p-4 bg-zinc-800 rounded-lg">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{numbers.length}</div>
                        <div className="text-xs text-zinc-500">Números</div>
                      </div>
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
                {currentPrediction && numbers.length >= 10 ? (
                  <Card className="bg-gradient-to-r from-zinc-900 to-zinc-800 border-amber-500/30">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div>
                          <div className="text-xs text-zinc-400 mb-1 flex items-center gap-2"><Target className="w-3 h-3" />PREDICCIÓN ACTUAL</div>
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
                    </CardContent>
                  </Card>
                ) : numbers.length > 0 && numbers.length < 10 ? (
                  <Card className="bg-zinc-900 border-zinc-700">
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs text-zinc-400 mb-1 flex items-center gap-2"><Target className="w-3 h-3" />PREDICCIÓN</div>
                          <div className="text-lg font-bold text-zinc-500">
                            Ingresa {10 - numbers.length} número{10 - numbers.length !== 1 ? 's' : ''} más para comenzar
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-zinc-700 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-amber-500 transition-all duration-300" 
                              style={{ width: `${(numbers.length / 10) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-zinc-400">{numbers.length}/10</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                {/* Charts */}
                {numbers.length >= 5 && <ColorParityChart numbers={numbers} />}
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

              {/* Quick Stats */}
              <Card className="bg-zinc-900 border-zinc-800 mt-4">
                <CardContent className="py-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xl font-bold text-green-500">{successCount}</div>
                      <div className="text-xs text-zinc-500">Aciertos</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-amber-500">{avgPeakHeight}</div>
                      <div className="text-xs text-zinc-500">Promedio</div>
                    </div>
                    <div>
                      <div className="text-xl font-bold text-red-500">
                        {peakHistory.filter(p => p.height >= 7).length}
                      </div>
                      <div className="text-xs text-zinc-500">Altos</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* Peak Volume Indicator - INDEPENDENT SECTION */}
        {isJoined && (
          <div className="mt-6">
            <PeakVolumeIndicator 
              peakHistory={peakHistory} 
              currentPeak={currentPeak} 
            />
          </div>
        )}

        {/* Pattern Detector - NEURAL SYSTEM INDEPENDENT */}
        {isJoined && (
          <div className="mt-6">
            <PatternDetector 
              peakHistory={peakHistory} 
              currentPeak={currentPeak} 
            />
          </div>
        )}

        {/* Probability Panel - MATHEMATICAL ENGINE */}
        {isJoined && (
          <div className="mt-6">
            <ProbabilityPanel 
              numbers={numbers}
              betType={selectedBetType}
              currentPeak={currentPeak}
            />
          </div>
        )}

        {/* Peak Level Charts - INDEPENDENT SECTION BELOW */}
        {isJoined && (
          <div className="mt-6">
            <PeakLevelCharts 
              peakHistory={peakHistory} 
              currentPeak={currentPeak} 
            />
          </div>
        )}
      </main>
    </div>
  )
}
