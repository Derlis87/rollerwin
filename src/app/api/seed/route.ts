import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hash } from 'crypto'

// This endpoint seeds an admin user if no users exist.
// Called automatically on first request to ensure DB is initialized.
export async function GET() {
  try {
    const count = await db.user.count()
    if (count === 0) {
      const hashedPassword = hash('sha256', 'Carlos123@')
      await db.user.create({
        data: {
          name: 'Carlos',
          email: 'derlisg3212@gmail.com',
          password: hashedPassword,
          registeredIP: 'admin-seed',
          lastLoginIP: 'admin-seed',
          isActive: true,
          subscription: {
            create: {
              plan: 'monthly',
              status: 'active',
              startDate: new Date(),
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            }
          }
        }
      })
      return NextResponse.json({ success: true, message: 'Admin user created' })
    }
    return NextResponse.json({ success: true, message: 'Users already exist' })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
