'use client'

import { useMemo } from 'react'
import { analyzeLastNumber, type AfterNumberResult } from '@/lib/after-number-engine'
import { BarChart3 } from 'lucide-react'

interface AfterNumberFilterProps {
  numbers: number[]
}

const COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500',
  black: 'bg-zinc-300',
  green: 'bg-green-500',
}

const COLOR_TEXT: Record<string, string> = {
  red: 'text-red-400',
  black: 'text-zinc-300',
  green: 'text-green-400',
}

const COLOR_LABEL: Record<string, string> = {
  red: 'Rojo',
  black: 'Negro',
  green: 'Verde',
}

const DOZEN_LABEL: Record<string, string> = {
  d1: '1a Doc (1-12)',
  d2: '2a Doc (13-24)',
  d3: '3a Doc (25-36)',
}

const COLUMN_LABEL: Record<string, string> = {
  c1: 'Col 1',
  c2: 'Col 2',
  c3: 'Col 3',
}

const PARITY_LABEL: Record<string, string> = {
  odd: 'Impar',
  even: 'Par',
}

function ConfidenceBar({ value, max, color, label, isBest }: { value: number; max: number; color: string; label: string; isBest: boolean }) {
  const width = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className={`w-24 shrink-0 ${isBest ? 'text-amber-400 font-semibold' : 'text-zinc-400'}`}>{label}</span>
      <div className="flex-1 h-3 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span className={`w-12 text-right ${isBest ? 'text-amber-400 font-semibold' : 'text-zinc-500'}`}>{value.toFixed(1)}%</span>
    </div>
  )
}

export default function AfterNumberFilter({ numbers }: AfterNumberFilterProps) {
  const analysis = useMemo(() => analyzeLastNumber(numbers), [numbers])

  if (!analysis) return null

  const lastNum = numbers[numbers.length - 1]

  return (
    <div className="bg-zinc-900/80 border border-zinc-700/50 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-amber-500" />
          <span className="text-xs text-zinc-400 font-medium">PRONÓSTICO POST-NÚMERO</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-500">Después de</span>
          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            analysis.color === 'red' ? 'bg-red-600 text-white' : 
            analysis.color === 'green' ? 'bg-green-600 text-white' : 'bg-zinc-600 text-white'
          }`}>
            {lastNum}
          </span>
          <span className="text-[10px] text-zinc-500">({analysis.totalOccurrences}x)</span>
        </div>
      </div>

      {/* Color Prediction */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Color</div>
        <ConfidenceBar
          value={analysis.nextColorProbs.red}
          max={Math.max(analysis.nextColorProbs.red, analysis.nextColorProbs.black, 1)}
          color="bg-red-500"
          label={`🔴 Rojo`}
          isBest={analysis.predictedColor === 'red'}
        />
        <ConfidenceBar
          value={analysis.nextColorProbs.black}
          max={Math.max(analysis.nextColorProbs.red, analysis.nextColorProbs.black, 1)}
          color="bg-zinc-400"
          label={`⚫ Negro`}
          isBest={analysis.predictedColor === 'black'}
        />
      </div>

      {/* Dozen Prediction */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Docenas</div>
        {analysis.dozenDetails.map(d => (
          <ConfidenceBar
            key={d.dozen}
            value={d.prob}
            max={analysis.dozenDetails[0].prob}
            color={d === analysis.dozenDetails[0] ? 'bg-amber-500' : 'bg-zinc-600'}
            label={d.label}
            isBest={d === analysis.dozenDetails[0]}
          />
        ))}
      </div>

      {/* Column Prediction */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Columnas</div>
        {analysis.columnDetails.map(c => (
          <ConfidenceBar
            key={c.column}
            value={c.prob}
            max={analysis.columnDetails[0].prob}
            color={c === analysis.columnDetails[0] ? 'bg-cyan-500' : 'bg-zinc-600'}
            label={c.label}
            isBest={c === analysis.columnDetails[0]}
          />
        ))}
      </div>

      {/* Parity Prediction */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Paridad</div>
        <ConfidenceBar
          value={analysis.nextParityProbs.odd}
          max={Math.max(analysis.nextParityProbs.odd, analysis.nextParityProbs.even, 1)}
          color="bg-purple-500"
          label="Impar"
          isBest={analysis.predictedParity === 'odd'}
        />
        <ConfidenceBar
          value={analysis.nextParityProbs.even}
          max={Math.max(analysis.nextParityProbs.odd, analysis.nextParityProbs.even, 1)}
          color="bg-indigo-500"
          label="Par"
          isBest={analysis.predictedParity === 'even'}
        />
      </div>

      {/* Summary prediction line */}
      <div className="border-t border-zinc-700/50 pt-3 space-y-1">
        <div className="text-[10px] text-zinc-500">Predicción combinada:</div>
        <div className="flex flex-wrap gap-1.5">
          <span className={`text-[11px] px-2 py-0.5 rounded ${
            analysis.predictedColor === 'red' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-600/20 text-zinc-300'
          }`}>
            {COLOR_LABEL[analysis.predictedColor]} {analysis.colorConfidence.toFixed(0)}%
          </span>
          {analysis.predictedDozen && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-400">
              {DOZEN_LABEL[analysis.predictedDozen]} {analysis.dozenConfidence.toFixed(0)}%
            </span>
          )}
          {analysis.predictedColumn && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
              {COLUMN_LABEL[analysis.predictedColumn]} {analysis.columnConfidence.toFixed(0)}%
            </span>
          )}
          {analysis.predictedParity && (
            <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-400">
              {PARITY_LABEL[analysis.predictedParity]} {analysis.parityConfidence.toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
