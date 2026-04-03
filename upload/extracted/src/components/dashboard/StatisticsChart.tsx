'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { BarChart3 } from 'lucide-react'
import { getNumberColor } from '@/store/app-store'

interface StatisticsChartProps {
  numbers: number[]
}

export function StatisticsChart({ numbers }: StatisticsChartProps) {
  const chartData = useMemo(() => {
    const frequency: Record<number, number> = {}
    
    // Initialize all numbers
    for (let i = 0; i <= 36; i++) {
      frequency[i] = 0
    }
    
    // Count frequencies
    numbers.forEach(num => {
      frequency[num] = (frequency[num] || 0) + 1
    })

    // Group by ranges for better visualization
    const ranges = [
      { name: '0', numbers: [0] },
      { name: '1-6', numbers: [1, 2, 3, 4, 5, 6] },
      { name: '7-12', numbers: [7, 8, 9, 10, 11, 12] },
      { name: '13-18', numbers: [13, 14, 15, 16, 17, 18] },
      { name: '19-24', numbers: [19, 20, 21, 22, 23, 24] },
      { name: '25-30', numbers: [25, 26, 27, 28, 29, 30] },
      { name: '31-36', numbers: [31, 32, 33, 34, 35, 36] },
    ]

    return ranges.map(range => ({
      name: range.name,
      frequency: range.numbers.reduce((sum, n) => sum + frequency[n], 0),
      numbers: range.numbers
    }))
  }, [numbers])

  const topNumbers = useMemo(() => {
    const frequency: Record<number, number> = {}
    numbers.forEach(num => {
      frequency[num] = (frequency[num] || 0) + 1
    })
    
    return Object.entries(frequency)
      .map(([num, freq]) => ({ number: parseInt(num), frequency: freq }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10)
  }, [numbers])

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-amber-500" />
          Distribución de Frecuencias
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
              <YAxis stroke="#71717a" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#18181b', 
                  border: '1px solid #27272a',
                  borderRadius: '8px'
                }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="frequency" radius={[4, 4, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill="#f59e0b" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Numbers */}
        <div className="mt-6">
          <p className="text-zinc-400 text-sm mb-3">Top 10 números más frecuentes</p>
          <div className="flex flex-wrap gap-2">
            {topNumbers.map(({ number, frequency }) => {
              const color = getNumberColor(number)
              const bgColor = color === 'red' ? 'bg-red-600' : color === 'black' ? 'bg-zinc-700' : 'bg-green-600'
              
              return (
                <div key={number} className="flex items-center gap-1">
                  <span className={`${bgColor} text-white w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold`}>
                    {number}
                  </span>
                  <span className="text-xs text-zinc-500">x{frequency}</span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
