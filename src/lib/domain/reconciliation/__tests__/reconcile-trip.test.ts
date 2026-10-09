import { describe, expect, it } from 'vitest'
import { buildReconciliationSnapshot, canFinalizeReconciliation } from '../reconcile-trip'

const base = {
  tripId: 'trip-1',
  fuel: [
    { id: 'fuel-1', amount: 1200, reference: 'FUEL-001' },
    { id: 'fuel-2', amount: 800, reference: 'FUEL-002' },
  ],
  tolls: [{ id: 'toll-1', amount: 40, reference: 'TOLL-001', status: 'verified' }],
  expenses: [
    { id: 'expense-1', amount: 350, category: 'loading', reference: 'EXP-001', status: 'approved' },
  ],
  advances: [{ id: 'advance-1', amount: 1000, status: 'disbursed' }],
  deliveryExceptions: [],
  adjustments: [],
}

describe('buildReconciliationSnapshot', () => {
  it('aggregates native fuel, tolls and approved expenses while keeping advances separate from cost', () => {
    const snapshot = buildReconciliationSnapshot(base)

    expect(snapshot.totals).toEqual({
      fuel: 2000,
      tolls: 40,
      expenses: 350,
      adjustments: 0,
      operationalCost: 2390,
      advances: 1000,
    })
    expect(snapshot.lines.map((line) => line.sourceType)).toEqual(['fuel', 'fuel', 'toll', 'expense', 'advance'])
  })

  it('does not double-count generic fuel/toll expenses when their reference matches a native source', () => {
    const snapshot = buildReconciliationSnapshot({
      ...base,
      expenses: [
        ...base.expenses,
        { id: 'expense-fuel-copy', amount: 1200, category: 'fuel', reference: 'FUEL-001', status: 'approved' },
        { id: 'expense-toll-copy', amount: 40, category: 'toll', reference: 'TOLL-001', status: 'approved' },
      ],
    })

    expect(snapshot.totals.expenses).toBe(350)
    expect(snapshot.lines.some((line) => line.sourceId === 'expense-fuel-copy')).toBe(false)
    expect(snapshot.lines.some((line) => line.sourceId === 'expense-toll-copy')).toBe(false)
    expect(snapshot.duplicates).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: 'expense-fuel-copy', duplicateOf: 'fuel:fuel-1' }),
      expect.objectContaining({ sourceId: 'expense-toll-copy', duplicateOf: 'toll:toll-1' }),
    ]))
  })

  it('excludes rejected or pending expenses and non-disbursed advances', () => {
    const snapshot = buildReconciliationSnapshot({
      ...base,
      expenses: [
        ...base.expenses,
        { id: 'expense-pending', amount: 500, category: 'repair', reference: 'PENDING', status: 'pending' },
        { id: 'expense-rejected', amount: 600, category: 'repair', reference: 'REJECTED', status: 'rejected' },
      ],
      advances: [
        ...base.advances,
        { id: 'advance-pending', amount: 2000, status: 'pending' },
        { id: 'advance-rejected', amount: 3000, status: 'rejected' },
      ],
    })

    expect(snapshot.totals.expenses).toBe(350)
    expect(snapshot.totals.advances).toBe(1000)
  })

  it('includes approved positive or negative adjustments in operational cost', () => {
    const snapshot = buildReconciliationSnapshot({
      ...base,
      adjustments: [
        { id: 'adj-1', amount: 125, status: 'approved', reason: 'approved unloading charge' },
        { id: 'adj-2', amount: -25, status: 'approved', reason: 'supplier credit' },
        { id: 'adj-pending', amount: 999, status: 'pending', reason: 'pending review' },
      ],
    })

    expect(snapshot.totals.adjustments).toBe(100)
    expect(snapshot.totals.operationalCost).toBe(2490)
  })

  it('turns unresolved delivery exceptions and pending financial adjustments into blockers', () => {
    const snapshot = buildReconciliationSnapshot({
      ...base,
      deliveryExceptions: [
        { id: 'delivery-ex-1', type: 'shortage', status: 'open', quantity: 10 },
        { id: 'delivery-ex-2', type: 'damage', status: 'resolved', quantity: 2 },
      ],
      adjustments: [{ id: 'adj-pending', amount: 300, status: 'pending', reason: 'damage valuation' }],
    })

    expect(snapshot.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DELIVERY_EXCEPTION_OPEN', sourceId: 'delivery-ex-1' }),
      expect.objectContaining({ code: 'ADJUSTMENT_PENDING', sourceId: 'adj-pending' }),
    ]))
    expect(canFinalizeReconciliation(snapshot)).toMatchObject({ allowed: false })
  })

  it('blocks finalization when an explicit reconciliation exception remains open', () => {
    const snapshot = buildReconciliationSnapshot({
      ...base,
      reconciliationExceptions: [{ id: 'recon-ex-1', type: 'missing_receipt', status: 'open' }],
    })

    expect(snapshot.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'RECONCILIATION_EXCEPTION_OPEN', sourceId: 'recon-ex-1' }),
    ]))
    expect(canFinalizeReconciliation(snapshot).allowed).toBe(false)
  })

  it('allows finalization when every blocking exception is resolved and all adjustments are decided', () => {
    const snapshot = buildReconciliationSnapshot({
      ...base,
      deliveryExceptions: [{ id: 'delivery-ex-1', type: 'shortage', status: 'resolved', quantity: 10 }],
      adjustments: [{ id: 'adj-1', amount: 100, status: 'approved', reason: 'approved shortage valuation' }],
    })

    expect(snapshot.blockers).toEqual([])
    expect(canFinalizeReconciliation(snapshot)).toEqual({ allowed: true, blockers: [] })
  })
})
