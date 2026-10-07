import {
  evaluateDriverEligibility,
  evaluateTruckEligibility,
} from "./eligibility"
import type {
  DispatchEligibilityContext,
  DriverEligibilityCandidate,
  EligibilityResult,
  TruckEligibilityCandidate,
} from "./types"
import {
  rankDispatchPairs,
  scoreDispatchPair,
  type DispatchPairScore,
  type DispatchScoreEvidenceValue,
} from "./scoring"

export type DispatchDriverEvidence = DriverEligibilityCandidate & {
  currentWorkload: number
  routeExperienceScore: number | null
  historicalPerformanceScore: number | null
  locationFitScore: number | null
}

export type DispatchTruckEvidence = TruckEligibilityCandidate & {
  fuelEfficiencyScore: number | null
  maintenanceReadinessScore: number | null
  locationFitScore: number | null
  capacityFitScore: number | null
}

export type BlockedDispatchResource = {
  id: string
  eligibility: EligibilityResult
}

export type DispatchCandidateRankingResult = {
  ranked: DispatchPairScore[]
  blockedDrivers: BlockedDispatchResource[]
  blockedTrucks: BlockedDispatchResource[]
}

function boundedScore(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function workloadBalanceScore(currentWorkload: number): number {
  if (!Number.isFinite(currentWorkload)) return 50
  return boundedScore(100 - Math.max(0, currentWorkload) * 20)
}

function combineLocationFit(
  driverScore: number | null,
  truckScore: number | null,
): DispatchScoreEvidenceValue {
  const values = [driverScore, truckScore].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  )

  if (values.length === 0) return null
  const average = values.reduce((sum, value) => sum + boundedScore(value), 0) / values.length

  return values.length === 2
    ? average
    : { value: average, known: false }
}

function complianceScore(
  driverEligibility: EligibilityResult,
  truckEligibility: EligibilityResult,
): DispatchScoreEvidenceValue {
  const incomplete = driverEligibility.warnings.length > 0
    || driverEligibility.missingData.length > 0
    || truckEligibility.warnings.length > 0
    || truckEligibility.missingData.length > 0

  return incomplete ? { value: 70, known: false } : 100
}

export function rankEligibleDispatchCandidates(
  drivers: DispatchDriverEvidence[],
  trucks: DispatchTruckEvidence[],
  context: DispatchEligibilityContext,
): DispatchCandidateRankingResult {
  const eligibleDrivers: Array<{ candidate: DispatchDriverEvidence; eligibility: EligibilityResult }> = []
  const eligibleTrucks: Array<{ candidate: DispatchTruckEvidence; eligibility: EligibilityResult }> = []
  const blockedDrivers: BlockedDispatchResource[] = []
  const blockedTrucks: BlockedDispatchResource[] = []

  for (const candidate of drivers) {
    const eligibility = evaluateDriverEligibility(candidate, context)
    if (eligibility.eligible) eligibleDrivers.push({ candidate, eligibility })
    else blockedDrivers.push({ id: candidate.id, eligibility })
  }

  for (const candidate of trucks) {
    const eligibility = evaluateTruckEligibility(candidate, context)
    if (eligibility.eligible) eligibleTrucks.push({ candidate, eligibility })
    else blockedTrucks.push({ id: candidate.id, eligibility })
  }

  const scores: DispatchPairScore[] = []

  for (const driver of eligibleDrivers) {
    for (const truck of eligibleTrucks) {
      scores.push(scoreDispatchPair({
        driverId: driver.candidate.id,
        truckId: truck.candidate.id,
        eligible: true,
        currentWorkload: driver.candidate.currentWorkload,
        components: {
          availability: 100,
          compliance: complianceScore(driver.eligibility, truck.eligibility),
          routeExperience: driver.candidate.routeExperienceScore,
          historicalPerformance: driver.candidate.historicalPerformanceScore,
          fuelEfficiency: truck.candidate.fuelEfficiencyScore,
          maintenanceReadiness: truck.candidate.maintenanceReadinessScore,
          workloadBalance: workloadBalanceScore(driver.candidate.currentWorkload),
          locationFit: combineLocationFit(
            driver.candidate.locationFitScore,
            truck.candidate.locationFitScore,
          ),
          capacityFit: truck.candidate.capacityFitScore,
        },
      }))
    }
  }

  return {
    ranked: rankDispatchPairs(scores),
    blockedDrivers,
    blockedTrucks,
  }
}
