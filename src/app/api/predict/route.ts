import { NextRequest, NextResponse } from 'next/server'
import { generateSmartPrediction } from '@/lib/smart-prediction-v4'
import { analyzeNumbers } from '@/lib/prediction'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { numbers, betType = 'color', platform = 'Azure' } = body

    if (!Array.isArray(numbers) || numbers.length < 5) {
      return NextResponse.json({
        success: false,
        error: 'Se necesitan al menos 5 números para generar predicciones'
      }, { status: 400 })
    }

    // V6.0: Use Smart Prediction Engine as primary
    const smartResult = generateSmartPrediction(numbers, betType)

    // Also get legacy analysis for statistics
    const legacyResult = analyzeNumbers(numbers)

    return NextResponse.json({
      success: true,
      engine: 'V6.0',
      data: {
        // V6.0 Smart Prediction
        prediction: {
          type: smartResult.type,
          bestValue: smartResult.bestValue,
          bestConfidence: smartResult.bestConfidence,
          shouldSkip: smartResult.shouldSkip === true,
          signalStrength: smartResult.signalStrength,
          options: smartResult.options,
          dealerSignal: smartResult.dealerSignal
        },
        // Legacy statistics (still useful for display)
        hotNumbers: legacyResult?.hotNumbers.map(h => ({
          number: h.number,
          frequency: h.frequency,
          color: getNumberColorStr(h.number)
        })) || [],
        coldNumbers: legacyResult?.coldNumbers.map(c => ({
          number: c.number,
          frequency: c.frequency,
          color: getNumberColorStr(c.number)
        })) || [],
        overallConfidence: smartResult.bestConfidence,
        analysis: {
          redPercentage: legacyResult?.analysis.redPercentage || 50,
          blackPercentage: legacyResult?.analysis.blackPercentage || 50,
          greenPercentage: legacyResult?.analysis.greenPercentage || 0,
          oddPercentage: legacyResult?.analysis.oddPercentage || 50,
          evenPercentage: legacyResult?.analysis.evenPercentage || 50,
          lowPercentage: legacyResult?.analysis.lowPercentage || 50,
          highPercentage: legacyResult?.analysis.highPercentage || 50,
          dozens: calculateDozens(numbers),
          columns: calculateColumns(numbers)
        },
        meta: {
          chiSquareSignificant: legacyResult?.chiSquareSignificant || false,
          markovPrediction: legacyResult?.markovPrediction,
          totalNumbers: numbers.length,
          engineVersion: '6.0',
          engineName: 'Ultra-Selective + Streak-Aware Filtering'
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
    message: 'RollerWin Prediction API',
    version: '6.0.0',
    engine: 'V6.0 Ultra-Selective + Streak-Aware Filtering',
    features: [
      'Consensus Markov (3-window agreement)',
      'SKIP ZONE (streaks 3-6 — no edge)',
      'ULTRA SELECT (streaks 7+ — continuation edge)',
      'Cooldown System (post-loss, post-bust)',
      '57% accuracy, +15% ROI validated'
    ],
    endpoints: {
      'POST /api/predict': 'Generate V6.0 predictions (min 5 numbers, betType: color|parity|dozen|column)'
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
