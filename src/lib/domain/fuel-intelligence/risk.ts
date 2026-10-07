import { DEFAULT_FUEL_ANOMALY_POLICY } from "./policy"
import type {
  FuelAnomalyFindingDraft,
  FuelAnomalyPolicy,
  FuelAnomalySeverity,
  FuelAssessmentEvidence,
  FuelAssessmentSummary,
} from "./types"

type RiskFamily = keyof FuelAnomalyPolicy["riskWeights"]

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function familyFor(correlationKey: string): RiskFamily {
  const prefix = correlationKey.split(":", 1)[0]
  switch (prefix) {
    case "tank":
    case "consumption":
      return "physical"
    case "receipt":
    case "duplicate":
      return "duplication"
    case "reversal":
      return "reversal"
    case "location":
      return "location"
    case "statistical":
      return "statistical"
    case "movement":
    case "reconciliation":
    default:
      return "ledger"
  }
}

function evidenceQuality(evidence: FuelAssessmentEvidence): number {
  const weights = Object.values(evidence.evidenceAvailability).map((availability) => {
    if (availability === "known") return 1
    if (availability === "partial") return 0.6
    return 0.2
  })
  if (weights.length === 0) return 0.2
  return weights.reduce((sum, value) => sum + value, 0) / weights.length
}

function severityFor(score: number, hasStrongEvidence: boolean): FuelAnomalySeverity {
  if (score < 20) return "info"
  if (score < 40) return "low"
  if (score < 60) return "medium"
  if (score < 80) return "high"
  return hasStrongEvidence ? "critical" : "high"
}

export function aggregateFuelAnomalyAssessment(
  findings: FuelAnomalyFindingDraft[],
  evidence: FuelAssessmentEvidence,
  policy: FuelAnomalyPolicy = DEFAULT_FUEL_ANOMALY_POLICY,
): FuelAssessmentSummary {
  const byCorrelation = new Map<string, FuelAnomalyFindingDraft>()
  for (const item of findings) {
    const normalizedRisk = clamp(item.riskContribution, 0, 100)
    const current = byCorrelation.get(item.correlationKey)
    if (!current || normalizedRisk > clamp(current.riskContribution, 0, 100) || (normalizedRisk === clamp(current.riskContribution, 0, 100) && item.code.localeCompare(current.code) < 0)) {
      byCorrelation.set(item.correlationKey, { ...item, riskContribution: normalizedRisk })
    }
  }

  const representatives = [...byCorrelation.values()].sort((a, b) => {
    const familyCompare = familyFor(a.correlationKey).localeCompare(familyFor(b.correlationKey))
    if (familyCompare !== 0) return familyCompare
    const riskCompare = b.riskContribution - a.riskContribution
    return riskCompare !== 0 ? riskCompare : a.correlationKey.localeCompare(b.correlationKey)
  })

  const remaining: Record<RiskFamily, number> = {
    physical: policy.riskWeights.physical,
    ledger: policy.riskWeights.ledger,
    duplication: policy.riskWeights.duplication,
    reversal: policy.riskWeights.reversal,
    location: policy.riskWeights.location,
    statistical: policy.riskWeights.statistical,
  }
  const applied = representatives.map((item) => {
    const family = familyFor(item.correlationKey)
    const amount = Math.min(clamp(item.riskContribution, 0, 100), Math.max(0, remaining[family]))
    remaining[family] -= amount
    return { finding: item, appliedRisk: amount }
  }).filter((item) => item.appliedRisk > 0)

  const overallRiskScore = Math.round(clamp(applied.reduce((sum, item) => sum + item.appliedRisk, 0), 0, 100))
  const hasStrongEvidence = applied.some((item) => item.finding.strongEvidence)
  const quality = evidenceQuality(evidence)

  const appliedTotal = applied.reduce((sum, item) => sum + item.appliedRisk, 0)
  const weightedConfidence = appliedTotal > 0
    ? applied.reduce((sum, item) => sum + clamp(item.finding.confidence, 0, 1) * item.appliedRisk, 0) / appliedTotal
    : quality
  const weightedFindingQuality = appliedTotal > 0
    ? applied.reduce((sum, item) => sum + clamp(item.finding.dataQuality, 0, 1) * item.appliedRisk, 0) / appliedTotal
    : quality

  return {
    overallRiskScore,
    overallSeverity: severityFor(overallRiskScore, hasStrongEvidence),
    confidence: clamp(weightedConfidence * (0.5 + 0.5 * quality), 0, 1),
    dataQuality: clamp((quality + weightedFindingQuality) / 2, 0, 1),
    contributions: applied.map(({ finding: item, appliedRisk }) => ({
      code: item.code,
      appliedRisk,
      correlationKey: item.correlationKey,
    })),
  }
}
