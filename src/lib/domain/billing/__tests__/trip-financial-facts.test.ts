import { describe, expect, it } from 'vitest'

import { buildTripFinancialFacts } from '../trip-financial-facts'

const base = {
  tripId: 'trip-1',
  revenue: 10000,
  reconciliation: {
    status: 'approved',
    lines: [
      { sourceType: 'fuel', sourceId: 'fuel-1', category: null, amount: 1200, includedInCost: true },
      { sourceType: 'toll', sourceId: 'toll-1', category: null, amount: 80, includedInCost: true },
      { sourceType: 'expense', sourceId: 'permit-1', category: 'permit', amount: 120, includedInCost: true },
      { sourceType: 'expense', sourceId: 'misc-1', category: 'escort', amount: 150, includedInCost: true },
      { sourceType: 'adjustment', sourceId: 'adj-1', category: null, amount: -50, includedInCost: true },
    ],
  },
  driverSettlementLines: [
    { status: 'approved', type: 'trip_earning', amount: 300 },
  ],
  haulierSettlement: null,
  reconciliationExceptions: [],
  postAdjustments: [],
  maintenanceAllocation: 200,
  includeMaintenanceAllocation: true,
}

describe('buildTripFinancialFacts', () => {
  it('maps approved reconciliation and driver settlement facts without double counting', () => {
    const result = buildTripFinancialFacts(base)

    expect(result).toMatchObject({
      fuelCost: 1200,
      tollAndFeesCost: 200,
      otherDirectCost: 150,
      driverCost: 300,
      maintenanceAllocation: 200,
      adjustmentAmount: -50,
    })
  })

  it('excludes driver and haulier settlement categories from reconciliation expenses', () => {
    const result = buildTripFinancialFacts({
      ...base,
      reconciliation: {
        status: 'approved',
        lines: [
          { sourceType: 'expense', sourceId: 'd1', category: 'driver_allowance', amount: 300, includedInCost: true },
          { sourceType: 'expense', sourceId: 'h1', category: 'haulier_extra', amount: 500, includedInCost: true },
          { sourceType: 'expense', sourceId: 'm1', category: 'misc', amount: 75, includedInCost: true },
        ],
      },
    })

    expect(result.driverCost).toBe(300)
    expect(result.otherDirectCost).toBe(75)
  })

  it('uses economic haulier cost without subtracting withholding or advances', () => {
    const result = buildTripFinancialFacts({
      ...base,
      haulierSettlement: {
        status: 'paid',
        baseFreight: 3000,
        detentionAmount: 200,
        extrasAmount: 100,
        shortageDeduction: 250,
        fuelAdjustment: -50,
        taxAmount: 150,
        withholdingAmount: 75,
        advanceDeduction: 500,
      },
    })

    expect(result.haulierCost).toBe(3150)
  })

  it('deduplicates approved post-reconciliation adjustments already captured in the snapshot', () => {
    const result = buildTripFinancialFacts({
      ...base,
      postAdjustments: [
        { id: 'adj-1', status: 'approved', amount: -50 },
        { id: 'adj-2', status: 'approved', amount: 125 },
        { id: 'adj-3', status: 'pending', amount: 900 },
      ],
    })

    expect(result.adjustmentAmount).toBe(75)
  })

  it('classifies direct maintenance and shortage/damage expenses into their authoritative buckets', () => {
    const result = buildTripFinancialFacts({
      ...base,
      maintenanceAllocation: 40,
      reconciliation: {
        status: 'approved',
        lines: [
          { sourceType: 'expense', sourceId: 'maint-1', category: 'maintenance', amount: 200, includedInCost: true },
          { sourceType: 'expense', sourceId: 'damage-1', category: 'cargo_damage', amount: 80, includedInCost: true },
        ],
      },
    })

    expect(result.maintenanceAllocation).toBe(240)
    expect(result.shortageDamageImpact).toBe(80)
    expect(result.otherDirectCost).toBe(0)
  })

  it('includes resolved shortage/damage financial impact only', () => {
    const result = buildTripFinancialFacts({
      ...base,
      reconciliationExceptions: [
        { type: 'shortage', status: 'resolved', amount: 400 },
        { type: 'damage_claim', status: 'closed', amount: 150 },
        { type: 'shortage', status: 'open', amount: 999 },
        { type: 'other', status: 'resolved', amount: 200 },
      ],
    })

    expect(result.shortageDamageImpact).toBe(550)
  })

  it('rejects profitability facts without approved reconciliation', () => {
    expect(() => buildTripFinancialFacts({
      ...base,
      reconciliation: { ...base.reconciliation, status: 'draft' },
    })).toThrow(/approved reconciliation/i)
  })
})
