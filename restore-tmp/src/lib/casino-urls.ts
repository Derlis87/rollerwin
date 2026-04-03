// Casino URLs and configurations - Direct links to roulette tables
export interface CasinoConfig {
  id: string
  name: string
  loginUrl: string
  rouletteUrl: string
  tables: CasinoTable[]
  logo?: string
  notes?: string
}

export interface CasinoTable {
  id: string
  name: string
  url: string
  provider?: string
}

// Solo Betfury
export const CASINO_CONFIGS: CasinoConfig[] = [
  {
    id: 'betfury',
    name: 'Betfury',
    loginUrl: 'https://betfury.com/es',
    rouletteUrl: 'https://betfury.com/es/casino',
    tables: [
      { 
        id: 'roulette-live-evolution', 
        name: 'Roulette Live', 
        url: 'https://betfury.com/es/casino/games/roulette-live-by-evolution',
        provider: 'Evolution'
      }
    ],
    notes: 'Haz login en Betfury y accede directamente a la mesa de ruleta'
  }
]

export function getCasinoById(id: string): CasinoConfig | undefined {
  return CASINO_CONFIGS.find(c => c.id === id)
}

export function getTableUrl(casinoId: string, tableId: string): string {
  const casino = getCasinoById(casinoId)
  if (!casino) return ''
  
  const table = casino.tables.find(t => t.id === tableId)
  if (table?.url) return table.url
  
  return casino.rouletteUrl
}

// Variable para almacenar la referencia de la ventana
let casinoWindowRef: Window | null = null

export function openCasino(casinoId: string, tableId?: string): Window | null {
  const casino = getCasinoById(casinoId)
  if (!casino) return null
  
  // Get direct table URL
  const url = getTableUrl(casinoId, tableId || '')
  
  // Si ya existe una ventana abierta, cerrarla primero
  if (casinoWindowRef && !casinoWindowRef.closed) {
    casinoWindowRef.close()
  }
  
  // Open in new window with specific features
  const features = [
    'width=1600',
    'height=1000',
    'left=50',
    'top=0',
    'menubar=no',
    'toolbar=no',
    'location=yes',
    'status=no',
    'resizable=yes',
    'scrollbars=yes'
  ].join(',')
  
  // Usar un nombre fijo para reutilizar la misma ventana
  casinoWindowRef = window.open(url, 'BetfuryCasino', features)
  
  return casinoWindowRef
}
