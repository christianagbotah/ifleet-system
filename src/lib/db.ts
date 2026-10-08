import { PrismaClient } from '@/generated/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { extractDatabaseName, resolveDatabaseUrl } from '@/lib/config/database-url'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = resolveDatabaseUrl(
  process.env,
  process.env.NODE_ENV ?? 'development'
)
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
