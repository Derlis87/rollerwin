'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { History, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { getNumberColor, RED_NUMBERS, BLACK_NUMBERS } from '@/store/app-store'

interface NumberHistoryProps {
  numbers: number[]
}

export function NumberHistory({ numbers }: NumberHistoryProps) {
  const statistics = useMemo(() => {
    const total = numbers.length
    const nonZero = numbers.filter(n => n !== 0)
    const nonZeroTotal = nonZero.length

    let redCount = 0
    let blackCount = 0
    let oddCount = 0
    let evenCount = 0
    let lowCount = 0 // 1-18
    let highCount = 0 // 19-36
    let dozen1 = 0 // 1-12
    let dozen2 = 0 // 13-24
    let dozen3 = 0 // 25-36
    let column1 = 0 // 1,4,7,10...
    let column2 = 0 // 2,5,8,11...
    let column3 = 0 // 3,6,9,12...

    nonZero.forEach(num => {
      if (RED_NUMBERS.includes(num)) redCount++
      else blackCount++
      
      if (num % 2 === 0) evenCount++
      else oddCount++
      
      if (num <= 18) lowCount++
      else highCount++
      
      if (num <= 12) dozen1++
      else if (num <= 24) dozen2++
      else dozen3++
      
      if (num % 3 === 1) column1++
      else if (num % 3 === 2) column2++
      else column3++
    })

    return {
      total,
      redPercentage: nonZeroTotal > 0 ? (redCount / nonZeroTotal) * 100 : 50,
      blackPercentage: nonZeroTotal > 0 ? (blackCount / nonZeroTotal) * 100 : 50,
      oddPercentage: nonZeroTotal > 0 ? (oddCount / nonZeroTotal) * 100 : 50,
      evenPercentage: nonZeroTotal > 0 ? (evenCount / nonZeroTotal) * 100 : 50,
      lowPercentage: nonZeroTotal > 0 ? (lowCount / nonZeroTotal) * 100 : 50,
      highPercentage: nonZeroTotal > 0 ? (highCount / nonZeroTotal) * 100 : 50,
      dozens: [
        { name: '1-12', percentage: nonZeroTotal > 0 ? (dozen1 / nonZeroTotal) * 100 : 33.3 },
        { name: '13-24', percentage: nonZeroTotal > 0 ? (dozen2 / nonZeroTotal) * 100 : 33.3 },
        { name: '25-36', percentage: nonZeroTotal > 0 ? (dozen3 / nonZeroTotal) * 100 : 33.3 },
      ],
      columns: [
        { name: 'Col 1', percentage: nonZeroTotal > 0 ? (column1 / nonZeroTotal) * 100 : 33.3 },
        { name: 'Col 2', percentage: nonZeroTotal > 0 ? (column2 / nonZeroTotal) * 100 : 33.3 },
        { name: 'Col 3', percentage: nonZeroTotal > 0 ? (column3 / nonZeroTotal) * 100 : 33.3 },
      ]
    }
  }, [numbers])

  const getTrend = (value: number, expected: number = 50) => {
    const diff = value - expected
    if (diff > 5) return { icon: ArrowUp, color: 'text-green-500', text: 'Alto' }
    if (diff < -5) return { icon: ArrowDown, color: 'text-red-500', text: 'Bajo' }
    return { icon: Minus, color: 'text-zinc-400', text: 'Normal' }
  }

  const StatRow = ({ label, value, expected = 50, suffix = '%' }: { label: string; value: number; expected?: number; suffix?: string }) => {
    const trend = getTrend(value, expected)
    const TrendIcon = trend.icon
    
    return (
      <div className="flex items-center justify-between py-2 border-b border-zinc-800">
        <span className="text-zinc-400 text-sm">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-white font-medium">{value.toFixed(1)}{suffix}</span>
          <TrendIcon className={`w-4 h-4 ${trend.color}`} />
        </div>
      </div>
    )
  }

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <History className="w-5 h-5 text-amber-500" />
          Estadísticas Avanzadas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-zinc-500 text-xs uppercase mb-2">Colores</p>
          <StatRow label="Rojo" value={statistics.redPercentage} />
          <StatRow label="Negro" value={statistics.blackPercentage} />
        </div>

        <div>
          <p className="text-zinc-500 text-xs uppercase mb-2">Paridad</p>
          <StatRow label="Par" value={statistics.evenPercentage} />
          <StatRow label="Impar" value={statistics.oddPercentage} />
        </div>

        <div>
          <p className="text-zinc-500 text-xs uppercase mb-2">Mitades</p>
          <StatRow label="Bajo (1-18)" value={statistics.lowPercentage} />
          <StatRow label="Alto (19-36)" value={statistics.highPercentage} />
        </div>

        <div>
          <p className="text-zinc-500 text-xs uppercase mb-2">Docenas</p>
          {statistics.dozens.map((d, i) => (
            <StatRow key={i} label={d.name} value={d.percentage} expected={33.3} />
          ))}
        </div>

        <div>
          <p className="text-zinc-500 text-xs uppercase mb-2">Columnas</p>
          {statistics.columns.map((c, i) => (
            <StatRow key={i} label={c.name} value={c.percentage} expected={33.3} />
          ))}
        </div>

        <div className="pt-4 border-t border-zinc-700">
          <p className="text-zinc-500 text-xs">Total de números analizados: <span className="text-white font-medium">{statistics.total}</span></p>
        </div>
      </CardContent>
    </Card>
  )
}
