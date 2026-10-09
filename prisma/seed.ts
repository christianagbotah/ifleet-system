import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth-utils'

const MIN_BOOTSTRAP_PASSWORD_LENGTH = 14

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`${name} must be configured before running the production bootstrap seed.`)
  }
  return value
}

function validateBootstrapPassword(password: string): void {
  if (password.length < MIN_BOOTSTRAP_PASSWORD_LENGTH) {
    throw new Error(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_BOOTSTRAP_PASSWORD_LENGTH} characters long.`)
  }

  const normalized = password.toLowerCase()
  const forbiddenFragments = ['password', 'admin123', 'changeme', 'default', 'welcome']
  if (forbiddenFragments.some((fragment) => normalized.includes(fragment))) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD is too predictable. Configure a unique strong password in the server environment.')
  }
}

async function main() {
  if (process.env.SEED_BOOTSTRAP_ENABLED !== 'true') {
    throw new Error('Production bootstrap seeding is disabled. Set SEED_BOOTSTRAP_ENABLED=true explicitly to continue.')
  }

  const email = requireEnv('BOOTSTRAP_ADMIN_EMAIL').toLowerCase()
  const name = requireEnv('BOOTSTRAP_ADMIN_NAME')
  const password = requireEnv('BOOTSTRAP_ADMIN_PASSWORD')
  validateBootstrapPassword(password)

  const adminRole = await db.role.upsert({
    where: { name: 'Admin' },
    update: { isSystem: true },
    create: {
      name: 'Admin',
      description: 'System administrator',
      permissions: JSON.stringify([]),
      isSystem: true,
    },
  })

  const existingUser = await db.user.findUnique({
    where: { email },
    select: { id: true, roleId: true },
  })

  if (existingUser) {
    await db.user.update({
      where: { id: existingUser.id },
      data: {
        name,
        roleId: adminRole.id,
        isActive: true,
      },
    })

    console.log('Bootstrap administrator already exists. Role/name were reconciled; password was left unchanged.')
    return
  }

  const activeAdministratorCount = await db.user.count({
    where: {
      roleId: adminRole.id,
      isActive: true,
    },
  })

  if (activeAdministratorCount > 0) {
    throw new Error(
      'An active administrator already exists. Refusing to create another bootstrap administrator automatically.'
    )
  }

  await db.user.create({
    data: {
      email,
      name,
      password: await hashPassword(password),
      roleId: adminRole.id,
      isActive: true,
      position: process.env.BOOTSTRAP_ADMIN_POSITION?.trim() || null,
      department: process.env.BOOTSTRAP_ADMIN_DEPARTMENT?.trim() || null,
    },
  })

  console.log('Production bootstrap administrator created successfully.')
}

main()
  .catch((error) => {
    console.error('Bootstrap seed failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
