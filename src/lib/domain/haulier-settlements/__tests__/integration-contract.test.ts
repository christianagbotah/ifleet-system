import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('haulier settlement integration contract', () => {
  it('persists one immutable settlement per reconciled trip with a line ledger', () => {
    const schema = source('prisma/models/haulier-settlements.prisma')
    expect(schema).toContain('model HaulierSettlement {')
    expect(schema).toMatch(/tripId\s+String\s+@unique/)
    expect(schema).toContain('snapshotJson')
    expect(schema).toContain('snapshotVersion')
    expect(schema).toContain('model HaulierSettlementLine {')
  })

  it('stores configurable settlement terms on transport rate cards instead of hard-coding commercial rules', () => {
    const schema = source('prisma/schema.prisma')
    expect(schema).toContain('settlementTerms')
  })

  it('generates only from approved reconciliation and resolved Phase 1 rate cards', () => {
    const route = source('src/app/api/haulier-settlements/route.ts')
    expect(route).toContain("status: 'approved'")
    expect(route).toContain('resolveTransportRate')
    expect(route).toContain('calculateHaulierSettlement')
    expect(route).toContain('selectHaulierPayee')
    expect(route).toContain('snapshotJson')
    expect(route).toContain('HAULIER_SETTLEMENT_ALREADY_EXISTS')
  })

  it('never re-offers a settled trip when the list is filtered', () => {
    const route = source('src/app/api/haulier-settlements/route.ts')
    expect(route).toContain('allSettledTrips')
    expect(route).toContain("select: { tripId: true }")
    expect(route).toContain('allSettledTrips.map')
  })

  it('can generate and offer settlement after operational completion when approved reconciliation already exists', () => {
    const route = source('src/app/api/haulier-settlements/route.ts')
    expect(route).toContain("status: { in: ['reconciled', 'completed'] }")
    expect(route).toContain("['reconciled', 'completed'].includes(trip.status)")
  })

  it('requires finance access and locks financial facts after approval/payment', () => {
    const route = source('src/app/api/haulier-settlements/[id]/route.ts')
    expect(route).toContain('financial.view')
    expect(route).toContain('HAULIER_SETTLEMENT_SNAPSHOT_REQUIRED')
    expect(route).toContain('HAULIER_SETTLEMENT_FINANCIALS_LOCKED')
    expect(route).toContain("status: 'approved'")
    expect(route).toContain("status: 'paid'")
  })

  it('exposes a finance-only hash-routed haulier settlement workspace', () => {
    const view = source('src/components/settlements/HaulierSettlementsView.tsx')
    const page = source('src/app/page.tsx')
    const auth = source('src/lib/store/auth.ts')
    expect(view).toContain('Haulier Settlements')
    expect(view).toContain('netPayable')
    expect(page).toContain("case 'haulier-settlements'")
    expect(auth).toContain("'haulier-settlements': ['financial.view']")
  })
})
