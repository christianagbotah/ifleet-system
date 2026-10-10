import { describe, expect, it } from 'vitest'

import { calculateRouteFuelBaseline } from '../fuel-baseline'

describe('calculateRouteFuelBaseline', () => {
  it('compares whole-trip fuel consumption on the same basis as the reviewed trip', () => {
    const result = calculateRouteFuelBaseline([
      { fuelUsed: 128, totalMileage: 400, startMileage: null, endMileage: null },
      { fuelUsed: 165, totalMileage: 500, startMileage: null, endMileage: null },
    ])

    expect(result.sampleCount).toBe(2)
    expect(result.litersPer100Km).toBeCloseTo(32.5, 5)
  })

  it('falls back to odometer distance and excludes unusable peer trips', () => {
    const result = calculateRouteFuelBaseline([
      { fuelUsed: 96, totalMileage: null, startMileage: 1000, endMileage: 1300 },
      { fuelUsed: null, totalMileage: 400, startMileage: null, endMileage: null },
      { fuelUsed: 50, totalMileage: 0, startMileage: 500, endMileage: 500 },
    ])

    expect(result.sampleCount).toBe(1)
    expect(result.litersPer100Km).toBeCloseTo(32, 5)
  })
})
