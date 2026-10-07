import { DEFAULT_FUEL_ANOMALY_POLICY } from "./policy"
import { interquartileRange, median, medianAbsoluteDeviation } from "./statistics"
import type {
  FuelAnomalyFindingDraft,
  FuelAnomalyPolicy,
  FuelAssessmentEvidence,
  FuelBaselineObservation,
  FuelComparableCohorts,
} from "./types"

export type FuelBaselineMetric = "kmPerLiter" | "costPerLiter" | "fuelAddedLiters" | "fuelCost" | "fillFrequencyPer100Km"
export type FuelBaselineCohortType = "truck_route" | "truck" | "route" | "fleet"

export type BaselineSelectionInput = {
  cohorts: FuelComparableCohorts
  metric: FuelBaselineMetric
  policy?: FuelAnomalyPolicy
}

export type FuelBaselineSelection = {
  cohortType: FuelBaselineCohortType
  metric: FuelBaselineMetric
  observations: FuelBaselineObservation[]
  values: number[]
  sampleSize: number
  confidenceTier: "preferred" | "advisory"
  confidence: number
  dataQuality: number
}

export type FuelBaselineEvaluationInput = {
  evidence: FuelAssessmentEvidence
  policy?: FuelAnomalyPolicy
}

type OutlierResult = {
  isOutlier: boolean
  direction: "low" | "high" | "none"
  method: "mad" | "iqr" | "relative"
  median: number
  mad: number | null
  q1: number | null
  q3: number | null
  score: number | null
}

