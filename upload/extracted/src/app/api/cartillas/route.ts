import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Seed data for cartillas
const cartillasSeed = [
  {
    id: '1',
    title: 'Introducción a la Ruleta',
    description: 'Aprende los conceptos básicos de la ruleta europea',
    content: `# Introducción a la Ruleta

## Conceptos Básicos

La ruleta europea tiene 37 números (0-36).

### Números Rojos
1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36

### Números Negros
2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35

### El Cero
El 0 es verde y da ventaja a la casa (2.7%)

### Probabilidades
- Cada número tiene una probabilidad de 1/37 (2.7%)
- Rojo/Negro: 48.6%
- Par/Impar: 48.6%`,
    category: 'beginner',
    order: 1,
    isActive: true
  },
  {
    id: '2',
    title: 'Tipos de Apuestas',
    description: 'Conoce los diferentes tipos de apuestas disponibles',
    content: `# Tipos de Apuestas

## Apuestas Internas

### Apuesta Directa
- Un solo número
- Paga 35:1
- Probabilidad: 2.7%

### Apuesta Dividida
- Dos números adyacentes
- Paga 17:1

### Apuesta de Calle
- Tres números en una fila
- Paga 11:1

## Apuestas Externas

### Color (Rojo/Negro)
- Paga 1:1
- Probabilidad: 48.6%

### Par/Impar
- Paga 1:1
- Probabilidad: 48.6%

### Alto/Bajo (1-18 / 19-36)
- Paga 1:1
- Probabilidad: 48.6%

### Docenas
- Paga 2:1
- Probabilidad: 32.4%

### Columnas
- Paga 2:1
- Probabilidad: 32.4%`,
    category: 'beginner',
    order: 2,
    isActive: true
  },
  {
    id: '3',
    title: 'Gestión de Capital',
    description: 'Aprende a gestionar tu dinero de forma inteligente',
    content: `# Gestión de Capital

## Reglas Fundamentales

### 1. Define un Presupuesto
- Nunca apuestes dinero que no puedas permitirte perder
- Establece un límite máximo antes de empezar

### 2. Gestión por Apuesta
- No apuestes más del 5% de tu capital en una sola apuesta
- Para principiantes: máximo 2-3%

### 3. Límites de Pérdida
- Establece un límite de pérdida diario
- Detente cuando alcances el límite
- No persigas pérdidas con apuestas más grandes

### 4. Objetivos de Ganancia
- Define un objetivo realista de ganancia
- Retírate cuando lo alcances
- No seas codicioso

### 5. Registro de Resultados
- Lleva un registro de todas tus sesiones
- Analiza tus resultados periódicamente
- Aprende de tus errores`,
    category: 'beginner',
    order: 3,
    isActive: true
  },
  {
    id: '4',
    title: 'Análisis de Frecuencias',
    description: 'Identifica patrones en los números',
    content: `# Análisis de Frecuencias

## Números Calientes y Fríos

### Números Calientes
Son los números que han aparecido con mayor frecuencia en las últimas tiradas.

### Números Fríos
Son los números que no han aparecido en mucho tiempo.

## Cómo Analizar

### 1. Registro de Tiradas
- Registra al menos 30-50 números consecutivos
- Usa el software RollerWin para facilitar el registro

### 2. Identificar Patrones
- Observa la distribución de colores
- Revisa los patrones de par/impar
- Analiza las docenas y columnas

### 3. Tendencias
- Busca rachas de un color
- Identifica patrones alternados
- Considera la "Ley de los Grandes Números"

### 4. Tomar Decisiones
- Combina el análisis estadístico con tu estrategia
- No confíes solo en los números calientes
- Considera que cada tirada es independiente`,
    category: 'intermediate',
    order: 4,
    isActive: true
  },
  {
    id: '5',
    title: 'Estrategias de Apuesta',
    description: 'Métodos avanzados de apuesta',
    content: `# Estrategias de Apuesta

## ⚠️ Advertencia Importante
**Ningún sistema garantiza ganancias.** La ruleta tiene una ventaja matemática para la casa. Usa estas estrategias con responsabilidad.

## Métodos Clásicos

### Martingala
- Duplicar la apuesta después de perder
- Recuperar pérdidas con una sola victoria
- ⚠️ Riesgo alto - requiere capital grande

### Paroli (Inversa)
- Duplicar después de ganar
- Aprovechar rachas ganadoras
- Limitar a 3 duplicaciones

### D'Alembert
- Aumentar en 1 unidad al perder
- Disminuir en 1 unidad al ganar
- Más conservador que Martingala

### Fibonacci
- Seguir la secuencia: 1, 1, 2, 3, 5, 8, 13...
- Retroceder dos pasos al ganar
- Avanzar un paso al perder

## Consejos

1. **Practica primero** con apuestas pequeñas
2. **Define límites** antes de empezar
3. **No persigas pérdidas**
4. **Retírate a tiempo**`,
    category: 'intermediate',
    order: 5,
    isActive: true
  },
  {
    id: '6',
    title: 'Uso del Software RollerWin',
    description: 'Aprende a usar RollerWin eficientemente',
    content: `# Uso de RollerWin

## Primeros Pasos

### 1. Selecciona la Plataforma
- Azure
- Bet365
- Evolution

### 2. Ingresa los Números
- Presiona los botones numéricos
- El sistema registra automáticamente

### 3. Observa las Predicciones
- Aparecen automáticamente después de 10 números
- Muestra números recomendados
- Indica nivel de confianza

## Módulos Disponibles

### Análisis
- Ingreso de números en tiempo real
- Predicciones basadas en estadísticas
- Gráficos de frecuencia

### Historial
- Registro de sesiones anteriores
- Estadísticas acumuladas
- Patrones identificados

### Cartillas
- Tutoriales para principiantes
- Guías avanzadas
- Estrategias probadas

## Interpretación de Resultados

### Confianza
- **Alta (>80%)**: Datos consistentes
- **Media (60-80%)**: Datos moderados
- **Baja (<60%)**: Datos insuficientes

### Números Recomendados
Combina:
- Números calientes
- Números fríos (por aparecer)
- Análisis de color`,
    category: 'beginner',
    order: 6,
    isActive: true
  }
]

export async function GET() {
  try {
    // Check if cartillas exist
    let cartillas = await db.cartilla.findMany({
      where: { isActive: true },
      orderBy: { order: 'asc' }
    })

    // If no cartillas, seed the database
    if (cartillas.length === 0) {
      await db.cartilla.createMany({
        data: cartillasSeed
      })
      
      cartillas = await db.cartilla.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' }
      })
    }

    return NextResponse.json({
      success: true,
      data: cartillas
    })
  } catch (error) {
    console.error('Cartillas fetch error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch cartillas'
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, content, category } = body

    const cartilla = await db.cartilla.create({
      data: {
        title,
        description,
        content,
        category: category || 'beginner',
        order: await db.cartilla.count() + 1,
        isActive: true
      }
    })

    return NextResponse.json({
      success: true,
      data: cartilla
    })
  } catch (error) {
    console.error('Cartilla creation error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to create cartilla'
    }, { status: 500 })
  }
}
