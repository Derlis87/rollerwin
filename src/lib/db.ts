import { PrismaClient } from '@prisma/client'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

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
