'use client'

import { memo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { Palette, Hash, Layers } from 'lucide-react'
import { getNumberColor } from '@/store/app-store'

interface ColorParityChartProps {
  numbers: number[]
}

// CustomTooltip component defined outside render
const CustomTooltip = memo(function CustomTooltip({ 
  active, 
  payload, 
  total 
}: { 
  active?: boolean
  payload?: Array<{ name: string; value: number; payload: { percentage?: string } }>
  total: number
}) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2">
        <p className="text-white font-medium">{payload[0].name}</p>
        <p className="text-zinc-400 text-sm">
          {payload[0].value} ({payload[0].payload.percentage || ((payload[0].value / total) * 100).toFixed(1)}%)
        </p>
      </div>
    )
  }
  return null
})

export function ColorParityChart({ numbers }: ColorParityChartProps) {
  // Calculate color distribution
  const colorStats = { red: 0, black: 0, green: 0 }
  const parityStats = { odd: 0, even: 0 }
  const dozenStats = { '1-12': 0, '13-24': 0, '25-36': 0 }
  const columnStats = { 'Col 1': 0, 'Col 2': 0, 'Col 3': 0 }

  numbers.forEach(num => {
    const color = getNumberColor(num)
    colorStats[color]++

    if (num !== 0) {
      // Parity
      if (num % 2 === 0) parityStats.even++
      else parityStats.odd++

      // Dozens
      if (num <= 12) dozenStats['1-12']++
      else if (num <= 24) dozenStats['13-24']++
      else dozenStats['25-36']++

      // Columns
      if (num % 3 === 1) columnStats['Col 1']++
      else if (num % 3 === 2) columnStats['Col 2']++
      else columnStats['Col 3']++
    }
  })

  const total = numbers.length
  const nonZero = numbers.filter(n => n !== 0).length || 1

  const colorData = [
    { name: 'Rojo', value: colorStats.red, color: '#dc2626' },
    { name: 'Negro', value: colorStats.black, color: '#27272a' },
    { name: 'Verde', value: colorStats.green, color: '#16a34a' }
  ]

  const parityData = [
    { name: 'Impar', value: parityStats.odd, color: '#f59e0b' },
    { name: 'Par', value: parityStats.even, color: '#3b82f6' }
  ]

  const dozenData = Object.entries(dozenStats).map(([name, value]) => ({
    name,
    value,
    percentage: ((value / nonZero) * 100).toFixed(1)
  }))

  const columnData = Object.entries(columnStats).map(([name, value]) => ({
    name,
    value,
    percentage: ((value / nonZero) * 100).toFixed(1)
  }))

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Colors Chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Palette className="w-4 h-4 text-red-500" />
            Distribución de Colores
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={colorData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {colorData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {colorData.map((item) => (
              <div key={item.name} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-zinc-400">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Parity Chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Hash className="w-4 h-4 text-amber-500" />
            Par / Impar
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={parityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {parityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {parityData.map((item) => (
              <div key={item.name} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-zinc-400">{item.name}: {item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dozens Chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Layers className="w-4 h-4 text-purple-500" />
            Docenas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dozenData}>
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip content={<CustomTooltip total={total} />} />
                <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Columns Chart */}
      <Card className="bg-zinc-900 border-zinc-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Layers className="w-4 h-4 text-cyan-500" />
            Columnas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={columnData}>
                <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
                <YAxis stroke="#71717a" fontSize={12} />
                <Tooltip content={<CustomTooltip total={total} />} />
                <Bar dataKey="value" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
