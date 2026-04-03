import { create } from 'zustand'

export interface RouletteNumber {
  id: string
  number: number
  color: 'red' | 'black' | 'green'
  timestamp: Date
}

export interface Prediction {
  id: string
  numbers: number[]
  prediction: number[]
  confidence: number
  hit?: boolean
  createdAt: Date
}

export interface RouletteSession {
  id: string
  name: string
  platform: 'Azure' | 'Bet365' | 'Evolution' | 'Pinnacle'
  numbers: RouletteNumber[]
  predictions: Prediction[]
  isActive: boolean
}

export interface User {
  id: string
  email: string
  name: string
  subscription?: {
    plan: string
    status: string
    endDate: string | null
  }
}

interface AppState {
  // Auth State
  user: User | null
  isAuthenticated: boolean
  
  // UI State
  currentView: 'landing' | 'dashboard' | 'dashboard-live' | 'cartillas' | 'graficas'
  isMenuOpen: boolean
  activeTab: 'analisis' | 'historial' | 'predicciones' | 'live'
  
  // Roulette State
  sessions: RouletteSession[]
  currentSession: RouletteSession | null
  inputNumbers: number[]
  
  // Prediction State
  currentPrediction: Prediction | null
  predictionHistory: Prediction[]
  
  // Actions - Auth
  setUser: (user: User | null) => void
  logout: () => void
  
  // Actions - UI
  setCurrentView: (view: 'landing' | 'dashboard' | 'dashboard-live' | 'cartillas' | 'graficas') => void
  setMenuOpen: (open: boolean) => void
  setActiveTab: (tab: 'analisis' | 'historial' | 'predicciones' | 'live') => void
  setInputNumbers: (numbers: number[]) => void
  addInputNumber: (num: number) => void
  clearInputNumbers: () => void
  setCurrentSession: (session: RouletteSession | null) => void
  addNumberToSession: (sessionId: string, number: RouletteNumber) => void
  setCurrentPrediction: (prediction: Prediction | null) => void
  addPredictionToHistory: (prediction: Prediction) => void
  createSession: (name: string, platform: 'Azure' | 'Bet365' | 'Evolution' | 'Pinnacle') => void
}

// Predefined roulette numbers by color
export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
export const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

export const getNumberColor = (num: number): 'red' | 'black' | 'green' => {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

export const useAppStore = create<AppState>((set) => ({
  // Auth State
  user: null,
  isAuthenticated: false,
  
  // UI State
  currentView: 'landing',
  isMenuOpen: false,
  activeTab: 'analisis',
  
  // Roulette State
  sessions: [],
  currentSession: null,
  inputNumbers: [],
  
  // Prediction State
  currentPrediction: null,
  predictionHistory: [],
  
  // Actions - Auth
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  logout: () => set({ 
    user: null, 
    isAuthenticated: false,
    currentView: 'landing',
    sessions: [],
    currentSession: null,
    inputNumbers: [],
    currentPrediction: null,
    predictionHistory: []
  }),
  
  // Actions - UI
  setCurrentView: (view) => set({ currentView: view }),
  setMenuOpen: (open) => set({ isMenuOpen: open }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setInputNumbers: (numbers) => set({ inputNumbers: numbers }),
  addInputNumber: (num) => set((state) => ({ 
    inputNumbers: [...state.inputNumbers, num].slice(-50)
  })),
  clearInputNumbers: () => set({ inputNumbers: [] }),
  setCurrentSession: (session) => set({ currentSession: session }),
  addNumberToSession: (sessionId, number) => set((state) => ({
    sessions: state.sessions.map(s => 
      s.id === sessionId 
        ? { ...s, numbers: [...s.numbers, number] }
        : s
    )
  })),
  setCurrentPrediction: (prediction) => set({ currentPrediction: prediction }),
  addPredictionToHistory: (prediction) => set((state) => ({
    predictionHistory: [...state.predictionHistory, prediction].slice(-100)
  })),
  createSession: (name, platform) => set((state) => {
    const newSession: RouletteSession = {
      id: Date.now().toString(),
      name,
      platform,
      numbers: [],
      predictions: [],
      isActive: true
    }
    return { 
      sessions: [...state.sessions, newSession],
      currentSession: newSession
    }
  })
}))
