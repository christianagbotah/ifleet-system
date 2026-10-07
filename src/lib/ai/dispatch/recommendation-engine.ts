import {
  rankEligibleDispatchCandidates,
  type BlockedDispatchResource,
  type DispatchDriverEvidence,
  type DispatchTruckEvidence,
} from "./candidate-ranking"
import type { DispatchEligibilityContext } from "./types"
import {
  buildDispatchExplanationPayload,
  mergeDispatchExplanations,
  type DispatchExplanationPayload,
  type DispatchExplanationTripSource,
  type DispatchRecommendationWithExplanation,
} from "./model-payload"

export type DispatchRecommendationEngineInput = {
  context: DispatchEligibilityContext
  trip: DispatchExplanationTripSource
  drivers: DispatchDriverEvidence[]
  trucks: DispatchTruckEvidence[]
  maxRecommendations?: number
}

export type DispatchExplanationClient = (
  payload: DispatchExplanationPayload,
) => Promise<unknown>

export type DispatchRecommendationEngineResult = {
  explanationSource: "ai" | "deterministic"
  explanationError: string | null
  summary: string | null
  candidates: DispatchRecommendationWithExplanation[]
  blockedDrivers: BlockedDispatchResource[]
  blockedTrucks: BlockedDispatchResource[]
}

function recommendationLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 5
  return Math.min(10, Math.max(1, Math.floor(value as number)))
}

export async function generateDispatchRecommendations(
  input: DispatchRecommendationEngineInput,
  explain?: DispatchExplanationClient,
): Promise<DispatchRecommendationEngineResult> {
  const ranking = rankEligibleDispatchCandidates(input.drivers, input.trucks, input.context)
  const ranked = ranking.ranked.slice(0, recommendationLimit(input.maxRecommendations))

  if (!explain || ranked.length === 0) {
    const merged = mergeDispatchExplanations(ranked, null)
    return {
      ...merged,
      explanationError: null,
      blockedDrivers: ranking.blockedDrivers,
      blockedTrucks: ranking.blockedTrucks,
    }
  }

  try {
    const payload = buildDispatchExplanationPayload({
      trip: input.trip,
      rankedCandidates: ranked,
    })
    const response = await explain(payload)
    const merged = mergeDispatchExplanations(ranked, response)

    return {
      ...merged,
      explanationError: null,
      blockedDrivers: ranking.blockedDrivers,
      blockedTrucks: ranking.blockedTrucks,
    }
  } catch (error) {
    const merged = mergeDispatchExplanations(ranked, null)
    return {
      ...merged,
      explanationError: error instanceof Error ? error.message : "AI explanation provider failed",
      blockedDrivers: ranking.blockedDrivers,
      blockedTrucks: ranking.blockedTrucks,
    }
  }
}
