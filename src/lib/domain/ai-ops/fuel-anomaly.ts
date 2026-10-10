import type { DataQualityAssessment } from './types'

export type FuelAnomalyClassification = 'normal' | 'data_issue' | 'review'
export type FuelEvidenceMode = 'sensor' | 'mixed' | 'manual'

export interface FuelAnomalyInput {
  purchaseLiters?: number | null
  tankCapacityLiters?: number | null
  fuelBeforeLiters?: number | null
  fuelAfterLiters?: number | null
  actualFuelUsedLiters?: number | null
  distanceKm?: number | null
  routeBaselineLitersPer100Km?: number | null
  routeBaselineSampleCount?: number
  sensorBeforeLiters?: number | null
  sensorAfterLiters?: number | null
  sensorDistanceKm?: number | null
  averageSpeedKph?: number | null
  idleMinutes?: number | null
  idleFuelUsedLiters?: number | null
  expectedIdleLitersPerHour?: number | null
  evidenceMode: FuelEvidenceMode
  dataQuality: DataQualityAssessment
}

export interface FuelAnomalyAssessment {
  classification: FuelAnomalyClassification
  reviewScore: number
  confidence: number
  reasons: string[]
  summary: string
  metrics: {
    actualLitersPer100Km: number | null
    baselineLitersPer100Km: number | null
    variancePercent: number | null
    sensorDropLiters: number | null
  }
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function confidenceFor(input: FuelAnomalyInput): number {
  const evidenceCeiling = input.evidenceMode === 'sensor'
    ? 0.9
    : input.evidenceMode === 'mixed'
      ? 0.78
      : 0.45
  return Math.min(evidenceCeiling, input.dataQuality.confidenceCeiling)
}

export function assessFuelAnomaly(input: FuelAnomalyInput): FuelAnomalyAssessment {
  const reasons: string[] = []
  let reviewScore = 0
  let dataIssue = false

  if (
    finiteNonNegative(input.purchaseLiters)
    && finiteNonNegative(input.tankCapacityLiters)
    && input.purchaseLiters > input.tankCapacityLiters * 1.02
  ) {
    dataIssue = true
    reasons.push('purchase_exceeds_tank_capacity')
  }

  const actualLitersPer100Km = finiteNonNegative(input.actualFuelUsedLiters)
    && finiteNonNegative(input.distanceKm)
    && input.distanceKm > 0
    ? (input.actualFuelUsedLiters / input.distanceKm) * 100
    : null
  const baselineLitersPer100Km = finiteNonNegative(input.routeBaselineLitersPer100Km)
    ? input.routeBaselineLitersPer100Km
    : null
  const variancePercent = actualLitersPer100Km != null
    && baselineLitersPer100Km != null
    && baselineLitersPer100Km > 0
    ? ((actualLitersPer100Km - baselineLitersPer100Km) / baselineLitersPer100Km) * 100
    : null

  const sensorDropLiters = finiteNonNegative(input.sensorBeforeLiters)
    && finiteNonNegative(input.sensorAfterLiters)
    ? Math.max(0, input.sensorBeforeLiters - input.sensorAfterLiters)
    : null

  if (
    sensorDropLiters != null
    && sensorDropLiters >= 20
    && finiteNonNegative(input.sensorDistanceKm)
    && input.sensorDistanceKm <= 1
    && finiteNonNegative(input.averageSpeedKph)
    && input.averageSpeedKph < 5
  ) {
    reviewScore = Math.max(reviewScore, 80)
    reasons.push('stationary_sensor_drop')
  }

  if (
    finiteNonNegative(input.idleMinutes)
    && input.idleMinutes >= 90
    && finiteNonNegative(input.idleFuelUsedLiters)
    && finiteNonNegative(input.expectedIdleLitersPerHour)
  ) {
    const expectedIdle = input.expectedIdleLitersPerHour * (input.idleMinutes / 60)
    if (input.idleFuelUsedLiters > Math.max(expectedIdle * 1.5, expectedIdle + 3)) {
      reviewScore = Math.max(reviewScore, 65)
      reasons.push('excessive_idle_consumption')
    }
  }

  if (
    variancePercent != null
    && (input.routeBaselineSampleCount ?? 0) >= 5
    && variancePercent >= 25
  ) {
    reviewScore = Math.max(reviewScore, Math.min(90, 45 + variancePercent * 0.5))
    reasons.push('route_consumption_above_baseline')
  }

  const hasSensorEvidence = sensorDropLiters != null
    || finiteNonNegative(input.idleFuelUsedLiters)
  const hasRouteEvidence = actualLitersPer100Km != null
    && baselineLitersPer100Km != null
    && (input.routeBaselineSampleCount ?? 0) >= 5

  if (!hasSensorEvidence && !hasRouteEvidence) {
    dataIssue = true
    reasons.push('insufficient_fuel_evidence')
  }

  if (input.evidenceMode === 'manual') {
    reasons.push('manual_only_evidence')
  }

  let classification: FuelAnomalyClassification = 'normal'
  if (dataIssue) classification = 'data_issue'
  else if (reviewScore >= 60) classification = 'review'

  const summary = classification === 'review'
    ? 'Fuel evidence differs materially from expected operating patterns and should be reviewed by an authorized operator.'
    : classification === 'data_issue'
      ? 'Fuel evidence is incomplete or internally inconsistent and should be corrected before drawing an operational conclusion.'
      : 'No material fuel anomaly detected from the available evidence.'

  return {
    classification,
    reviewScore: Math.round(reviewScore),
    confidence: confidenceFor(input),
    reasons,
    summary,
    metrics: {
      actualLitersPer100Km,
      baselineLitersPer100Km,
      variancePercent,
      sensorDropLiters,
    },
  }
}
