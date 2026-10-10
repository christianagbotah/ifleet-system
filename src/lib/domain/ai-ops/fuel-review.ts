import type { FuelAnomalyAssessment } from './fuel-anomaly'
import type { DataQualityAssessment } from './types'

export const FUEL_ANOMALY_MODEL = {
  key: 'deterministic-fuel-anomaly',
  version: '1.0.0',
  reviewThreshold: 60,
} as const

export type FuelReviewAction = 'confirm_data_error' | 'explain' | 'dismiss' | 'escalate'

export interface FuelReviewCaseSummary {
  id: string
  status: string
  caseType?: string
  subjectId?: string | null
  [key: string]: unknown
}

export interface FuelReviewCaseCreateInput {
  caseType: 'fuel_anomaly'
  subjectType: 'FuelLog'
  subjectId: string
  severity: string
  modelKey: string
  modelVersion: string
  confidence: number
  dataQualityScore: number
  dataQualityGrade: string
  inputSnapshotRef: string
  explanation: string
  evidence: string
}

export interface FuelReviewResolutionInput {
  status: string
  resolution: string
  resolvedBy: string
  resolvedAt: Date
}

export interface FuelReviewRepository {
  findOpenBySubject(subjectId: string): Promise<FuelReviewCaseSummary | null>
  create(input: FuelReviewCaseCreateInput): Promise<FuelReviewCaseSummary>
  findById(id: string): Promise<FuelReviewCaseSummary | null>
  updateResolution(id: string, input: FuelReviewResolutionInput): Promise<FuelReviewCaseSummary>
}

function severityFor(score: number): string {
  if (score >= 80) return 'high'
  if (score >= 65) return 'medium'
  return 'review'
}

export async function createFuelReviewCase(
  input: {
    fuelLogId: string
    assessment: FuelAnomalyAssessment
    dataQuality: DataQualityAssessment
    inputSnapshotRef: string
    evidence: Record<string, unknown>
  },
  options: { repository: FuelReviewRepository; reviewThreshold?: number },
): Promise<{ created: boolean; case: FuelReviewCaseSummary | null }> {
  const threshold = options.reviewThreshold ?? FUEL_ANOMALY_MODEL.reviewThreshold
  if (input.assessment.classification !== 'review' || input.assessment.reviewScore < threshold) {
    return { created: false, case: null }
  }

  const existing = await options.repository.findOpenBySubject(input.fuelLogId)
  if (existing) return { created: false, case: existing }

  const created = await options.repository.create({
    caseType: 'fuel_anomaly',
    subjectType: 'FuelLog',
    subjectId: input.fuelLogId,
    severity: severityFor(input.assessment.reviewScore),
    modelKey: FUEL_ANOMALY_MODEL.key,
    modelVersion: FUEL_ANOMALY_MODEL.version,
    confidence: input.assessment.confidence,
    dataQualityScore: input.dataQuality.score,
    dataQualityGrade: input.dataQuality.grade,
    inputSnapshotRef: input.inputSnapshotRef,
    explanation: JSON.stringify({
      summary: input.assessment.summary,
      reasons: input.assessment.reasons,
      reviewScore: input.assessment.reviewScore,
    }),
    evidence: JSON.stringify({
      ...input.evidence,
      metrics: input.assessment.metrics,
    }),
  })

  return { created: true, case: created }
}

const RESOLUTION_STATUS: Record<FuelReviewAction, string> = {
  confirm_data_error: 'resolved_data_error',
  explain: 'resolved_explained',
  dismiss: 'dismissed',
  escalate: 'escalated',
}

export async function resolveFuelReviewCase(
  id: string,
  input: { action: FuelReviewAction; note: string; userId: string; now: Date },
  options: { repository: FuelReviewRepository },
): Promise<FuelReviewCaseSummary> {
  const current = await options.repository.findById(id)
  if (!current || current.caseType !== 'fuel_anomaly') throw new Error('fuel review case not found')
  if (current.status !== 'open' && current.status !== 'escalated') {
    throw new Error('fuel review case is already closed')
  }

  const note = input.note.trim()
  if (input.action !== 'dismiss' && !note) throw new Error('review note is required')

  return options.repository.updateResolution(id, {
    status: RESOLUTION_STATUS[input.action],
    resolution: JSON.stringify({ action: input.action, note }),
    resolvedBy: input.userId,
    resolvedAt: input.now,
  })
}
