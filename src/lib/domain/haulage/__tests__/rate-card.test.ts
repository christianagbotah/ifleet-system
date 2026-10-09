import { describe, expect, it } from 'vitest'

import { resolveTransportRate } from '@/lib/domain/haulage/rate-card'
import type { TransportRateCandidate } from '@/lib/domain/haulage/types'

const at = new Date('2026-10-08T00:00:00.000Z')

function rate(overrides: Partial<TransportRateCandidate> = {}): TransportRateCandidate {
  return {
    id: 'rate-default',
    shipperProfileId: null,
    loadingPointId: null,
    destinationZoneId: null,
    itemId: null,
    unit: null,
    rateAmount: 1000,
    currency: 'GHS',
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    isActive: true,
    priority: 0,
    ...overrides,
  }
}

const exactInput = {
  shipperProfileId: 'shipper-1',
  loadingPointId: 'loading-1',
  destinationZoneId: 'zone-1',
  itemId: 'item-1',
  unit: 'bags',
  at,
}

describe('resolveTransportRate', () => {
  it('selects the exact shipper/loading/destination/product/unit/date match', () => {
    const exact = rate({
      id: 'exact',
      shipperProfileId: 'shipper-1',
      loadingPointId: 'loading-1',
      destinationZoneId: 'zone-1',
      itemId: 'item-1',
      unit: 'bags',
      rateAmount: 2450,
    })
    const generic = rate({ id: 'generic', destinationZoneId: 'zone-1', rateAmount: 2000 })

    const resolved = resolveTransportRate({ ...exactInput, candidates: [generic, exact] })

    expect(resolved).toMatchObject({ rateCardId: 'exact', rateAmount: 2450, currency: 'GHS', specificity: 5 })
  })

  it('uses the latest effective rate when specificity is equal', () => {
    const older = rate({
      id: 'older',
      destinationZoneId: 'zone-1',
      rateAmount: 1800,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    })
    const newer = rate({
      id: 'newer',
      destinationZoneId: 'zone-1',
      rateAmount: 2100,
      effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
    })

    expect(resolveTransportRate({ ...exactInput, candidates: [older, newer] })?.rateCardId).toBe('newer')
  })

  it('falls back from a non-matching specific rule to a compatible generic rule', () => {
    const wrongShipper = rate({
      id: 'wrong-shipper',
      shipperProfileId: 'shipper-2',
      destinationZoneId: 'zone-1',
      rateAmount: 3000,
    })
    const generic = rate({ id: 'generic-zone', destinationZoneId: 'zone-1', rateAmount: 1700 })

    const resolved = resolveTransportRate({ ...exactInput, candidates: [wrongShipper, generic] })

    expect(resolved).toMatchObject({ rateCardId: 'generic-zone', rateAmount: 1700, specificity: 1 })
  })

  it('ignores inactive, future and expired rates', () => {
    const inactive = rate({ id: 'inactive', destinationZoneId: 'zone-1', isActive: false, rateAmount: 900 })
    const future = rate({
      id: 'future',
      destinationZoneId: 'zone-1',
      effectiveFrom: new Date('2026-11-01T00:00:00.000Z'),
      rateAmount: 800,
    })
    const expired = rate({
      id: 'expired',
      destinationZoneId: 'zone-1',
      effectiveTo: new Date('2026-09-30T23:59:59.999Z'),
      rateAmount: 700,
    })
    const active = rate({ id: 'active', destinationZoneId: 'zone-1', rateAmount: 2200 })

    expect(resolveTransportRate({ ...exactInput, candidates: [inactive, future, expired, active] })?.rateCardId).toBe('active')
  })

  it('prefers a transporter-specific rate over an otherwise identical generic rate', () => {
    const generic = rate({ id: 'aaa-generic', destinationZoneId: 'zone-1', rateAmount: 2000 })
    const carrier = rate({
      id: 'zzz-carrier',
      transporterId: 'transporter-1',
      destinationZoneId: 'zone-1',
      rateAmount: 2300,
    })

    const resolved = resolveTransportRate({
      ...exactInput,
      transporterId: 'transporter-1',
      candidates: [generic, carrier],
    })

    expect(resolved).toMatchObject({ rateCardId: 'zzz-carrier', transporterId: 'transporter-1', rateAmount: 2300 })
  })

  it('returns null when no active candidate matches the requested dimensions', () => {
    const onlyOtherZone = rate({ id: 'other-zone', destinationZoneId: 'zone-2' })

    expect(resolveTransportRate({ ...exactInput, candidates: [onlyOtherZone] })).toBeNull()
  })
})
