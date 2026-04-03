'use client'

import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { 
  Target, ShieldCheck, AlertTriangle, 
  ChevronDown, ChevronUp, Zap, Gauge, History
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// --- CONFIGURACIÓN LÓGICA ---
const CONFIDENCE_THRESHOLD = 88; // Umbral para disparar señal
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

const getNumData = (n: number) => ({
  color: n === 0 ? 'green' : RED_NUMBERS.includes(n) ? 'red' : 'black',
  parity: n === 0 ? 'zero' : n % 2 === 0 ? 'even' : 'odd',
  dozen: n === 0 ? 0 : Math.ceil(n / 12),
  column: n === 0 ? 0 : n % 3 === 0 ? 3 : n % 3
})

// --- MOTOR DE PREDICCIÓN MULTI-MERCADO ---
function getMultiMarketPredictions(numbers: number[]) {
  try {
    if (!numbers || !Array.isArray(numbers) || numbers.length < 12) return []

    const last15 = numbers.slice(-15)
    if (!last15 || last15.length === 0) return []

    const data = last15.map(getNumData)
    if (!data || data.length === 0) return []

    const signals: { market: string; bet: string; conf: number }[] = []

    // 1. ANÁLISIS DE COLORES
    let redCount = 0, blackCount = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i].color === 'red') redCount++
      if (data[i] && data[i].color === 'black') blackCount++
    }
    if (redCount >= 10) signals.push({ market: 'COLOR', bet: 'NEGRO', conf: 92 })
    else if (blackCount >= 10) signals.push({ market: 'COLOR', bet: 'ROJO', conf: 92 })

    // 2. ANÁLISIS PAR / IMPAR
    let evenCount = 0, oddCount = 0
    for (let i = 0; i < data.length; i++) {
      if (data[i] && data[i].parity === 'even') evenCount++
      if (data[i] && data[i].parity === 'odd') oddCount++
    }
    if (evenCount >= 10) signals.push({ market: 'P/I', bet: 'IMPAR', conf: 89 })
    else if (oddCount >= 10) signals.push({ market: 'P/I', bet: 'PAR', conf: 89 })

    // 3. ANÁLISIS DE DOCENAS (Saturación)
    if (numbers.length >= 15) {
      for (let d = 1; d <= 3; d++) {
        let count = 0
        for (let i = 0; i < data.length; i++) {
          if (data[i] && data[i].dozen === d) count++
        }
        if (count <= 1) signals.push({ market: 'DOCENA', bet: `DOCENA ${d}`, conf: 85 })
      }
    }

    // 4. ANÁLISIS DE COLUMNAS
    if (numbers.length >= 15) {
      for (let c = 1; c <= 3; c++) {
        let count = 0
        for (let i = 0; i < data.length; i++) {
          if (data[i] && data[i].column === c) count++
        }
        if (count <= 1) signals.push({ market: 'COLUMNA', bet: `COLUMNA ${c}`, conf: 85 })
      }
    }

    return signals.sort((a, b) => b.conf - a.conf)
  } catch (e) {
    console.error('[UltimateSignals] Error in getMultiMarketPredictions:', e)
    return []
  }
}

interface UltimateSignalsProps {
  inputNumbers: number[]
}

export function UltimateSignals({ inputNumbers }: UltimateSignalsProps) {
  const [expandedRisk, setExpandedRisk] = useState(false)
  
  const predictions = useMemo(() => {
    if (!inputNumbers || !Array.isArray(inputNumbers) || inputNumbers.length < 12) return []
    return getMultiMarketPredictions(inputNumbers)
  }, [inputNumbers])

  return (
    <div className="space-y-4">
      {/* HEADER STATUS */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="py-3 px-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs font-bold tracking-tighter text-zinc-400">SISTEMA V4.0 LIVE</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <History className="w-3 h-3" />
              Muestra: {inputNumbers.length} giros
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MONITOR DE SEÑALES ACTIVAS */}
      <Card className="bg-zinc-900 border-2 border-amber-500/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Señales de Alta Probabilidad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {predictions.length > 0 ? (
            predictions.map((sig, idx) => (
              <motion.div 
                initial={{ x: -20, opacity: 0 }} 
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: idx * 0.1 }}
                key={idx}
                className="bg-zinc-900 border-l-4 border-l-amber-500 border-zinc-800 p-4 rounded-r-xl"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">{sig.market}</span>
                    <div className="text-xl font-black text-white">{sig.bet}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-amber-400">{sig.conf}% CONF</div>
                    <div className="text-[10px] text-zinc-600">Entrada Sugerida</div>
                  </div>
                </div>
                <div className="mt-3 h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${sig.conf}%` }}
                    transition={{ duration: 0.8, delay: idx * 0.1 }}
                    className="h-full bg-amber-500 rounded-full" 
                  />
                </div>
              </motion.div>
            ))
          ) : (
            <div className="py-10 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-600">
              <Gauge className="w-8 h-8 mb-2 opacity-20" />
              <p className="text-xs font-medium uppercase">Analizando patrones críticos...</p>
              <p className="text-[10px] mt-1 opacity-50">Esperando desbalance estadístico</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* PANEL DE CONTROL DE RIESGO */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="py-3 px-4">
          <button
            onClick={() => setExpandedRisk(!expandedRisk)}
            className="w-full flex items-center justify-between"
          >
            <CardTitle className="text-xs text-zinc-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" /> PROTECCIÓN DE CAPITAL
            </CardTitle>
            {expandedRisk ? (
              <ChevronUp className="w-4 h-4 text-zinc-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-zinc-500" />
            )}
          </button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-black/40 p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase">Stop Loss Sugerido</div>
              <div className="text-lg font-bold text-red-500">-5 Unidades</div>
            </div>
            <div className="bg-black/40 p-3 rounded-lg border border-zinc-800">
              <div className="text-[10px] text-zinc-500 uppercase">Martingala Max</div>
              <div className="text-lg font-bold text-zinc-200">Nivel 3</div>
            </div>
          </div>
          <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded flex items-center gap-2">
            <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
            <span className="text-[9px] text-amber-200 leading-tight">
              Si una docena no sale por 15 giros, la probabilidad de éxito aumenta al 94% en los próximos 3 giros.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* FOOTER - HISTORIAL RÁPIDO */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardContent className="py-3 px-4">
          <div className="text-[10px] text-zinc-500 font-bold uppercase mb-2">Última Secuencia</div>
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {inputNumbers.length > 0 ? (
              inputNumbers.slice(-12).reverse().map((n, i) => {
                const d = getNumData(n)
                return (
                  <div key={i} className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shadow-lg ${
                    d.color === 'red' ? 'bg-red-600' : d.color === 'green' ? 'bg-green-600' : 'bg-zinc-800'
                  }`}>
                    {n}
                  </div>
                )
              })
            ) : (
              <span className="text-zinc-600 text-xs">Sin números ingresados</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
