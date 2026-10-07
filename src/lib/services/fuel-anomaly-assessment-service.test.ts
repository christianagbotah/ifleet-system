import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { FuelAnomalyFindingDraft, FuelAssessmentEvidence } from "@/lib/domain/fuel-intelligence/types"
import {
  assessFuelAnomaly,
  canonicalFuelEvidence,
  getFuelAnomalyAssessment,
  recordFuelAnomalyReview,
  recordFuelAnomalyExplanation,
  type FuelAnomalyAssessmentCreateInput,
  type FuelAnomalyAssessmentDependencies,
  type FuelAnomalyAssessmentStore,
  type FuelAnomalyStoredAssessment,
} from "./fuel-anomaly-assessment-service"

function evidence(distanceKm = 200): FuelAssessmentEvidence {
  return {
    subject: { tripId: "trip-1" }, subjectType: "trip", subjectKey: "trip-1",
    fuelLogId: null, tripId: "trip-1", truckId: "truck-1", driverId: "driver-1",
    routeKey: "route-a", truckClass: null, truckTankCapacityLiters: 200,
    physicalEfficiencyBounds: null, distanceKm, reconciledConsumedLiters: 40,
    reconciliationExceptionCount: 0, openingTankLiters: null, closingTankLiters: null,
    netFuelAddedLiters: 40, fuelEvents: [],
    comparableCohorts: { truckRoute: [], truck: [], route: [], fleet: [] },
    evidenceAvailability: {
      tankCapacity: "known", tankLevels: "unavailable", distance: "known",
      reconciliation: "known", gps: "unavailable", routeGeofence: "unavailable",
      physicalEfficiencyBounds: "unavailable", comparableHistory: "unavailable",
    },
  }
}

function draft(code: FuelAnomalyFindingDraft["code"] = "FUEL_ADDED_WITH_NO_DISTANCE"): FuelAnomalyFindingDraft {
  return {
    code, severity: "medium", riskContribution: 15, confidence: 0.8, dataQuality: 0.8,
    strongEvidence: false, correlationKey: "movement:fuel", evidence: { source: "verified" },
    reason: "Requires review", recommendedAction: "Review evidence", fuelLogId: null,
    tripId: "trip-1", truckId: "truck-1", driverId: "driver-1",
  }
}

function memoryStore() {
  const rows = new Map<string, FuelAnomalyStoredAssessment>()
  const createInputs: FuelAnomalyAssessmentCreateInput[] = []
  let nextId = 1
  const store: FuelAnomalyAssessmentStore = {
    async findByIdentity(identity) {
      return [...rows.values()].find((row) =>
        row.subjectType === identity.subjectType && row.subjectKey === identity.subjectKey &&
        row.rulesetVersion === identity.rulesetVersion && row.baselineVersion === identity.baselineVersion &&
        row.inputHash === identity.inputHash,
      ) ?? null
    },
    async create(input) {
      createInputs.push(input)
      const now = new Date("2026-10-07T12:00:00Z")
      const row: FuelAnomalyStoredAssessment = {
        id: `assessment-${nextId++}`,
        ...input.assessment,
        requestedAt: now,
        status: "open",
        explanationSource: null, explanationProvider: null, explanationModel: null,
        explanationOutput: null, explanationAt: null, reviewedBy: null, reviewedAt: null,
        reviewNotes: null, outcomeCode: null, createdAt: now, updatedAt: now,
        findings: input.findings.map((item, index) => ({ id: `finding-${index + 1}`, assessmentId: `assessment-${nextId - 1}`, createdAt: now, ...item })),
        reviewEvents: [],
      }
      rows.set(row.id, row)
      return row
    },
    async getById(id) { return rows.get(id) ?? null },
    async recordExplanation(input) {
      const current = rows.get(input.assessmentId)
      if (!current) throw new Error("missing")
      const updated: FuelAnomalyStoredAssessment = {
        ...current, explanationSource: input.source, explanationProvider: input.provider,
        explanationModel: input.model, explanationOutput: input.output, explanationAt: input.explainedAt,
        updatedAt: input.explainedAt,
      }
      rows.set(current.id, updated)
      return updated
    },
    async transitionReview(input) {
      const current = rows.get(input.assessmentId)
      if (!current) throw new Error("missing")
      const event = {
        id: `review-${current.reviewEvents.length + 1}`, assessmentId: current.id,
        fromStatus: input.fromStatus, toStatus: input.toStatus, outcomeCode: input.outcomeCode,
        notes: input.notes, actorId: input.actorId, createdAt: input.reviewedAt,
      }
      const updated: FuelAnomalyStoredAssessment = {
        ...current,
        status: input.toStatus,
        outcomeCode: input.outcomeCode,
        reviewNotes: input.notes,
        reviewedBy: input.actorId,
        reviewedAt: input.reviewedAt,
        updatedAt: input.reviewedAt,
        reviewEvents: [...current.reviewEvents, event],
      }
      rows.set(current.id, updated)
      return updated
    },
  }
  return { store, rows, createInputs }
}

