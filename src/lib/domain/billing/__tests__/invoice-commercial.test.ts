import { describe, expect, it } from 'vitest'

import { deriveTripInvoiceCommercialLine } from '../invoice-commercial'

const trip = {
  tripNumber: 'TRP-100',
  loadingLocation: 'Tema',
  destination: 'Kumasi',
  quantity: 600,
  unit: 'bags',
  unitPrice: 28.5,
  totalRevenue: 17100,
}

describe('deriveTripInvoiceCommercialLine', () => {
  it('uses finalized accepted POD quantity with the trip unit rate', () => {
    const line = deriveTripInvoiceCommercialLine({
      trip,
      acceptedPodQuantities: [300, 280],
    })

    expect(line.quantity).toBe(580)
    expect(line.unitPrice).toBe(28.5)
    expect(line.total).toBe(16530)
    expect(line.description).toContain('TRP-100')
  })

  it('falls back to reconciled trip quantity when no POD quantities exist', () => {
    const line = deriveTripInvoiceCommercialLine({ trip, acceptedPodQuantities: [] })

    expect(line.quantity).toBe(600)
    expect(line.total).toBe(17100)
  })

  it('uses a flat finalized trip revenue when no per-unit rate exists', () => {
    const line = deriveTripInvoiceCommercialLine({
      trip: { ...trip, unitPrice: null, totalRevenue: 4200 },
      acceptedPodQuantities: [580],
    })

    expect(line.quantity).toBe(1)
    expect(line.unitPrice).toBe(4200)
    expect(line.total).toBe(4200)
  })

  it('rejects missing or invalid finalized commercial value', () => {
    expect(() => deriveTripInvoiceCommercialLine({
      trip: { ...trip, unitPrice: null, totalRevenue: null },
      acceptedPodQuantities: [],
    })).toThrow(/commercial/i)

    expect(() => deriveTripInvoiceCommercialLine({
      trip: { ...trip, unitPrice: -1 },
      acceptedPodQuantities: [],
    })).toThrow(/rate/i)
  })
})
