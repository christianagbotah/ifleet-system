import { getAiServiceConfig, type AiServiceConfig } from "@/lib/config/ai-service"
import {
  buildDispatchExplanationPayload,
  mergeDispatchExplanations,
  type DispatchExplanationInput,
  type MergedDispatchExplanations,
} from "./model-payload"

type DispatchExplainerDependencies = {
  config?: AiServiceConfig
  fetcher?: typeof fetch
  timeoutMs?: number
}

type LegacyAiServiceEnvelope = {
  success?: boolean
  response?: unknown
  data?: unknown
  error?: unknown
}

function deterministicFallback(input: DispatchExplanationInput): MergedDispatchExplanations {
  return mergeDispatchExplanations(input.rankedCandidates, null)
}

function normalizeModelResponse(raw: unknown): unknown {
  let value = raw
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>

  if (Array.isArray(object.explanations)) return object

  if (Array.isArray(object.recommendations)) {
    return {
      summary: object.summary,
      explanations: object.recommendations.map((row) => {
        if (!row || typeof row !== "object") return row
        const recommendation = row as Record<string, unknown>
        return {
          driverId: recommendation.driverId,
          truckId: recommendation.truckId,
          explanation: recommendation.explanation ?? recommendation.reason,
        }
      }),
    }
  }

  return null
}

export async function explainDispatchRanking(
  input: DispatchExplanationInput,
  dependencies: DispatchExplainerDependencies = {},
): Promise<MergedDispatchExplanations> {
  const safePayload = buildDispatchExplanationPayload(input)
  const fetcher = dependencies.fetcher ?? fetch
  const timeoutMs = Math.max(250, Math.min(10_000, dependencies.timeoutMs ?? 2_500))

  let config: AiServiceConfig
  try {
    config = dependencies.config ?? getAiServiceConfig()
  } catch {
    return deterministicFallback(input)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetcher(`${config.url}/api/dispatch-suggest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-api-key": config.internalApiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        explanationOnly: true,
        tripDetails: safePayload.trip,
        rankedCandidates: safePayload.candidates,
        rulesetVersion: safePayload.rulesetVersion,
      }),
    })

    if (!response.ok) return deterministicFallback(input)

    const envelope = await response.json().catch(() => null) as LegacyAiServiceEnvelope | null
    if (!envelope || envelope.success === false) return deterministicFallback(input)

    const normalized = normalizeModelResponse(envelope.response ?? envelope.data ?? envelope)
    return mergeDispatchExplanations(input.rankedCandidates, normalized)
  } catch {
    return deterministicFallback(input)
  } finally {
    clearTimeout(timeout)
  }
}
