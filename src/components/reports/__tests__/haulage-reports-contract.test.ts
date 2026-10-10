import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('haulage reports workspace contract', () => {
  it('is reachable from the hash-routed application shell', () => {
    const view = 'src/components/reports/HaulageReportsView.tsx'
    expect(existsSync(join(root, view))).toBe(true)
    expect(source('src/lib/constants.ts')).toContain('haulage-reports')
    expect(source('src/app/page.tsx')).toContain("case 'haulage-reports'")
    expect(source('src/lib/store/auth.ts')).toContain("'haulage-reports': ['reports.view']")
  })

  it('uses one screen endpoint with all shared haulage filters', () => {
    const view = source('src/components/reports/HaulageReportsView.tsx')
    expect(view).toContain('/api/reports/haulage')
    for (const filter of ['dateFrom', 'dateTo', 'shipperId', 'transporterId', 'vehicleId', 'driverId', 'route']) {
      expect(view).toContain(filter)
    }
  })

  it('offers CSV, XLSX and PDF exports through the haulage export endpoint', () => {
    const view = source('src/components/reports/HaulageReportsView.tsx')
    expect(view).toContain('/api/reports/haulage/export')
    expect(view).toContain("'csv'")
    expect(view).toContain("'xlsx'")
    expect(view).toContain("'pdf'")
  })

  it('persists report history from the export API', () => {
    expect(source('src/app/api/reports/haulage/export/route.ts')).toContain('db.reportHistory.create')
  })
})
