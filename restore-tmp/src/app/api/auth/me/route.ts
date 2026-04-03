import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get('userId')?.value

    if (!userId) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        error: 'No hay sesión activa'
      }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    })

    if (!user) {
      return NextResponse.json({
        success: false,
        authenticated: false,
        error: 'Usuario no encontrado'
      }, { status: 401 })
    }

    // Get current client IP
    const clientIP = getClientIP(request)

    // Check subscription
    const hasActiveSubscription = user.subscription && 
      user.subscription.status === 'active' &&
      (!user.subscription.endDate || new Date(user.subscription.endDate) > new Date())

    return NextResponse.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        registeredIP: user.registeredIP,
        currentIP: clientIP,
        subscription: user.subscription ? {
          plan: user.subscription.plan,
          status: user.subscription.status,
          endDate: user.subscription.endDate
        } : null,
        isActive: hasActiveSubscription
      }
    })
  } catch (error) {
    console.error('Session check error:', error)
    return NextResponse.json({
      success: false,
      authenticated: false,
      error: 'Error al verificar sesión'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const response = NextResponse.json({
      success: true,
      message: 'Sesión cerrada exitosamente'
    })

    // Clear cookies
    response.cookies.set('session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/'
    })

    response.cookies.set('userId', '', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 0,
      path: '/'
    })

    return response
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({
      success: false,
      error: 'Error al cerrar sesión'
    }, { status: 500 })
  }
}
