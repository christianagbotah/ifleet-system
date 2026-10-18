import { describe, expect, it } from 'vitest'

import { buildAlternativeRouteAdvisories } from '../advisory'

const fleetFuelSamples = [
  { distanceKm: 300, fuelLiters: 100 },
  { distanceKm: 240, fuelLiters: 80 },
  { distanceKm: 270, fuelLiters: 90 },
  { distanceKm: 180, fuelLiters: 60 },
  { distanceKm: 210, fuelLiters: 70 },
]

describe('buildAlternativeRouteAdvisories', () => {
  it('costs practical direct-route alternatives with the same evidence hierarchy as the primary advisory', () => {
    const alternatives = buildAlternativeRouteAdvisories({
      from: 'Accra',
      to: 'Kumasi',
      weightTonnes: 30,
      fuelPricePerLiter: 16,
      fleetFuelSamples,
    })

    expect(alternatives.length).toBeGreaterThan(0)
    expect(alternatives.length).toBeLessThanOrEqual(3)

    for (const alternative of alternatives) {
      expect(alternative.source).toBe('static_fallback')
      expect(alternative.fuelEstimate.source).toBe('fleet_history')
      expect(alternative.fuelEstimate.priceSource).toBe('request')
      expect(alternative.fuelEstimate.cargoAdjustmentFactor).toBeGreaterThan(1)
      expect(alternative.totalCost).toBeCloseTo(alternative.fuelEstimate.cost + alternative.tollCost, 2)
      expect(alternative.confidence).toBeLessThanOrEqual(alternative.dataQuality)
      expect(alternative.notices).toContain('route_uses_static_ghana_graph')
    }
  })

  it('does not invent whole-route alternatives for an explicit multi-stop plan', () => {
    const alternatives = buildAlternativeRouteAdvisories({
      from: 'Accra',
      to: 'Kumasi',
      stops: ['Tema'],
      fuelPricePerLiter: 16,
      fleetFuelSamples,
    })

    expect(alternatives).toEqual([])
  })
})
