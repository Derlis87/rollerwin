// European roulette constants
const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

export interface AfterNumberResult {
  number: number           // The trigger number (0-36)
  color: 'red' | 'black' | 'green'
  totalOccurrences: number // How many times this number appeared in history
  
  // Color prediction
  nextColorProbs: {
    red: number    // percentage 0-100
    black: number
    green: number
  }
  predictedColor: 'red' | 'black' | 'green'
  colorConfidence: number // confidence of predicted color
  
  // Dozen prediction
  nextDozenProbs: {
    d1: number  // 1-12
    d2: number  // 13-24
    d3: number  // 25-36
  }
  predictedDozen: 'd1' | 'd2' | 'd3' | null
  dozenConfidence: number
  dozensToBet: string[]  // top 2 dozens with their confidence
  dozenDetails: { dozen: string; label: string; prob: number }[]
  
  // Column prediction
  nextColumnProbs: {
    c1: number  // 1,4,7,10,13,16,19,22,25,28,31,34
    c2: number  // 2,5,8,11,14,17,20,23,26,29,32,35
    c3: number  // 3,6,9,12,15,18,21,24,27,30,33,36
  }
  predictedColumn: 'c1' | 'c2' | 'c3' | null
  columnConfidence: number
  columnsToBet: string[] // top 2 columns
  columnDetails: { column: string; label: string; prob: number }[]
  
  // Parity prediction
  nextParityProbs: {
    odd: number
    even: number
  }
  predictedParity: 'odd' | 'even' | null
  parityConfidence: number
}

function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green'
  return RED_NUMBERS.includes(n) ? 'red' : 'black'
}

function getDozen(n: number): 'd1' | 'd2' | 'd3' | null {
  if (n === 0) return null
  if (n <= 12) return 'd1'
  if (n <= 24) return 'd2'
  return 'd3'
}

function getColumn(n: number): 'c1' | 'c2' | 'c3' | null {
  if (n === 0) return null
  if (n % 3 === 1) return 'c1'
  if (n % 3 === 2) return 'c2'
  return 'c3'
}

function getParity(n: number): 'odd' | 'even' | null {
  if (n === 0) return null
  return n % 2 === 0 ? 'even' : 'odd'
}

function normalizeColor(red: number, black: number, green: number): { red: number; black: number; green: number } {
  const total = red + black + green
  if (total === 0) return { red: 48.6, black: 48.6, green: 2.7 }
  return {
    red: Math.round((red / total) * 1000) / 10,
    black: Math.round((black / total) * 1000) / 10,
    green: Math.round((green / total) * 1000) / 10,
  }
}

function normalizeParity(odd: number, even: number): { odd: number; even: number } {
  const total = odd + even
  if (total === 0) return { odd: 50, even: 50 }
  return {
    odd: Math.round((odd / total) * 1000) / 10,
    even: Math.round((even / total) * 1000) / 10,
  }
}

function normalizeDozen(d1: number, d2: number, d3: number): { d1: number; d2: number; d3: number } {
  const total = d1 + d2 + d3
  if (total === 0) return { d1: 33.3, d2: 33.3, d3: 33.3 }
  return {
    d1: Math.round((d1 / total) * 1000) / 10,
    d2: Math.round((d2 / total) * 1000) / 10,
    d3: Math.round((d3 / total) * 1000) / 10,
  }
}

function normalizeColumn(c1: number, c2: number, c3: number): { c1: number; c2: number; c3: number } {
  const total = c1 + c2 + c3
  if (total === 0) return { c1: 33.3, c2: 33.3, c3: 33.3 }
  return {
    c1: Math.round((c1 / total) * 1000) / 10,
    c2: Math.round((c2 / total) * 1000) / 10,
    c3: Math.round((c3 / total) * 1000) / 10,
  }
}

