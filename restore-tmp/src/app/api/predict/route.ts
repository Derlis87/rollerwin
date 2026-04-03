import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Predefined roulette numbers by color
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]
const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]

function getNumberColor(num: number): 'red' | 'black' | 'green' {
  if (num === 0) return 'green'
  return RED_NUMBERS.includes(num) ? 'red' : 'black'
}

interface PredictionResponse {
  success: boolean
  data: {
    hotNumbers: { number: number; frequency: number; color: string }[]
    coldNumbers: { number: number; frequency: number; color: string }[]
    predictedNumbers: { number: number; color: string; confidence: number }[]
    overallConfidence: number
    analysis: {
      redPercentage: number
      blackPercentage: number
      greenPercentage: number
      oddPercentage: number
      evenPercentage: number
      lowPercentage: number
      highPercentage: number
      dozens: { range: string; percentage: number }[]
      columns: { name: string; percentage: number }[]
    }
    trends: {
      lastTrend: 'red' | 'black' | 'green'
      streakCount: number
      alternatingPattern: boolean
    }
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<PredictionResponse>> {
  try {
    const body = await request.json()
    const { numbers, platform = 'Azure' } = body

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return NextResponse.json({
        success: false,
        data: {
          hotNumbers: [],
          coldNumbers: [],
          predictedNumbers: [],
          overallConfidence: 0,
          analysis: {
            redPercentage: 0,
            blackPercentage: 0,
            greenPercentage: 0,
            oddPercentage: 0,
            evenPercentage: 0,
            lowPercentage: 0,
            highPercentage: 0,
            dozens: [],
            columns: []
          },
          trends: {
            lastTrend: 'red',
            streakCount: 0,
            alternatingPattern: false
          }
        }
      })
    }

    // Count frequencies
    const frequency: Record<number, number> = {}
    numbers.forEach((num: number) => {
      frequency[num] = (frequency[num] || 0) + 1
    })

    // Sort by frequency
    const sorted = Object.entries(frequency)
      .map(([num, freq]) => ({ 
        number: parseInt(num), 
        frequency: freq,
        color: getNumberColor(parseInt(num))
      }))
      .sort((a, b) => b.frequency - a.frequency)

    // Hot and cold numbers
    const hotNumbers = sorted.slice(0, 5)
    const coldNumbers = sorted.slice(-5).reverse()

    // Calculate percentages
    let redCount = 0, blackCount = 0, greenCount = 0
    let oddCount = 0, evenCount = 0
    let lowCount = 0, highCount = 0
    let dozen1 = 0, dozen2 = 0, dozen3 = 0
    let column1 = 0, column2 = 0, column3 = 0

    numbers.forEach((num: number) => {
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
    const nonZeroTotal = total - greenCount || 1

    // Generate predictions based on patterns
    const predictedNumbers: { number: number; color: string; confidence: number }[] = []
    
    // Add hot numbers with high confidence
    hotNumbers.slice(0, 2).forEach(h => {
      const confidence = Math.min(95, 50 + (h.frequency / total) * 100)
      predictedNumbers.push({ 
        number: h.number, 
        color: h.color,
        confidence 
      })
    })

    // Add cold numbers (due for appearance) with moderate confidence
    coldNumbers.slice(0, 2).forEach(c => {
      if (!predictedNumbers.find(p => p.number === c.number)) {
        const confidence = Math.min(85, 40 + ((total - c.frequency) / total) * 50)
        predictedNumbers.push({ 
          number: c.number, 
          color: c.color,
          confidence 
        })
      }
    })

    // Add numbers based on color probability
    const redPercentage = (redCount / nonZeroTotal) * 100
    if (redPercentage > 55 && predictedNumbers.length < 5) {
      const blackNums = BLACK_NUMBERS.filter(n => !predictedNumbers.find(p => p.number === n))
      if (blackNums.length > 0) {
        const num = blackNums[Math.floor(Math.random() * blackNums.length)]
        predictedNumbers.push({ number: num, color: 'black', confidence: 60 })
      }
    } else if (redPercentage < 45 && predictedNumbers.length < 5) {
      const redNums = RED_NUMBERS.filter(n => !predictedNumbers.find(p => p.number === n))
      if (redNums.length > 0) {
        const num = redNums[Math.floor(Math.random() * redNums.length)]
        predictedNumbers.push({ number: num, color: 'red', confidence: 60 })
      }
    }

    // Fill remaining slots with random numbers
    while (predictedNumbers.length < 5) {
      const randomNum = Math.floor(Math.random() * 37)
      if (!predictedNumbers.find(p => p.number === randomNum)) {
        predictedNumbers.push({ 
          number: randomNum, 
          color: getNumberColor(randomNum),
          confidence: 50 
        })
      }
    }

    // Calculate overall confidence
    const avgConfidence = predictedNumbers.reduce((sum, p) => sum + p.confidence, 0) / predictedNumbers.length
    const dataQualityBonus = Math.min(10, numbers.length / 5)
    const overallConfidence = Math.min(95, Math.max(50, avgConfidence + dataQualityBonus))

    // Analyze trends
    const lastNumbers = numbers.slice(-5)
    const lastTrend = getNumberColor(lastNumbers[lastNumbers.length - 1])
    
    let streakCount = 1
    for (let i = lastNumbers.length - 2; i >= 0; i--) {
      if (getNumberColor(lastNumbers[i]) === lastTrend) {
        streakCount++
      } else {
        break
      }
    }

    // Check for alternating pattern
    let alternatingPattern = true
    for (let i = lastNumbers.length - 1; i > 0; i--) {
      if (getNumberColor(lastNumbers[i]) === getNumberColor(lastNumbers[i - 1])) {
        alternatingPattern = false
        break
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        hotNumbers,
        coldNumbers,
        predictedNumbers: predictedNumbers.slice(0, 5),
        overallConfidence,
        analysis: {
          redPercentage: (redCount / total) * 100,
          blackPercentage: (blackCount / total) * 100,
          greenPercentage: (greenCount / total) * 100,
          oddPercentage: (oddCount / nonZeroTotal) * 100,
          evenPercentage: (evenCount / nonZeroTotal) * 100,
          lowPercentage: (lowCount / nonZeroTotal) * 100,
          highPercentage: (highCount / nonZeroTotal) * 100,
          dozens: [
            { range: '1-12', percentage: (dozen1 / nonZeroTotal) * 100 },
            { range: '13-24', percentage: (dozen2 / nonZeroTotal) * 100 },
            { range: '25-36', percentage: (dozen3 / nonZeroTotal) * 100 }
          ],
          columns: [
            { name: 'Columna 1', percentage: (column1 / nonZeroTotal) * 100 },
            { name: 'Columna 2', percentage: (column2 / nonZeroTotal) * 100 },
            { name: 'Columna 3', percentage: (column3 / nonZeroTotal) * 100 }
          ]
        },
        trends: {
          lastTrend,
          streakCount,
          alternatingPattern
        }
      }
    })
  } catch (error) {
    console.error('Prediction error:', error)
    return NextResponse.json({
      success: false,
      data: {
        hotNumbers: [],
        coldNumbers: [],
        predictedNumbers: [],
        overallConfidence: 0,
        analysis: {
          redPercentage: 0,
          blackPercentage: 0,
          greenPercentage: 0,
          oddPercentage: 0,
          evenPercentage: 0,
          lowPercentage: 0,
          highPercentage: 0,
          dozens: [],
          columns: []
        },
        trends: {
          lastTrend: 'red',
          streakCount: 0,
          alternatingPattern: false
        }
      }
    })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'RollerWin Prediction API',
    version: '1.0.0',
    endpoints: {
      'POST /api/predict': 'Generate predictions from number sequence'
    }
  })
}