function metricValue(observation: FuelBaselineObservation, metric: FuelBaselineMetric): number | null {
  const value = observation[metric]
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function selectFuelBaseline({ cohorts, metric, policy = DEFAULT_FUEL_ANOMALY_POLICY }: BaselineSelectionInput): FuelBaselineSelection | null {
  const candidates: Array<[FuelBaselineCohortType, FuelBaselineObservation[]]> = [
    ["truck_route", cohorts.truckRoute],
    ["truck", cohorts.truck],
    ["route", cohorts.route],
    ["fleet", cohorts.fleet],
  ]
  for (const [cohortType, observations] of candidates) {
    const usable = observations
      .map((item) => metricValue(item, metric))
      .filter((value): value is number => value != null)
    if (usable.length < policy.baselineAdvisorySampleSize) continue
    const preferred = usable.length >= policy.baselinePreferredSampleSize
    return {
      cohortType,
      metric,
      observations,
      values: usable,
      sampleSize: usable.length,
      confidenceTier: preferred ? "preferred" : "advisory",
      confidence: preferred ? 0.9 : 0.65,
      dataQuality: preferred ? 0.9 : 0.7,
    }
  }
  return null
}

function analyzeOutlier(value: number, values: number[], policy: FuelAnomalyPolicy): OutlierResult | null {
  if (!Number.isFinite(value)) return null
  const center = median(values)
  if (center == null) return null
  const mad = medianAbsoluteDeviation(values, center)
  if (mad != null && mad > 0) {
    const signedScore = 0.6745 * (value - center) / mad
    return {
      isOutlier: Math.abs(signedScore) > policy.robustZThreshold,
      direction: signedScore < -policy.robustZThreshold ? "low" : signedScore > policy.robustZThreshold ? "high" : "none",
      method: "mad",
      median: center,
      mad,
      q1: null,
      q3: null,
      score: signedScore,
    }
  }
  const range = interquartileRange(values)
  if (range && range.iqr > 0) {
    const lower = range.q1 - policy.iqrFenceMultiplier * range.iqr
    const upper = range.q3 + policy.iqrFenceMultiplier * range.iqr
    return {
      isOutlier: value < lower || value > upper,
      direction: value < lower ? "low" : value > upper ? "high" : "none",
      method: "iqr",
      median: center,
      mad,
      q1: range.q1,
      q3: range.q3,
      score: null,
    }
  }
  const denominator = Math.max(Math.abs(center), Number.EPSILON)
  const relative = Math.abs(value - center) / denominator
  return {
    isOutlier: relative > policy.zeroSpreadRelativeToleranceRatio,
    direction: relative > policy.zeroSpreadRelativeToleranceRatio ? (value < center ? "low" : "high") : "none",
    method: "relative",
    median: center,
    mad,
    q1: range?.q1 ?? center,
    q3: range?.q3 ?? center,
    score: relative,
  }
}

function statisticalFinding(
  evidence: FuelAssessmentEvidence,
  selection: FuelBaselineSelection,
  result: OutlierResult,
  code: FuelAnomalyFindingDraft["code"],
  label: string,
  observed: number,
  severityOverride?: FuelAnomalyFindingDraft["severity"],
): FuelAnomalyFindingDraft {
  const preferred = selection.confidenceTier === "preferred"
  return {
    code,
    severity: severityOverride ?? (preferred ? "medium" : "low"),
    riskContribution: preferred ? 14 : 8,
    confidence: selection.confidence,
    dataQuality: selection.dataQuality,
    strongEvidence: false,
    correlationKey: `statistical:${selection.metric}`,
    evidence: {
      observed,
      direction: result.direction,
      method: result.method,
      median: result.median,
      mad: result.mad,
      q1: result.q1,
      q3: result.q3,
      score: result.score,
      cohortType: selection.cohortType,
      sampleSize: selection.sampleSize,
      confidenceTier: selection.confidenceTier,
    },
    reason: `${label} is a robust statistical outlier relative to the ${selection.cohortType.replace("_", "+")} baseline.`,
    recommendedAction: "Review operational context and source evidence; a statistical outlier is not proof of misuse.",
    fuelLogId: evidence.fuelLogId,
    tripId: evidence.tripId,
    truckId: evidence.truckId,
    driverId: evidence.driverId,
  }
}

function currentFuelCost(evidence: FuelAssessmentEvidence): number | null {
  const verified = evidence.fuelEvents.filter((item) => item.verificationStatus === "verified" && item.eventType !== "tank_observation")
  if (verified.length === 0) return null
  return verified.reduce((sum, item) => sum + item.totalCost, 0)
}

function currentCostPerLiter(evidence: FuelAssessmentEvidence): number | null {
  const values = evidence.fuelEvents
    .filter((item) => item.verificationStatus === "verified" && item.eventType !== "reversal" && item.eventType !== "tank_observation")
    .map((item) => item.costPerLiter)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  return median(values)
}

function currentFillFrequency(evidence: FuelAssessmentEvidence): number | null {
  if (evidence.distanceKm == null || !Number.isFinite(evidence.distanceKm) || evidence.distanceKm <= 0) return null
  const fills = evidence.fuelEvents.filter((item) => item.verificationStatus === "verified" && item.eventType !== "reversal" && item.eventType !== "tank_observation" && item.liters > 0).length
  return fills / (evidence.distanceKm / 100)
}

function evaluateMetric(
  evidence: FuelAssessmentEvidence,
  metric: FuelBaselineMetric,
  observed: number | null,
  code: FuelAnomalyFindingDraft["code"],
  label: string,
  policy: FuelAnomalyPolicy,
): FuelAnomalyFindingDraft | null {
  if (observed == null || !Number.isFinite(observed)) return null
  const selection = selectFuelBaseline({ cohorts: evidence.comparableCohorts, metric, policy })
  if (!selection) return null
  const result = analyzeOutlier(observed, selection.values, policy)
  if (!result?.isOutlier) return null
  return statisticalFinding(evidence, selection, result, code, label, observed)
}

export function evaluateFuelBaselineFindings({ evidence, policy = DEFAULT_FUEL_ANOMALY_POLICY }: FuelBaselineEvaluationInput): FuelAnomalyFindingDraft[] {
  const findings: FuelAnomalyFindingDraft[] = []
  const currentKmPerLiter = evidence.distanceKm != null && evidence.reconciledConsumedLiters != null && evidence.distanceKm > 0 && evidence.reconciledConsumedLiters > 0
    ? evidence.distanceKm / evidence.reconciledConsumedLiters
    : null

  if (currentKmPerLiter != null) {
    const selection = selectFuelBaseline({ cohorts: evidence.comparableCohorts, metric: "kmPerLiter", policy })
    const result = selection ? analyzeOutlier(currentKmPerLiter, selection.values, policy) : null
    if (selection && result?.isOutlier) {
      const recent = selection.observations
        .filter((item) => item.kmPerLiter != null && Number.isFinite(item.kmPerLiter))
        .slice()
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime() || b.id.localeCompare(a.id))
        .slice(0, policy.sustainedEfficiencyPriorCount)
      const sustained = result.direction === "low" && recent.length === policy.sustainedEfficiencyPriorCount && recent.every((item) => {
        const prior = analyzeOutlier(item.kmPerLiter as number, selection.values, policy)
        return prior?.isOutlier && prior.direction === "low"
      })
      findings.push(statisticalFinding(
        evidence,
        selection,
        result,
        sustained ? "FUEL_EFFICIENCY_DEGRADATION" : "FUEL_EFFICIENCY_SINGLE_OUTLIER",
        sustained ? "Sustained reconciled fuel efficiency" : "Reconciled fuel efficiency",
        currentKmPerLiter,
        sustained ? (selection.confidenceTier === "preferred" ? "high" : "medium") : undefined,
      ))
    }
  }

  const metrics: Array<[FuelBaselineMetric, number | null, FuelAnomalyFindingDraft["code"], string]> = [
    ["costPerLiter", currentCostPerLiter(evidence), "FUEL_PRICE_OUTLIER", "Fuel price per litre"],
    ["fuelAddedLiters", evidence.netFuelAddedLiters, "FUEL_VOLUME_OUTLIER", "Fuel volume"],
    ["fillFrequencyPer100Km", currentFillFrequency(evidence), "FUEL_FILL_FREQUENCY_OUTLIER", "Refueling frequency"],
    ["fuelCost", currentFuelCost(evidence), "FUEL_COST_OUTLIER", "Fuel cost"],
  ]
  for (const [metric, observed, code, label] of metrics) {
    const finding = evaluateMetric(evidence, metric, observed, code, label, policy)
    if (finding) findings.push(finding)
  }

  return findings.sort((a, b) => a.code.localeCompare(b.code))
}
