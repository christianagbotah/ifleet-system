import type { FuelAnomalyPolicy } from "./types"

export const FUEL_ANOMALY_RULESET_VERSION = "fuel-rules-v1"
export const FUEL_ANOMALY_BASELINE_VERSION = "fuel-baseline-v1"

export const DEFAULT_FUEL_ANOMALY_POLICY: FuelAnomalyPolicy = Object.freeze({
  rulesetVersion: FUEL_ANOMALY_RULESET_VERSION,
  baselineVersion: FUEL_ANOMALY_BASELINE_VERSION,
  tankCapacityToleranceRatio: 0.02,
  tankLevelToleranceLiters: 2,
  unexplainedTankLossToleranceLiters: 5,
  nearZeroDistanceKm: 1,
  meaningfulFuelLiters: 5,
  meaningfulMovementKm: 10,
  reconciliationExceptionClusterCount: 3,
  nearDuplicateWindowMinutes: 30,
  nearDuplicateLitersTolerance: 0.5,
  nearDuplicateCostTolerance: 5,
  reversalClusterCount: 3,
  postVerificationReversalClusterCount: 2,
  baselinePreferredSampleSize: 12,
  baselineAdvisorySampleSize: 6,
  riskWeights: {
    physical: 35,
    ledger: 20,
    duplication: 18,
    reversal: 18,
    location: 15,
    statistical: 20,
  },
})

export type { FuelAnomalyPolicy } from "./types"
