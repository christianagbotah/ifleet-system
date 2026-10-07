export type EvidenceAvailability = "known" | "partial" | "unavailable"
export type FuelAnomalySeverity = "info" | "low" | "medium" | "high" | "critical"

export type FuelAnomalySubject =
  | { fuelLogId: string; tripId?: never; truckId?: never; startDate?: never; endDate?: never }
  | { tripId: string; fuelLogId?: never; truckId?: never; startDate?: never; endDate?: never }
  | { truckId: string; startDate: Date; endDate: Date; fuelLogId?: never; tripId?: never }

export type FuelEvidenceEvent = {
  id: string
  tripId: string | null
  truckId: string
  driverId: string | null
  occurredAt: Date
  eventType: "purchase" | "company_issue" | "external_issue" | "emergency" | "tank_observation" | "reversal"
  verificationStatus: "pending" | "verified" | "rejected" | "superseded"
  source: "manual" | "driver_app" | "admin" | "gps" | "import" | "integration" | "system"
  liters: number
  totalCost: number
  costPerLiter: number | null
  stationName: string | null
  receiptNumber: string | null
  fuelLevelBeforeLiters: number | null
  fuelLevelAfterLiters: number | null
  latitude: number | null
  longitude: number | null
  gpsRequiredByCapturePolicy: boolean
  insideExpectedFuelingArea: boolean | null
  reversalOfId: string | null
  reversalTargetWasVerified: boolean
}

export type FuelBaselineObservation = {
  id: string
  truckId: string
  routeKey: string | null
  driverId: string | null
  stationName: string | null
  fuelType: string | null
  occurredAt: Date
  distanceKm: number | null
  consumedLiters: number | null
  fuelAddedLiters: number | null
  fuelCost: number | null
  costPerLiter: number | null
  kmPerLiter: number | null
  litersPer100Km: number | null
  fillFrequencyPer100Km?: number | null
}

export type FuelComparableCohorts = {
  truckRoute: FuelBaselineObservation[]
  truck: FuelBaselineObservation[]
  route: FuelBaselineObservation[]
  fleet: FuelBaselineObservation[]
}

export type FuelAssessmentEvidence = {
  subject: FuelAnomalySubject
  subjectType: "fuel_event" | "trip" | "truck_window"
  subjectKey: string
  fuelLogId: string | null
  tripId: string | null
  truckId: string
  driverId: string | null
  routeKey: string | null
  truckClass: string | null
  truckTankCapacityLiters: number | null
  physicalEfficiencyBounds: { minKmPerLiter: number; maxKmPerLiter: number } | null
  distanceKm: number | null
  reconciledConsumedLiters: number | null
  reconciliationExceptionCount: number
  openingTankLiters: number | null
  closingTankLiters: number | null
  netFuelAddedLiters: number | null
  fuelEvents: FuelEvidenceEvent[]
  comparableCohorts: FuelComparableCohorts
  evidenceAvailability: {
    tankCapacity: EvidenceAvailability
    tankLevels: EvidenceAvailability
    distance: EvidenceAvailability
    reconciliation: EvidenceAvailability
    gps: EvidenceAvailability
    routeGeofence: EvidenceAvailability
    physicalEfficiencyBounds: EvidenceAvailability
    comparableHistory: EvidenceAvailability
  }
}

export type FuelAnomalyFindingCode =
  | "FUEL_TANK_CAPACITY_EXCEEDED"
  | "FUEL_TANK_BALANCE_NEGATIVE"
  | "FUEL_TANK_LOSS_UNEXPLAINED"
  | "FUEL_FILL_LEVEL_CONTRADICTION"
  | "FUEL_CONSUMPTION_EXTREME_PHYSICAL"
  | "FUEL_ADDED_WITH_NO_DISTANCE"
  | "FUEL_DISTANCE_WITH_NO_USABLE_FUEL"
  | "FUEL_RECONCILIATION_EXCEPTION_CLUSTER"
  | "FUEL_NEAR_DUPLICATE_EVENT"
  | "FUEL_RECEIPT_REUSE"
  | "FUEL_REVERSAL_PATTERN"
  | "FUEL_POST_VERIFICATION_REVERSAL_CLUSTER"
  | "FUEL_PRICE_OUTLIER"
  | "FUEL_FILL_FREQUENCY_OUTLIER"
  | "FUEL_VOLUME_OUTLIER"
  | "FUEL_COST_OUTLIER"
  | "FUEL_EFFICIENCY_DEGRADATION"
  | "FUEL_EFFICIENCY_SINGLE_OUTLIER"
  | "FUEL_LOCATION_OUTSIDE_EXPECTED_AREA"
  | "FUEL_LOCATION_EVIDENCE_MISSING"

export type FuelAnomalyFindingDraft = {
  code: FuelAnomalyFindingCode
  severity: FuelAnomalySeverity
  riskContribution: number
  confidence: number
  dataQuality: number
  strongEvidence: boolean
  correlationKey: string
  evidence: Record<string, unknown>
  reason: string
  recommendedAction: string
  fuelLogId: string | null
  tripId: string | null
  truckId: string | null
  driverId: string | null
}

export type FuelAnomalyPolicy = {
  rulesetVersion: string
  baselineVersion: string
  tankCapacityToleranceRatio: number
  tankLevelToleranceLiters: number
  unexplainedTankLossToleranceLiters: number
  nearZeroDistanceKm: number
  meaningfulFuelLiters: number
  meaningfulMovementKm: number
  reconciliationExceptionClusterCount: number
  nearDuplicateWindowMinutes: number
  nearDuplicateLitersTolerance: number
  nearDuplicateCostTolerance: number
  reversalClusterCount: number
  postVerificationReversalClusterCount: number
  robustZThreshold: number
  iqrFenceMultiplier: number
  zeroSpreadRelativeToleranceRatio: number
  sustainedEfficiencyPriorCount: number
  baselinePreferredSampleSize: number
  baselineAdvisorySampleSize: number
  riskWeights: {
    physical: number
    ledger: number
    duplication: number
    reversal: number
    location: number
    statistical: number
  }
}

export type FuelAnomalyRuleContext = {
  evidence: FuelAssessmentEvidence
  policy: FuelAnomalyPolicy
}

export type FuelAssessmentSummary = {
  overallRiskScore: number
  overallSeverity: FuelAnomalySeverity
  confidence: number
  dataQuality: number
  contributions: Array<{ code: FuelAnomalyFindingCode; appliedRisk: number; correlationKey: string }>
}
