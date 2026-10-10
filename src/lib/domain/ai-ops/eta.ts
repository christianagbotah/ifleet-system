import type { DataQualityAssessment } from './types'

export type EtaBasis = 'live_progress' | 'route_history' | 'route_class' | 'global_prior' | 'insufficient'

export interface EtaHistoryPrior {
  averageRemainingMinutes: number
  sampleCount: number
}

export interface EtaEstimateInput {
  asOf: Date
  remainingDistanceKm?: number | null
  speedKph?: number | null
  stoppedMinutes?: number
  routeHistory?: EtaHistoryPrior
  routeClassPrior?: EtaHistoryPrior
  globalPriorMinutes?: number
  dataQuality: DataQualityAssessment
}

export interface EtaEstimate {
  eta: Date | null
  remainingMinutes: number | null
  confidence: number
  basis: EtaBasis
  reasons: string[]
}

function validPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function confidence(input: EtaEstimateInput, base: number): number {
  return Math.max(0, Math.min(base, input.dataQuality.confidenceCeiling))
}

function result(
  input: EtaEstimateInput,
  basis: EtaBasis,
  remainingMinutes: number | null,
  baseConfidence: number,
  reasons: string[],
): EtaEstimate {
  const rounded = remainingMinutes == null ? null : Math.max(0, Math.round(remainingMinutes))
  return {
    eta: rounded == null ? null : new Date(input.asOf.getTime() + rounded * 60_000),
    remainingMinutes: rounded,
    confidence: confidence(input, baseConfidence),
    basis,
    reasons,
  }
}

export function estimateEta(input: EtaEstimateInput): EtaEstimate {
  const moving = validPositive(input.speedKph) && input.speedKph >= 5
  const distanceKnown = validPositive(input.remainingDistanceKm)

  if (moving && distanceKnown) {
    const liveMinutes = input.remainingDistanceKm / input.speedKph * 60
    if (input.routeHistory && validPositive(input.routeHistory.averageRemainingMinutes)) {
      const historyWeight = input.routeHistory.sampleCount >= 10 ? 0.35 : 0.2
      const blended = liveMinutes * (1 - historyWeight)
        + input.routeHistory.averageRemainingMinutes * historyWeight
      return result(input, 'live_progress', blended, input.routeHistory.sampleCount >= 10 ? 0.9 : 0.82, [
        'live_progress',
        'route_history_blend',
      ])
    }

    return result(input, 'live_progress', liveMinutes, 0.76, ['live_progress'])
  }

  if (input.routeHistory && validPositive(input.routeHistory.averageRemainingMinutes)) {
    const stopPenalty = Math.max(0, input.stoppedMinutes ?? 0) * 0.5
    const reasons = moving ? ['route_history'] : ['vehicle_stopped', 'route_history']
    return result(
      input,
      'route_history',
      input.routeHistory.averageRemainingMinutes + stopPenalty,
      input.routeHistory.sampleCount >= 10 ? 0.76 : 0.66,
      reasons,
    )
  }

  if (input.routeClassPrior && validPositive(input.routeClassPrior.averageRemainingMinutes)) {
    return result(input, 'route_class', input.routeClassPrior.averageRemainingMinutes, 0.58, [
      'route_class_fallback',
    ])
  }

  if (validPositive(input.globalPriorMinutes)) {
    return result(input, 'global_prior', input.globalPriorMinutes, 0.45, ['global_prior_fallback'])
  }

  return result(input, 'insufficient', null, 0.2, ['insufficient_route_evidence'])
}
