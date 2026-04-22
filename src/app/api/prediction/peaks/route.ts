import { NextRequest, NextResponse } from 'next/server'
import { generateSmartPrediction } from '@/lib/smart-prediction-v4'

// Predefined roulette numbers by color
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

function getNumberColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

export interface PredictionResult {
  type: 'color' | 'parity' | 'dozen' | 'column'
  value: string
  confidence: number
  reasoning: string
  shouldSkip: boolean
}

export interface PeakPrediction {
  id: string
  prediction: PredictionResult
  currentPeak: number
  history: Array<{
    number: number
    color: 'red' | 'black' | 'green'
    matched: boolean
  }>
  isActive: boolean
}

// Store active predictions per session
const activePredictions: Map<string, PeakPrediction> = new Map()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { numbers, betType = 'color', sessionId = 'default' } = body

    if (!Array.isArray(numbers) || numbers.length < 5) {
      return NextResponse.json({
        success: false,
        error: 'Se necesitan al menos 5 números para generar predicciones'
      }, { status: 400 })
    }

    // V6.0: Use Smart Prediction Engine
    const smartResult = generateSmartPrediction(numbers, betType)

    const prediction: PredictionResult = {
      type: smartResult.type,
      value: smartResult.bestValue,
      confidence: smartResult.bestConfidence,
      reasoning: smartResult.shouldSkip
        ? 'V6.0: Señal débil — se recomienda SKIP'
        : `V6.0: Consensus Markov, signal strength: ${smartResult.signalStrength || 'N/A'}`,
      shouldSkip: smartResult.shouldSkip === true
    }

    // Check if there's an active prediction for this session
    const activePrediction = activePredictions.get(sessionId)
    let currentPeak = 0
    let history: Array<{ number: number; color: 'red' | 'black' | 'green'; matched: boolean }> = []

    if (activePrediction && activePrediction.isActive && !activePrediction.prediction.shouldSkip) {
      // Check the last number against the active prediction
      const lastNumber = numbers[numbers.length - 1]
      const lastColor = getNumberColor(lastNumber)
      
      const matched = checkPredictionMatch(activePrediction.prediction, lastNumber)
      
      if (matched) {
        // Prediction was correct, reset
        currentPeak = 1
        activePrediction.isActive = false
        activePrediction.currentPeak = 0
        history = [{ number: lastNumber, color: lastColor, matched: true }]
      } else {
        // Prediction failed, increment peak
        currentPeak = activePrediction.currentPeak + 1
        activePrediction.currentPeak = currentPeak
        history = [
          ...activePrediction.history,
          { number: lastNumber, color: lastColor, matched: false }
        ]
      }
    } else {
      // Start new prediction (or was skip)
      currentPeak = 1
    }

    // Store new prediction
    const newPrediction: PeakPrediction = {
      id: `${sessionId}-${Date.now()}`,
      prediction,
      currentPeak,
      history,
      isActive: true
    }
    activePredictions.set(sessionId, newPrediction)

    // Calculate basic stats for response
    const stats = calculateStats(numbers)

    return NextResponse.json({
      success: true,
      engine: 'V6.0',
      prediction: {
        ...prediction,
        currentPeak,
        history,
        sessionId
      },
      stats: {
        colors: stats.colors,
        parity: stats.parity,
        dozens: stats.dozens,
        columns: stats.columns
      }
    })
  } catch (error) {
    console.error('Prediction error:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al generar predicción'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('sessionId') || 'default'

  const activePrediction = activePredictions.get(sessionId)

  return NextResponse.json({
    success: true,
    engine: 'V6.0',
    activePrediction: activePrediction || null
  })
}

function calculateStats(numbers: number[]) {
  const nonZero = numbers.filter(n => n !== 0)
  
  let redCount = 0, blackCount = 0, greenCount = 0
  let oddCount = 0, evenCount = 0
  let lowCount = 0, highCount = 0
  let dozen1 = 0, dozen2 = 0, dozen3 = 0
  let column1 = 0, column2 = 0, column3 = 0

  numbers.forEach(num => {
    const color = getNumberColor(num)
    if (color === 'red') redCount++
    else if (color === 'black') blackCount++
    else greenCount++

    if (num !== 0) {
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
    }
  })

  const total = numbers.length
  const nonZeroTotal = nonZero.length || 1

  return {
    colors: {
      red: { count: redCount, percentage: (redCount / total) * 100 },
      black: { count: blackCount, percentage: (blackCount / total) * 100 },
      green: { count: greenCount, percentage: (greenCount / total) * 100 }
    },
    parity: {
      odd: { count: oddCount, percentage: (oddCount / nonZeroTotal) * 100 },
      even: { count: evenCount, percentage: (evenCount / nonZeroTotal) * 100 }
    },
    range: {
      low: { count: lowCount, percentage: (lowCount / nonZeroTotal) * 100 },
      high: { count: highCount, percentage: (highCount / nonZeroTotal) * 100 }
    },
    dozens: {
      '1-12': { count: dozen1, percentage: (dozen1 / nonZeroTotal) * 100 },
      '13-24': { count: dozen2, percentage: (dozen2 / nonZeroTotal) * 100 },
      '25-36': { count: dozen3, percentage: (dozen3 / nonZeroTotal) * 100 }
    },
    columns: {
      col1: { count: column1, percentage: (column1 / nonZeroTotal) * 100 },
      col2: { count: column2, percentage: (column2 / nonZeroTotal) * 100 },
      col3: { count: column3, percentage: (column3 / nonZeroTotal) * 100 }
    }
  }
}

function checkPredictionMatch(prediction: PredictionResult, number: number): boolean {
  switch (prediction.type) {
    case 'color': {
      const color = getNumberColor(number)
      return color === prediction.value
    }
    case 'parity': {
      if (number === 0) return false
      const isEven = number % 2 === 0
      return (isEven && prediction.value === 'even') || (!isEven && prediction.value === 'odd')
    }
    case 'dozen': {
      if (number === 0) return false
      if (prediction.value === '1-12') return number <= 12
      if (prediction.value === '13-24') return number > 12 && number <= 24
      if (prediction.value === '25-36') return number > 24
      return false
    }
    case 'column': {
      if (number === 0) return false
      const col = number % 3
      if (prediction.value === '1') return col === 1
      if (prediction.value === '2') return col === 2
      if (prediction.value === '3') return col === 0
      return false
    }
    default:
      return false
  }
}
