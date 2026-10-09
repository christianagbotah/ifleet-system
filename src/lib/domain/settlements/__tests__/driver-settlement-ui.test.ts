import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (relative: string) => {
  const file = path.join(process.cwd(), relative)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

describe('driver settlement UI contract', () => {
  it('exposes snapshot and advance deduction fields in the client settlement type', () => {
    const api = source('src/lib/api.ts')
    expect(api).toContain('advanceDeductions: number')
    expect(api).toContain('snapshotVersion?: number | null')
    expect(api).toContain('snapshotJson?: string | null')
    expect(api).toContain('sourceId?: string | null')
  })

  it('renders reconciled earnings and advance deductions without legacy revenue/fuel labels', () => {
    const view = source('src/components/settlements/SettlementsView.tsx')
    expect(view).toContain("l.type === 'trip_earning'")
    expect(view).toContain("l.type === 'advance_deduction'")
    expect(view).toContain("l.type === 'incentive'")
    expect(view).toContain('settlement.advanceDeductions')
    expect(view).toContain('Reconciled Trip Earnings')
    expect(view).not.toContain('t.totalRevenue')
    expect(view).not.toContain('fuelCost?: number')
    expect(view).not.toContain('Auto-calculate earnings and deductions from completed trips')
  })

  it('does not submit bonus mutations for snapshot-backed approve, pay or note actions', () => {
    const view = source('src/components/settlements/SettlementsView.tsx')
    expect(view).toContain('const financialsLocked = Boolean(settlement?.snapshotVersion && settlement?.snapshotJson)')
    expect(view).toContain('disabled={financialsLocked || settlement.status !== \'pending\'}')
    expect(view).not.toContain("status: 'approved',\n        approvedBy: user?.id,\n        notes,\n        bonusAmount")
    expect(view).not.toContain("status: 'paid',\n        notes,\n        bonusAmount")
  })
  it('maps Prisma SettlementLine relation names to the client lines contract', () => {
    const detail = source('src/app/api/settlements/[id]/route.ts')
    const list = source('src/app/api/settlements/route.ts')
    expect(detail).toContain('lines: settlement.SettlementLine')
    expect(list).toContain('lines: settlement._count.SettlementLine')
  })

})
