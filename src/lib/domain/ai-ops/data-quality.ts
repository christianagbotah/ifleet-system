import type {
  AiInputFacts,
  DataQualityAssessment,
  DataQualityGrade,
  DataQualityIssue,
} from './types'

const FRESH_TELEMETRY_MINUTES = 5
const STALE_TELEMETRY_MINUTES = 15
const ODOMETER_CONFLICT_KM = 10
const FUEL_CONFLICT_LITERS = 15
const FUEL_CONFLICT_RATIO = 0.2

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function minutesBetween(later: Date, earlier: Date): number {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 60_000)
}

function gradeFor(score: number, ceiling: number, issues: DataQualityIssue[]): DataQualityGrade {
  if (issues.some((issue) => issue.severity === 'blocking')) return 'insufficient'
  if (score >= 0.9 && ceiling >= 0.9) return 'trusted'
  if (score >= 0.65 && ceiling > 0.55) return 'usable'
  if (score >= 0.4) return 'limited'
  return 'insufficient'
}

export function assessDataQuality(input: AiInputFacts): DataQualityAssessment {
  const issues: DataQualityIssue[] = []
  let score = 1
  let confidenceCeiling = 1

  if (!input.telemetry) {
    issues.push({
      code: 'missing_telemetry',
      severity: 'blocking',
      message: 'No current telemetry evidence is available.',
    })
    score -= 0.45
    confidenceCeiling = Math.min(confidenceCeiling, 0.4)
  } else {
    if (input.telemetry.source === 'phone') {
      issues.push({
        code: 'phone_telemetry_fallback',
        severity: 'warning',
        message: 'Phone telemetry is being used as a fallback instead of installed hardware.',
      })
      score -= 0.15
      confidenceCeiling = Math.min(confidenceCeiling, 0.72)
    }

    const ageMinutes = minutesBetween(input.asOf, input.telemetry.observedAt)
    if (ageMinutes > STALE_TELEMETRY_MINUTES) {
      issues.push({
        code: 'stale_telemetry',
        severity: 'warning',
        message: `Latest telemetry is ${Math.round(ageMinutes)} minutes old.`,
      })
      score -= 0.35
      confidenceCeiling = Math.min(confidenceCeiling, 0.5)
    } else if (ageMinutes > FRESH_TELEMETRY_MINUTES) {
      issues.push({
        code: 'aging_telemetry',
        severity: 'warning',
        message: `Latest telemetry is ${Math.round(ageMinutes)} minutes old.`,
      })
      score -= 0.15
      confidenceCeiling = Math.min(confidenceCeiling, 0.75)
    }
  }

  if (!input.weight || input.weight.grossKg == null || input.weight.tareKg == null) {
    issues.push({
      code: 'missing_weight_evidence',
      severity: 'warning',
      message: 'Verified gross and tare weight evidence is incomplete.',
    })
    score -= 0.2
    confidenceCeiling = Math.min(confidenceCeiling, 0.55)
  }

  if (!input.fuel || input.fuel.measuredLiters == null) {
    issues.push({
      code: 'missing_fuel_evidence',
      severity: 'warning',
      message: 'Current fuel evidence is unavailable.',
    })
    score -= 0.2
    confidenceCeiling = Math.min(confidenceCeiling, 0.55)
  }

  if (
    input.telemetry?.odometerKm != null
    && input.manual?.odometerKm != null
    && Math.abs(input.telemetry.odometerKm - input.manual.odometerKm) > ODOMETER_CONFLICT_KM
  ) {
    issues.push({
      code: 'odometer_conflict',
      severity: 'blocking',
      message: 'Telemetry and manually recorded odometer readings materially disagree.',
    })
    score -= 0.35
    confidenceCeiling = Math.min(confidenceCeiling, 0.35)
  }

  const sensorFuel = input.telemetry?.fuelLiters ?? input.fuel?.measuredLiters
  const manualFuel = input.manual?.fuelLiters
  if (sensorFuel != null && manualFuel != null) {
    const conflictThreshold = Math.max(FUEL_CONFLICT_LITERS, Math.abs(sensorFuel) * FUEL_CONFLICT_RATIO)
    if (Math.abs(sensorFuel - manualFuel) > conflictThreshold) {
      issues.push({
        code: 'fuel_conflict',
        severity: 'blocking',
        message: 'Sensor and manually recorded fuel values materially disagree.',
      })
      score -= 0.35
      confidenceCeiling = Math.min(confidenceCeiling, 0.35)
    }
  }

  score = clamp(score)
  confidenceCeiling = clamp(confidenceCeiling)

  return {
    grade: gradeFor(score, confidenceCeiling, issues),
    score,
    confidenceCeiling,
    issues,
  }
}
