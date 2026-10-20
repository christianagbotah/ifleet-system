import { hashPassword } from '../src/lib/auth-utils'
import { parseQaProfilesConfig } from '../src/lib/auth/qa-runtime-config'
import { db } from '../src/lib/db'

function requireBootstrapAccess(): string {
  const enabled = process.env.QA_BOOTSTRAP_ENABLED === 'true'
  if (!enabled) {
    throw new Error('QA bootstrap is disabled. Set QA_BOOTSTRAP_ENABLED=true for this explicit operation.')
  }

  if (process.env.NODE_ENV === 'production' && process.env.QA_LOGIN_ALLOW_PRODUCTION !== 'true') {
    throw new Error('QA bootstrap is blocked in production unless QA_LOGIN_ALLOW_PRODUCTION=true.')
  }

  const secret = process.env.QA_BOOTSTRAP_PASSWORD?.trim() ?? ''
  if (secret.length < 14) {
    throw new Error('QA_BOOTSTRAP_PASSWORD must be at least 14 characters.')
  }

  return secret
}

async function validateExistingUser(profile: ReturnType<typeof parseQaProfilesConfig>[number]) {
  const existing = await db.user.findUnique({
    where: { email: profile.email },
    include: {
      role: { select: { name: true } },
      driver: { select: { id: true } },
    },
  })

  if (!existing) return false
  if (existing.role.name !== profile.roleName) {
    throw new Error(`QA profile ${profile.key} already exists with role ${existing.role.name}, expected ${profile.roleName}.`)
  }
  if (!existing.isActive) {
    throw new Error(`QA profile ${profile.key} already exists but is inactive.`)
  }
  if (profile.roleName === 'Driver') {
    if (!profile.driverId) {
      throw new Error(`QA Driver profile ${profile.key} requires driverId in QA_PROFILES_JSON.`)
    }
    if (existing.driver?.id !== profile.driverId) {
      throw new Error(`QA Driver profile ${profile.key} is not linked to the configured driverId.`)
    }
  }

  console.log(`QA profile ${profile.key}: existing account validated.`)
  return true
}

async function validateDriver(profile: ReturnType<typeof parseQaProfilesConfig>[number]) {
  if (profile.roleName !== 'Driver') return null
  if (!profile.driverId) {
    throw new Error(`QA Driver profile ${profile.key} requires driverId in QA_PROFILES_JSON.`)
  }

  const driver = await db.driver.findUnique({
    where: { id: profile.driverId },
    include: { user: { select: { id: true, email: true } } },
  })
  if (!driver) {
    throw new Error(`QA Driver profile ${profile.key} references a driverId that does not exist.`)
  }
  if (driver.user) {
    throw new Error(`QA Driver profile ${profile.key} references a driver that is already linked to another user.`)
  }
  return driver.id
}

async function main() {
  const bootstrapSecret = requireBootstrapAccess()
  const profiles = parseQaProfilesConfig(process.env.QA_PROFILES_JSON)
  const passwordHash = await hashPassword(bootstrapSecret)

  let created = 0
  let existing = 0

  for (const profile of profiles) {
    if (await validateExistingUser(profile)) {
      existing += 1
      continue
    }

    const role = await db.role.findUnique({ where: { name: profile.roleName } })
    if (!role) {
      throw new Error(`QA profile ${profile.key} requires missing role ${profile.roleName}.`)
    }

    const driverId = await validateDriver(profile)

    await db.user.create({
      data: {
        name: profile.label,
        email: profile.email,
        password: passwordHash,
        roleId: role.id,
        position: profile.position,
        department: profile.department,
        isActive: true,
        ...(driverId ? { driver: { connect: { id: driverId } } } : {}),
      },
    })

    created += 1
    console.log(`QA profile ${profile.key}: account created.`)
  }

  console.log(`QA bootstrap complete: ${created} created, ${existing} already valid.`)
}

main()
  .catch((error) => {
    console.error('QA bootstrap failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
