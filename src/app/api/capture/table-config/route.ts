import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const CONFIG_DIR = process.env.NODE_ENV === 'production' ? '/tmp/rw-capture' : path.join(process.cwd(), 'db/capture')
const CONFIG_FILE = path.join(CONFIG_DIR, 'table-config.json')

const DEFAULT_TABLES = [
  // === BetFury ===
  { id: 'betfury-evolution', name: 'Evolution Live Roulette', url: 'https://betfury.com/es/casino/games/roulette-live-by-evolution', casino: 'betfury' },
  { id: 'betfury-azure', name: 'Roulette Azure (Pragmatic Play)', url: 'https://betfury.com/es/casino/games/roulette-azure-by-pragmatic-play', casino: 'betfury' },
  // === Pinnacle ===
  { id: 'pinnacle-evolution', name: 'European Roulette (Evolution)', url: 'https://casino.pinnacle.com/es/live-casino/games/european-roulette/', casino: 'pinnacle' },
  { id: 'pinnacle-azure', name: 'Roulette Azure (Pragmatic Play)', url: 'https://casino.pinnacle.com/es/live-casino/games/roulette-azure/', casino: 'pinnacle' },
]

const DEFAULT_CONFIG = { selectedTable: DEFAULT_TABLES[0].url }

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
})

async function readConfig() {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true })
    const raw = await fs.readFile(CONFIG_FILE, 'utf8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_CONFIG
  }
}

async function writeConfig(data: Record<string, string>) {
  await fs.mkdir(CONFIG_DIR, { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, CONFIG_FILE)
}

/** GET /api/capture/table-config — returns available tables + selected */
export async function GET() {
  const config = await readConfig()
  return NextResponse.json({
    selectedTable: config.selectedTable,
    tables: DEFAULT_TABLES,
  }, { headers: corsHeaders() })
}

/** POST /api/capture/table-config — update selected table */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const tableUrl = String(body.table || '').trim()

    if (!DEFAULT_TABLES.some(t => t.url === tableUrl)) {
      return NextResponse.json(
        { error: 'Tabla no valida', validTables: DEFAULT_TABLES.map(t => t.url) },
        { status: 400, headers: corsHeaders() }
      )
    }

    await writeConfig({ selectedTable: tableUrl })
    const updated = await readConfig()

    return NextResponse.json({ ok: true, selectedTable: updated.selectedTable }, { headers: corsHeaders() })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400, headers: corsHeaders() })
  }
}

/** Handle CORS preflight */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}