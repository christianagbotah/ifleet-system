import type { FuelAnomalyStoredAssessment } from "@/lib/services/fuel-anomaly-assessment-service"

export type FuelAnomalyExplanationFinding = {
  findingId: string
  code: string
  severity: string
  riskContribution: number
  confidence: number
  dataQuality: number
  reason: string
  recommendedAction: string
  evidenceSummary: Record<string, unknown>
}

export type FuelAnomalyExplanationPayload = {
  assessmentId: string
  overallRiskScore: number
  overallSeverity: string
  confidence: number
  dataQuality: number
  findings: FuelAnomalyExplanationFinding[]
}

export type FuelAnomalyExplanationContent = {
  summary: string
  findingExplanations: Array<{ findingId: string; explanation: string }>
  investigationQuestions: string[]
}

const SENSITIVE_KEYS = /(?:phone|licen[cs]e|address|ghana.?card|email|captured.?by|requested.?by|actor.?id|user.?id|driver.?id|emergency)/i
const AUTHORITY_KEYS = new Set([
  "severity", "risk", "riskscore", "overallriskscore", "score", "confidence", "dataquality",
  "status", "outcome", "outcomecode", "decision", "recommendedaction", "action", "code", "findingcode",
])
const ACCUSATORY_ASSERTION = /\b(?:theft|fraud)\s+(?:is\s+)?(?:confirmed|proven)\b|\bstole\s+fuel\b|\bis\s+stealing\b|\bcommitted\s+(?:theft|fraud)\b/i

function sanitizeEvidence(value: unknown, depth = 0): unknown {
  if (depth > 4) return null
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeEvidence(item, depth + 1))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.test(key)) continue
      out[key] = sanitizeEvidence(item, depth + 1)
    }
    return out
  }
  if (typeof value === "string") return value.slice(0, 500)
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value === "boolean" || value == null) return value
  return String(value).slice(0, 500)
}

function parseStoredEvidence(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    const sanitized = sanitizeEvidence(parsed)
    return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
      ? sanitized as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export function buildFuelAnomalyExplanationPayload(assessment: FuelAnomalyStoredAssessment): FuelAnomalyExplanationPayload {
  return {
    assessmentId: assessment.id,
    overallRiskScore: assessment.overallRiskScore,
    overallSeverity: assessment.overallSeverity,
    confidence: assessment.confidence,
    dataQuality: assessment.dataQuality,
    findings: assessment.findings.map((finding) => ({
      findingId: finding.id,
      code: finding.code,
      severity: finding.severity,
      riskContribution: finding.riskContribution,
      confidence: finding.confidence,
      dataQuality: finding.dataQuality,
      reason: finding.reason.slice(0, 1000),
      recommendedAction: finding.recommendedAction.slice(0, 1000),
      evidenceSummary: parseStoredEvidence(finding.evidence),
    })),
  }
}

function assertNoAuthorityFields(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoAuthorityFields(item)
    return
  }
  if (!value || typeof value !== "object") return
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (AUTHORITY_KEYS.has(key.toLowerCase())) throw new Error("AI_EXPLANATION_AUTHORITY_FIELD")
    assertNoAuthorityFields(item)
  }
}

function cleanText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`AI_EXPLANATION_MALFORMED_${field}`)
  const text = value.trim().slice(0, 4000)
  if (ACCUSATORY_ASSERTION.test(text)) throw new Error("AI_EXPLANATION_ACCUSATORY_LANGUAGE")
  return text
}

export function mergeFuelAnomalyExplanation(
  payload: FuelAnomalyExplanationPayload,
  raw: unknown,
): FuelAnomalyExplanationContent {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AI_EXPLANATION_MALFORMED_OUTPUT")
  assertNoAuthorityFields(raw)
  const obj = raw as Record<string, unknown>
  const allowedTop = new Set(["summary", "findingExplanations", "investigationQuestions"])
  for (const key of Object.keys(obj)) if (!allowedTop.has(key)) throw new Error("AI_EXPLANATION_MALFORMED_OUTPUT")
  if (!Array.isArray(obj.findingExplanations) || !Array.isArray(obj.investigationQuestions)) throw new Error("AI_EXPLANATION_MALFORMED_OUTPUT")

  const expectedIds = payload.findings.map((finding) => finding.findingId)
  const explanations = obj.findingExplanations.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("AI_EXPLANATION_MALFORMED_OUTPUT")
    const entry = item as Record<string, unknown>
    if (Object.keys(entry).some((key) => key !== "findingId" && key !== "explanation")) throw new Error("AI_EXPLANATION_MALFORMED_OUTPUT")
    if (typeof entry.findingId !== "string") throw new Error("AI_EXPLANATION_MALFORMED_OUTPUT")
    return { findingId: entry.findingId, explanation: cleanText(entry.explanation, "EXPLANATION") }
  })
  const actualIds = explanations.map((item) => item.findingId)
  if (actualIds.length !== new Set(actualIds).size || actualIds.length !== expectedIds.length || actualIds.some((id) => !expectedIds.includes(id))) {
    throw new Error("AI_EXPLANATION_FINDING_SET_MISMATCH")
  }
  const byId = new Map(explanations.map((item) => [item.findingId, item]))
  return {
    summary: cleanText(obj.summary, "SUMMARY"),
    findingExplanations: expectedIds.map((id) => byId.get(id)!),
    investigationQuestions: obj.investigationQuestions.slice(0, 12).map((item) => cleanText(item, "QUESTION")),
  }
}
