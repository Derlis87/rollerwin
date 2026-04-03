import { NextRequest, NextResponse } from 'next/server'
import { analyzeNumbers } from '@/lib/prediction'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { numbers, platform = 'Azure' } = body

    if (!Array.isArray(numbers) || numbers.length < 5) {
      return NextResponse.json({
        success: false,
        error: 'Se necesitan al menos 5 números para generar predicciones'
      }, { status: 400 })
    }

    const result = analyzeNumbers(numbers)

    if (!result) {
      return NextResponse.json({
        success: false,
        error: 'No se pudo generar la predicción'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: {
        hotNumbers: result.hotNumbers.map(h => ({
          number: h.number,
          frequency: h.frequency,
          color: getNumberColorStr(h.number)
        })),
        coldNumbers: result.coldNumbers.map(c => ({
          number: c.number,
          frequency: c.frequency,
          color: getNumberColorStr(c.number)
        })),
        predictedNumbers: result.predictedNumbers.map(n => ({
          number: n,
          color: getNumberColorStr(n),
          confidence: result.overallConfidence
        })),
        overallConfidence: result.overallConfidence,
        analysis: {
          redPercentage: result.analysis.redPercentage,
          blackPercentage: result.analysis.blackPercentage,
          greenPercentage: result.analysis.greenPercentage,
          oddPercentage: result.analysis.oddPercentage,
          evenPercentage: result.analysis.evenPercentage,
          lowPercentage: result.analysis.lowPercentage,
          highPercentage: result.analysis.highPercentage,
          dozens: calculateDozens(numbers),
          columns: calculateColumns(numbers)
        },
        trends: result.trends,
        meta: {
          chiSquareSignificant: result.chiSquareSignificant,
          markovPrediction: result.markovPrediction,
          totalNumbers: numbers.length
        }
      }
    })
  } catch (error) {
    console.error('Prediction error:', error)
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'RollerWin Prediction API v2',
    version: '2.0.0',
    engine: 'EMA + Chi-Square + Markov Chain',
    endpoints: {
      'POST /api/predict': 'Generate predictions from number sequence (min 5 numbers)'
    }
  })
}

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

function getNumberColorStr(num: number): string {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

function calculateDozens(numbers: number[]) {
  const nonZero = numbers.filter(n => n !== 0).length || 1
  const d1 = numbers.filter(n => n >= 1 && n <= 12).length
  const d2 = numbers.filter(n => n >= 13 && n <= 24).length
  const d3 = numbers.filter(n => n >= 25 && n <= 36).length
  return [
    { range: '1-12', percentage: (d1 / nonZero) * 100 },
    { range: '13-24', percentage: (d2 / nonZero) * 100 },
    { range: '25-36', percentage: (d3 / nonZero) * 100 }
  ]
}

function calculateColumns(numbers: number[]) {
  const nonZero = numbers.filter(n => n !== 0).length || 1
  const c1 = numbers.filter(n => n !== 0 && n % 3 === 1).length
  const c2 = numbers.filter(n => n !== 0 && n % 3 === 2).length
  const c3 = numbers.filter(n => n !== 0 && n % 3 === 0).length
  return [
    { name: 'Columna 1', percentage: (c1 / nonZero) * 100 },
    { name: 'Columna 2', percentage: (c2 / nonZero) * 100 },
    { name: 'Columna 3', percentage: (c3 / nonZero) * 100 }
  ]
}
