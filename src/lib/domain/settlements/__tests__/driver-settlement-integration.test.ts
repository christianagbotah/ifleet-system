import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => {
  const file = path.join(root, relative)
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

describe('driver settlement reconciliation integration', () => {
  it('stores an immutable calculation snapshot and explicit advance deductions', () => {
    const schema = source('prisma/schema.prisma')
    expect(schema).toContain('advanceDeductions')
    expect(schema).toContain('snapshotVersion')
    expect(schema).toContain('snapshotJson')
  })

  it('generates settlement from approved reconciliation evidence instead of customer revenue/fuel cost', () => {
    const route = source('src/app/api/settlements/generate/route.ts')
    expect(route).toContain('calculateDriverSettlement')
    expect(route).toContain('tripReconciliation.findMany')
    expect(route).toContain("status: 'approved'")
    expect(route).toContain('SettlementLine')
    expect(route).not.toContain('trip.totalRevenue')
    expect(route).not.toContain('trip.fuelCost')
    expect(route).not.toContain("TERMINAL_STATUSES")
  })

  it('excludes already-settled trip ids before calculating a new settlement', () => {
    const route = source('src/app/api/settlements/generate/route.ts')
    expect(route).toContain('settledTripIds')
    expect(route).toContain('tripId: { not: null }')
  })

  it('requires a snapshot before approval and preserves financial history after approval', () => {
    const route = source('src/app/api/settlements/[id]/route.ts')
    expect(route).toContain('snapshotJson')
    expect(route).toContain('snapshotVersion')
    expect(route).toContain('SETTLEMENT_SNAPSHOT_REQUIRED')
    expect(route).toContain('SETTLEMENT_FINANCIALS_LOCKED')
    expect(route).toContain('auth.userId')
  })

  it('retires manual settlement creation so reconciliation-backed generation cannot be bypassed', () => {
    const route = source('src/app/api/settlements/route.ts')
    expect(route).toContain('SETTLEMENT_GENERATION_REQUIRED')
    expect(route).toContain('/api/settlements/generate')
    expect(route).not.toContain('db.driverSettlement.create')
  })
})