export function analyzeAfterNumber(nums: number[], targetNumber: number): AfterNumberResult | null {
  if (nums.length < 10) return null
  
  const totalOccurrences = nums.filter(n => n === targetNumber).length
  if (totalOccurrences < 2) return null
  
  let redCount = 0, blackCount = 0, greenCount = 0
  let d1Count = 0, d2Count = 0, d3Count = 0
  let c1Count = 0, c2Count = 0, c3Count = 0
  let oddCount = 0, evenCount = 0
  
  for (let i = 0; i < nums.length - 1; i++) {
    if (nums[i] === targetNumber) {
      const next = nums[i + 1]
      const color = getNumberColor(next)
      if (color === 'red') redCount++
      else if (color === 'black') blackCount++
      else greenCount++
      
      const dozen = getDozen(next)
      if (dozen === 'd1') d1Count++
      else if (dozen === 'd2') d2Count++
      else if (dozen === 'd3') d3Count++
      
      const col = getColumn(next)
      if (col === 'c1') c1Count++
      else if (col === 'c2') c2Count++
      else if (col === 'c3') c3Count++
      
      const parity = getParity(next)
      if (parity === 'odd') oddCount++
      else if (parity === 'even') evenCount++
    }
  }
  
  const colorProbs = normalizeColor(redCount, blackCount, greenCount)
  const dozenProbs = normalizeDozen(d1Count, d2Count, d3Count)
  const colProbs = normalizeColumn(c1Count, c2Count, c3Count)
  const parityProbs = normalizeParity(oddCount, evenCount)
  
  const predictedColor = colorProbs.red >= colorProbs.black ? 'red' : 'black'
  const colorConfidence = Math.max(colorProbs.red, colorProbs.black)
  
  const dozenDetails = [
    { dozen: 'd1', label: '1a Docena (1-12)', prob: dozenProbs.d1 },
    { dozen: 'd2', label: '2a Docena (13-24)', prob: dozenProbs.d2 },
    { dozen: 'd3', label: '3a Docena (25-36)', prob: dozenProbs.d3 },
  ].sort((a, b) => b.prob - a.prob)
  
  const predictedDozen = dozenDetails[0].prob >= 38 ? (dozenDetails[0].dozen as 'd1' | 'd2' | 'd3') : null
  const dozenConfidence = dozenDetails[0].prob
  const dozensToBet = dozenDetails[0].prob > 30 && dozenDetails[1].prob > 25
    ? [dozenDetails[0].dozen, dozenDetails[1].dozen]
    : dozenDetails[0].prob > 30 ? [dozenDetails[0].dozen] : []
  
  const columnDetails = [
    { column: 'c1', label: 'Columna 1', prob: colProbs.c1 },
    { column: 'c2', label: 'Columna 2', prob: colProbs.c2 },
    { column: 'c3', label: 'Columna 3', prob: colProbs.c3 },
  ].sort((a, b) => b.prob - a.prob)
  
  const predictedColumn = columnDetails[0].prob >= 38 ? (columnDetails[0].column as 'c1' | 'c2' | 'c3') : null
  const columnConfidence = columnDetails[0].prob
  const columnsToBet = columnDetails[0].prob > 30 && columnDetails[1].prob > 25
    ? [columnDetails[0].column, columnDetails[1].column]
    : columnDetails[0].prob > 30 ? [columnDetails[0].column] : []
  
  const predictedParity = parityProbs.odd >= parityProbs.even ? 'odd' : 'even'
  const parityConfidence = Math.max(parityProbs.odd, parityProbs.even)
  
  return {
    number: targetNumber,
    color: getNumberColor(targetNumber),
    totalOccurrences,
    nextColorProbs: colorProbs,
    predictedColor,
    colorConfidence,
    nextDozenProbs: dozenProbs,
    predictedDozen,
    dozenConfidence,
    dozensToBet,
    dozenDetails,
    nextColumnProbs: colProbs,
    predictedColumn,
    columnConfidence,
    columnsToBet,
    columnDetails,
    nextParityProbs: parityProbs,
    predictedParity,
    parityConfidence,
  }
}

// Analyze for the LAST number in the sequence (current prediction)
export function analyzeLastNumber(nums: number[]): AfterNumberResult | null {
  if (nums.length < 10) return null
  return analyzeAfterNumber(nums, nums[nums.length - 1])
}

// Get all numbers 0-36 with their occurrence counts
export function getNumberOccurrenceMap(nums: number[]): Map<number, number> {
  const map = new Map<number, number>()
  for (let i = 0; i <= 36; i++) map.set(i, 0)
  nums.forEach(n => {
    if (n >= 0 && n <= 36) map.set(n, (map.get(n) || 0) + 1)
  })
  return map
}
