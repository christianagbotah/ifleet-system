import { describe, expect, it } from 'vitest'

import {
  allocateLoadOrderQuantity,
  canTransitionLoadOrderStatus,
  validateLoadOrder,
  type LoadOrderDraft,
} from '@/lib/domain/orders/load-order'

function draft(overrides: Partial<LoadOrderDraft> = {}): LoadOrderDraft {
  return {
    shipperProfileId: 'shipper-1',
    externalReference: 'EXT-1001',
    loadingPointId: 'site-1',
    destinations: [{ ref: 'accra', name: 'Accra Depot' }],
    lines: [
      { ref: 'cement-bags', itemName: 'Cement 50kg', quantity: 600, unit: 'bags', destinationRef: 'accra' },
      { ref: 'cement-tonnes', itemName: 'Bulk Cement', quantity: 20, unit: 'tonnes', destinationRef: 'accra' },
    ],
    ...overrides,
  }
}

describe('validateLoadOrder', () => {
  it('accepts cement quantities expressed in bags and tonnes', () => {
    const result = validateLoadOrder(draft())
    expect(result.valid).toBe(true)
    expect(result.blocking).toEqual([])
  })

  it('preserves an FMCG multi-line multi-drop order', () => {
    const input = draft({
      externalReference: 'FMCG-55',
      destinations: [
        { ref: 'tema', name: 'Tema DC' },
        { ref: 'accra', name: 'Accra Shop' },
      ],
      lines: [
        { ref: 'soap-tema', itemName: 'Soap', quantity: 120, unit: 'cartons', destinationRef: 'tema' },
        { ref: 'soap-accra', itemName: 'Soap', quantity: 40, unit: 'cartons', destinationRef: 'accra' },
        { ref: 'oil-accra', itemName: 'Cooking Oil', quantity: 65, unit: 'cartons', destinationRef: 'accra' },
      ],
    })

    const result = validateLoadOrder(input)
    expect(result.valid).toBe(true)
    expect(result.normalized?.lines.map((line) => [line.ref, line.quantity, line.destinationRef])).toEqual([
      ['soap-tema', 120, 'tema'],
      ['soap-accra', 40, 'accra'],
      ['oil-accra', 65, 'accra'],
    ])
  })

  it('rejects a line that points at an unknown destination', () => {
    const result = validateLoadOrder(draft({
      lines: [{ ref: 'line-1', itemName: 'Cement', quantity: 10, unit: 'tonnes', destinationRef: 'missing' }],
    }))

    expect(result.valid).toBe(false)
    expect(result.blocking).toContain('unknown_destination')
  })

  it('rejects an external reference already used by the same shipper but not another shipper', () => {
    const existing = [
      { shipperProfileId: 'shipper-1', externalReference: 'EXT-1001' },
      { shipperProfileId: 'shipper-2', externalReference: 'EXT-2002' },
    ]

    expect(validateLoadOrder(draft(), existing).blocking).toContain('duplicate_external_reference')
    expect(validateLoadOrder(draft({ shipperProfileId: 'shipper-3' }), existing).valid).toBe(true)
  })
})

describe('allocateLoadOrderQuantity', () => {
  const order = {
    lines: [
      { id: 'line-a', quantity: 600 },
      { id: 'line-b', quantity: 20 },
    ],
  }

  it('calculates partial allocation across multiple trips', () => {
    const result = allocateLoadOrderQuantity(order, [
      { status: 'scheduled', items: [{ loadOrderLineId: 'line-a', quantity: 200 }] },
      { status: 'in_transit', items: [{ loadOrderLineId: 'line-a', quantity: 150 }, { loadOrderLineId: 'line-b', quantity: 5 }] },
      { status: 'cancelled', items: [{ loadOrderLineId: 'line-a', quantity: 100 }] },
    ])

    expect(result.valid).toBe(true)
    expect(result.lines).toEqual([
      { lineId: 'line-a', ordered: 600, allocated: 350, remaining: 250, overAllocated: 0 },
      { lineId: 'line-b', ordered: 20, allocated: 5, remaining: 15, overAllocated: 0 },
    ])
  })

  it('rejects over-allocation while reporting the exact excess', () => {
    const result = allocateLoadOrderQuantity(order, [
      { status: 'scheduled', items: [{ loadOrderLineId: 'line-b', quantity: 12 }] },
      { status: 'loaded', items: [{ loadOrderLineId: 'line-b', quantity: 11 }] },
    ])

    expect(result.valid).toBe(false)
    expect(result.overAllocatedLineIds).toEqual(['line-b'])
    expect(result.lines.find((line) => line.lineId === 'line-b')).toEqual({
      lineId: 'line-b', ordered: 20, allocated: 23, remaining: 0, overAllocated: 3,
    })
  })
})


describe('canTransitionLoadOrderStatus', () => {
  it('allows the canonical allocation path and temporary holds', () => {
    expect(canTransitionLoadOrderStatus('draft', 'open')).toBe(true)
    expect(canTransitionLoadOrderStatus('open', 'partially_allocated')).toBe(true)
    expect(canTransitionLoadOrderStatus('partially_allocated', 'allocated')).toBe(true)
    expect(canTransitionLoadOrderStatus('allocated', 'in_progress')).toBe(true)
    expect(canTransitionLoadOrderStatus('in_progress', 'completed')).toBe(true)
    expect(canTransitionLoadOrderStatus('open', 'on_hold')).toBe(true)
    expect(canTransitionLoadOrderStatus('on_hold', 'open')).toBe(true)
  })

  it('protects terminal states and rejects execution skips', () => {
    expect(canTransitionLoadOrderStatus('draft', 'in_progress')).toBe(false)
    expect(canTransitionLoadOrderStatus('completed', 'open')).toBe(false)
    expect(canTransitionLoadOrderStatus('cancelled', 'open')).toBe(false)
  })
})
