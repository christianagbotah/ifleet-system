import { describe, expect, it } from 'vitest'

import { importLoadOrders, normalizeExternalLoadOrder } from '../load-order-import'

const mapping = {
  defaults: { shipperProfileId: 'shipper-1', loadingPointId: 'loading-1', currency: 'GHS' },
  unitMap: { bags: 'bag', BAG: 'bag', tonnes: 'tonne' },
}

describe('load order imports', () => {
  it('normalizes a flat CSV/XLSX-style row into the existing LoadOrderDraft contract', () => {
    const draft = normalizeExternalLoadOrder({
      externalReference: ' EXT-100 ', destinationRef: 'kumasi', destinationName: 'Kumasi Depot',
      itemName: 'Cement', quantity: '600', unit: 'bags', lineRef: 'cement-1',
    }, mapping, 1)

    expect(draft.externalReference).toBe('EXT-100')
    expect(draft.lines[0]).toMatchObject({ itemName: 'Cement', quantity: 600, unit: 'bag', destinationRef: 'kumasi' })
    expect(draft.destinations[0]).toMatchObject({ ref: 'kumasi', name: 'Kumasi Depot' })
  })

  it('groups repeated external references into one multi-destination load order', async () => {
    const persisted: unknown[] = []
    const result = await importLoadOrders({
      rows: [
        { externalReference: 'EXT-200', destinationRef: 'a', destinationName: 'Kumasi', itemName: 'Cement', quantity: 300, unit: 'bags', lineRef: 'l1' },
        { externalReference: 'EXT-200', destinationRef: 'b', destinationName: 'Tamale', itemName: 'Cement', quantity: 200, unit: 'bags', lineRef: 'l2' },
      ],
      mapping,
      persist: async (draft) => { persisted.push(draft); return { id: 'order-200' } },
    })

    expect(result.acceptedCount).toBe(1)
    expect(result.rejectedRowCount).toBe(0)
    expect(persisted).toHaveLength(1)
    expect((persisted[0] as { destinations: unknown[] }).destinations).toHaveLength(2)
    expect((persisted[0] as { lines: unknown[] }).lines).toHaveLength(2)
  })

  it('rejects an existing shipper external reference without persisting it', async () => {
    let persistCalls = 0
    const result = await importLoadOrders({
      rows: [{ externalReference: 'EXT-300', destinationName: 'Accra', itemName: 'Oil', quantity: 10, unit: 'tonnes' }],
      mapping,
      existingOrders: [{ shipperProfileId: 'shipper-1', externalReference: 'ext-300' }],
      persist: async () => { persistCalls += 1; return { id: 'never' } },
    })

    expect(result.acceptedCount).toBe(0)
    expect(result.rejectedRowCount).toBe(1)
    expect(result.rowErrors[0]?.blocking).toContain('duplicate_external_reference')
    expect(persistCalls).toBe(0)
  })

  it('persists valid groups while returning row-level errors for invalid rows', async () => {
    const result = await importLoadOrders({
      rows: [
        { externalReference: 'GOOD-1', destinationName: 'Accra', itemName: 'Soap', quantity: 25, unit: 'BAG' },
        { externalReference: 'BAD-1', destinationName: 'Takoradi', itemName: 'Soap', quantity: 0, unit: 'bags' },
      ],
      mapping,
      persist: async () => ({ id: 'created' }),
    })

    expect(result.acceptedCount).toBe(1)
    expect(result.rejectedRowCount).toBe(1)
    expect(result.rowErrors[0]).toMatchObject({ row: 2 })
    expect(result.rowErrors[0]?.blocking).toContain('invalid_quantity')
  })

  it('derives the same stable batch id for the same payload and mapping', async () => {
    const rows = [{ externalReference: 'EXT-400', destinationName: 'Ho', itemName: 'Rice', quantity: 10, unit: 'bags' }]
    const a = await importLoadOrders({ rows, mapping, persist: async () => ({ id: 'a' }) })
    const b = await importLoadOrders({ rows, mapping, persist: async () => ({ id: 'b' }) })
    expect(a.batchId).toBe(b.batchId)
  })
})
