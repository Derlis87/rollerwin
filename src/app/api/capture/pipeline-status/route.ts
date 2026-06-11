import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const CONFIG_DIR = process.env.NODE_ENV === 'production' ? '/tmp/rw-capture' : path.join(process.cwd(), 'db/capture')
const STATUS_FILE = path.join(CONFIG_DIR, 'pipeline-status.json')

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
})

async function readStatus() {
  try {
    const raw = await fs.readFile(STATUS_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    return { active: false, table: '', casino: '', activatedAt: null }
  }
}

async function writeStatus(data: Record<string, unknown>) {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  const tmp = STATUS_FILE + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, STATUS_FILE)
}

/**
 * GET /api/capture/pipeline-status
 * El script capturador consulta esto cada 5 segundos para saber si debe capturar
 * Retorna: { active, table, casino, activatedAt }
 */
export async function GET() {
  const status = await readStatus()
  return NextResponse.json(status, { headers: corsHeaders() })
}

/**
 * POST /api/capture/pipeline-status
 * El dashboard llama esto cuando el usuario activa/desactiva auto-capture
 * Body: { active: true/false, table: "url", casino: "betfury"|"pinnacle" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const active = !!body.active
    const table = String(body.table || '').trim()
    const casino = String(body.casino || '').trim()

    if (active && !table) {
      return NextResponse.json(
        { error: 'Se requiere tabla cuando se activa' },
        { status: 400, headers: corsHeaders() }
      )
    }

    const status = {
      active,
      table: active ? table : '',
      casino: active ? casino : '',
      activatedAt: active ? Date.now() : null,
    }

    await writeStatus(status)

    return NextResponse.json({ ok: true, ...status }, { headers: corsHeaders() })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: corsHeaders() })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}