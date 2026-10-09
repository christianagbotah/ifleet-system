import { describe, expect, it } from 'vitest'

import { deriveTripInvoiceLine } from '../trip-invoice'

const base = {
  tripId: 'trip-1',
  tripNumber: 'TRP-001',
  status: 'reconciled',
  itemName: '50kg Cement Bags',
  unit: 'bags',
  dispatchedQuantity: 600,
  unitPrice: 28.5,
  totalRevenue: 17100,
  proofs: [
    { id: 'pod-1', acceptedQty: 250, unit: 'bags', supersedesId: null },
    { id: 'pod-2', acceptedQty: 350, unit: 'bags', supersedesId: null },
  ],
}

describe('deriveTripInvoiceLine', () => {
  it('uses the accepted quantity from effective POD records and the commercial unit rate', () => {
    const result = deriveTripInvoiceLine(base)

    expect(result.quantity).toBe(600)
    expect(result.unitPrice).toBe(28.5)
    expect(result.total).toBe(17100)
    expect(result.description).toMatch(/TRP-001/)
  })

  it('uses only the latest POD correction in a supersession chain', () => {
    const result = deriveTripInvoiceLine({
      ...base,
      proofs: [
        { id: 'pod-old', acceptedQty: 250, unit: 'bags', supersedesId: null },
        { id: 'pod-new', acceptedQty: 240, unit: 'bags', supersedesId: 'pod-old' },
        { id: 'pod-2', acceptedQty: 350, unit: 'bags', supersedesId: null },
      ],
    })

    expect(result.quantity).toBe(590)
    expect(result.total).toBe(16815)
  })

  it('derives the rate from finalized trip revenue when unit price was not stored separately', () => {
    const result = deriveTripInvoiceLine({ ...base, unitPrice: null })

    expect(result.unitPrice).toBe(28.5)
    expect(result.total).toBe(17100)
  })

  it('reduces the invoice quantity for a documented delivery shortage instead of billing dispatched quantity', () => {
    const result = deriveTripInvoiceLine({
      ...base,
      proofs: [{ id: 'pod-1', acceptedQty: 575, unit: 'bags', supersedesId: null }],
    })

    expect(result.quantity).toBe(575)
    expect(result.total).toBe(16387.5)
  })

  it('rejects unreconciled trips, missing POD and incompatible units', () => {
    expect(() => deriveTripInvoiceLine({ ...base, status: 'delivered' })).toThrow(/reconciled/i)
    expect(() => deriveTripInvoiceLine({ ...base, proofs: [] })).toThrow(/proof of delivery/i)
    expect(() => deriveTripInvoiceLine({
      ...base,
      proofs: [{ id: 'pod-1', acceptedQty: 20, unit: 'tonnes', supersedesId: null }],
    })).toThrow(/unit/i)
  })
})
