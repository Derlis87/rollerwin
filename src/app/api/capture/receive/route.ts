import { NextRequest, NextResponse } from 'next/server'
import { captureBus } from '@/lib/capture-bus'

/**
 * POST /api/capture/receive
 * 
 * Receives a roulette number from the Tampermonkey userscript.
 * The userscript sends: { number: 0-36 }
 * 
 * CORS headers are wide-open so the userscript (running on betfury.com) can POST here.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const number = parseInt(body.number, 10)

    if (isNaN(number) || number < 0 || number > 36) {
      return NextResponse.json(
        { error: 'Invalid number. Must be 0-36.' },
        { status: 400, headers: corsHeaders() }
      )
    }

    captureBus.push(number)

    return NextResponse.json(
      { ok: true, number, timestamp: Date.now() },
      { status: 200, headers: corsHeaders() }
    )
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400, headers: corsHeaders() }
    )
  }
}

/** Handle CORS preflight */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
