import { NextResponse } from 'next/server'
import { captureBus } from '@/lib/capture-bus'

/**
 * POST /api/capture/reset
 * 
 * Resets the capture bus. Called when the user activates auto-capture
 * so stale numbers from previous sessions don't leak through.
 */
export async function POST() {
  captureBus.reset()
  return NextResponse.json({ ok: true, message: 'Capture bus reset' })
}
