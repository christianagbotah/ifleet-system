import { describe, expect, it } from 'vitest'
import { calculateDriverSettlement } from '../driver-settlement'

const base = {
  trips: [
    { id: 'trip-1', reconciliationId: 'recon-1', reconciliationApproved: true, tripBonus: 120, allowance: 80 },
    { id: 'trip-2', reconciliationId: 'recon-2', reconciliationApproved: true, tripBonus: 100, allowance: 50 },
  ],
  incentives: [
    { id: 'inc-1', amount: 75, status: 'approved' },
    { id: 'inc-pending', amount: 999, status: 'pending' },
  ],
  deductions: [
    { id: 'ded-1', amount: 40, status: 'approved', reason: 'approved driver charge' },
    { id: 'ded-rejected', amount: 500, status: 'rejected', reason: 'rejected charge' },
  ],
  advances: [
    { id: 'adv-1', amount: 300, remainingBalance: 180, status: 'partially_deducted' },
  ],
  settledTripIds: [] as string[],
}

describe('calculateDriverSettlement', () => {
  it('pays reconciled trip bonus and allowance, approved incentives, and deducts approved charges plus outstanding advances', () => {
    const result = calculateDriverSettlement(base)

    expect(result.includedTripIds).toEqual(['trip-1', 'trip-2'])
    expect(result.totals).toEqual({
      tripEarnings: 350,
      bonusAmount: 75,
      expenseDeductions: 40,
      advanceDeductions: 180,
      netPay: 205,
    })
  })

  it('excludes trips without approved reconciliation evidence', () => {
    const result = calculateDriverSettlement({
      ...base,
      trips: [
        ...base.trips,
        { id: 'trip-unreconciled', reconciliationId: null, reconciliationApproved: false, tripBonus: 500, allowance: 500 },
      ],
    })

    expect(result.includedTripIds).not.toContain('trip-unreconciled')
    expect(result.totals.tripEarnings).toBe(350)
  })

  it('deduplicates repeated trip facts and excludes already-settled trips', () => {
    const result = calculateDriverSettlement({
      ...base,
      trips: [base.trips[0], base.trips[0], base.trips[1]],
      settledTripIds: ['trip-2'],
    })

    expect(result.includedTripIds).toEqual(['trip-1'])
    expect(result.totals.tripEarnings).toBe(200)
    expect(result.excludedTrips).toEqual(expect.arrayContaining([
      expect.objectContaining({ tripId: 'trip-1', reason: 'duplicate' }),
      expect.objectContaining({ tripId: 'trip-2', reason: 'already_settled' }),
    ]))
  })

  it('ignores pending or rejected incentives and deductions', () => {
    const result = calculateDriverSettlement({
      ...base,
      incentives: [
        { id: 'inc-approved', amount: 25, status: 'approved' },
        { id: 'inc-pending', amount: 1000, status: 'pending' },
        { id: 'inc-rejected', amount: 1000, status: 'rejected' },
      ],
      deductions: [
        { id: 'ded-approved', amount: 15, status: 'approved', reason: 'approved' },
        { id: 'ded-pending', amount: 1000, status: 'pending', reason: 'pending' },
        { id: 'ded-rejected', amount: 1000, status: 'rejected', reason: 'rejected' },
      ],
    })

    expect(result.totals.bonusAmount).toBe(25)
    expect(result.totals.expenseDeductions).toBe(15)
  })

  it('uses only the outstanding advance balance and ignores non-disbursed or fully deducted advances', () => {
    const result = calculateDriverSettlement({
      ...base,
      advances: [
        { id: 'adv-disbursed', amount: 400, remainingBalance: 400, status: 'disbursed' },
        { id: 'adv-partial', amount: 300, remainingBalance: 125, status: 'partially_deducted' },
        { id: 'adv-pending', amount: 999, remainingBalance: 999, status: 'pending' },
        { id: 'adv-done', amount: 200, remainingBalance: 0, status: 'fully_deducted' },
      ],
    })

    expect(result.totals.advanceDeductions).toBe(525)
  })

  it('never returns a non-finite amount', () => {
    expect(() => calculateDriverSettlement({
      ...base,
      trips: [{ id: 'bad', reconciliationId: 'r', reconciliationApproved: true, tripBonus: Number.NaN, allowance: 0 }],
    })).toThrow(/finite/i)
  })
})
