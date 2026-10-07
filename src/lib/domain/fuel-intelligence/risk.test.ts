import { describe, expect, test } from "bun:test"
import { aggregateFuelAnomalyAssessment } from "./risk"
import type { FuelAnomalyFindingDraft, FuelAssessmentEvidence, FuelAnomalyFindingCode } from "./types"

function evidence(availability: "known" | "partial" | "unavailable" = "known"): FuelAssessmentEvidence {
  return {
    subject: { tripId: "trip-1" }, subjectType: "trip", subjectKey: "trip-1",
    fuelLogId: null, tripId: "trip-1", truckId: "truck-1", driverId: "driver-1",
    routeKey: "route-a", truckClass: "articulated", truckTankCapacityLiters: 200,
    physicalEfficiencyBounds: null, distanceKm: 200, reconciledConsumedLiters: 40,
    reconciliationExceptionCount: 0, openingTankLiters: null, closingTankLiters: null,
    netFuelAddedLiters: 40, fuelEvents: [],
    comparableCohorts: { truckRoute: [], truck: [], route: [], fleet: [] },
    evidenceAvailability: {
      tankCapacity: availability, tankLevels: availability, distance: availability,
      reconciliation: availability, gps: availability, routeGeofence: availability,
      physicalEfficiencyBounds: availability, comparableHistory: availability,
    },
  }
}

function finding(
  riskContribution: number,
  correlationKey: string,
  overrides: Partial<FuelAnomalyFindingDraft> = {},
): FuelAnomalyFindingDraft {
  return {
    code: "FUEL_EFFICIENCY_SINGLE_OUTLIER" as FuelAnomalyFindingCode,
    severity: "medium",
    riskContribution,
    confidence: 0.9,
    dataQuality: 0.9,
    strongEvidence: false,
    correlationKey,
    evidence: {},
    reason: "test",
    recommendedAction: "review",
    fuelLogId: null, tripId: "trip-1", truckId: "truck-1", driverId: "driver-1",
    ...overrides,
  }
}

describe("aggregateFuelAnomalyAssessment", () => {
  test("maps exact risk boundaries to informational, low, medium and high", () => {
    expect(aggregateFuelAnomalyAssessment([finding(19, "statistical:a")], evidence()).overallSeverity).toBe("info")
    expect(aggregateFuelAnomalyAssessment([finding(20, "statistical:a")], evidence()).overallSeverity).toBe("low")
    expect(aggregateFuelAnomalyAssessment([finding(20, "statistical:a"), finding(15, "location:a"), finding(5, "movement:a")], evidence()).overallSeverity).toBe("medium")
    expect(aggregateFuelAnomalyAssessment([finding(25, "tank:a"), finding(20, "statistical:a"), finding(15, "location:a")], evidence()).overallSeverity).toBe("high")
  })

  test("allows critical at 80+ only when strong physical/accounting evidence supports it", () => {
    const inputs = [
      finding(35, "tank:a", { strongEvidence: true, severity: "critical", code: "FUEL_TANK_BALANCE_NEGATIVE" }),
      finding(20, "statistical:a"), finding(15, "location:a"), finding(10, "movement:a"),
    ]
    const strong = aggregateFuelAnomalyAssessment(inputs, evidence())
    const weak = aggregateFuelAnomalyAssessment(inputs.map((item) => ({ ...item, strongEvidence: false })), evidence())
    expect(strong.overallRiskScore).toBe(80)
    expect(strong.overallSeverity).toBe("critical")
    expect(weak.overallRiskScore).toBe(80)
    expect(weak.overallSeverity).toBe("high")
  })

  test("uses max contribution for the same correlation key and caps each evidence family", () => {
    const result = aggregateFuelAnomalyAssessment([
      finding(30, "tank:same", { code: "FUEL_TANK_BALANCE_NEGATIVE", strongEvidence: true }),
      finding(28, "tank:same", { code: "FUEL_FILL_LEVEL_CONTRADICTION", strongEvidence: true }),
      finding(20, "tank:other", { code: "FUEL_TANK_CAPACITY_EXCEEDED", strongEvidence: true }),
    ], evidence())
    expect(result.overallRiskScore).toBe(35)
    expect(result.contributions.reduce((sum, item) => sum + item.appliedRisk, 0)).toBe(35)
  })

  test("keeps low-confidence statistical findings low-confidence even with complete evidence", () => {
    const result = aggregateFuelAnomalyAssessment([
      finding(20, "statistical:a", { confidence: 0.3, dataQuality: 0.5 }),
    ], evidence("known"))
    expect(result.overallRiskScore).toBe(20)
    expect(result.confidence).toBeLessThan(0.6)
    expect(result.dataQuality).toBeGreaterThan(result.confidence)
  })

  test("missing evidence lowers data quality without increasing risk", () => {
    const complete = aggregateFuelAnomalyAssessment([], evidence("known"))
    const sparse = aggregateFuelAnomalyAssessment([], evidence("unavailable"))
    expect(complete.overallRiskScore).toBe(0)
    expect(sparse.overallRiskScore).toBe(0)
    expect(sparse.dataQuality).toBeLessThan(complete.dataQuality)
  })

  test("clamps malformed contributions and scores to safe bounds", () => {
    const result = aggregateFuelAnomalyAssessment([
      finding(999, "statistical:a", { confidence: 5, dataQuality: -2 }),
      finding(-10, "location:a"),
    ], evidence())
    expect(result.overallRiskScore).toBeGreaterThanOrEqual(0)
    expect(result.overallRiskScore).toBeLessThanOrEqual(100)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
    expect(result.dataQuality).toBeGreaterThanOrEqual(0)
    expect(result.dataQuality).toBeLessThanOrEqual(1)
  })
})
