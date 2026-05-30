// ════════════════════════════════════════════════════════════════════
// iFleet Pro — Password Migration Script
// ════════════════════════════════════════════════════════════════════
//
// One-time script to ensure ALL users have bcrypt-hashed passwords.
// A bcrypt hash always starts with "$2a$" or "$2b$".
// Any password NOT matching this pattern is assumed to be plaintext
// and will be replaced with its bcrypt hash.
//
// Usage: bun run scripts/migrate-passwords.ts
// ────────────────────────────────────────────────────────────────────

import bcrypt from 'bcryptjs'
import { PrismaClient } from '../src/generated/client'
import { PrismaMariaDb } from '@prisma/adapter-mariadb'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SALT_ROUNDS = 12

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
    // .env not found
  }
  return process.env.DATABASE_URL || ''
}

let databaseUrl = loadDatabaseUrl()
if (databaseUrl.startsWith('mysql://')) {
  databaseUrl = 'mariadb://' + databaseUrl.slice('mysql://'.length)
}

function extractDatabaseName(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.pathname.slice(1).split('?')[0] || 'ifleetpro_data'
  } catch {
    return 'ifleetpro_data'
  }
}

const adapter = new PrismaMariaDb(databaseUrl, { database: extractDatabaseName(databaseUrl) })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('🔐 Password Migration: Checking all users...\n')

  const users = await db.user.findMany({
    select: { id: true, email: true, name: true, password: true },
  })

  const BCRYPT_PREFIX = '$2'
  let migrated = 0
  let alreadyHashed = 0
  let noPassword = 0

  for (const user of users) {
    if (!user.password) {
      console.log(`  ⚠️  ${user.email} (${user.name}) — No password set, skipping`)
      noPassword++
      continue
    }

    if (user.password.startsWith(BCRYPT_PREFIX)) {
      alreadyHashed++
      continue
    }

    // Password is plaintext — hash it
    console.log(`  🔄 Migrating ${user.email} (${user.name}) — plaintext → bcrypt`)
    const hashed = await bcrypt.hash(user.password, SALT_ROUNDS)
    await db.user.update({
      where: { id: user.id },
      data: { password: hashed },
    })
    migrated++
  }

  console.log(`\n═══ Migration Complete ═══`)
  console.log(`  ✅ Already bcrypt-hashed: ${alreadyHashed}`)
  console.log(`  🔄 Migrated (plaintext → bcrypt): ${migrated}`)
  console.log(`  ⚠️  No password set: ${noPassword}`)
  console.log(`  📊 Total users checked: ${users.length}`)
  console.log()

  if (migrated > 0) {
    console.log(`✅ Successfully migrated ${migrated} user(s) to bcrypt hashes.`)
    console.log(`⚠️  Please inform these users that their passwords remain the same.`)
    console.log(`   No action needed from them — the password value is unchanged,`)
    console.log(`   only the storage format was updated from plaintext to bcrypt.`)
  } else {
    console.log(`✅ All passwords are already bcrypt-hashed. No migration needed.`)
  }
}

main()
  .catch((err) => {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