function deps(store: FuelAnomalyAssessmentStore, source = evidence()) {
  let ruleCalls = 0
  let baselineCalls = 0
  const logs: Array<{ event: string; metadata: Record<string, unknown> }> = []
  const dependencies: FuelAnomalyAssessmentDependencies = {
    loadEvidence: async () => structuredClone(source),
    evaluateRules: () => { ruleCalls += 1; return [draft()] },
    evaluateBaselines: () => { baselineCalls += 1; return [] },
    aggregate: () => ({ overallRiskScore: 15, overallSeverity: "info", confidence: 0.8, dataQuality: 0.8, contributions: [{ code: "FUEL_ADDED_WITH_NO_DISTANCE", appliedRisk: 15, correlationKey: "movement:fuel" }] }),
    store,
    now: () => new Date("2026-10-07T12:00:00Z"),
    logger: { info: (event, metadata) => logs.push({ event, metadata }) },
  }
  return { dependencies, logs, calls: () => ({ ruleCalls, baselineCalls }) }
}

const actor = { userId: "manager-1", roleName: "Manager" }

describe("fuel anomaly assessment service", () => {
  test("orchestrates evidence, deterministic findings, aggregation and immutable provenance persistence", async () => {
    const mem = memoryStore()
    const harness = deps(mem.store)
    const result = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    expect(result.id).toBe("assessment-1")
    expect(result.rulesetVersion).toBe("fuel-rules-v1")
    expect(result.baselineVersion).toBe("fuel-baseline-v1")
    expect(result.findings).toHaveLength(1)
    expect(result.overallRiskScore).toBe(15)
    expect(mem.createInputs).toHaveLength(1)
    expect(mem.createInputs[0].assessment.inputSnapshot).toBe(canonicalFuelEvidence(evidence()))
    expect(mem.createInputs[0].assessment.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(harness.calls()).toEqual({ ruleCalls: 1, baselineCalls: 1 })
  })

  test("reuses an identical subject + evidence hash + versions without re-running findings", async () => {
    const mem = memoryStore()
    const harness = deps(mem.store)
    const first = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    const second = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    expect(second.id).toBe(first.id)
    expect(mem.createInputs).toHaveLength(1)
    expect(harness.calls()).toEqual({ ruleCalls: 1, baselineCalls: 1 })
  })

  test("creates a new assessment when evidence or version changes instead of rewriting history", async () => {
    const mem = memoryStore()
    const firstHarness = deps(mem.store, evidence(200))
    const first = await assessFuelAnomaly({ tripId: "trip-1" }, actor, firstHarness.dependencies)
    const secondHarness = deps(mem.store, evidence(250))
    const second = await assessFuelAnomaly({ tripId: "trip-1" }, actor, secondHarness.dependencies)
    const versionHarness = deps(mem.store, evidence(250))
    versionHarness.dependencies.policy = { ...versionHarness.dependencies.policy!, rulesetVersion: "fuel-rules-v2" }
    const third = await assessFuelAnomaly({ tripId: "trip-1" }, actor, versionHarness.dependencies)
    expect(new Set([first.id, second.id, third.id]).size).toBe(3)
    expect(mem.rows.get(first.id)?.inputHash).not.toBe(mem.rows.get(second.id)?.inputHash)
    expect(mem.rows.get(third.id)?.rulesetVersion).toBe("fuel-rules-v2")
  })

  test("records only allowed review transitions and append-only history", async () => {
    const mem = memoryStore()
    const harness = deps(mem.store)
    const created = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    await expect(recordFuelAnomalyReview(created.id, { toStatus: "investigating", notes: "skip" }, actor, harness.dependencies)).rejects.toThrow("INVALID_REVIEW_TRANSITION")
    const acknowledged = await recordFuelAnomalyReview(created.id, { toStatus: "acknowledged", notes: "seen" }, actor, harness.dependencies)
    const investigating = await recordFuelAnomalyReview(created.id, { toStatus: "investigating", notes: "checking" }, actor, harness.dependencies)
    const resolved = await recordFuelAnomalyReview(created.id, { toStatus: "resolved", outcomeCode: "verified_legitimate", notes: "receipt verified" }, actor, harness.dependencies)
    expect(acknowledged.reviewEvents).toHaveLength(1)
    expect(investigating.reviewEvents).toHaveLength(2)
    expect(resolved.reviewEvents).toHaveLength(3)
    expect(resolved.outcomeCode).toBe("verified_legitimate")
    expect(resolved.reviewedBy).toBe(actor.userId)
  })

  test("requires a valid terminal outcome and supports auditable reopening", async () => {
    const mem = memoryStore()
    const harness = deps(mem.store)
    const created = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    await recordFuelAnomalyReview(created.id, { toStatus: "acknowledged" }, actor, harness.dependencies)
    await recordFuelAnomalyReview(created.id, { toStatus: "investigating" }, actor, harness.dependencies)
    await expect(recordFuelAnomalyReview(created.id, { toStatus: "resolved" }, actor, harness.dependencies)).rejects.toThrow("OUTCOME_REQUIRED")
    await expect(recordFuelAnomalyReview(created.id, { toStatus: "resolved", outcomeCode: "theft_confirmed" as never }, actor, harness.dependencies)).rejects.toThrow("INVALID_OUTCOME")
    const resolved = await recordFuelAnomalyReview(created.id, { toStatus: "resolved", outcomeCode: "insufficient_evidence" }, actor, harness.dependencies)
    const reopened = await recordFuelAnomalyReview(created.id, { toStatus: "investigating", notes: "new receipt" }, actor, harness.dependencies)
    expect(resolved.reviewEvents).toHaveLength(3)
    expect(reopened.reviewEvents).toHaveLength(4)
    expect(reopened.reviewEvents.at(-1)?.fromStatus).toBe("resolved")
    expect(reopened.outcomeCode).toBeNull()
  })

  test("persists optional AI explanation audit without changing deterministic assessment authority", async () => {
    const mem = memoryStore()
    const harness = deps(mem.store)
    const created = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    const updated = await recordFuelAnomalyExplanation(created.id, {
      source: "ai", provider: "groq", model: "model-x",
      output: JSON.stringify({ summary: "Review the variance." }),
    }, harness.dependencies)
    expect(updated.explanationSource).toBe("ai")
    expect(updated.explanationProvider).toBe("groq")
    expect(updated.explanationModel).toBe("model-x")
    expect(updated.overallRiskScore).toBe(created.overallRiskScore)
    expect(updated.findings.map((item) => item.code)).toEqual(created.findings.map((item) => item.code))
  })

  test("retrieves persisted assessment detail without recomputation", async () => {
    const mem = memoryStore()
    const harness = deps(mem.store)
    const created = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    const detail = await getFuelAnomalyAssessment(created.id, harness.dependencies)
    expect(detail?.id).toBe(created.id)
    expect(harness.calls()).toEqual({ ruleCalls: 1, baselineCalls: 1 })
  })

  test("logs only audit identifiers and never dumps evidence snapshots", async () => {
    const mem = memoryStore()
    const harness = deps(mem.store)
    const created = await assessFuelAnomaly({ tripId: "trip-1" }, actor, harness.dependencies)
    expect(harness.logs.length).toBeGreaterThan(0)
    const serialized = JSON.stringify(harness.logs)
    expect(serialized).toContain(created.id)
    expect(serialized).not.toContain("inputSnapshot")
    expect(serialized).not.toContain("route-a")
    expect(serialized).not.toContain("source\":\"verified")
  })

  test("has no source-record mutation authority in the assessment service", () => {
    const source = readFileSync(join(import.meta.dir, "fuel-anomaly-assessment-service.ts"), "utf8")
    for (const forbidden of ["fuelLog.update", "fuelLog.create", "trip.update", "odometerReading.update", "tripReconciliation.update", "driver.update", "truck.update"]) {
      expect(source).not.toContain(forbidden)
    }
  })
})
