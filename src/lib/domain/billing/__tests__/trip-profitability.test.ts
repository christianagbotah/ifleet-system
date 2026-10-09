import { describe, expect, it } from 'vitest'

import { calculateTripProfitability } from '../trip-profitability'

const baseFacts = {
  tripId: 'trip-1',
  revenue: 10000,
  haulierCost: 0,
  fuelCost: 2000,
  driverCost: 500,
  tollAndFeesCost: 100,
  maintenanceAllocation: 300,
  otherDirectCost: 200,
  shortageDamageImpact: 0,
  adjustmentAmount: 0,
}

describe('calculateTripProfitability', () => {
  it('calculates contribution for an internal-fleet trip', () => {
    const result = calculateTripProfitability(baseFacts)

    expect(result.totalDirectCost).toBe(3100)
    expect(result.contribution).toBe(6900)
    expect(result.marginPercent).toBe(69)
  })

  it('includes third-party haulier cost for subcontracted movement', () => {
    const result = calculateTripProfitability({ ...baseFacts, haulierCost: 4000 })

    expect(result.totalDirectCost).toBe(7100)
    expect(result.contribution).toBe(2900)
  })

  it('returns zero margin when revenue is zero without hiding the loss', () => {
    const result = calculateTripProfitability({ ...baseFacts, revenue: 0 })

    expect(result.contribution).toBe(-3100)
    expect(result.marginPercent).toBe(0)
  })

  it('preserves a negative contribution and negative margin', () => {
    const result = calculateTripProfitability({ ...baseFacts, revenue: 2000 })

    expect(result.contribution).toBe(-1100)
    expect(result.marginPercent).toBe(-55)
  })

  it('can exclude maintenance allocation by policy', () => {
    const result = calculateTripProfitability({ ...baseFacts, includeMaintenanceAllocation: false })

    expect(result.maintenanceCost).toBe(0)
    expect(result.totalDirectCost).toBe(2800)
    expect(result.contribution).toBe(7200)
  })

  it('includes shortage or damage impact as a direct economic cost', () => {
    const result = calculateTripProfitability({ ...baseFacts, shortageDamageImpact: 750 })

    expect(result.shortageDamageImpact).toBe(750)
    expect(result.totalDirectCost).toBe(3850)
    expect(result.contribution).toBe(6150)
  })

  it('applies signed post-settlement correction adjustments without rewriting prior cost facts', () => {
    const debit = calculateTripProfitability({ ...baseFacts, adjustmentAmount: 250 })
    const credit = calculateTripProfitability({ ...baseFacts, adjustmentAmount: -150 })

    expect(debit.adjustmentAmount).toBe(250)
    expect(debit.totalDirectCost).toBe(3350)
    expect(credit.adjustmentAmount).toBe(-150)
    expect(credit.totalDirectCost).toBe(2950)
  })

  it('rejects non-finite and negative immutable cost facts', () => {
    expect(() => calculateTripProfitability({ ...baseFacts, fuelCost: -1 })).toThrow(/fuel/i)
    expect(() => calculateTripProfitability({ ...baseFacts, revenue: Number.NaN })).toThrow(/revenue/i)
  })
})

import { classifyReconciliationCosts } from '../trip-profitability'

describe('classifyReconciliationCosts', () => {
  it('separates maintenance and shortage/damage from other direct expense lines', () => {
    const result = classifyReconciliationCosts([
      { sourceType: 'expense', category: 'maintenance', amount: 300 },
      { sourceType: 'expense', category: 'cargo_damage', amount: 450 },
      { sourceType: 'expense', category: 'parking', amount: 75 },
    ])

    expect(result).toEqual({ maintenance: 300, shortageDamage: 450, otherDirect: 75 })
  })

  it('excludes driver compensation categories because driver settlement is authoritative for them', () => {
    const result = classifyReconciliationCosts([
      { sourceType: 'expense', category: 'driver_allowance', amount: 250 },
      { sourceType: 'expense', category: 'trip_bonus', amount: 150 },
      { sourceType: 'expense', category: 'overnight_allowance', amount: 100 },
      { sourceType: 'expense', category: 'loading_fee', amount: 80 },
    ])

    expect(result).toEqual({ maintenance: 0, shortageDamage: 0, otherDirect: 80 })
  })

  it('excludes haulier settlement categories because net payable is authoritative for them', () => {
    const result = classifyReconciliationCosts([
      { sourceType: 'expense', category: 'haulier_extra', amount: 250 },
      { sourceType: 'expense', category: 'transporter_advance', amount: 500 },
      { sourceType: 'expense', category: 'vehicle_owner_extra', amount: 100 },
      { sourceType: 'expense', category: 'parking', amount: 75 },
    ])

    expect(result).toEqual({ maintenance: 0, shortageDamage: 0, otherDirect: 75 })
  })

  it('ignores non-expense reconciliation lines and rejects invalid expense amounts', () => {
    expect(classifyReconciliationCosts([
      { sourceType: 'fuel', category: null, amount: 500 },
      { sourceType: 'toll', category: null, amount: 50 },
      { sourceType: 'adjustment', category: null, amount: -25 },
    ])).toEqual({ maintenance: 0, shortageDamage: 0, otherDirect: 0 })

    expect(() => classifyReconciliationCosts([
      { sourceType: 'expense', category: 'parking', amount: -1 },
    ])).toThrow(/expense/i)
  })
})

import { calculateMaintenanceAllocation, resolveConfirmedRevenue } from '../trip-profitability'

describe('profitability source policy', () => {
  it('uses non-tax invoice subtotal once the invoice is commercially confirmed', () => {
    expect(resolveConfirmedRevenue({
      tripRevenue: 10000,
      invoice: { status: 'sent', subtotal: 12000 },
    })).toBe(12000)
    expect(resolveConfirmedRevenue({
      tripRevenue: 10000,
      invoice: { status: 'paid', subtotal: 12000 },
    })).toBe(12000)
  })

  it('ignores draft, cancelled and void invoices and falls back to trip revenue', () => {
    for (const status of ['draft', 'cancelled', 'void']) {
      expect(resolveConfirmedRevenue({
        tripRevenue: 10000,
        invoice: { status, subtotal: 12000 },
      })).toBe(10000)
    }
  })

  it('applies maintenance allocation policy only when enabled', () => {
    expect(calculateMaintenanceAllocation({ enabled: false, costPerKm: 1.25, distanceKm: 400 })).toBe(0)
    expect(calculateMaintenanceAllocation({ enabled: true, costPerKm: 1.25, distanceKm: 400 })).toBe(500)
  })
})
