export type MiniFuelAnomalyExplanationPayload = {
  assessmentId: string
  overallRiskScore: number
  overallSeverity: string
  confidence: number
  dataQuality: number
  findings: Array<{
    findingId: string
    code: string
    severity: string
    riskContribution: number
    confidence: number
    dataQuality: number
    reason: string
    recommendedAction: string
    evidenceSummary: Record<string, unknown>
  }>
}

export const FUEL_ANOMALY_EXPLANATION_SYSTEM_PROMPT = `You explain server-determined fuel anomaly findings for human review. You have no authority to create or remove findings, change severity, risk, confidence, data quality, status, outcomes, money, driver/truck state, or source records. Never state theft or fraud as a fact. Return JSON only with keys summary, findingExplanations, investigationQuestions. findingExplanations must contain exactly one {findingId, explanation} for every supplied findingId.`

function isPayload(value: unknown): value is MiniFuelAnomalyExplanationPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  const allowed = new Set(["assessmentId", "overallRiskScore", "overallSeverity", "confidence", "dataQuality", "findings"])
  if (Object.keys(obj).some((key) => !allowed.has(key))) return false
  if (typeof obj.assessmentId !== "string" || typeof obj.overallRiskScore !== "number" || typeof obj.overallSeverity !== "string" || typeof obj.confidence !== "number" || typeof obj.dataQuality !== "number" || !Array.isArray(obj.findings)) return false
  return obj.findings.every((finding) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) return false
    const item = finding as Record<string, unknown>
    const keys = new Set(["findingId", "code", "severity", "riskContribution", "confidence", "dataQuality", "reason", "recommendedAction", "evidenceSummary"])
    return !Object.keys(item).some((key) => !keys.has(key)) && typeof item.findingId === "string" && typeof item.code === "string" && typeof item.severity === "string" && typeof item.riskContribution === "number" && typeof item.confidence === "number" && typeof item.dataQuality === "number" && typeof item.reason === "string" && typeof item.recommendedAction === "string" && !!item.evidenceSummary && typeof item.evidenceSummary === "object" && !Array.isArray(item.evidenceSummary)
  })
}

function parseJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  return JSON.parse(trimmed)
}

function validateOutput(payload: MiniFuelAnomalyExplanationPayload, value: unknown): { summary: string; findingExplanations: Array<{ findingId: string; explanation: string }>; investigationQuestions: string[] } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_FUEL_ANOMALY_MODEL_OUTPUT")
  const obj = value as Record<string, unknown>
  const allowed = new Set(["summary", "findingExplanations", "investigationQuestions"])
  if (Object.keys(obj).some((key) => !allowed.has(key)) || typeof obj.summary !== "string" || !Array.isArray(obj.findingExplanations) || !Array.isArray(obj.investigationQuestions)) throw new Error("INVALID_FUEL_ANOMALY_MODEL_OUTPUT")
  const expected = payload.findings.map((finding) => finding.findingId)
  const explanations = obj.findingExplanations.map((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("INVALID_FUEL_ANOMALY_MODEL_OUTPUT")
    const item = entry as Record<string, unknown>
    if (Object.keys(item).some((key) => key !== "findingId" && key !== "explanation") || typeof item.findingId !== "string" || typeof item.explanation !== "string") throw new Error("INVALID_FUEL_ANOMALY_MODEL_OUTPUT")
    return { findingId: item.findingId, explanation: item.explanation.trim() }
  })
  const ids = explanations.map((item) => item.findingId)
  if (ids.length !== expected.length || ids.length !== new Set(ids).size || ids.some((id) => !expected.includes(id))) throw new Error("INVALID_FUEL_ANOMALY_MODEL_OUTPUT")
  const text = [obj.summary, ...explanations.map((item) => item.explanation), ...obj.investigationQuestions].join(" ")
  if (/\b(?:theft|fraud)\s+(?:is\s+)?(?:confirmed|proven)\b|\bstole\s+fuel\b|\bis\s+stealing\b/i.test(text)) throw new Error("INVALID_FUEL_ANOMALY_MODEL_OUTPUT")
  const byId = new Map(explanations.map((item) => [item.findingId, item]))
  return {
    summary: obj.summary.trim(),
    findingExplanations: expected.map((id) => byId.get(id)!),
    investigationQuestions: obj.investigationQuestions.filter((item): item is string => typeof item === "string").slice(0, 12).map((item) => item.trim()),
  }
}

export async function explainFuelAnomalyPayload(
  payload: MiniFuelAnomalyExplanationPayload,
  callModel: (prompt: string) => Promise<string>,
  provenance: { provider: string; model: string },
) {
  if (!isPayload(payload)) throw new Error("INVALID_FUEL_ANOMALY_EXPLANATION_PAYLOAD")
  const prompt = `Explain this already-determined fuel anomaly assessment without changing any finding or score:\n${JSON.stringify(payload)}`
  const raw = await callModel(prompt)
  let parsed: unknown
  try { parsed = parseJson(raw) } catch { throw new Error("INVALID_FUEL_ANOMALY_MODEL_OUTPUT") }
  return { provider: provenance.provider, model: provenance.model, explanation: validateOutput(payload, parsed) }
}
