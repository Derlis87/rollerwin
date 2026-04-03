import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hash } from 'crypto'

// Simple password hashing function
function hashPassword(password: string): string {
  return hash('sha256', password)
}

// Get client IP from request
function getClientIP(request: NextRequest): string {
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
  
  return '127.0.0.1'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password } = body

    // Validate input
    if (!email || !password) {
      return NextResponse.json({
        success: false,
        error: 'El correo y la contraseña son requeridos'
      }, { status: 400 })
    }

    // Get client IP
    const clientIP = getClientIP(request)

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { subscription: true }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Credenciales incorrectas'
      }, { status: 401 })
    }

    // Check if user is active
    if (!user.isActive) {
      return NextResponse.json({
        success: false,
        error: 'Tu cuenta ha sido desactivada. Contacta a soporte.'
      }, { status: 401 })
    }

    // Verify password
    const hashedPassword = hashPassword(password)
    if (user.password !== hashedPassword) {
      return NextResponse.json({
        success: false,
        error: 'Credenciales incorrectas'
      }, { status: 401 })
    }

    // Check subscription
    const hasActiveSubscription = user.subscription && 
      user.subscription.status === 'active' &&
      (!user.subscription.endDate || new Date(user.subscription.endDate) > new Date())

    if (!hasActiveSubscription) {
      return NextResponse.json({
        success: false,
        error: 'Tu suscripción ha expirado. Por favor renuévala para continuar.'
      }, { status: 401 })
    }

    // Update last login IP
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginIP: clientIP }
    })

    // Create session token (simple implementation)
    const sessionToken = Buffer.from(`${user.id}:${Date.now()}:${clientIP}`).toString('base64')

    const response = NextResponse.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    })

    // Set session cookie
    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/'
    })

    // Also set user info cookie for client access
    response.cookies.set('userId', user.id, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7,
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al iniciar sesión. Por favor intenta de nuevo.'
    }, { status: 500 })
  }
}
