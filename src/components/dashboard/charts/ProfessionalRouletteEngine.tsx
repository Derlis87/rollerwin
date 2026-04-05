'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target, ShieldCheck, AlertTriangle, Zap, Gauge,
  ChevronDown, ChevronUp, Crosshair, Activity, Info
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// --- CONSTANTES TÉCNICAS ---
const WHEEL_LAYOUT = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

// --- MOTOR DE INFERENCIA ESTADÍSTICA ---
const getSpinData = (n: number) => ({
  val: n,
  color: n === 0 ? 'green' : RED_NUMBERS.includes(n) ? 'red' : 'black',
  parity: n === 0 ? 'zero' : n % 2 === 0 ? 'even' : 'odd',
  dozen: n === 0 ? 0 : Math.ceil(n / 12),
  column: n === 0 ? 0 : n % 3 === 0 ? 3 : n % 3,
  index: WHEEL_LAYOUT.indexOf(n)
});

const calculateZScore = (observed: number, total: number, probability: number) => {
  const expected = total * probability;
  const stdDev = Math.sqrt(total * probability * (1 - probability));
  return stdDev === 0 ? 0 : (observed - expected) / stdDev;
};

export default function ProfessionalRouletteEngine({ inputNumbers = [] }: { inputNumbers: number[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const analysis = useMemo(() => {
    if (inputNumbers.length < 10) return { signals: [], signature: null };

    const data = inputNumbers.map(getSpinData);
    const n = data.length;
    const lastSpin = data[data.length - 1];
    const signals: any[] = [];

    // 1. ANÁLISIS DE Z-SCORE (DOCENAS Y COLUMNAS)
    [1, 2, 3].forEach(d => {
      const count = data.filter(x => x.dozen === d).length;
      const z = calculateZScore(count, n, 12/37);
      if (z < -2.2) {
        signals.push({
          market: `DOCENA ${d}`,
          type: 'REVERSIÓN',
          conf: Math.min(98, Math.floor(Math.abs(z) * 25)),
          reason: 'Ausencia estadística crítica'
        });
      }
    });

    // 2. FIRMA DEL CRUPIER (DESPLAZAMIENTO FÍSICO)
    let signature = null;
    if (n >= 6) {
      const displacements = [];
      for (let i = 1; i < data.length; i++) {
        let diff = data[i].index - data[i-1].index;
        if (diff < 0) diff += 37;
        displacements.push(diff);
      }
      const last3 = displacements.slice(-3);
      const avgDisp = last3.reduce((a, b) => a + b, 0) / 3;
      const variance = last3.reduce((a, b) => a + Math.pow(b - avgDisp, 2), 0) / 3;

      if (variance < 8) {
        signature = {
          targetSector: WHEEL_LAYOUT[Math.floor((lastSpin.index + avgDisp) % 37)],
          reliability: Math.floor(100 - variance * 5)
        };
      }
    }

    // 3. SATURACIÓN DE COLOR/PARIDAD
    const colors = data.slice(-8).map(d => d.color);
    const redStreak = colors.filter(c => c === 'red').length;
    const blackStreak = colors.filter(c => c === 'black').length;

    if (redStreak >= 6) signals.push({ market: 'COLOR', bet: 'NEGRO', conf: 91, reason: 'Saturación de Rojo' });
    if (blackStreak >= 6) signals.push({ market: 'COLOR', bet: 'ROJO', conf: 91, reason: 'Saturación de Negro' });

    return {
      signals: signals.sort((a, b) => b.conf - a.conf),
      signature
    };
  }, [inputNumbers]);

  return (
    <div className="max-w-md mx-auto p-4 bg-zinc-950 min-h-screen text-zinc-100 font-sans selection:bg-amber-500/30">

      {/* HEADER DE ESTADO CRÍTICO */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black tracking-tighter text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" /> PRO-ENGINE V5
          </h1>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Statistical Inference Engine</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-zinc-400">DATA_SAMPLE: {inputNumbers.length}</div>
          <div className="text-[10px] text-green-500 font-bold">● SISTEMA ACTIVO</div>
        </div>
      </div>

      {/* SECCIÓN DE FIRMA DEL CRUPIER (FÍSICA) */}
      {analysis.signature && (
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-gradient-to-br from-amber-500/20 to-transparent border border-amber-500/30 rounded-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-2 opacity-10"><Zap className="w-12 h-12" /></div>
          <div className="flex justify-between items-center relative z-10">
            <div>
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Firma Detectada</span>
              <h3 className="text-2xl font-black text-white">Sector {analysis.signature.targetSector}</h3>
              <p className="text-[10px] text-amber-200/60 mt-1">Proyección basada en fuerza de lanzamiento constante</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono font-black text-amber-400">{analysis.signature.reliability}%</div>
              <div className="text-[9px] text-zinc-500 uppercase">Fiabilidad</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* MONITOR DE SEÑALES ACTIVAS */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Target className="w-4 h-4 text-zinc-500" />
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Señales Sniper</h2>
        </div>

        {analysis.signals.length > 0 ? (
          analysis.signals.map((sig, i) => (
            <Card key={i} className="bg-zinc-900 border-zinc-800 border-l-4 border-l-amber-500 overflow-hidden">
              <CardContent className="p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-black text-white">{sig.bet || sig.market}</span>
                      <span className="text-[9px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 font-bold">{sig.type || 'ALERTA'}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                      <Info className="w-3 h-3" /> {sig.reason}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-mono font-black text-amber-500">{sig.conf}%</div>
                    <div className="h-1 w-16 bg-zinc-800 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-amber-500" style={{ width: `${sig.conf}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <div className="py-12 border-2 border-dashed border-zinc-900 rounded-3xl flex flex-col items-center justify-center text-zinc-700">
            <Gauge className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Escaneando anomalías...</p>
          </div>
        )}
      </div>

      {/* GESTIÓN DE RIESGO PROFESIONAL */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
          <div className="text-[9px] text-zinc-500 uppercase font-black mb-1">Criterio de Kelly</div>
          <div className="text-xs font-bold text-green-400">Stake: 1.2% Bankroll</div>
        </div>
        <div className="bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
          <div className="text-[9px] text-zinc-500 uppercase font-black mb-1">Protección Máxima</div>
          <div className="text-xs font-bold text-red-400">Stop Loss: -8 Unidades</div>
        </div>
      </div>

      {/* HISTORIAL VISUAL DE CILINDRO */}
      <div className="mt-8">
        <div className="text-[10px] text-zinc-600 font-black uppercase mb-3 tracking-widest flex justify-between">
          <span>Última Secuencia</span>
          <span>Cilindro Posicional</span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-4 no-scrollbar">
          {inputNumbers.slice(-15).reverse().map((n, i) => (
            <div key={i} className={`flex-shrink-0 w-9 h-12 rounded-lg flex flex-col items-center justify-center shadow-2xl border-t-2 ${
              getSpinData(n).color === 'red' ? 'bg-red-900/40 border-red-500' :
              n === 0 ? 'bg-green-900/40 border-green-500' : 'bg-zinc-800 border-zinc-600'
            }`}>
              <span className="text-xs font-black text-white">{n}</span>
              <span className="text-[8px] text-white/30 font-mono">{getSpinData(n).index}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
