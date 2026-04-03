import { NextRequest, NextResponse } from 'next/server'

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

    // Calculate statistics
    const stats = calculateStats(numbers)

    // Generate prediction based on bet type
    const prediction = generatePrediction(stats, betType)

    // Check if there's an active prediction for this session
    const activePrediction = activePredictions.get(sessionId)
    let currentPeak = 0
    let history: Array<{ number: number; color: 'red' | 'black' | 'green'; matched: boolean }> = []

    if (activePrediction && activePrediction.isActive) {
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
      // Start new prediction
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

    return NextResponse.json({
      success: true,
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

function generatePrediction(stats: ReturnType<typeof calculateStats>, betType: string): PredictionResult {
  switch (betType) {
    case 'color': {
      // Predict the opposite of the dominant color
      const redPct = stats.colors.red.percentage
      const blackPct = stats.colors.black.percentage
      
      if (redPct > blackPct + 5) {
        return {
          type: 'color',
          value: 'black',
          confidence: Math.min(85, 50 + (redPct - blackPct)),
          reasoning: `El rojo ha salido ${redPct.toFixed(1)}%, tendencia hacia negro`
        }
      } else if (blackPct > redPct + 5) {
        return {
          type: 'color',
          value: 'red',
          confidence: Math.min(85, 50 + (blackPct - redPct)),
          reasoning: `El negro ha salido ${blackPct.toFixed(1)}%, tendencia hacia rojo`
        }
      } else {
        // Default to red if balanced
        return {
          type: 'color',
          value: 'red',
          confidence: 55,
          reasoning: 'Colores equilibrados, predicción neutral hacia rojo'
        }
      }
    }

    case 'parity': {
      const oddPct = stats.parity.odd.percentage
      const evenPct = stats.parity.even.percentage
      
      if (oddPct > evenPct + 5) {
        return {
          type: 'parity',
          value: 'even',
          confidence: Math.min(85, 50 + (oddPct - evenPct)),
          reasoning: `Impar ha salido ${oddPct.toFixed(1)}%, tendencia hacia par`
        }
      } else if (evenPct > oddPct + 5) {
        return {
          type: 'parity',
          value: 'odd',
          confidence: Math.min(85, 50 + (evenPct - oddPct)),
          reasoning: `Par ha salido ${evenPct.toFixed(1)}%, tendencia hacia impar`
        }
      } else {
        return {
          type: 'parity',
          value: 'odd',
          confidence: 55,
          reasoning: 'Paridad equilibrada, predicción neutral'
        }
      }
    }

    case 'dozen': {
      const dozens = [
        { name: '1-12', ...stats.dozens['1-12'] },
        { name: '13-24', ...stats.dozens['13-24'] },
        { name: '25-36', ...stats.dozens['25-36'] }
      ].sort((a, b) => a.percentage - b.percentage)
      
      // Predict the dozen that appeared least
      const leastFrequent = dozens[0]
      return {
        type: 'dozen',
        value: leastFrequent.name,
        confidence: Math.min(80, 50 + (33.3 - leastFrequent.percentage)),
        reasoning: `Docena ${leastFrequent.name} ha salido menos (${leastFrequent.percentage.toFixed(1)}%)`
      }
    }

    case 'column': {
      const columns = [
        { name: '1', ...stats.columns.col1 },
        { name: '2', ...stats.columns.col2 },
        { name: '3', ...stats.columns.col3 }
      ].sort((a, b) => a.percentage - b.percentage)
      
      const leastFrequent = columns[0]
      return {
        type: 'column',
        value: leastFrequent.name,
        confidence: Math.min(80, 50 + (33.3 - leastFrequent.percentage)),
        reasoning: `Columna ${leastFrequent.name} ha salido menos (${leastFrequent.percentage.toFixed(1)}%)`
      }
    }

    default:
      return {
        type: 'color',
        value: 'red',
        confidence: 50,
        reasoning: 'Tipo de apuesta no especificado'
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
