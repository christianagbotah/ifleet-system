import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const legacy = {
  companyName: 'iFleetPro Ltd.',
  companyEmail: 'info@fleetpro.com.gh',
  companyPhone: '+233 30 277 8899',
  companyAddress: '37 Ring Road Central',
  companyWebsite: 'www.fleetpro.com.gh',
}

describe('legacy Fleetivo tenant-placeholder cleanup', () => {
  it('only clears fields that still exactly match known legacy placeholders', async () => {
    const profileModule = await import('../company-profile')
    const cleanup = (profileModule as Record<string, unknown>).buildLegacyCompanyCleanup

    expect(cleanup).toBeTypeOf('function')
    if (typeof cleanup !== 'function') return

    const build = cleanup as (value: Record<string, string>) => Record<string, string>
    expect(build(legacy)).toEqual({
      companyName: '',
      companyEmail: '',
      companyPhone: '',
      companyAddress: '',
      companyWebsite: '',
    })
    expect(build({
      ...legacy,
      companyName: 'Acme Logistics Ltd.',
      companyEmail: 'ops@acmelogistics.com',
    })).toEqual({
      companyPhone: '',
      companyAddress: '',
      companyWebsite: '',
    })
  })

  it('ships an auditable one-time migration script', () => {
    expect(existsSync(join(process.cwd(), 'scripts/migrate-fleetivo-brand-settings.ts'))).toBe(true)
  })
})
