import { describe, expect, it } from 'vitest'

import { assessDataQuality } from '../data-quality'
import type { AiInputFacts } from '../types'

const AS_OF = new Date('2026-10-10T12:00:00.000Z')

function completeFacts(overrides: Partial<AiInputFacts> = {}): AiInputFacts {
  return {
    asOf: AS_OF,
    telemetry: {
      source: 'hardware',
      observedAt: new Date('2026-10-10T11:59:00.000Z'),
      odometerKm: 182_450,
      fuelLiters: 246,
      speedKph: 62,
    },
    weight: {
      grossKg: 39_800,
      tareKg: 15_200,
      observedAt: new Date('2026-10-10T11:45:00.000Z'),
    },
    fuel: {
      measuredLiters: 246,
      observedAt: new Date('2026-10-10T11:59:00.000Z'),
      source: 'sensor',
    },
    manual: {
      odometerKm: 182_448,
      fuelLiters: 244,
    },
    ...overrides,
  }
}

describe('assessDataQuality', () => {
  it('rates fresh trusted hardware facts as high quality', () => {
    const result = assessDataQuality(completeFacts())

    expect(result.grade).toBe('trusted')
    expect(result.score).toBeGreaterThanOrEqual(0.9)
    expect(result.confidenceCeiling).toBeGreaterThanOrEqual(0.9)
    expect(result.issues).toEqual([])
  })

  it('down-confidences phone GPS fallback without rejecting it', () => {
    const facts = completeFacts({
      telemetry: {
        source: 'phone',
        observedAt: new Date('2026-10-10T11:59:00.000Z'),
        odometerKm: 182_450,
        speedKph: 58,
      },
    })

    const result = assessDataQuality(facts)

    expect(result.grade).toBe('usable')
    expect(result.confidenceCeiling).toBeLessThanOrEqual(0.75)
    expect(result.confidenceCeiling).toBeGreaterThan(0.5)
    expect(result.issues.map((issue) => issue.code)).toContain('phone_telemetry_fallback')
  })

  it('marks stale telemetry and caps confidence', () => {
    const facts = completeFacts({
      telemetry: {
        source: 'hardware',
        observedAt: new Date('2026-10-10T11:35:00.000Z'),
        odometerKm: 182_450,
        fuelLiters: 246,
        speedKph: 0,
      },
    })

    const result = assessDataQuality(facts)

    expect(result.issues.map((issue) => issue.code)).toContain('stale_telemetry')
    expect(result.confidenceCeiling).toBeLessThanOrEqual(0.5)
    expect(result.grade).not.toBe('trusted')
  })

  it('reports missing weight and fuel evidence instead of inventing precision', () => {
    const facts = completeFacts({
      weight: undefined,
      fuel: undefined,
      manual: { odometerKm: 182_448 },
    })

    const result = assessDataQuality(facts)
    const codes = result.issues.map((issue) => issue.code)

    expect(codes).toContain('missing_weight_evidence')
    expect(codes).toContain('missing_fuel_evidence')
    expect(result.grade).toBe('limited')
    expect(result.confidenceCeiling).toBeLessThanOrEqual(0.55)
  })

  it('flags contradictory sensor and manual facts as low-confidence evidence', () => {
    const facts = completeFacts({
      telemetry: {
        source: 'hardware',
        observedAt: new Date('2026-10-10T11:59:00.000Z'),
        odometerKm: 182_450,
        fuelLiters: 246,
        speedKph: 62,
      },
      manual: {
        odometerKm: 182_510,
        fuelLiters: 180,
      },
    })

    const result = assessDataQuality(facts)
    const codes = result.issues.map((issue) => issue.code)

    expect(codes).toContain('odometer_conflict')
    expect(codes).toContain('fuel_conflict')
    expect(result.grade).toBe('insufficient')
    expect(result.confidenceCeiling).toBeLessThanOrEqual(0.4)
  })
})
