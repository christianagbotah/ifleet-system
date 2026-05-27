import { PrismaClient } from '@/generated/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
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

let databaseUrl = loadDatabaseUrl()

// The @prisma/adapter-mariadb requires the connection string to use
// the mariadb:// protocol prefix.  Automatically convert mysql:// to
// mariadb:// so that .env files using mysql:// still work.
if (databaseUrl.startsWith('mysql://')) {
  databaseUrl = 'mariadb://' + databaseUrl.slice('mysql://'.length)
}

// Extract database name from the URL for the adapter option
function extractDatabaseName(url: string): string {
  try {
    const urlObj = new URL(url)
    // pathname starts with '/', strip it
    const dbName = urlObj.pathname.slice(1).split('?')[0]
    return dbName || 'ifleetpro_data'
  } catch {
    return 'ifleetpro_data'
  }
}

const databaseName = extractDatabaseName(databaseUrl)

const adapter = new PrismaMariaDb(databaseUrl, {
  database: databaseName,
})

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
