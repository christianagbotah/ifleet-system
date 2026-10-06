import { PrismaClient } from "@/generated/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { getDatabaseUrl } from "@/lib/config/database-url"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const databaseUrl = getDatabaseUrl()
const parsedDatabaseUrl = new URL(databaseUrl)
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\/+/, ""))

if (!databaseName) {
  throw new Error("DATABASE_URL must include a database name")
}

const adapter = new PrismaMariaDb(databaseUrl, {
  database: databaseName,
})

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db
