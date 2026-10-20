import { db } from '@/lib/db'
import { buildLegacyCompanyCleanup } from '@/lib/config/company-profile'

async function main() {
  const settings = await db.systemSettings.findFirst({
    select: {
      id: true,
      companyName: true,
      companyEmail: true,
      companyPhone: true,
      companyAddress: true,
      companyWebsite: true,
    },
  })

  if (!settings) {
    console.log('[Fleetivo brand migration] No SystemSettings row found; nothing to clean.')
    return
  }

  const updates = buildLegacyCompanyCleanup(settings)
  const fields = Object.keys(updates)
  if (fields.length === 0) {
    console.log('[Fleetivo brand migration] No legacy placeholder fields found; no changes made.')
    return
  }

  await db.systemSettings.update({
    where: { id: settings.id },
    data: updates,
  })

  console.log(`[Fleetivo brand migration] Cleared legacy placeholders: ${fields.join(', ')}`)
}

main()
  .catch((error) => {
    console.error('[Fleetivo brand migration] Failed:', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(async () => {
    await db.$disconnect()
  })
