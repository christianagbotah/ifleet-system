import { describe, expect, it } from 'vitest'

import { sanitizeTrainingRows } from '../export-training-dataset'
import { evaluatePromotion } from '../evaluate-model'

describe('AI training dataset export', () => {
  it('keeps only allow-listed operational features and labels', () => {
    const rows = [{
      driverId: 'driver-secret',
      driverName: 'Sensitive Name',
      phone: '+233000000000',
      email: 'private@example.com',
      routeClass: 'tema-kumasi',
      distanceKm: 255,
      dwellMinutes: 42,
      lateDelivery: true,
    }]

    expect(sanitizeTrainingRows(rows, {
      featureFields: ['routeClass', 'distanceKm', 'dwellMinutes', 'driverId'],
      labelFields: ['lateDelivery'],
    })).toEqual([{ routeClass: 'tema-kumasi', distanceKm: 255, dwellMinutes: 42, lateDelivery: true }])
  })

  it('rejects exports with no usable operational features', () => {
    expect(() => sanitizeTrainingRows([{ driverId: 'd1', phone: '1' }], {
      featureFields: ['driverId', 'phone'],
      labelFields: [],
    })).toThrow(/operational feature/i)
  })
})

describe('AI model promotion evaluation', () => {
  it('passes when every configured metric beats its deterministic baseline', () => {
    const result = evaluatePromotion({
      modelMetrics: { mae: 8, coverage: 0.91 },
      baselineMetrics: { mae: 10, coverage: 0.9 },
      criteria: {
        mae: { direction: 'lower', minRelativeImprovement: 0.1 },
        coverage: { direction: 'higher', minRelativeImprovement: 0 },
      },
    })

    expect(result.passed).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('fails promotion when the learned model does not beat the baseline', () => {
    const result = evaluatePromotion({
      modelMetrics: { mae: 9.7, coverage: 0.88 },
      baselineMetrics: { mae: 10, coverage: 0.9 },
      criteria: {
        mae: { direction: 'lower', minRelativeImprovement: 0.05 },
        coverage: { direction: 'higher', minRelativeImprovement: 0 },
      },
    })

    expect(result.passed).toBe(false)
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.stringMatching(/mae/i),
      expect.stringMatching(/coverage/i),
    ]))
  })

  it('fails closed when a required metric is missing or non-finite', () => {
    const result = evaluatePromotion({
      modelMetrics: { mae: Number.NaN },
      baselineMetrics: { mae: 10, coverage: 0.9 },
      criteria: {
        mae: { direction: 'lower', minRelativeImprovement: 0 },
        coverage: { direction: 'higher', minRelativeImprovement: 0 },
      },
    })

    expect(result.passed).toBe(false)
    expect(result.failures.some((failure) => /missing|finite/i.test(failure))).toBe(true)
  })
})
