import { describe, expect, it } from 'vitest'

import {
  createFuelReviewCase,
  resolveFuelReviewCase,
  type FuelReviewRepository,
} from '../fuel-review'
import type { FuelAnomalyAssessment } from '../fuel-anomaly'
import type { DataQualityAssessment } from '../types'

const QUALITY: DataQualityAssessment = {
  grade: 'trusted',
  score: 0.92,
  confidenceCeiling: 0.9,
  issues: [],
}

function assessment(classification: FuelAnomalyAssessment['classification'] = 'review'): FuelAnomalyAssessment {
  return {
    classification,
    reviewScore: classification === 'review' ? 78 : 20,
    confidence: classification === 'review' ? 0.78 : 0.5,
    reasons: classification === 'review' ? ['route_consumption_above_baseline'] : [],
    summary: classification === 'review' ? 'Operational evidence needs review.' : 'No material anomaly.',
    metrics: {
      actualLitersPer100Km: 44,
      baselineLitersPer100Km: 32,
      variancePercent: 37.5,
      sensorDropLiters: null,
    },
  }
}

function repository(): FuelReviewRepository & { created: unknown[]; updates: unknown[] } {
  const created: unknown[] = []
  const updates: unknown[] = []
  return {
    created,
    updates,
    findOpenBySubject: async () => null,
    create: async (input) => {
      created.push(input)
      return { id: 'case-1', ...input, status: 'open', createdAt: new Date('2026-10-10T12:00:00Z') }
    },
    findById: async (id) => id === 'case-1'
      ? { id, status: 'open', caseType: 'fuel_anomaly', subjectId: 'fuel-1' }
      : null,
    updateResolution: async (id, input) => {
      updates.push({ id, ...input })
      return { id, status: input.status, resolution: input.resolution }
    },
  }
}

describe('fuel anomaly review cases', () => {
  it('persists only review classifications with model and evidence provenance', async () => {
    const repo = repository()
    const result = await createFuelReviewCase({
      fuelLogId: 'fuel-1',
      assessment: assessment('review'),
      dataQuality: QUALITY,
      inputSnapshotRef: 'sha256:abc',
      evidence: { tripId: 'trip-1', route: 'Tema → Kumasi' },
    }, { repository: repo })

    expect(result.created).toBe(true)
    expect(repo.created).toHaveLength(1)
    expect(repo.created[0]).toMatchObject({
      caseType: 'fuel_anomaly',
      subjectType: 'FuelLog',
      subjectId: 'fuel-1',
      modelKey: 'deterministic-fuel-anomaly',
      modelVersion: '1.0.0',
      inputSnapshotRef: 'sha256:abc',
      dataQualityGrade: 'trusted',
    })
  })

  it.each(['normal', 'data_issue'] as const)('does not create a review case for %s evidence', async (classification) => {
    const repo = repository()
    const result = await createFuelReviewCase({
      fuelLogId: 'fuel-1',
      assessment: assessment(classification),
      dataQuality: QUALITY,
      inputSnapshotRef: 'sha256:abc',
      evidence: {},
    }, { repository: repo })

    expect(result.created).toBe(false)
    expect(repo.created).toHaveLength(0)
  })

  it('returns an existing open review case instead of duplicating it on retry', async () => {
    const repo = repository()
    repo.findOpenBySubject = async () => ({ id: 'existing', status: 'open', subjectId: 'fuel-1' })

    const result = await createFuelReviewCase({
      fuelLogId: 'fuel-1', assessment: assessment(), dataQuality: QUALITY,
      inputSnapshotRef: 'sha256:abc', evidence: {},
    }, { repository: repo })

    expect(result).toMatchObject({ created: false, case: { id: 'existing' } })
    expect(repo.created).toHaveLength(0)
  })

  it.each([
    ['confirm_data_error', 'resolved_data_error'],
    ['explain', 'resolved_explained'],
    ['dismiss', 'dismissed'],
    ['escalate', 'escalated'],
  ] as const)('applies %s as an auditable human review outcome', async (action, expectedStatus) => {
    const repo = repository()
    const result = await resolveFuelReviewCase('case-1', {
      action,
      note: action === 'dismiss' ? 'Reviewed; no action required.' : 'Operator review note.',
      userId: 'user-1',
      now: new Date('2026-10-10T13:00:00Z'),
    }, { repository: repo })

    expect(result.status).toBe(expectedStatus)
    expect(repo.updates[0]).toMatchObject({
      id: 'case-1',
      status: expectedStatus,
      resolvedBy: 'user-1',
    })
  })

  it('requires a note for explain, data-error confirmation, and escalation', async () => {
    const repo = repository()

    await expect(resolveFuelReviewCase('case-1', {
      action: 'escalate', note: ' ', userId: 'user-1', now: new Date(),
    }, { repository: repo })).rejects.toThrow('review note is required')
  })
})
