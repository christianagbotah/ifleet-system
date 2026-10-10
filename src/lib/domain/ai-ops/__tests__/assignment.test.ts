import { describe, expect, it } from 'vitest'

import { rankAssignmentCandidates, type AssignmentRecommendationInput } from '../assignment'

const BASE: AssignmentRecommendationInput = {
  modelKey: 'deterministic-assignment',
  modelVersion: '1.0.0',
  configVersion: 'ghana-haulage-v1',
  weights: {
    deadhead: 0.18,
    suitability: 0.12,
    maintenanceHealth: 0.14,
    driverHours: 0.12,
    routeExperience: 0.12,
    fuelEfficiency: 0.1,
    onTime: 0.1,
    projectedMargin: 0.12,
  },
  candidates: [],
}

function candidate(id: string, overrides: Record<string, unknown> = {}) {
  return {
    candidateId: id,
    driverId: `driver-${id}`,
    tractorId: `truck-${id}`,
    trailerId: null,
    eligible: true,
    blocking: [],
    warnings: [],
    deadheadKm: 20,
    suitability: 0.9,
    maintenanceHealth: 0.9,
    driverHoursAvailable: 9,
    routeExperienceTrips: 12,
    fuelEfficiencyRatio: 1,
    onTimeRate: 0.92,
    projectedMargin: 1800,
    marginReference: 2000,
    evidenceCount: 20,
    dataQualityScore: 0.9,
    ...overrides,
  }
}

describe('rankAssignmentCandidates', () => {
  it('excludes any candidate that fails the authoritative eligibility gate even with a high margin', () => {
    const result = rankAssignmentCandidates({
      ...BASE,
      candidates: [
        candidate('safe', { projectedMargin: 1000 }),
        candidate('blocked', { eligible: false, blocking: ['driver_license_expired'], projectedMargin: 10000 }),
      ],
    })

    expect(result.map((item) => item.candidateId)).toEqual(['safe'])
  })

  it('ranks a nearer healthier and more experienced candidate above a weaker candidate', () => {
    const result = rankAssignmentCandidates({
      ...BASE,
      candidates: [
        candidate('weak', { deadheadKm: 180, maintenanceHealth: 0.55, routeExperienceTrips: 1, onTimeRate: 0.72 }),
        candidate('strong', { deadheadKm: 12, maintenanceHealth: 0.96, routeExperienceTrips: 28, onTimeRate: 0.97 }),
      ],
    })

    expect(result[0].candidateId).toBe('strong')
    expect(result[0].score).toBeGreaterThan(result[1].score)
  })

  it('reduces confidence and explains fallback assumptions for sparse history', () => {
    const [result] = rankAssignmentCandidates({
      ...BASE,
      candidates: [candidate('sparse', { routeExperienceTrips: 0, evidenceCount: 2, dataQualityScore: 0.55 })],
    })

    expect(result.confidence).toBeLessThan(0.6)
    expect(result.fallbackAssumptions.length).toBeGreaterThan(0)
  })

  it('uses a deterministic candidate id tie-break for equal scores', () => {
    const result = rankAssignmentCandidates({
      ...BASE,
      candidates: [candidate('b'), candidate('a')],
    })

    expect(result.map((item) => item.candidateId)).toEqual(['a', 'b'])
  })

  it('returns explainable score components that sum to the recommendation score', () => {
    const [result] = rankAssignmentCandidates({ ...BASE, candidates: [candidate('explain')] })
    const componentTotal = Object.values(result.scoreComponents).reduce((sum, value) => sum + value, 0)

    expect(result.score).toBeCloseTo(componentTotal, 5)
    expect(result.reasons.length).toBeGreaterThan(0)
    expect(result.configVersion).toBe('ghana-haulage-v1')
  })
})
