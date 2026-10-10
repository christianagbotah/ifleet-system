import type { DataQualityAssessment } from './types'

export type DwellSeverity = 'normal' | 'elevated' | 'critical'

export interface DwellAssessmentInput {
  asOf: Date
  joinedAt: Date
  estimatedWaitMinutes?: number | null
  historicalP90Minutes?: number | null
  detentionFreeMinutes?: number | null
  dataQuality: DataQualityAssessment
}

export interface DwellAssessment {
  currentMinutes: number
  expectedMinutes: number | null
  excessMinutes: number
  severity: DwellSeverity
  confidence: number
  reasons: string[]
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function assessDwell(input: DwellAssessmentInput): DwellAssessment {
  const currentMinutes = Math.max(
    0,
    Math.round((input.asOf.getTime() - input.joinedAt.getTime()) / 60_000),
  )
  const expectedMinutes = finiteNonNegative(input.estimatedWaitMinutes)
    ? input.estimatedWaitMinutes
    : finiteNonNegative(input.historicalP90Minutes)
      ? input.historicalP90Minutes
      : null
  const excessMinutes = expectedMinutes == null ? 0 : Math.max(0, currentMinutes - expectedMinutes)
  const reasons: string[] = []

  const detentionExceeded = finiteNonNegative(input.detentionFreeMinutes)
    && currentMinutes > input.detentionFreeMinutes
  const historicalP90Exceeded = finiteNonNegative(input.historicalP90Minutes)
    && currentMinutes > input.historicalP90Minutes

  let severity: DwellSeverity = 'normal'
  if (detentionExceeded) {
    severity = 'critical'
    reasons.push('detention_threshold_exceeded')
  }
  if (historicalP90Exceeded) {
    if (severity !== 'critical') severity = 'elevated'
    reasons.push('historical_p90_exceeded')
  }
  if (expectedMinutes != null && excessMinutes > Math.max(15, expectedMinutes * 0.25)) {
    if (severity === 'normal') severity = 'elevated'
    reasons.push('expected_wait_exceeded')
  }

  const evidenceConfidence = finiteNonNegative(input.estimatedWaitMinutes)
    && finiteNonNegative(input.historicalP90Minutes)
    ? 0.9
    : finiteNonNegative(input.estimatedWaitMinutes) || finiteNonNegative(input.historicalP90Minutes)
      ? 0.75
      : 0.45

  return {
    currentMinutes,
    expectedMinutes,
    excessMinutes,
    severity,
    confidence: Math.min(evidenceConfidence, input.dataQuality.confidenceCeiling),
    reasons,
  }
}
