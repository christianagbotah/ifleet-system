import { describe, expect, it } from 'vitest'
import { calculateHaulierSettlement, selectHaulierPayee } from '../haulier-settlement'

const baseInput = {
  tripId: 'trip-1',
  deliveredQuantity: 20,
  deliveredUnit: 'tonnes',
  detentionMinutes: 0,
  approvedExtras: [] as { id: string; description: string; amount: number }[],
  shortageQuantity: 0,
  fuelAdjustmentAmount: 0,
  advanceAlreadyPaid: 0,
}

describe('calculateHaulierSettlement', () => {
  it('calculates a flat per-trip rate', () => {
    const result = calculateHaulierSettlement(baseInput, { rateType: 'per_trip', rateAmount: 3200 })
    expect(result.baseFreight).toBe(3200)
    expect(result.netPayable).toBe(3200)
  })

  it('calculates tonne-based rates from delivered quantity', () => {
    const result = calculateHaulierSettlement(baseInput, { rateType: 'per_tonne', rateAmount: 180 })
    expect(result.baseFreight).toBe(3600)
  })

  it.each([
    ['bags', 'per_bag', 600, 2.5, 1500],
    ['pallets', 'per_pallet', 25, 80, 2000],
  ])('calculates %s rates', (unit, rateType, quantity, rateAmount, expected) => {
    const result = calculateHaulierSettlement(
      { ...baseInput, deliveredUnit: unit, deliveredQuantity: quantity },
      { rateType, rateAmount },
    )
    expect(result.baseFreight).toBe(expected)
  })

  it('adds detention only after the free period', () => {
    const result = calculateHaulierSettlement(
      { ...baseInput, detentionMinutes: 210 },
      { rateType: 'per_trip', rateAmount: 3000, detentionFreeMinutes: 90, detentionRatePerHour: 120 },
    )
    expect(result.detentionAmount).toBe(240)
    expect(result.netPayable).toBe(3240)
  })

  it('adds approved extras and ignores unapproved values by contract shape', () => {
    const result = calculateHaulierSettlement(
      { ...baseInput, approvedExtras: [{ id: 'extra-1', description: 'Escort', amount: 250 }] },
      { rateType: 'per_trip', rateAmount: 3000 },
    )
    expect(result.extrasAmount).toBe(250)
    expect(result.lines.some((line) => line.type === 'extra' && line.sourceId === 'extra-1')).toBe(true)
  })

  it('deducts shortages using the configured shortage rate', () => {
    const result = calculateHaulierSettlement(
      { ...baseInput, shortageQuantity: 3 },
      { rateType: 'per_tonne', rateAmount: 180, shortageRatePerUnit: 450 },
    )
    expect(result.shortageDeduction).toBe(1350)
  })

  it('applies a signed fuel adjustment', () => {
    const result = calculateHaulierSettlement(
      { ...baseInput, fuelAdjustmentAmount: -175 },
      { rateType: 'per_trip', rateAmount: 3000 },
    )
    expect(result.fuelAdjustment).toBe(-175)
    expect(result.netPayable).toBe(2825)
  })

  it('applies tax and withholding after commercial adjustments', () => {
    const result = calculateHaulierSettlement(
      { ...baseInput, approvedExtras: [{ id: 'x', description: 'Extra', amount: 200 }] },
      { rateType: 'per_trip', rateAmount: 3000, taxRatePercent: 5, withholdingRatePercent: 2.5 },
    )
    expect(result.taxAmount).toBe(160)
    expect(result.withholdingAmount).toBe(80)
    expect(result.netPayable).toBe(3280)
  })

  it('deducts advances already paid without making the settlement negative', () => {
    const result = calculateHaulierSettlement(
      { ...baseInput, advanceAlreadyPaid: 4000 },
      { rateType: 'per_trip', rateAmount: 3000 },
    )
    expect(result.advanceDeduction).toBe(3000)
    expect(result.netPayable).toBe(0)
  })

  it('rejects a tonne rate when proof of delivery is not measured in tonnes', () => {
    expect(() => calculateHaulierSettlement(
      { ...baseInput, deliveredUnit: 'bags', deliveredQuantity: 600 },
      { rateType: 'per_tonne', rateAmount: 180 },
    )).toThrow(/unit/i)
  })

  it('rejects bag and pallet rates when the delivered unit does not match the contract basis', () => {
    expect(() => calculateHaulierSettlement(
      { ...baseInput, deliveredUnit: 'tonnes', deliveredQuantity: 20 },
      { rateType: 'per_bag', rateAmount: 2.5 },
    )).toThrow(/unit/i)

    expect(() => calculateHaulierSettlement(
      { ...baseInput, deliveredUnit: 'bags', deliveredQuantity: 600 },
      { rateType: 'per_pallet', rateAmount: 80 },
    )).toThrow(/unit/i)
  })
})

describe('selectHaulierPayee', () => {
  const externalOwner = { id: 'owner-1', name: 'Owner One', isInternal: false }
  const externalTransporter = { id: 'transporter-1', name: 'Carrier One', isInternal: false }

  it('prefers the transporter named by the rate card/contract', () => {
    expect(selectHaulierPayee({
      rateCardTransporterId: 'transporter-1',
      transporter: externalTransporter,
      vehicleOwner: externalOwner,
    })).toEqual({ type: 'transporter', id: 'transporter-1', name: 'Carrier One' })
  })

  it('pays an external vehicle owner when no transporter is contractually selected', () => {
    expect(selectHaulierPayee({ transporter: externalTransporter, vehicleOwner: externalOwner })).toEqual({
      type: 'vehicle_owner', id: 'owner-1', name: 'Owner One',
    })
  })

  it('falls back to an external transporter and returns null for a fully internal movement', () => {
    expect(selectHaulierPayee({ transporter: externalTransporter, vehicleOwner: null })).toEqual({
      type: 'transporter', id: 'transporter-1', name: 'Carrier One',
    })
    expect(selectHaulierPayee({
      transporter: { ...externalTransporter, isInternal: true },
      vehicleOwner: { ...externalOwner, isInternal: true },
    })).toBeNull()
  })
})
