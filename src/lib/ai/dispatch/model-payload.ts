import type { DispatchPairScore } from "./scoring"

export type DispatchExplanationTripSource = {
  departureTime?: string | null
  destinationZoneId?: string | null
  cargoUnit?: string | null
  quantity?: number | null
  [key: string]: unknown
}

export type DispatchExplanationCandidateSource = DispatchPairScore & Record<string, unknown>

export type DispatchExplanationInput = {
  trip: DispatchExplanationTripSource
  rankedCandidates: DispatchExplanationCandidateSource[]
}

export type DispatchExplanationPayload = {
  trip: {
    departureTime: string | null
    destinationZoneId: string | null
    cargoUnit: string | null
    quantity: number | null
  }
  rulesetVersion: string | null
  candidates: Array<{
    driverId: string
    truckId: string
    score: number
    confidence: number
    dataQuality: number
    components: DispatchPairScore["components"]
    reasons: string[]
  }>
}

export type DispatchRecommendationWithExplanation = DispatchPairScore & {
  explanation: string
}

export type MergedDispatchExplanations = {
  explanationSource: "ai" | "deterministic"
  summary: string | null
  candidates: DispatchRecommendationWithExplanation[]
}

const MAX_SUMMARY_LENGTH = 1500
const MAX_EXPLANATION_LENGTH = 1000

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, maxLength)
}

function deterministicExplanation(candidate: DispatchPairScore): string {
  if (candidate.reasons.length > 0) return candidate.reasons.join("; ")
  return `Deterministic dispatch score ${candidate.score.toFixed(2)} with ${(candidate.dataQuality * 100).toFixed(0)}% data quality`
}

export function buildDispatchExplanationPayload(input: DispatchExplanationInput): DispatchExplanationPayload {
  return {
    trip: {
      departureTime: typeof input.trip.departureTime === "string" ? input.trip.departureTime : null,
      destinationZoneId: typeof input.trip.destinationZoneId === "string" ? input.trip.destinationZoneId : null,
      cargoUnit: typeof input.trip.cargoUnit === "string" ? input.trip.cargoUnit : null,
      quantity: typeof input.trip.quantity === "number" && Number.isFinite(input.trip.quantity)
        ? input.trip.quantity
        : null,
    },
    rulesetVersion: input.rankedCandidates[0]?.rulesetVersion ?? null,
    candidates: input.rankedCandidates.map((candidate) => ({
      driverId: candidate.driverId,
      truckId: candidate.truckId,
      score: candidate.score,
      confidence: candidate.confidence,
      dataQuality: candidate.dataQuality,
      components: candidate.components,
      reasons: [...candidate.reasons],
    })),
  }
}

function deterministicFallback(ranked: DispatchPairScore[]): MergedDispatchExplanations {
  return {
    explanationSource: "deterministic",
    summary: null,
    candidates: ranked.map((candidate) => ({
      ...candidate,
      explanation: deterministicExplanation(candidate),
    })),
  }
}

export function mergeDispatchExplanations(
  ranked: DispatchPairScore[],
  modelResponse: unknown,
): MergedDispatchExplanations {
  if (!modelResponse || typeof modelResponse !== "object") return deterministicFallback(ranked)

  const response = modelResponse as Record<string, unknown>
  if (!Array.isArray(response.explanations)) return deterministicFallback(ranked)

  const allowed = new Map(
    ranked.map((candidate) => [`${candidate.driverId}:${candidate.truckId}`, candidate] as const),
  )
  const explanations = new Map<string, string>()

  for (const raw of response.explanations) {
    if (!raw || typeof raw !== "object") return deterministicFallback(ranked)
    const row = raw as Record<string, unknown>
    if (typeof row.driverId !== "string" || typeof row.truckId !== "string") {
      return deterministicFallback(ranked)
    }

    const key = `${row.driverId}:${row.truckId}`
    if (!allowed.has(key) || explanations.has(key)) return deterministicFallback(ranked)

    const explanation = boundedText(row.explanation, MAX_EXPLANATION_LENGTH)
    if (!explanation) return deterministicFallback(ranked)
    explanations.set(key, explanation)
  }

  const summary = boundedText(response.summary, MAX_SUMMARY_LENGTH)

  return {
    explanationSource: "ai",
    summary,
    candidates: ranked.map((candidate) => ({
      ...candidate,
      explanation: explanations.get(`${candidate.driverId}:${candidate.truckId}`)
        ?? deterministicExplanation(candidate),
    })),
  }
}
