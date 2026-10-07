import { describe, expect, test } from "bun:test"
import type { FuelAnomalyStoredAssessment } from "@/lib/services/fuel-anomaly-assessment-service"
import { explainFuelAnomalyAssessment } from "./explainer-client"

function assessment(): FuelAnomalyStoredAssessment {
  const now = new Date("2026-10-07T15:00:00Z")
  return {
    id: "assessment-1", subjectType: "trip", subjectKey: "trip-1", fuelLogId: null, tripId: "trip-1", truckId: "truck-1", requestedBy: "manager-1", requestedAt: now,
    rulesetVersion: "fuel-rules-v1", baselineVersion: "fuel-baseline-v1", inputHash: "abc", inputSnapshot: "{}", overallRiskScore: 45,
    overallSeverity: "medium", confidence: 0.8, dataQuality: 0.8, status: "open", explanationSource: null, explanationProvider: null, explanationModel: null,
    explanationOutput: null, explanationAt: null, reviewedBy: null, reviewedAt: null, reviewNotes: null, outcomeCode: null, createdAt: now, updatedAt: now,
    findings: [{ id: "finding-1", assessmentId: "assessment-1", code: "FUEL_PRICE_OUTLIER", severity: "medium", riskContribution: 12, confidence: 0.8, dataQuality: 0.8, evidence: "{}", reason: "Price variance requires review.", recommendedAction: "Check station/date evidence.", fuelLogId: null, tripId: "trip-1", truckId: "truck-1", driverId: null, createdAt: now }], reviewEvents: [],
  }
}

describe("fuel anomaly explainer client", () => {
  test("returns validated AI explanation with provider/model provenance", async () => {
    let sent = ""
    const result = await explainFuelAnomalyAssessment(assessment(), {
      config: { url: "http://ai.internal", internalApiKey: "secret" },
      fetch: async (_url, init) => {
        sent = String(init?.body ?? "")
        return { ok: true, json: async () => ({ success: true, provider: "groq", model: "model-x", explanation: { summary: "Review one fuel variance.", findingExplanations: [{ findingId: "finding-1", explanation: "The server-determined price variance is unusual." }], investigationQuestions: ["Verify station/date pricing."] } }) }
      },
      timeoutMs: 100,
    })
    expect(result.source).toBe("ai")
    expect(result.provider).toBe("groq")
    expect(result.model).toBe("model-x")
    expect(sent).not.toContain("inputSnapshot")
    expect(sent).not.toContain("manager-1")
  })

  test("provider error falls back deterministically without changing findings", async () => {
    const result = await explainFuelAnomalyAssessment(assessment(), {
      config: { url: "http://ai.internal", internalApiKey: "secret" },
      fetch: async () => { throw new Error("offline") },
      timeoutMs: 100,
    })
    expect(result.source).toBe("deterministic_fallback")
    expect(result.provider).toBeNull()
    expect(result.model).toBeNull()
    expect(result.findingExplanations).toEqual([{ findingId: "finding-1", explanation: "Price variance requires review." }])
  })

  test("malicious authority-bearing provider output falls back deterministically", async () => {
    const result = await explainFuelAnomalyAssessment(assessment(), {
      config: { url: "http://ai.internal", internalApiKey: "secret" },
      fetch: async () => ({ ok: true, json: async () => ({ success: true, provider: "groq", model: "model-x", explanation: { summary: "Review", severity: "critical", findingExplanations: [{ findingId: "finding-1", explanation: "x" }], investigationQuestions: [] } }) }),
      timeoutMs: 100,
    })
    expect(result.source).toBe("deterministic_fallback")
  })
})
