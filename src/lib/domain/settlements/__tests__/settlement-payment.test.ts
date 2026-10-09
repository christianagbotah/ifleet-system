import { describe, expect, it } from 'vitest'
import { deriveSettlementPaymentEffects } from '../settlement-payment'

describe('deriveSettlementPaymentEffects', () => {
  it('applies source-linked advance deductions to the outstanding balance', () => {
    const result = deriveSettlementPaymentEffects({
      lines: [{ type: 'advance_deduction', sourceId: 'adv-1', amount: -180 }],
      advances: [{ id: 'adv-1', totalDeducted: 120, remainingBalance: 180 }],
    })

    expect(result.advanceUpdates).toEqual([{
      id: 'adv-1',
      deduction: 180,
      totalDeducted: 300,
      remainingBalance: 0,
      status: 'fully_deducted',
    }])
  })

  it('never deducts more than the current outstanding advance balance', () => {
    const result = deriveSettlementPaymentEffects({
      lines: [{ type: 'advance_deduction', sourceId: 'adv-1', amount: -250 }],
      advances: [{ id: 'adv-1', totalDeducted: 80, remainingBalance: 100 }],
    })

    expect(result.advanceUpdates[0]).toMatchObject({ deduction: 100, totalDeducted: 180, remainingBalance: 0, status: 'fully_deducted' })
  })

  it('marks source-linked approved incentives as paid without duplicating ids', () => {
    const result = deriveSettlementPaymentEffects({
      lines: [
        { type: 'incentive', sourceId: 'inc-1', amount: 50 },
        { type: 'incentive', sourceId: 'inc-1', amount: 50 },
        { type: 'trip_earning', sourceId: 'recon-1', amount: 100 },
      ],
      advances: [],
    })

    expect(result.paidIncentiveIds).toEqual(['inc-1'])
  })

  it('ignores source-less and unrelated lines', () => {
    const result = deriveSettlementPaymentEffects({
      lines: [
        { type: 'advance_deduction', sourceId: null, amount: -100 },
        { type: 'deduction', sourceId: 'expense-1', amount: -25 },
      ],
      advances: [],
    })

    expect(result).toEqual({ advanceUpdates: [], paidIncentiveIds: [] })
  })
})
