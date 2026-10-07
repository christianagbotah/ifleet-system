import path from 'node:path'
import { defineConfig } from 'prisma/config'

const databaseUrl = process.env.DATABASE_URL?.trim()

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is required in the process environment before running Prisma commands.'
  )
}

export default defineConfig({
  schema: path.join(__dirname, 'prisma/schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
  migrate: {
    async development() {
      return {
        url: databaseUrl,
      }
    },
  },
})
