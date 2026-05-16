/**
 * EMI v6.1e — Soft Martingala Reset
 * 
 * Instead of HARD FILTERING (skip entirely), use EMI as a SOFT RESET:
 * - Always bet (no filtering) — preserves engine state and accuracy
 * - When RA10 < 50% (COLD): Reset martingala step to 0 (free timeout)
 * - When RA10 >= 55% (HOT): Allow martingala to advance normally  
 * - When RA10 >= 65% (FIRE): Allow martingala to advance normally
 * 
 * This breaks loss chains without losing correct predictions.
 */
export type EMILevel = 'COLD' | 'WARM' | 'HOT' | 'FIRE'

export interface EMIState {
  ra10: number
  level: EMILevel
  shouldResetMartingala: boolean  // true when cold — suggests resetting
  totalTracked: number
  score: number
}

export const EMI_CONFIG = {
  windowSize: 10,
  coldThreshold: 0.48,   // Below this → reset martingala
  hotThreshold: 0.60,
  fireThreshold: 0.70,
  minSpins: 8,
}

export class EngineMomentumIndex {
  private raHistory: boolean[] = []
  private config = EMI_CONFIG

  constructor(cfg: Partial<typeof EMI_CONFIG> = {}) {
    this.config = { ...EMI_CONFIG, ...cfg }
  }

  reset(): void { this.raHistory = [] }

  getState(): EMIState {
    const w = this.raHistory.slice(-this.config.windowSize)
    const ra = w.length > 0 ? w.filter(Boolean).length / w.length : 0.5
    const total = this.raHistory.length
    const level = total < this.config.minSpins ? 'WARM'
      : ra < this.config.coldThreshold ? 'COLD'
      : ra < this.config.hotThreshold ? 'WARM'
      : ra < this.config.fireThreshold ? 'HOT' : 'FIRE'
    
    const shouldReset = total >= this.config.minSpins && ra < this.config.coldThreshold
    const score = Math.round(ra * 100)
    
    return { ra10: ra, level, shouldResetMartingala: shouldReset, totalTracked: total, score }
  }

  recordBet(correct: boolean): void {
    this.raHistory.push(correct)
    if (this.raHistory.length > this.config.windowSize * 4) {
      this.raHistory = this.raHistory.slice(-this.config.windowSize * 4)
    }
  }
}

export const EMI_LEVEL_INFO: Record<EMILevel, {
  label: string; emoji: string; color: string; bgColor: string; description: string
}> = {
  COLD: { label: 'FRIO', emoji: '❄️', color: '#60a5fa', bgColor: '#1e3a5f', description: '<48% RA10 — reset martingala' },
  WARM: { label: 'NORMAL', emoji: '🟢', color: '#22c55e', bgColor: '#14532d', description: '48-60% RA10 — bet normal' },
  HOT: { label: 'CALIENTE', emoji: '🔥', color: '#f59e0b', bgColor: '#78350f', description: '60-70% RA10 — confidence up' },
  FIRE: { label: 'FUEGO!', emoji: '⭐', color: '#fbbf24', bgColor: '#713f12', description: '>70% RA10 — strong signal' },
}
