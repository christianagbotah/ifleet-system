import { describe, expect, test } from "bun:test"
import type { FuelAnomalyStoredAssessment } from "./fuel-anomaly-assessment-service"
import {
  getFuelAnomalyAssessmentDetailView,
  getFuelAnomalyDashboardSummary,
  listFuelAnomalyAssessments,
  normalizeFuelAnomalyListQuery,
  normalizeFuelAnomalySummaryQuery,
  type FuelAnomalyQueryStore,
} from "./fuel-anomaly-query-service"

const d1 = new Date("2026-10-01T08:00:00Z")
const d2 = new Date("2026-10-02T08:00:00Z")
const d3 = new Date("2026-10-03T08:00:00Z")

function assessment(overrides: Partial<FuelAnomalyStoredAssessment> = {}): FuelAnomalyStoredAssessment {
  const id = overrides.id ?? "a1"
  const requestedAt = overrides.requestedAt ?? d1
  return {
    id,
    subjectType: "trip",
    subjectKey: `trip-${id}`,
    fuelLogId: null,
    tripId: `trip-${id}`,
    truckId: "truck-1",
    requestedBy: "manager-secret",
    requestedAt,
    rulesetVersion: "fuel-rules-v1",
    baselineVersion: "fuel-baseline-v1",
    inputHash: "hash-secret",
    inputSnapshot: JSON.stringify({
      routeKey: "zone-a->zone-b",
      fuelEvents: [{ stationName: "Station A" }],
      comparableCohorts: { truckRoute: Array(12).fill({ id: "x" }), truck: [], route: [], fleet: [] },
    }),
    overallRiskScore: 45,
    overallSeverity: "medium",
    confidence: 0.8,
    dataQuality: 0.75,
    status: "open",
    explanationSource: "ai",
    explanationProvider: "groq",
    explanationModel: "model-x",
    explanationOutput: "private explanation artifact",
    explanationAt: requestedAt,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    outcomeCode: null,
    createdAt: requestedAt,
    updatedAt: requestedAt,
    findings: [{
      id: `f-${id}`,
      assessmentId: id,
      code: "FUEL_PRICE_OUTLIER",
      severity: "medium",
      riskContribution: 15,
      confidence: 0.8,
      dataQuality: 0.75,
      evidence: JSON.stringify({ sampleSize: 12, cohortType: "truck_route", stationName: "Station A" }),
      reason: "Price variance requires review.",
      recommendedAction: "Review station/date evidence.",
      fuelLogId: null,
      tripId: `trip-${id}`,
      truckId: "truck-1",
      driverId: "driver-1",
      createdAt: requestedAt,
    }],
    reviewEvents: [],
    ...overrides,
  }
}

function store(rows: FuelAnomalyStoredAssessment[]): FuelAnomalyQueryStore {
  return {
    async list(query) {
      let filtered = rows.filter((row) => row.requestedAt >= query.startDate && row.requestedAt <= query.endDate)
      if (query.status) filtered = filtered.filter((row) => row.status === query.status)
      if (query.severity) filtered = filtered.filter((row) => row.overallSeverity === query.severity)
      if (query.truckId) filtered = filtered.filter((row) => row.truckId === query.truckId)
      const total = filtered.length
      const start = (query.page - 1) * query.pageSize
      return { rows: filtered.slice(start, start + query.pageSize), total }
    },
    async summaryRows(query) {
      return rows.filter((row) => row.requestedAt >= query.startDate && row.requestedAt <= query.endDate && (!query.truckId || row.truckId === query.truckId))
    },
    async getById(id) { return rows.find((row) => row.id === id) ?? null },
  }
}

