export type TelemetrySource = 'hardware' | 'phone'
export type FuelEvidenceSource = 'sensor' | 'manual' | 'receipt'

export interface AiTelemetryFacts {
  source: TelemetrySource
  observedAt: Date
  odometerKm?: number
  fuelLiters?: number
  speedKph?: number
}

export interface AiWeightFacts {
  grossKg?: number
  tareKg?: number
  observedAt?: Date
}

export interface AiFuelFacts {
  measuredLiters?: number
  observedAt?: Date
  source: FuelEvidenceSource
}

export interface AiManualFacts {
  odometerKm?: number
  fuelLiters?: number
}

export interface AiInputFacts {
  asOf: Date
  telemetry?: AiTelemetryFacts
  weight?: AiWeightFacts
  fuel?: AiFuelFacts
  manual?: AiManualFacts
}

export type DataQualityGrade = 'trusted' | 'usable' | 'limited' | 'insufficient'
export type DataQualityIssueSeverity = 'info' | 'warning' | 'blocking'

export interface DataQualityIssue {
  code: string
  severity: DataQualityIssueSeverity
  message: string
}

export interface DataQualityAssessment {
  grade: DataQualityGrade
  score: number
  confidenceCeiling: number
  issues: DataQualityIssue[]
}
