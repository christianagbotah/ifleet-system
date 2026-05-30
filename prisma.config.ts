import path from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

// Read DATABASE_URL from .env files, with explicit .env taking priority to avoid
// being overridden by a system-level DATABASE_URL (e.g. SQLite sandbox default).
// Falls back to process.env.DATABASE_URL if no .env file is found.
function loadDatabaseUrl(): string {
  // Priority: .env > .env.local > .env.production > process.env
  const candidates = ['.env', '.env.local', '.env.production']
  for (const file of candidates) {
    const envPath = path.join(__dirname, file)
    try {
      const content = readFileSync(envPath, 'utf-8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('DATABASE_URL=') && !trimmed.startsWith('#')) {
          return trimmed.substring('DATABASE_URL='.length)
        }
      }
    } catch {
      // file not found – continue to next candidate
    }
  }
  // Final fallback: environment variable
  return process.env.DATABASE_URL || ''
}

const databaseUrl = loadDatabaseUrl()

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Create a .env file in the project root with:\n' +
    '  DATABASE_URL=mysql://user:password@host:3306/database\n' +
    'Or set the DATABASE_URL environment variable.'
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
