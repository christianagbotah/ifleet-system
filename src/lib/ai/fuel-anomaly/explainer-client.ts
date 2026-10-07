import { getAiServiceConfig, type AiServiceConfig } from "@/lib/config/ai-service"
import type { FuelAnomalyStoredAssessment } from "@/lib/services/fuel-anomaly-assessment-service"
import {
  buildFuelAnomalyExplanationPayload,
  mergeFuelAnomalyExplanation,
  type FuelAnomalyExplanationContent,
} from "./model-payload"

export type FuelAnomalyFetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>

export type FuelAnomalyExplanationResult = FuelAnomalyExplanationContent & {
  source: "ai" | "deterministic_fallback"
  provider: string | null
  model: string | null
}

export type FuelAnomalyExplainerDependencies = {
  config?: AiServiceConfig
  fetch?: FuelAnomalyFetchLike
  timeoutMs?: number
}

function fallback(assessment: FuelAnomalyStoredAssessment): FuelAnomalyExplanationResult {
  return {
    source: "deterministic_fallback",
    provider: null,
    model: null,
    summary: `Assessment contains ${assessment.findings.length} server-determined fuel variance finding(s) at ${assessment.overallSeverity} review priority. Review the underlying verified evidence before taking action.`,
    findingExplanations: assessment.findings.map((finding) => ({ findingId: finding.id, explanation: finding.reason })),
    investigationQuestions: [],
  }
}

export async function explainFuelAnomalyAssessment(
  assessment: FuelAnomalyStoredAssessment,
  dependencies: FuelAnomalyExplainerDependencies = {},
): Promise<FuelAnomalyExplanationResult> {
  try {
    const config = dependencies.config ?? getAiServiceConfig()
    const fetcher = dependencies.fetch ?? (async (url, init) => fetch(url, init))
    const timeoutMs = dependencies.timeoutMs ?? 5000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const payload = buildFuelAnomalyExplanationPayload(assessment)
      const response = await fetcher(`${config.url}/api/fuel-anomaly`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-api-key": config.internalApiKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
      if (!response.ok) throw new Error(`AI_SERVICE_HTTP_${response.status ?? "ERROR"}`)
      const raw = await response.json()
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("AI_SERVICE_MALFORMED_RESPONSE")
      const envelope = raw as Record<string, unknown>
      if (envelope.success !== true || typeof envelope.provider !== "string" || typeof envelope.model !== "string") throw new Error("AI_SERVICE_MALFORMED_RESPONSE")
      const content = mergeFuelAnomalyExplanation(payload, envelope.explanation)
      return { source: "ai", provider: envelope.provider, model: envelope.model, ...content }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return fallback(assessment)
  }
}
