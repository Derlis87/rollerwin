'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target, ShieldCheck, AlertTriangle, Zap, Gauge,
  ChevronDown, ChevronUp, Crosshair, Activity, Info
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

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
})

const calculateZScore = (observed: number, total: number, probability: number) => {
  const expected = total * probability;
  const stdDev = Math.sqrt(total * probability * (1 - probability));
  return stdDev === 0 ? 0 : (observed - expected) / stdDev;
};

interface Signal {
  market: string;
  bet?: string;
  type: string;
  conf: number;
  reason: string;
}

interface DealerSignature {
  targetSector: number;
  reliability: number;
}

interface AnalysisResult {
  signals: Signal[];
  signature: DealerSignature | null;
}

export default function ProfessionalRouletteEngine({ inputNumbers = [] }: { inputNumbers: number[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const analysis: AnalysisResult = useMemo(() => {
    if (inputNumbers.length < 10) return { signals: [], signature: null };

    const data = inputNumbers.map(getSpinData);
    const n = data.length;
    const lastSpin = data[data.length - 1];
    const signals: Signal[] = [];

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

    // 1b. Z-SCORE COLUMNAS
    [1, 2, 3].forEach(c => {
      const count = data.filter(x => x.column === c).length;
      const z = calculateZScore(count, n, 12/37);
      if (z < -2.2) {
        signals.push({
          market: `COLUMNA ${c}`,
          type: 'REVERSIÓN',
          conf: Math.min(98, Math.floor(Math.abs(z) * 25)),
          reason: 'Ausencia estadística crítica'
        });
      }
    });

    // 2. FIRMA DEL CRUPIER (DESPLAZAMIENTO FÍSICO)
    let signature: DealerSignature | null = null;
    if (n >= 6) {
      const displacements: number[] = [];
      for (let i = 1; i < data.length; i++) {
        let diff = data[i].index - data[i - 1].index;
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

    if (redStreak >= 6) signals.push({ market: 'COLOR', bet: 'NEGRO', type: 'REVERSIÓN', conf: 91, reason: 'Saturación de Rojo' });
    if (blackStreak >= 6) signals.push({ market: 'COLOR', bet: 'ROJO', type: 'REVERSIÓN', conf: 91, reason: 'Saturación de Negro' });

    // 4. SATURACIÓN DE PARIDAD
    const parities = data.slice(-8).map(d => d.parity);
    const oddStreak = parities.filter(p => p === 'odd').length;
    const evenStreak = parities.filter(p => p === 'even').length;

    if (oddStreak >= 6) signals.push({ market: 'PARIDAD', bet: 'PAR', type: 'REVERSIÓN', conf: 88, reason: 'Saturación de Impar' });
    if (evenStreak >= 6) signals.push({ market: 'PARIDAD', bet: 'IMPAR', type: 'REVERSIÓN', conf: 88, reason: 'Saturación de Par' });

    // 5. Z-SCORE COLOR/PARIDAD (binario)
    const redCount = data.filter(x => x.color === 'red').length;
    const zRed = calculateZScore(redCount, n, 18/37);
    if (zRed > 2.0) signals.push({ market: 'COLOR', bet: 'NEGRO', type: 'REVERSIÓN', conf: Math.min(92, Math.floor(70 + Math.abs(zRed) * 8)), reason: 'Exceso estadístico de Rojo' });
    if (zRed < -2.0) signals.push({ market: 'COLOR', bet: 'ROJO', type: 'REVERSIÓN', conf: Math.min(92, Math.floor(70 + Math.abs(zRed) * 8)), reason: 'Exceso estadístico de Negro' });

    const oddCount = data.filter(x => x.parity === 'odd').length;
    const nonZero = data.filter(x => x.parity !== 'zero').length;
    const zOdd = calculateZScore(oddCount, nonZero, 18/37);
    if (zOdd > 2.0) signals.push({ market: 'PARIDAD', bet: 'PAR', type: 'REVERSIÓN', conf: Math.min(90, Math.floor(70 + Math.abs(zOdd) * 8)), reason: 'Exceso estadístico de Impar' });
    if (zOdd < -2.0) signals.push({ market: 'PARIDAD', bet: 'IMPAR', type: 'REVERSIÓN', conf: Math.min(90, Math.floor(70 + Math.abs(zOdd) * 8)), reason: 'Exceso estadístico de Par' });

    return {
      signals: signals.sort((a, b) => b.conf - a.conf),
      signature
    };
  }, [inputNumbers]);

  return (
    <div className="space-y-4">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <Crosshair className="w-5 h-5 text-amber-500" />
            PRO-ENGINE V5
          </h3>
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Statistical Inference Engine</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-zinc-400">DATA: {inputNumbers.length}</div>
          <div className="text-[10px] text-green-500 font-bold">● ACTIVO</div>
        </div>
      </div>

      {/* SECCIÓN DE FIRMA DEL CRUPIER (FÍSICA) */}
      {analysis.signature && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-gradient-to-br from-amber-500/20 to-transparent border border-amber-500/30 rounded-2xl relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 p-2 opacity-10"><Zap className="w-12 h-12" /></div>
          <div className="flex justify-between items-center relative z-10">
            <div>
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Firma Detectada</span>
              <h4 className="text-2xl font-black text-white">Sector {analysis.signature.targetSector}</h4>
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
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Señales Sniper</h4>
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
          <div className="py-12 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center text-zinc-700">
            <Gauge className="w-10 h-10 mb-2 opacity-20" />
            <p className="text-[10px] font-bold uppercase tracking-widest">Escaneando anomalías...</p>
          </div>
        )}
      </div>

      {/* GESTIÓN DE RIESGO PROFESIONAL */}
      <div className="grid grid-cols-2 gap-3">
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
      {inputNumbers.length > 0 && (
        <div>
          <div className="text-[10px] text-zinc-600 font-black uppercase mb-3 tracking-widest flex justify-between">
            <span>Última Secuencia</span>
            <span>Cilindro Posicional</span>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-2">
            {inputNumbers.slice(-15).reverse().map((n, i) => {
              const spinData = getSpinData(n);
              return (
                <div
                  key={i}
                  className={`flex-shrink-0 w-9 h-12 rounded-lg flex flex-col items-center justify-center shadow-2xl border-t-2 ${
                    spinData.color === 'red' ? 'bg-red-900/40 border-red-500' :
                    n === 0 ? 'bg-green-900/40 border-green-500' : 'bg-zinc-800 border-zinc-600'
                  }`}
                >
                  <span className="text-xs font-black text-white">{n}</span>
                  <span className="text-[8px] text-white/30 font-mono">{spinData.index}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
