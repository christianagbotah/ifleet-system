import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

const protectedRoutes = [
  'src/app/api/expenses/[id]/route.ts',
  'src/app/api/trip-expenses/[id]/route.ts',
  'src/app/api/expenses/bulk-delete/route.ts',
  'src/app/api/expense-approvals/[id]/route.ts',
  'src/app/api/expense-approvals/route.ts',
  'src/app/api/expenses/route.ts',
  'src/app/api/trip-expenses/route.ts',
  'src/app/api/trips/expenses/route.ts',
  'src/app/api/trips/[id]/expenses/route.ts',
  'src/app/api/fuel-logs/route.ts',
  'src/app/api/fuel-logs/[id]/route.ts',
  'src/app/api/fuel-logs/bulk/route.ts',
  'src/app/api/tolls/route.ts',
  'src/app/api/tolls/[id]/route.ts',
]

describe('reconciled expense history lock integration', () => {
  for (const route of protectedRoutes) {
    it(`${route} checks the approved reconciliation lock before mutating expense facts`, () => {
      const text = source(route)
      expect(text).toContain('isTripFinancialSourceLocked')
      expect(text).toContain('RECONCILED_FINANCIAL_SOURCE_LOCKED')
    })
  }

  it('keeps reconciliation adjustments as the correction path', () => {
    const route = source('src/app/api/trips/[id]/reconciliation/route.ts')
    expect(route).toContain("action === 'create_adjustment'")
    expect(route).toContain('reconciliationAdjustment.create')
  })
})
