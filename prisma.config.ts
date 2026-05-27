import path from 'node:path'
import { defineConfig } from 'prisma/config'

// Explicitly load .env so that DATABASE_URL is available for prisma db push / migrate
import { config } from 'dotenv'
config()

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Please add it to your .env file in the project root.'
  )
}

export default defineConfig({
  earlyAccess: true,
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
