# Worklog V5.3 → V5.5

## Session: 2026-04-23

### BUG CRÍTICO DESUBIERTO
El simulador `simulate-v53.ts` **ignoraba `pred.shouldSkip`** completamente. V5.4 tenía:
- SKIP_THRESHOLD = 15
- Micro-Markov (50 spins)  
- shouldSkip en la interfaz

Pero el simulador **nunca verificaba shouldSkip**, haciendo que V5.4 fuera paper-only.
Resultado: el skip nunca fue simulado correctamente en TODAS las sesiones anteriores.

---

### V5.4 SIMULACIÓN CORRECTA (simulate-v54.ts)
Primera simulación con skip correctamente implementado:
| Metric | V5.3 (sin skip) | V5.4 (con skip) |
|--------|----------------|-----------------|
| Accuracy | 49.6% | 50.7% |
| Ratio | 8.00:1 | 8.48:1 |
| Max streak | 14 | 10 |
| Fatal ≥4 | 156 (12.5%) | 116 (13.0%) |
| Busts | 328 | 252 |
| Net | -4,051 | -3,057 |
| Skips | 0 | 1,143 (24%) |

Mejora significativa pero accuracy aún insuficiente.

---

### V5.5 — MEJORAS IMPLEMENTADAS

#### 1. Recovery DESHABILITADO
- Tenía 41.8% accuracy (PEOR que random)
- 304 flips: 127 correct, 170 incorrect
- Cada flip incorrecto EXTIENDE la racha en vez de cortarla
- Decisión: return null (deshabilitado completamente)

#### 2. CONSENSUS MARKOV — Quality Gate
- Construye Markov-2 en 3 ventanas: 20, 50, 100 spins
- NO suma scores (eso infla y mata el skip)
- Actúa como FILTRO: si los 3 ventanas coinciden → +12 pts bonus
- Si no hay consenso → el score es más débil → más probable skip

#### 3. SKIP Agresivo Adaptativo
- NORMAL: threshold = 28.0 (solo apuesta en señales fuertes)
- SOFT: threshold = 24.0
- ULTRA: sin skip (streak-based push ya es señal fuerte)
- Skip resetea martingala step a 0 (fresh start)

#### 4. Alternación Mejorada (strength-based)
- Detecta con solo 3 resultados (antes necesitaba 4)
- Strength score 0-100 (no solo detected/not)
- Boost proporcional a strength

---

### RESULTADOS V5.5 — SECUENCIA 1 (4,781 números)
| Metric | V5.3 | V5.5 | Mejora |
|--------|------|------|--------|
| Accuracy global | 49.6% | **52.7%** | +3.1% |
| NORMAL mode | 49.6% | **55.4%** ✅ | +5.8% |
| SOFT mode | ~50% | 49.6% | ~ |
| ULTRA mode | ~53% | 53.5% | ~ |
| Skips | 0 | **3,460 (72.5%)** | Solo apuesta 27.5% |
| Ratio | 8.00:1 | **9.65:1** ✅ | +20.6% |
| Max streak | 14 | **10** | -28.6% |
| Busts | 328 | **18** | **-94.5%** |
| Fatal ≥4 | 156 (12.5%) | **31 (9.4%)** | -80.1% |
| Net | -4,051 | **-758** | -81.3% |

### RESULTADOS V5.5 — SECUENCIA 2 (4,832 números)
| Metric | Seq 1 | Seq 2 | Consistente |
|--------|-------|-------|-------------|
| Accuracy global | 52.7% | 52.3% | ✅ |
| NORMAL mode | 55.4% | **55.1%** ✅ | ✅ |
| SOFT mode | 49.6% | 49.1% | ✅ |
| ULTRA mode | 53.5% | 53.4% | ✅ |
| Ratio | 9.65:1 | **9.39:1** ✅ | ✅ |
| Busts | 18 | **18** | ✅✅ |
| Max streak | 10 | **10** | ✅ |
| Fatal ≥4 | 31 (9.4%) | **32 (9.6%)** | ✅ |
| Net | -758 | -776 | ✅ |

---

### ANÁLISIS

**Logrado:**
- ✅ NORMAL mode >55% consistente (55.1-55.4%)
- ✅ Ratio >7:1 consistente (9.4-9.7:1)
- ✅ Busts reducidos 94.5% (328→18)
- ✅ Resultados idénticos entre ambas secuencias

**Pendiente:**
- ⚠️ SOFT mode 49.1-49.6% (arrastra la accuracy global)
- ⚠️ Max streak 10 (objetivo ≤3 no alcanzado)
- ⚠️ Net aún negativo (-758, -776)
