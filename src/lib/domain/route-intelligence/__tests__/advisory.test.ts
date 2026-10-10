import { describe, expect, it } from 'vitest'

import {
  buildRouteAdvisory,
  rankRouteCandidates,
  selectFuelEfficiencyEvidence,
  validateRouteAdvisoryInput,
  type RouteCandidateInput,
} from '../advisory'

describe('route advisory input validation', () => {
  it('rejects non-finite, negative and unreasonable numeric inputs', () => {
    expect(validateRouteAdvisoryInput({ weightTonnes: Number.NaN })).toContain('weight_invalid')
    expect(validateRouteAdvisoryInput({ weightTonnes: -1 })).toContain('weight_invalid')
    expect(validateRouteAdvisoryInput({ weightTonnes: 101 })).toContain('weight_invalid')
    expect(validateRouteAdvisoryInput({ fuelPricePerLiter: Number.POSITIVE_INFINITY })).toContain('fuel_price_invalid')
    expect(validateRouteAdvisoryInput({ fuelPricePerLiter: 0 })).toContain('fuel_price_invalid')
    expect(validateRouteAdvisoryInput({ fuelPricePerLiter: 101 })).toContain('fuel_price_invalid')
    expect(validateRouteAdvisoryInput({ stops: ['A', 'B', 'C', 'D', 'E', 'F'] })).toContain('too_many_stops')
  })
})

describe('fuel efficiency evidence', () => {
  const valid = (count: number, kmPerLiter: number) => Array.from({ length: count }, (_, index) => ({
    distanceKm: 100 + index,
    fuelLiters: (100 + index) / kmPerLiter,
  }))

  it('prefers sufficient truck history, then fleet history, then a labelled default', () => {
    const truck = selectFuelEfficiencyEvidence(valid(3, 3), valid(8, 2.5))
    expect(truck.source).toBe('truck_history')
    expect(truck.sampleCount).toBe(3)
    expect(truck.kmPerLiter).toBeCloseTo(3, 5)

    const fleet = selectFuelEfficiencyEvidence(valid(2, 4), valid(5, 2.5))
    expect(fleet.source).toBe('fleet_history')
    expect(fleet.sampleCount).toBe(5)
    expect(fleet.kmPerLiter).toBeCloseTo(2.5, 5)
    expect(fleet.dataQuality).toBeLessThan(truck.dataQuality)

    const fallback = selectFuelEfficiencyEvidence([], [])
    expect(fallback.source).toBe('configured_default')
    expect(fallback.sampleCount).toBe(0)
    expect(fallback.dataQuality).toBeLessThan(fleet.dataQuality)
  })
})

describe('buildRouteAdvisory', () => {
  it('labels the static Ghana graph as fallback and never lets confidence exceed data quality', () => {
    const result = buildRouteAdvisory({
      from: 'Accra',
      to: 'Kumasi',
      stops: [],
      weightTonnes: 30,
      fuelPricePerLiter: 16,
      truckFuelSamples: [
        { distanceKm: 300, fuelLiters: 100 },
        { distanceKm: 240, fuelLiters: 80 },
        { distanceKm: 270, fuelLiters: 90 },
      ],
      fleetFuelSamples: [],
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.route.source).toBe('static_fallback')
    expect(result.route.totalDistance).toBe(254)
    expect(result.route.dataQuality).toBeLessThan(0.85)
    expect(result.fuelEstimate.source).toBe('truck_history')
    expect(result.fuelEstimate.cargoAdjustmentFactor).toBeGreaterThanOrEqual(1)
    expect(result.fuelEstimate.cargoAdjustmentFactor).toBeLessThanOrEqual(1.15)
    expect(result.confidence).toBeLessThanOrEqual(result.dataQuality)
  })

  it('fails explicitly when a multi-stop leg is missing instead of fabricating a route', () => {
    const result = buildRouteAdvisory({
      from: 'Accra',
      to: 'Kumasi',
      stops: ['Bolgatanga'],
      weightTonnes: 20,
      fuelPricePerLiter: 16,
      truckFuelSamples: [],
      fleetFuelSamples: [],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBe('route_data_missing')
    expect(result.missingRoutes.length).toBeGreaterThan(0)
  })
})

function candidate(overrides: Partial<RouteCandidateInput> = {}): RouteCandidateInput {
  return {
    tractorId: 'truck-a',
    plateNumber: 'GT 1000-26',
    make: 'MAN',
    model: 'TGS',
    driverId: 'driver-a',
    driverName: 'Demo Driver',
    eligible: true,
    blocking: [],
    warnings: [],
    deadheadKm: 25,
    location: {
      latitude: 5.66,
      longitude: -0.01,
      source: 'teltonika',
      trust: 'trusted',
      receivedAt: new Date('2026-10-10T12:00:00.000Z'),
      freshness: 'fresh',
    },
    fuelSamples: [
      { distanceKm: 300, fuelLiters: 100 },
      { distanceKm: 240, fuelLiters: 80 },
      { distanceKm: 270, fuelLiters: 90 },
    ],
    dataQualityScore: 0.92,
    ...overrides,
  }
}

describe('rankRouteCandidates', () => {
  it('hard-excludes blocked, busy or maintenance-held candidates', () => {
    const results = rankRouteCandidates([
      candidate({ tractorId: 'eligible' }),
      candidate({ tractorId: 'busy', eligible: false, blocking: ['tractor_active_trip'] }),
      candidate({ tractorId: 'maintenance', eligible: false, blocking: ['tractor_maintenance_block'] }),
    ], [])

    expect(results.map((item) => item.tractorId)).toEqual(['eligible'])
  })

  it('prefers fresh live telematics over stale evidence when candidates are otherwise equal', () => {
    const results = rankRouteCandidates([
      candidate({
        tractorId: 'stale',
        location: {
          latitude: 5.66,
          longitude: -0.01,
          source: 'teltonika',
          trust: 'trusted',
          receivedAt: new Date('2026-10-10T10:00:00.000Z'),
          freshness: 'stale',
        },
        dataQualityScore: 0.62,
      }),
      candidate({ tractorId: 'fresh' }),
    ], [])

    expect(results[0].tractorId).toBe('fresh')
    expect(results[1].location.freshness).toBe('stale')
    expect(results[1].dataQuality).toBeLessThan(results[0].dataQuality)
  })

  it('uses deterministic tractor id tie-breaking and never reports confidence above quality', () => {
    const results = rankRouteCandidates([
      candidate({ tractorId: 'truck-z' }),
      candidate({ tractorId: 'truck-b' }),
    ], [])

    expect(results.map((item) => item.tractorId)).toEqual(['truck-b', 'truck-z'])
    for (const result of results) expect(result.confidence).toBeLessThanOrEqual(result.dataQuality)
  })
})
