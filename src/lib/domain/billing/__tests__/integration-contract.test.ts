import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const source = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

describe('authoritative trip profitability integration contract', () => {
  it('stores an opt-in per-kilometre maintenance allocation policy in system settings', () => {
    const schema = source('prisma/schema.prisma')
    expect(schema).toContain('profitabilityMaintenanceAllocationEnabled')
    expect(schema).toContain('profitabilityMaintenanceCostPerKm')
  })

  it('exposes a finance-gated authoritative analytics route backed by the billing service', () => {
    const route = source('src/app/api/analytics/trip-profitability/route.ts')
    expect(route).toContain('requireFinanceAccess')
    expect(route).toContain('loadAuthoritativeTripProfitability')
    expect(route).toContain('Financial analytics access is required')
  })

  it('builds profitability from approved reconciliation and finalized settlement evidence', () => {
    const service = source('src/lib/domain/billing/profitability-service.ts')
    expect(service).toContain("status: 'approved'")
    expect(service).toContain('tripReconciliation')
    expect(service).toContain('settlementLine')
    expect(service).toContain('haulierSettlement')
    expect(service).toContain('Invoice')
    expect(service).toContain('calculateTripProfitability')
    expect(service).toContain('buildTripFinancialFacts')
  })

  it('moves the existing profitability dashboard to the authoritative analytics endpoint', () => {
    const view = source('src/components/analytics/ProfitabilityView.tsx')
    expect(view).toContain('/api/analytics/trip-profitability?')
    expect(view).not.toContain('/api/trips/profitability?')
  })

  it('returns and saves the maintenance allocation policy through System Settings', () => {
    const route = source('src/app/api/settings/route.ts')
    expect(route).toContain('profitabilityMaintenanceAllocationEnabled')
    expect(route).toContain('profitabilityMaintenanceCostPerKm')
    expect(route).toContain('profitability:')
  })

  it('exposes maintenance allocation controls in the existing Settings workspace', () => {
    const view = source('src/components/settings/SettingsView.tsx')
    expect(view).toContain('Maintenance Cost Allocation')
    expect(view).toContain('maintenanceAllocationEnabled')
    expect(view).toContain('maintenanceCostPerKm')
  })
})
