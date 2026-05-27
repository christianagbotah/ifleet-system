import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Read .env file explicitly to override sandbox-level DATABASE_URL env var
function loadDatabaseUrl(): string {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf-8')
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('DATABASE_URL=') && !trimmed.startsWith('#')) {
        return trimmed.substring('DATABASE_URL='.length)
      }
    }
  } catch {
    // .env not found, fall through to process.env
  }
  return process.env.DATABASE_URL || ''
}

const databaseUrl = loadDatabaseUrl()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
    datasourceUrl: databaseUrl || undefined,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
