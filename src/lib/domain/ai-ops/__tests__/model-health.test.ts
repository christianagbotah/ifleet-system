import { describe, expect, it } from 'vitest'

import { buildModelHealthSnapshot, type ModelHealthHook } from '../model-health'

const hook: ModelHealthHook = {
  modelKey: 'late-delivery-learned',
  version: '0.1.0',
  family: 'late_delivery',
  status: 'shadow',
  minimumDataQuality: 0.75,
  deterministicBaseline: 'late-delivery-deterministic-v1',
}

describe('model health snapshot', () => {
  it('reports a zero-sample shadow hook without inventing metrics', () => {
    const [result] = buildModelHealthSnapshot({
      asOf: new Date('2026-10-10T12:00:00Z'),
      hooks: [hook],
      predictions: [],
    })

    expect(result.status).toBe('shadow')
    expect(result.sampleCount).toBe(0)
    expect(result.latestPredictionAt).toBeNull()
    expect(result.averageDataQuality).toBeNull()
    expect(result.evaluation).toBeNull()
    expect(result.drift).toBeNull()
  })

  it('aggregates only the pinned model version and computes freshness', () => {
    const [result] = buildModelHealthSnapshot({
      asOf: new Date('2026-10-10T12:00:00Z'),
      hooks: [hook],
      predictions: [
        { modelKey: hook.modelKey, modelVersion: hook.version, dataQualityScore: 0.8, createdAt: new Date('2026-10-10T11:30:00Z') },
        { modelKey: hook.modelKey, modelVersion: hook.version, dataQualityScore: 0.9, createdAt: new Date('2026-10-10T11:45:00Z') },
        { modelKey: hook.modelKey, modelVersion: '0.2.0', dataQualityScore: 1, createdAt: new Date('2026-10-10T11:59:00Z') },
      ],
    })

    expect(result.sampleCount).toBe(2)
    expect(result.averageDataQuality).toBeCloseTo(0.85)
    expect(result.freshnessMinutes).toBe(15)
  })

  it('surfaces evaluation and drift evidence only when supplied', () => {
    const [result] = buildModelHealthSnapshot({
      asOf: new Date('2026-10-10T12:00:00Z'),
      hooks: [{
        ...hook,
        evaluation: { passed: true, metrics: { mae: 8 }, baselineMetrics: { mae: 10 } },
        drift: { status: 'stable', score: 0.04, measuredAt: new Date('2026-10-10T10:00:00Z') },
      }],
      predictions: [],
    })

    expect(result.evaluation?.passed).toBe(true)
    expect(result.drift?.status).toBe('stable')
  })
})
