import { NextRequest, NextResponse } from 'next/server'
import { captureBus } from '@/lib/capture-bus'

/**
 * GET /api/capture/latest?afterId=xxx
 * 
 * Polled by the dashboard (useRouletteCapturer hook) every ~2 seconds.
 * Returns only the NEW numbers since the given afterId.
 * 
 * Query params:
 *   afterId — the last entry id the client already has (optional)
 */
export async function GET(req: NextRequest) {
  const afterId = req.nextUrl.searchParams.get('afterId') ?? undefined
  const newEntries = captureBus.getNew(afterId)

  return NextResponse.json({
    entries: newEntries,
    total: newEntries.length,
  })
}
