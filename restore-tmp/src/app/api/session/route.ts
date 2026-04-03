import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, platform, numbers } = body

    // Create roulette entry
    const roulette = await db.roulette.create({
      data: {
        name: name || `Session ${new Date().toISOString()}`,
        platform: platform || 'Azure',
        isActive: true
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        id: roulette.id,
        name: roulette.name,
        platform: roulette.platform,
        createdAt: roulette.createdAt
      }
    })
  } catch (error) {
    console.error('Session creation error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create session'
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const roulettes = await db.roulette.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    return NextResponse.json({
      success: true,
      data: roulettes
    })
  } catch (error) {
    console.error('Session fetch error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch sessions'
    }, { status: 500 })
  }
}
