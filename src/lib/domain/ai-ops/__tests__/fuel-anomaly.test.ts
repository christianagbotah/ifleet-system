import { describe, expect, it } from 'vitest'

import { assessFuelAnomaly, type FuelAnomalyInput } from '../fuel-anomaly'
import type { DataQualityAssessment } from '../types'

const QUALITY: DataQualityAssessment = {
  grade: 'trusted',
  score: 0.95,
  confidenceCeiling: 0.95,
  issues: [],
}

function input(overrides: Partial<FuelAnomalyInput> = {}): FuelAnomalyInput {
  return {
    purchaseLiters: 120,
    tankCapacityLiters: 400,
    fuelBeforeLiters: 180,
    fuelAfterLiters: 300,
    distanceKm: 420,
    routeBaselineLitersPer100Km: 32,
    routeBaselineSampleCount: 18,
    evidenceMode: 'mixed',
    dataQuality: QUALITY,
    ...overrides,
  }
}

describe('assessFuelAnomaly', () => {
  it('treats a plausible refill and route consumption as normal', () => {
    const result = assessFuelAnomaly(input({ actualFuelUsedLiters: 135 }))

    expect(result.classification).toBe('normal')
    expect(result.reviewScore).toBeLessThan(60)
    expect(result.reasons).not.toContain('purchase_exceeds_tank_capacity')
  })

  it('classifies an impossible purchase above tank capacity as a data issue', () => {
    const result = assessFuelAnomaly(input({ purchaseLiters: 460 }))

    expect(result.classification).toBe('data_issue')
    expect(result.reasons).toContain('purchase_exceeds_tank_capacity')
    expect(result.confidence).toBeLessThanOrEqual(QUALITY.confidenceCeiling)
  })

  it('sends a large sensor drop while stationary for human review without accusing the driver', () => {
    const result = assessFuelAnomaly(input({
      sensorBeforeLiters: 260,
      sensorAfterLiters: 205,
      sensorDistanceKm: 0.3,
      averageSpeedKph: 1,
      evidenceMode: 'sensor',
    }))

    expect(result.classification).toBe('review')
    expect(result.reasons).toContain('stationary_sensor_drop')
    expect(result.summary.toLowerCase()).not.toContain('theft')
    expect(result.summary.toLowerCase()).not.toContain('fraud')
  })

  it('flags excessive idling fuel consumption for review', () => {
    const result = assessFuelAnomaly(input({
      idleMinutes: 150,
      idleFuelUsedLiters: 18,
      expectedIdleLitersPerHour: 3,
      evidenceMode: 'sensor',
    }))

    expect(result.classification).toBe('review')
    expect(result.reasons).toContain('excessive_idle_consumption')
  })

  it('classifies missing sensor and route evidence as a data issue instead of inventing precision', () => {
    const result = assessFuelAnomaly(input({
      actualFuelUsedLiters: null,
      routeBaselineLitersPer100Km: null,
      routeBaselineSampleCount: 0,
      sensorBeforeLiters: null,
      sensorAfterLiters: null,
      evidenceMode: 'manual',
    }))

    expect(result.classification).toBe('data_issue')
    expect(result.reasons).toContain('insufficient_fuel_evidence')
    expect(result.confidence).toBeLessThanOrEqual(0.45)
  })

  it('reviews materially high consumption against a sufficiently sampled route baseline', () => {
    const result = assessFuelAnomaly(input({
      actualFuelUsedLiters: 190,
      distanceKm: 420,
      routeBaselineLitersPer100Km: 32,
      routeBaselineSampleCount: 24,
    }))

    expect(result.classification).toBe('review')
    expect(result.reasons).toContain('route_consumption_above_baseline')
    expect(result.metrics.actualLitersPer100Km).toBeGreaterThan(result.metrics.baselineLitersPer100Km!)
  })

  it('allows severe manual-only evidence to create review work but caps confidence', () => {
    const result = assessFuelAnomaly(input({
      actualFuelUsedLiters: 230,
      distanceKm: 420,
      routeBaselineLitersPer100Km: 32,
      routeBaselineSampleCount: 30,
      evidenceMode: 'manual',
    }))

    expect(result.classification).toBe('review')
    expect(result.reasons).toContain('manual_only_evidence')
    expect(result.confidence).toBeLessThanOrEqual(0.45)
  })
})
