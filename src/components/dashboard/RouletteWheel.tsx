'use client'

import { motion } from 'framer-motion'

interface RouletteWheelProps {
  highlightedNumber?: number
  size?: number
}

const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
]

const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]

function getNumberColor(num: number): string {
  if (num === 0) return '#16a34a' // green
  return RED_NUMBERS.includes(num) ? '#dc2626' : '#27272a' // red or black
}

export function RouletteWheel({ highlightedNumber, size = 200 }: RouletteWheelProps) {
  const segmentAngle = 360 / ROULETTE_ORDER.length
  const radius = size / 2 - 10
  const centerOffset = size / 2

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        {/* Outer ring */}
        <circle
          cx={centerOffset}
          cy={centerOffset}
          r={radius + 5}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="3"
        />
        
        {/* Segments */}
        {ROULETTE_ORDER.map((num, index) => {
          const startAngle = index * segmentAngle - 90
          const endAngle = startAngle + segmentAngle
          const startRad = (startAngle * Math.PI) / 180
          const endRad = (endAngle * Math.PI) / 180
          
          const x1 = centerOffset + radius * Math.cos(startRad)
          const y1 = centerOffset + radius * Math.sin(startRad)
          const x2 = centerOffset + radius * Math.cos(endRad)
          const y2 = centerOffset + radius * Math.sin(endRad)
          
          const largeArc = segmentAngle > 180 ? 1 : 0
          
          const midAngle = ((startAngle + endAngle) / 2 * Math.PI) / 180
          const textX = centerOffset + (radius - 20) * Math.cos(midAngle)
          const textY = centerOffset + (radius - 20) * Math.sin(midAngle)
          
          const isHighlighted = num === highlightedNumber
          const color = getNumberColor(num)
          
          return (
            <g key={num}>
              <path
                d={`M ${centerOffset} ${centerOffset} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={color}
                stroke={isHighlighted ? '#fbbf24' : '#3f3f46'}
                strokeWidth={isHighlighted ? 2 : 0.5}
                className={isHighlighted ? 'animate-pulse' : ''}
              />
              <text
                x={textX}
                y={textY}
                fill="white"
                fontSize="8"
                fontWeight="bold"
                textAnchor="middle"
                dominantBaseline="middle"
                style={{ pointerEvents: 'none' }}
              >
                {num}
              </text>
            </g>
          )
        })}
        
        {/* Center circle */}
        <circle
          cx={centerOffset}
          cy={centerOffset}
          r={30}
          fill="#18181b"
          stroke="#f59e0b"
          strokeWidth="2"
        />
        
        {/* Center text */}
        <text
          x={centerOffset}
          y={centerOffset}
          fill="#f59e0b"
          fontSize="10"
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          RW
        </text>
      </svg>
      
      {/* Ball indicator */}
      {highlightedNumber !== undefined && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white rounded-full shadow-lg"
        />
      )}
    </div>
  )
}
