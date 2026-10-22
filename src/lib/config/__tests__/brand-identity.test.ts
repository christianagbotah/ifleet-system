import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

const CUSTOMER_FACING_FILES = [
  'public/manifest.json',
  'public/sw.js',
  'src/app/layout.tsx',
  'src/app/portal/page.tsx',
  'src/app/verify/waybill/[token]/page.tsx',
  'src/app/api/reports/generate/route.ts',
  'src/app/api/reports/haulage/export/route.ts',
  'src/components/auth/LoginView.tsx',
  'src/components/auth/DemoLoginPanel.tsx',
  'src/components/layout/AppFooter.tsx',
  'src/components/layout/PwaInstallPrompt.tsx',
  'src/components/pages/ReportsPage.tsx',
  'src/components/pages/TripsPage.tsx',
  'src/components/reports/HaulageReportsView.tsx',
  'src/components/reports/ReportPreviewView.tsx',
  'src/components/settings/SettingsView.tsx',
  'src/components/ui/onboarding-tour.tsx',
  'src/components/video/VideoPrivacySettingsView.tsx',
  'src/lib/pdf-export.ts',
  'src/lib/services/invoice-delivery.ts',
] as const

describe('Fleetivo public brand contract', () => {
  it('defines product identity separately from the legal publisher', () => {
    const constants = source('src/lib/constants.ts')

    expect(constants).toContain('export const APP_NAME = "Fleetivo"')
    expect(constants).toContain('export const APP_PUBLISHER = "Lightworld Technologies Limited"')
    expect(constants).toContain('export const APP_PRODUCT_BYLINE = `A product of ${APP_PUBLISHER}`')
    expect(constants).not.toContain('APP_COMPANY')
  })

  it('removes legacy public branding and fake fleet-company contact defaults', () => {
    for (const path of CUSTOMER_FACING_FILES) {
      const content = source(path)
      expect(content, path).not.toMatch(/iFleetPro|iFleet Pro|LightWorld Tech|fleetpro\.com\.gh/)
    }
  })

  it('keeps tenant identity independent from Fleetivo and uses a neutral Prisma default', () => {
    const companyProfile = source('src/lib/config/company-profile.ts')
    const settingsView = source('src/components/settings/SettingsView.tsx')
    const schema = source('prisma/schema.prisma')

    expect(companyProfile).not.toMatch(/APP_(?:NAME|PUBLISHER|PRODUCT_BYLINE|COMPANY)/)
    expect(companyProfile).toContain("settings?.companyName || ''")
    expect(schema).toContain('companyName             String   @default("")')
    expect(settingsView).toContain("name: '', email: '', phone: ''")
    expect(settingsView).not.toContain('37 Ring Road Central')
    expect(settingsView).not.toContain('+233 30 277 8899')
    expect(settingsView).not.toContain('www.fleetpro.com.gh')
    expect(source('src/components/clients/ClientFormDialog.tsx')).not.toContain('37 Ring Road Central')
    expect(source('src/app/verify/waybill/[token]/page.tsx')).toContain('Verify a Fleetivo electronic haulage waybill')
  })

  it('uses Fleetivo for customer-visible download filenames', () => {
    const downloads = [
      source('src/components/load-orders/ImportLoadOrdersDialog.tsx'),
      source('src/components/reports/HaulageReportsView.tsx'),
      source('src/app/api/reports/haulage/export/route.ts'),
    ]

    for (const content of downloads) expect(content).not.toContain('ifleetpro-')
    expect(downloads.join('\n')).toContain('fleetivo-')
  })

  it('preserves deliberate internal compatibility identifiers', () => {
    expect(source('public/sw.js')).toContain("const CACHE_PREFIX = 'fleetpro-';")
    expect(source('src/lib/services/email.ts')).toContain("'X-iFleetPro-Notification': 'true'")
  })
})
