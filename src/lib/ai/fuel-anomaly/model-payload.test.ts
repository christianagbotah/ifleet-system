import { describe, expect, test } from "bun:test"
import type { FuelAnomalyStoredAssessment } from "@/lib/services/fuel-anomaly-assessment-service"
import { buildFuelAnomalyExplanationPayload, mergeFuelAnomalyExplanation } from "./model-payload"

function assessment(): FuelAnomalyStoredAssessment {
  const now = new Date("2026-10-07T15:00:00Z")
  return {
    id: "assessment-1", subjectType: "trip", subjectKey: "trip-1", fuelLogId: null, tripId: "trip-1", truckId: "truck-1",
    requestedBy: "user-secret", requestedAt: now, rulesetVersion: "fuel-rules-v1", baselineVersion: "fuel-baseline-v1",
    inputHash: "abc", inputSnapshot: JSON.stringify({ driverPhone: "0240000000", licenseNumber: "SECRET", openingTankLiters: 20 }),
    overallRiskScore: 45, overallSeverity: "medium", confidence: 0.82, dataQuality: 0.76, status: "open",
    explanationSource: null, explanationProvider: null, explanationModel: null, explanationOutput: null, explanationAt: null,
    reviewedBy: null, reviewedAt: null, reviewNotes: null, outcomeCode: null, createdAt: now, updatedAt: now,
    findings: [{
      id: "finding-1", assessmentId: "assessment-1", code: "FUEL_TANK_LOSS_UNEXPLAINED", severity: "high", riskContribution: 45,
      confidence: 0.92, dataQuality: 0.88, evidence: JSON.stringify({ liters: 15, stationName: "Station A", driverPhone: "0240000000", licenseNumber: "SECRET" }),
      reason: "Tank balance requires review.", recommendedAction: "Review verified tank evidence.", fuelLogId: null, tripId: "trip-1", truckId: "truck-1", driverId: "driver-1", createdAt: now,
    }],
    reviewEvents: [],
  }
}

describe("fuel anomaly explanation payload", () => {
  test("sends only bounded assessment/finding fields and strips sensitive evidence keys", () => {
    const payload = buildFuelAnomalyExplanationPayload(assessment())
    const text = JSON.stringify(payload)
    expect(payload.assessmentId).toBe("assessment-1")
    expect(payload.findings).toHaveLength(1)
    expect(text).not.toContain("inputSnapshot")
    expect(text).not.toContain("requestedBy")
    expect(text).not.toContain("driverPhone")
    expect(text).not.toContain("licenseNumber")
    expect(text).not.toContain("0240000000")
    expect(text).not.toContain("user-secret")
    expect(payload.findings[0]?.severity).toBe("high")
    expect(payload.findings[0]?.riskContribution).toBe(45)
  })

  test("accepts explanations only for the exact server-owned finding set", () => {
    const payload = buildFuelAnomalyExplanationPayload(assessment())
    const result = mergeFuelAnomalyExplanation(payload, {
      summary: "One fuel variance requires review.",
      findingExplanations: [{ findingId: "finding-1", explanation: "The verified tank balance differs from reconciled consumption." }],
      investigationQuestions: ["Can the verified tank observations be cross-checked?"],
    })
    expect(result.findingExplanations.map((item) => item.findingId)).toEqual(["finding-1"])
  })

  test("rejects invented, missing, duplicate or authority-bearing finding output", () => {
    const payload = buildFuelAnomalyExplanationPayload(assessment())
    expect(() => mergeFuelAnomalyExplanation(payload, { summary: "Review", findingExplanations: [{ findingId: "fake", explanation: "x" }], investigationQuestions: [] })).toThrow("AI_EXPLANATION_FINDING_SET_MISMATCH")
    expect(() => mergeFuelAnomalyExplanation(payload, { summary: "Review", findingExplanations: [], investigationQuestions: [] })).toThrow("AI_EXPLANATION_FINDING_SET_MISMATCH")
    expect(() => mergeFuelAnomalyExplanation(payload, { summary: "Review", severity: "critical", findingExplanations: [{ findingId: "finding-1", explanation: "x" }], investigationQuestions: [] })).toThrow("AI_EXPLANATION_AUTHORITY_FIELD")
  })

  test("rejects model language that asserts theft or fraud as fact", () => {
    const payload = buildFuelAnomalyExplanationPayload(assessment())
    expect(() => mergeFuelAnomalyExplanation(payload, {
      summary: "Theft confirmed by the driver.",
      findingExplanations: [{ findingId: "finding-1", explanation: "The driver stole fuel." }],
      investigationQuestions: [],
    })).toThrow("AI_EXPLANATION_ACCUSATORY_LANGUAGE")
  })
})
