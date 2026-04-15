import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * GET /api/capture/userscript
 *
 * Serves the Tampermonkey userscript with the correct Content-Type
 * so Tampermonkey's auto-install detects it properly.
 */
export async function GET() {
  const filePath = join(process.cwd(), 'public', 'rollerwin-capture.user.js')

  try {
    const content = readFileSync(filePath, 'utf-8')

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/x-userscript;charset=utf-8',
        'Content-Disposition': 'inline; filename="rollerwin-capture.user.js"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Userscript file not found' },
      { status: 404 }
    )
  }
}
