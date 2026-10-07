import { describe, expect, test } from "bun:test"
import type { FuelAnomalyActor, FuelAnomalyStoredAssessment } from "./fuel-anomaly-assessment-service"
import {
  normalizeFuelAnomalyShadowScanInput,
  scanFuelAnomalySubjects,
  type FuelAnomalyShadowScanDependencies,
} from "./fuel-anomaly-shadow-scan-service"

const startDate = new Date("2026-10-01T00:00:00Z")
const endDate = new Date("2026-10-07T00:00:00Z")
const actor: FuelAnomalyActor = { userId: "system:fuel-anomaly-shadow-scan", roleName: "System" }

function assessment(id: string): FuelAnomalyStoredAssessment {
  const now = new Date("2026-10-07T12:00:00Z")
  return {
    id, subjectType: "trip", subjectKey: id.replace("assessment-", ""), fuelLogId: null,
    tripId: id.replace("assessment-", ""), truckId: "truck-1", requestedBy: actor.userId,
    requestedAt: now, rulesetVersion: "fuel-rules-v1", baselineVersion: "fuel-baseline-v1",
    inputHash: id, inputSnapshot: "{}", overallRiskScore: 0, overallSeverity: "info",
    confidence: 0.8, dataQuality: 0.8, status: "open", explanationSource: null,
    explanationProvider: null, explanationModel: null, explanationOutput: null, explanationAt: null,
    reviewedBy: null, reviewedAt: null, reviewNotes: null, outcomeCode: null, createdAt: now,
    updatedAt: now, findings: [], reviewEvents: [],
  }
}

function deps(overrides: Partial<FuelAnomalyShadowScanDependencies> = {}): FuelAnomalyShadowScanDependencies {
  return {
    discoverSubjects: async () => [{ tripId: "trip-1" }, { tripId: "trip-2" }],
    assessSubject: async (subject) => assessment(`assessment-${"tripId" in subject ? subject.tripId : "other"}`),
    ...overrides,
  }
}

describe("fuel anomaly observer scan", () => {
  test("normalizes bounded window and limit policy", () => {
    expect(normalizeFuelAnomalyShadowScanInput({ startDate, endDate })).toEqual({ startDate, endDate, truckId: undefined, limit: 100 })
    expect(normalizeFuelAnomalyShadowScanInput({ startDate, endDate, limit: 999 })).toEqual({ startDate, endDate, truckId: undefined, limit: 250 })
    expect(() => normalizeFuelAnomalyShadowScanInput({ startDate: endDate, endDate: startDate })).toThrow("FUEL_ANOMALY_SCAN_INVALID_WINDOW")
    expect(() => normalizeFuelAnomalyShadowScanInput({ startDate, endDate: new Date("2026-11-15T00:00:00Z") })).toThrow("FUEL_ANOMALY_SCAN_WINDOW_TOO_LARGE")
  })

  test("delegates only discovered eligible subjects to the authoritative assessment service", async () => {
    const seen: unknown[] = []
    const result = await scanFuelAnomalySubjects({ startDate, endDate, limit: 2 }, actor, deps({
      assessSubject: async (subject) => { seen.push(subject); return assessment(`assessment-${"tripId" in subject ? subject.tripId : "other"}`) },
    }))
    expect(seen).toEqual([{ tripId: "trip-1" }, { tripId: "trip-2" }])
    expect(result.discovered).toBe(2)
    expect(result.processed).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.assessmentIds).toEqual(["assessment-trip-1", "assessment-trip-2"])
  })

  test("repeated scans remain idempotent through the assessment identity contract", async () => {
    const persisted = new Map<string, FuelAnomalyStoredAssessment>()
    let creates = 0
    const d = deps({
      discoverSubjects: async () => [{ tripId: "trip-1" }],
      assessSubject: async (subject) => {
        const key = subject.tripId ?? "other"
        if (!persisted.has(key)) { creates += 1; persisted.set(key, assessment(`assessment-${key}`)) }
        return persisted.get(key)!
      },
    })
    const first = await scanFuelAnomalySubjects({ startDate, endDate }, actor, d)
    const second = await scanFuelAnomalySubjects({ startDate, endDate }, actor, d)
    expect(first.assessmentIds).toEqual(second.assessmentIds)
    expect(creates).toBe(1)
  })

  test("changed evidence can yield a new assessment on a later observer pass", async () => {
    let revision = 1
    const d = deps({
      discoverSubjects: async () => [{ tripId: "trip-1" }],
      assessSubject: async () => assessment(`assessment-trip-1-r${revision}`),
    })
    const first = await scanFuelAnomalySubjects({ startDate, endDate }, actor, d)
    revision = 2
    const second = await scanFuelAnomalySubjects({ startDate, endDate }, actor, d)
    expect(first.assessmentIds).not.toEqual(second.assessmentIds)
  })

  test("honors per-run limits and isolates one subject failure", async () => {
    const result = await scanFuelAnomalySubjects({ startDate, endDate, limit: 2 }, actor, deps({
      discoverSubjects: async (input) => {
        expect(input.limit).toBe(2)
        return [{ tripId: "trip-1" }, { tripId: "trip-2" }]
      },
      assessSubject: async (subject) => {
        if ("tripId" in subject && subject.tripId === "trip-1") throw new Error("bad fixture")
        return assessment("assessment-trip-2")
      },
    }))
    expect(result.processed).toBe(1)
    expect(result.failed).toBe(1)
    expect(result.assessmentIds).toEqual(["assessment-trip-2"])
    expect(result.errors).toEqual([{ subjectKey: "trip:trip-1", error: "bad fixture" }])
  })
})
