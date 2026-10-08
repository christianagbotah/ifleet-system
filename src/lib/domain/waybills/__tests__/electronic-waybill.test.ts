import { describe, expect, it } from 'vitest'

import {
  finalizeWaybill,
  publicWaybillVerification,
  supersedeWaybill,
  type WaybillFinalizationInput,
} from '@/lib/domain/waybills/electronic-waybill'

const baseInput = (overrides: Partial<WaybillFinalizationInput> = {}): WaybillFinalizationInput => ({
  trip: {
    id: 'trip-1',
    tripNumber: 'TRIP-0001',
    tractorId: 'truck-1',
    tractorPlate: 'GT-1234-26',
    trailerId: 'trailer-1',
    trailerPlate: 'GE-5678-26',
    origin: 'Tema Factory',
    destination: 'Kumasi Depot',
    product: 'Cement',
    quantity: 600,
    unit: 'bags',
    driverName: 'Demo Driver',
    driverPhone: '0200000000',
    driverLicense: 'DVLA-PRIVATE',
    customerName: 'Example Customer',
    customerPhone: '0240000000',
    offeredRate: 42.5,
  },
  weighing: {
    id: 'weight-2',
    tripId: 'trip-1',
    tractorId: 'truck-1',
    trailerId: 'trailer-1',
    tareWeightKg: 16_000,
    grossWeightKg: 49_500,
    netWeightKg: 33_500,
    clearancePassed: true,
  },
  seals: [{ sealNumber: 'SEAL-001', type: 'cargo' }],
  finalizedBy: 'admin-1',
  finalizedAt: new Date('2026-10-08T10:00:00Z'),
  entropy: 'ABC12345',
  ...overrides,
})

describe('electronic waybill finalization', () => {
  it('generates deterministic unique-looking waybill numbering and verification token material', () => {
    const first = finalizeWaybill(baseInput())
    const second = finalizeWaybill(baseInput({ entropy: 'XYZ98765' }))

    expect(first.waybillNumber).toMatch(/^EWB-\d{8}-[A-Z0-9]+$/)
    expect(first.verificationToken).toMatch(/^[a-f0-9]{32,}$/)
    expect(second.waybillNumber).not.toBe(first.waybillNumber)
    expect(second.verificationToken).not.toBe(first.verificationToken)
  })

  it('returns an immutable finalized snapshot detached from mutable input', () => {
    const input = baseInput()
    const finalized = finalizeWaybill(input)
    input.trip.product = 'Changed after finalization'

    expect(finalized.version).toBe(1)
    expect(finalized.status).toBe('finalized')
    expect(finalized.snapshot.product).toBe('Cement')
    expect(finalized.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(Object.isFrozen(finalized.snapshot)).toBe(true)
  })

  it('supersedes by creating a new version without mutating the previous finalized version', () => {
    const original = finalizeWaybill(baseInput())
    const correction = supersedeWaybill(original, {
      correctionReason: 'Corrected consignee destination after factory confirmation',
      correctedBy: 'admin-2',
      correctedAt: new Date('2026-10-08T10:20:00Z'),
      snapshot: { destination: 'Takoradi Depot' },
    })

    expect(correction.version).toBe(2)
    expect(correction.supersedesVersion).toBe(1)
    expect(correction.waybillNumber).toBe(original.waybillNumber)
    expect(correction.verificationToken).toBe(original.verificationToken)
    expect(correction.snapshot.destination).toBe('Takoradi Depot')
    expect(original.snapshot.destination).toBe('Kumasi Depot')
  })

  it('rejects finalization when weighing belongs to a different trip or vehicle combination', () => {
    expect(() => finalizeWaybill(baseInput({
      weighing: { ...baseInput().weighing, tripId: 'other-trip' },
    }))).toThrow(/weighing trip/i)

    expect(() => finalizeWaybill(baseInput({
      weighing: { ...baseInput().weighing, tractorId: 'other-truck' },
    }))).toThrow(/tractor/i)
  })

  it('rejects a waybill backed by failed weight clearance', () => {
    expect(() => finalizeWaybill(baseInput({
      weighing: { ...baseInput().weighing, clearancePassed: false },
    }))).toThrow(/weight clearance/i)
  })

  it('exposes least-information public verification without private contacts, licence or commercial rate', () => {
    const finalized = finalizeWaybill(baseInput())
    const publicView = publicWaybillVerification(finalized)

    expect(publicView).toEqual(expect.objectContaining({
      waybillNumber: finalized.waybillNumber,
      version: 1,
      status: 'finalized',
      origin: 'Tema Factory',
      destination: 'Kumasi Depot',
      tractorPlate: 'GT-1234-26',
      trailerPlate: 'GE-5678-26',
      product: 'Cement',
    }))
    expect(publicView).not.toHaveProperty('driverPhone')
    expect(publicView).not.toHaveProperty('driverLicense')
    expect(publicView).not.toHaveProperty('customerPhone')
    expect(publicView).not.toHaveProperty('offeredRate')
  })
})
