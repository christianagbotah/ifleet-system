import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

describe('company profile runtime configuration contract', () => {
  it('does not ship tenant contact details as Prisma defaults', () => {
    const schema = source('prisma/schema.prisma')
    expect(schema).not.toContain('@default("info@fleetpro.com.gh")')
    expect(schema).not.toContain('@default("+233 30 277 8899")')
    expect(schema).not.toContain('@default("37 Ring Road Central")')
    expect(schema).not.toContain('@default("www.fleetpro.com.gh")')
  })

  it('requires email sender and footer identity from runtime configuration/settings', () => {
    const email = source('src/lib/services/email.ts')
    expect(email).toContain('loadCompanyProfile')
    expect(email).toContain('process.env.SMTP_FROM')
    expect(email).not.toContain("process.env.SMTP_FROM || 'noreply@fleetpro.com.gh'")
    expect(email).not.toContain('37 Ring Road Central, Accra, Ghana')
    expect(email).not.toContain('+233 30 277 8899')
    expect(email).not.toContain('info@fleetpro.com.gh')
  })

  it('uses configured company profile data in generated business documents', () => {
    for (const path of [
      'src/lib/reports/invoice-pdf.ts',
      'src/lib/reports/waybill-pdf.ts',
      'src/lib/reports/payslip-pdf.ts',
    ]) {
      const content = source(path)
      expect(content).toContain('loadCompanyProfile')
      expect(content).not.toContain('37 Ring Road Central')
      expect(content).not.toContain('+233 30 277 8899')
      expect(content).not.toContain('info@fleetpro.com.gh')
    }
  })
})
