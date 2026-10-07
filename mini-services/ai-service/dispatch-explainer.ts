export type DispatchExplanationCandidate = {
  driverId: string
  truckId: string
  score: number
  confidence: number
  dataQuality: number
  components?: unknown
  reasons?: string[]
}

export type DispatchExplanationRequest = {
  tripDetails: Record<string, unknown>
  candidates: DispatchExplanationCandidate[]
  rulesetVersion: string | null
  prompt: string
}

export type DispatchExplanationResponse = {
  summary: string | null
  explanations: Array<{
    driverId: string
    truckId: string
    explanation: string
  }>
}

const MAX_SUMMARY_LENGTH = 1500
const MAX_EXPLANATION_LENGTH = 1000
const AUTHORITY_FIELDS = new Set([
  "score",
  "confidence",
  "dataQuality",
  "eligible",
  "eligibility",
  "approved",
  "assigned",
  "assignment",
  "rank",
  "ranking",
])

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

function boundedText(value: unknown, maxLength: number, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be non-empty text`)
  return value.trim().slice(0, maxLength)
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed.startsWith("```")) return trimmed
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim()
}

export function buildDispatchExplanationRequest(body: unknown): DispatchExplanationRequest {
  const input = asRecord(body, "Dispatch explanation request")
  if (input.explanationOnly !== true) {
    throw new Error("Dispatch AI requires explanationOnly=true")
  }
  if ("availableDrivers" in input || "availableTrucks" in input) {
    throw new Error("Dispatch AI rejects caller-supplied candidate authority")
  }
  if (!Array.isArray(input.rankedCandidates)) {
    throw new Error("rankedCandidates must be an array")
  }

  const seen = new Set<string>()
  const candidates = input.rankedCandidates.map((raw, index): DispatchExplanationCandidate => {
    const candidate = asRecord(raw, `rankedCandidates[${index}]`)
    if (typeof candidate.driverId !== "string" || !candidate.driverId.trim()) {
      throw new Error(`rankedCandidates[${index}].driverId is required`)
    }
    if (typeof candidate.truckId !== "string" || !candidate.truckId.trim()) {
      throw new Error(`rankedCandidates[${index}].truckId is required`)
    }
    const key = `${candidate.driverId}:${candidate.truckId}`
    if (seen.has(key)) throw new Error("rankedCandidates contains a duplicate pair")
    seen.add(key)

    return {
      driverId: candidate.driverId,
      truckId: candidate.truckId,
      score: finiteNumber(candidate.score, `rankedCandidates[${index}].score`),
      confidence: finiteNumber(candidate.confidence, `rankedCandidates[${index}].confidence`),
      dataQuality: finiteNumber(candidate.dataQuality, `rankedCandidates[${index}].dataQuality`),
      components: candidate.components,
      reasons: Array.isArray(candidate.reasons)
        ? candidate.reasons.filter((reason): reason is string => typeof reason === "string").slice(0, 8)
        : [],
    }
  })

  const tripDetails = input.tripDetails && typeof input.tripDetails === "object" && !Array.isArray(input.tripDetails)
    ? input.tripDetails as Record<string, unknown>
    : {}
  const rulesetVersion = typeof input.rulesetVersion === "string" ? input.rulesetVersion : null

  const prompt = [
    "explain only the server-ranked driver/truck pairs supplied below.",
    "Do not add, remove, reorder, rescore, approve, or assign any candidate.",
    "The numeric scores and eligibility decisions are authoritative application output; use them only as context for concise explanations.",
    "Return ONLY JSON with this shape: {\"summary\":\"...\",\"explanations\":[{\"driverId\":\"...\",\"truckId\":\"...\",\"explanation\":\"...\"}]}.",
    JSON.stringify({ tripDetails, rulesetVersion, rankedCandidates: candidates }),
  ].join("\n")

  return { tripDetails, candidates, rulesetVersion, prompt }
}

export function parseDispatchExplanationResponse(
  rawResponse: string,
  allowedCandidates: Array<Pick<DispatchExplanationCandidate, "driverId" | "truckId">>,
): DispatchExplanationResponse {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonFence(rawResponse))
  } catch {
    throw new Error("Dispatch AI response must be valid JSON")
  }

  const object = asRecord(parsed, "Dispatch AI response")
  for (const key of Object.keys(object)) {
    if (AUTHORITY_FIELDS.has(key) || key === "recommendations" || key === "candidates") {
      throw new Error("Dispatch AI response contains authority-bearing fields")
    }
  }
  if (!Array.isArray(object.explanations)) {
    throw new Error("Dispatch AI response explanations must be an array")
  }

  const allowed = new Set(allowedCandidates.map((candidate) => `${candidate.driverId}:${candidate.truckId}`))
  const seen = new Set<string>()
  const explanations = object.explanations.map((raw, index) => {
    const row = asRecord(raw, `explanations[${index}]`)
    for (const key of Object.keys(row)) {
      if (AUTHORITY_FIELDS.has(key)) {
        throw new Error("Dispatch AI explanation contains authority-bearing fields")
      }
    }
    if (typeof row.driverId !== "string" || typeof row.truckId !== "string") {
      throw new Error("Dispatch AI explanation must identify a supplied candidate pair")
    }
    const key = `${row.driverId}:${row.truckId}`
    if (!allowed.has(key)) throw new Error("Dispatch AI returned an unknown candidate")
    if (seen.has(key)) throw new Error("Dispatch AI returned a duplicate candidate explanation")
    seen.add(key)

    return {
      driverId: row.driverId,
      truckId: row.truckId,
      explanation: boundedText(row.explanation, MAX_EXPLANATION_LENGTH, "Dispatch AI explanation"),
    }
  })

  return {
    summary: object.summary == null ? null : boundedText(object.summary, MAX_SUMMARY_LENGTH, "Dispatch AI summary"),
    explanations,
  }
}
