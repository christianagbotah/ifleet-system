import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('authoritative trip profitability integration', () => {
  it('centralizes approved reconciliation and settlement mapping in the profitability service', () => {
    const service = source('src/lib/domain/billing/profitability-service.ts')

    expect(service).toContain('buildTripFinancialFacts')
    expect(service).toContain('calculateTripProfitability')
    expect(service).toContain('tripReconciliation.findMany')
    expect(service).toContain("status: 'approved'")
    expect(service).toContain('settlementLine.findMany')
    expect(service).toContain('haulierSettlement.findMany')
    expect(service).toContain('reconciliationException.findMany')
    expect(service).toContain('reconciliationAdjustment.findMany')
    expect(service).not.toContain('netPayable: true')
  })

  it('keeps both profitability API paths finance-gated but delegates to one service', () => {
    const canonical = source('src/app/api/analytics/trip-profitability/route.ts')
    const compatibility = source('src/app/api/trips/profitability/route.ts')

    for (const route of [canonical, compatibility]) {
      expect(route).toContain('requireFinanceAccess')
      expect(route).toContain('financial.view')
      expect(route).toContain('loadAuthoritativeTripProfitability')
    }
    expect(compatibility).not.toContain('tripReconciliation.findMany')
  })

  it('uses the canonical analytics endpoint while maintenance allocation is governed by System Settings', () => {
    const view = source('src/components/analytics/ProfitabilityView.tsx')
    const settings = source('src/components/settings/SettingsView.tsx')

    expect(view).toContain('/api/analytics/trip-profitability?')
    expect(view).not.toContain('/api/trips/profitability?')
    expect(view).not.toContain('includeMaintenance')
    expect(settings).toContain('Maintenance Cost Allocation')
    expect(settings).toContain('maintenanceAllocationEnabled')
  })
})
