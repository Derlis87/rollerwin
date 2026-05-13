import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import { hash } from 'crypto'

// Ensure db directory exists (Render free tier has ephemeral filesystem)
const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './db/custom.db'
try {
  mkdirSync(dirname(dbPath), { recursive: true })
} catch {}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// Auto-create admin user if no users exist (for Render fresh deploys)
async function seedAdminUser() {
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
              endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
            }
          }
        }
      })
      console.log('Admin user created: derlisg3212@gmail.com')
    }
  } catch (e) {
    console.error('Failed to seed admin user:', e)
  }
}

// Run seed on startup
seedAdminUser()