describe("fuel anomaly query service", () => {
  test("normalizes bounded list pagination and summary windows", () => {
    const list = normalizeFuelAnomalyListQuery({ startDate: d1, endDate: d3, page: 0, pageSize: 999 })
    expect(list.page).toBe(1)
    expect(list.pageSize).toBe(100)
    expect(() => normalizeFuelAnomalyListQuery({ startDate: d3, endDate: d1 })).toThrow("FUEL_ANOMALY_QUERY_INVALID_WINDOW")
    expect(() => normalizeFuelAnomalySummaryQuery({ startDate: d1, endDate: new Date("2027-02-01T00:00:00Z") })).toThrow("FUEL_ANOMALY_QUERY_WINDOW_TOO_LARGE")
  })

  test("lists filtered assessments with pagination and a safe projected shape", async () => {
    const rows = [
      assessment({ id: "a1", requestedAt: d1, status: "open", overallSeverity: "medium", truckId: "truck-1" }),
      assessment({ id: "a2", requestedAt: d2, status: "resolved", overallSeverity: "high", truckId: "truck-2" }),
      assessment({ id: "a3", requestedAt: d3, status: "open", overallSeverity: "high", truckId: "truck-1" }),
    ]
    const result = await listFuelAnomalyAssessments({ startDate: d1, endDate: d3, status: "open", truckId: "truck-1", page: 1, pageSize: 1 }, { store: store(rows) })
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.id).toBe("a1")
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("inputSnapshot")
    expect(serialized).not.toContain("inputHash")
    expect(serialized).not.toContain("manager-secret")
    expect(serialized).not.toContain("private explanation artifact")
  })

  test("returns detail with findings/review history but omits raw assessment snapshot and requester identity", async () => {
    const row = assessment({
      id: "a1",
      status: "resolved",
      reviewedAt: d2,
      reviewedBy: "manager-2",
      reviewNotes: "Receipt checked",
      outcomeCode: "verified_legitimate",
      reviewEvents: [{ id: "r1", assessmentId: "a1", fromStatus: "investigating", toStatus: "resolved", outcomeCode: "verified_legitimate", notes: "Receipt checked", actorId: "manager-2", createdAt: d2 }],
    })
    const detail = await getFuelAnomalyAssessmentDetailView("a1", { store: store([row]) })
    expect(detail?.findings).toHaveLength(1)
    expect(detail?.reviewEvents).toHaveLength(1)
    expect(detail?.reviewNotes).toBe("Receipt checked")
    const serialized = JSON.stringify(detail)
    expect(serialized).not.toContain("inputSnapshot")
    expect(serialized).not.toContain("inputHash")
    expect(serialized).not.toContain("requestedBy")
  })

  test("summarizes deterministic dashboard metrics without recalculating risk", async () => {
    const resolved = assessment({
      id: "a2", requestedAt: d2, overallRiskScore: 80, overallSeverity: "high", status: "resolved",
      confidence: 0.9, dataQuality: 0.85, reviewedAt: new Date("2026-10-02T10:00:00Z"),
      outcomeCode: "verified_legitimate", explanationSource: "deterministic_fallback", explanationProvider: null, explanationModel: null,
      inputSnapshot: JSON.stringify({ routeKey: "zone-a->zone-b", fuelEvents: [{ stationName: "Station A" }], comparableCohorts: { truckRoute: Array(7).fill({ id: "x" }), truck: [], route: [], fleet: [] } }),
    })
    const falsePositive = assessment({
      id: "a3", requestedAt: d3, overallRiskScore: 20, overallSeverity: "low", status: "false_positive",
      confidence: 0.6, dataQuality: 0.55, reviewedAt: new Date("2026-10-03T09:00:00Z"),
      outcomeCode: "data_entry_error", explanationSource: null,
      inputSnapshot: JSON.stringify({ routeKey: null, fuelEvents: [{ stationName: null }], comparableCohorts: { truckRoute: Array(3).fill({ id: "x" }), truck: [], route: [], fleet: [] } }),
    })
    const summary = await getFuelAnomalyDashboardSummary({ startDate: d1, endDate: d3 }, { store: store([assessment(), resolved, falsePositive]) })
    expect(summary.observerMode).toBe(true)
    expect(summary.openBySeverity.medium).toBe(1)
    expect(summary.findingsByCode.FUEL_PRICE_OUTLIER).toBe(3)
    expect(summary.averageConfidence).toBeCloseTo((0.8 + 0.9 + 0.6) / 3)
    expect(summary.averageDataQuality).toBeCloseTo((0.75 + 0.85 + 0.55) / 3)
    expect(summary.aiExplanations).toEqual({ success: 1, fallback: 1, none: 1 })
    expect(summary.review.falsePositiveRate).toBe(0.5)
    expect(summary.review.outcomes.verified_legitimate).toBe(1)
    expect(summary.review.outcomes.data_entry_error).toBe(1)
    expect(summary.review.averageResolutionMs).toBeGreaterThan(0)
    expect(summary.baselines.sampleSizeDistribution).toEqual({ below6: 1, advisory6To11: 1, preferred12Plus: 1 })
    expect(summary.topRoutes[0]).toEqual({ key: "zone-a->zone-b", count: 2 })
    expect(summary.topStations[0]).toEqual({ key: "Station A", count: 2 })
    expect(summary.versionDistribution["fuel-rules-v1|fuel-baseline-v1"]).toBe(3)
    expect(summary.riskTrend).toHaveLength(3)
    expect(summary.dataQualityTrend).toHaveLength(3)
  })

  test("does not fabricate route or station labels when snapshot evidence is absent/malformed", async () => {
    const rows = [
      assessment({ id: "none", inputSnapshot: "not-json" }),
      assessment({ id: "missing", inputSnapshot: JSON.stringify({ routeKey: null, fuelEvents: [{}], comparableCohorts: {} }) }),
    ]
    const summary = await getFuelAnomalyDashboardSummary({ startDate: d1, endDate: d3 }, { store: store(rows) })
    expect(summary.topRoutes).toEqual([])
    expect(summary.topStations).toEqual([])
  })
})
