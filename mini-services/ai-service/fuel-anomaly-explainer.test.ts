import { describe, expect, test } from "bun:test"
import { explainFuelAnomalyPayload } from "./fuel-anomaly-explainer"

const payload = {
  assessmentId: "assessment-1", overallRiskScore: 45, overallSeverity: "medium", confidence: 0.8, dataQuality: 0.8,
  findings: [{ findingId: "finding-1", code: "FUEL_PRICE_OUTLIER", severity: "medium", riskContribution: 12, confidence: 0.8, dataQuality: 0.8, reason: "Price variance requires review.", recommendedAction: "Check station/date evidence.", evidenceSummary: {} }],
}

describe("AI mini-service fuel anomaly explainer", () => {
  test("accepts only sanitized assessment payload and reports provider/model provenance", async () => {
    const result = await explainFuelAnomalyPayload(payload, async () => JSON.stringify({ summary: "Review the variance.", findingExplanations: [{ findingId: "finding-1", explanation: "Compare station pricing." }], investigationQuestions: ["Check receipt pricing."] }), { provider: "groq", model: "model-x" })
    expect(result.provider).toBe("groq")
    expect(result.model).toBe("model-x")
    expect(result.explanation.findingExplanations[0]?.findingId).toBe("finding-1")
  })

  test("rejects caller-owned raw fuel logs and authority-bearing output", async () => {
    await expect(explainFuelAnomalyPayload({ ...payload, fuelLogs: [{ liters: 10 }] } as never, async () => "{}", { provider: "groq", model: "x" })).rejects.toThrow("INVALID_FUEL_ANOMALY_EXPLANATION_PAYLOAD")
    await expect(explainFuelAnomalyPayload(payload, async () => JSON.stringify({ summary: "Review", severity: "critical", findingExplanations: [{ findingId: "finding-1", explanation: "x" }], investigationQuestions: [] }), { provider: "groq", model: "x" })).rejects.toThrow("INVALID_FUEL_ANOMALY_MODEL_OUTPUT")
  })
})
