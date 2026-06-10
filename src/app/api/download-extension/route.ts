import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import path from 'path'

export async function GET() {
  try {
    const b64Path = path.join(process.cwd(), 'db', 'extension-zip-base64.txt')
    const b64Data = readFileSync(b64Path, 'utf-8').trim()
    const fileBuffer = Buffer.from(b64Data, 'base64')
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=RollerWin-Capture-Extension.zip,',
        'Content-Length': String(fileBuffer.length),
        'Cache-Control': 'no-cache',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Download failed' }, { status: 500 })
  }
}