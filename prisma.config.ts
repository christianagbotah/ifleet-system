import path from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Read .env file directly to avoid being overridden by system-level DATABASE_URL
function loadDatabaseUrlFromEnvFile(): string {
  const envPath = path.join(__dirname, '.env')
  try {
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('DATABASE_URL=') && !trimmed.startsWith('#')) {
        return trimmed.substring('DATABASE_URL='.length)
      }
    }
  } catch {
    // .env not found
  }
  // Fall back to process.env
  return process.env.DATABASE_URL || ''
}

const databaseUrl = loadDatabaseUrlFromEnvFile()
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
