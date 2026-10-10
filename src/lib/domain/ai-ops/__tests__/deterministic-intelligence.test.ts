import { describe, expect, it } from 'vitest'

import { assessDwell } from '../dwell'
import { estimateEta } from '../eta'
import { scoreComplianceRisk } from '../compliance-risk'
import type { DataQualityAssessment } from '../types'

const AS_OF = new Date('2026-10-10T12:00:00.000Z')

function quality(confidenceCeiling = 0.92): DataQualityAssessment {
  return {
    grade: confidenceCeiling >= 0.9 ? 'trusted' : confidenceCeiling >= 0.6 ? 'usable' : 'limited',
    score: confidenceCeiling,
    confidenceCeiling,
    issues: [],
  }
}

describe('deterministic ETA intelligence', () => {
  it('uses live progress for a moving trip and respects the quality ceiling', () => {
    const result = estimateEta({
      asOf: AS_OF,
      remainingDistanceKm: 120,
      speedKph: 60,
      routeHistory: { averageRemainingMinutes: 135, sampleCount: 18 },
      dataQuality: quality(0.88),
    })

    expect(result.basis).toBe('live_progress')
    expect(result.remainingMinutes).toBeGreaterThanOrEqual(120)
    expect(result.remainingMinutes).toBeLessThanOrEqual(135)
    expect(result.eta?.getTime()).toBeGreaterThan(AS_OF.getTime())
    expect(result.confidence).toBeLessThanOrEqual(0.88)
  })

  it('falls back to route history when a trip is stopped instead of dividing by zero speed', () => {
    const result = estimateEta({
      asOf: AS_OF,
      remainingDistanceKm: 80,
      speedKph: 0,
      stoppedMinutes: 25,
      routeHistory: { averageRemainingMinutes: 110, sampleCount: 12 },
      dataQuality: quality(),
    })

    expect(result.basis).toBe('route_history')
    expect(result.remainingMinutes).toBeGreaterThan(110)
    expect(result.reasons).toContain('vehicle_stopped')
    expect(result.eta).not.toBeNull()
  })

  it('uses an explicit global prior for a new route and says that it is a fallback', () => {
    const result = estimateEta({
      asOf: AS_OF,
      remainingDistanceKm: 300,
      speedKph: null,
      globalPriorMinutes: 420,
      dataQuality: quality(0.72),
    })

    expect(result.basis).toBe('global_prior')
    expect(result.remainingMinutes).toBe(420)
    expect(result.reasons).toContain('global_prior_fallback')
    expect(result.confidence).toBeLessThanOrEqual(0.5)
  })
})

describe('deterministic dwell intelligence', () => {
  it('flags excessive factory dwell against historical and detention baselines', () => {
    const result = assessDwell({
      asOf: AS_OF,
      joinedAt: new Date('2026-10-10T09:30:00.000Z'),
      estimatedWaitMinutes: 45,
      historicalP90Minutes: 75,
      detentionFreeMinutes: 90,
      dataQuality: quality(0.86),
    })

    expect(result.currentMinutes).toBe(150)
    expect(result.expectedMinutes).toBe(45)
    expect(result.excessMinutes).toBe(105)
    expect(result.severity).toBe('critical')
    expect(result.reasons).toContain('detention_threshold_exceeded')
    expect(result.confidence).toBeLessThanOrEqual(0.86)
  })
})

describe('deterministic compliance risk intelligence', () => {
  it('raises risk for documents expiring soon without inventing a blocker', () => {
    const result = scoreComplianceRisk({
      asOf: AS_OF,
      documents: [
        { type: 'insurance', expiresAt: new Date('2026-10-18T00:00:00.000Z') },
        { type: 'roadworthy', expiresAt: new Date('2027-02-01T00:00:00.000Z') },
      ],
      activeHold: false,
      blockingRuleCount: 0,
      warningRuleCount: 0,
      dataQuality: quality(),
    })

    expect(result.level).toBe('medium')
    expect(result.blocking).toBe(false)
    expect(result.reasons).toContain('document_expiring_soon:insurance')
  })

  it('treats an active compliance hold as critical regardless of otherwise healthy documents', () => {
    const result = scoreComplianceRisk({
      asOf: AS_OF,
      documents: [{ type: 'insurance', expiresAt: new Date('2027-10-10T00:00:00.000Z') }],
      activeHold: true,
      blockingRuleCount: 0,
      warningRuleCount: 0,
      dataQuality: quality(0.74),
    })

    expect(result.level).toBe('critical')
    expect(result.blocking).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(90)
    expect(result.reasons).toContain('active_compliance_hold')
    expect(result.confidence).toBeLessThanOrEqual(0.74)
  })
})
