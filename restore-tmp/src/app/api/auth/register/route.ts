import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hash } from 'crypto'

// Simple password hashing function
function hashPassword(password: string): string {
  return hash('sha256', password)
}

// Get client IP from request
function getClientIP(request: NextRequest): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const cfIP = request.headers.get('cf-connecting-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  if (cfIP) {
    return cfIP
  }
  
  // Fallback for development
  return '127.0.0.1'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, email, password } = body

    // Validate input
    if (!name || !email || !password) {
      return NextResponse.json({
        success: false,
        error: 'Todos los campos son requeridos'
      }, { status: 400 })
    }

    if (name.length < 2) {
      return NextResponse.json({
        success: false,
        error: 'El nombre debe tener al menos 2 caracteres'
      }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({
        success: false,
        error: 'La contraseña debe tener al menos 6 caracteres'
      }, { status: 400 })
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        success: false,
        error: 'El correo electrónico no es válido'
      }, { status: 400 })
    }

    // Get client IP
    const clientIP = getClientIP(request)

    // Check if email already exists
    const existingUser = await db.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (existingUser) {
      return NextResponse.json({
        success: false,
        error: 'Este correo electrónico ya está registrado'
      }, { status: 400 })
    }

    // Check if IP is already registered
    const existingIP = await db.user.findUnique({
      where: { registeredIP: clientIP }
    })

    if (existingIP) {
      return NextResponse.json({
        success: false,
        error: `Ya existe una cuenta registrada desde esta IP (${clientIP}). Por seguridad, solo se permite una cuenta por IP.`
      }, { status: 400 })
    }

    // Create user
    const hashedPassword = hashPassword(password)
    
    const user = await db.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        password: hashedPassword,
        registeredIP: clientIP,
        lastLoginIP: clientIP,
        isActive: true
      }
    })

    // Create default subscription
    await db.subscription.create({
      data: {
        userId: user.id,
        plan: 'monthly',
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Cuenta creada exitosamente',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al crear la cuenta. Por favor intenta de nuevo.'
    }, { status: 500 })
  }
}
