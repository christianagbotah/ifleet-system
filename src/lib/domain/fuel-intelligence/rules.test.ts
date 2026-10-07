import { describe, expect, test } from "bun:test"
import { DEFAULT_FUEL_ANOMALY_POLICY } from "./policy"
import { evaluateFuelIntegrityRules } from "./rules"
import type { FuelAssessmentEvidence, FuelEvidenceEvent } from "./types"

function event(overrides: Partial<FuelEvidenceEvent> = {}): FuelEvidenceEvent {
  return {
    id: "fuel-1",
    tripId: "trip-1",
    truckId: "truck-1",
    driverId: "driver-1",
    occurredAt: new Date("2026-10-07T08:00:00Z"),
    eventType: "purchase",
    verificationStatus: "verified",
    source: "driver_app",
    liters: 40,
    totalCost: 600,
    costPerLiter: 15,
    stationName: "Station A",
    receiptNumber: "R-100",
    fuelLevelBeforeLiters: null,
    fuelLevelAfterLiters: null,
    latitude: null,
    longitude: null,
    gpsRequiredByCapturePolicy: false,
    insideExpectedFuelingArea: null,
    reversalOfId: null,
    reversalTargetWasVerified: false,
    ...overrides,
  }
}

function evidence(overrides: Partial<FuelAssessmentEvidence> = {}): FuelAssessmentEvidence {
  return {
    subject: { tripId: "trip-1" },
    subjectType: "trip",
    subjectKey: "trip-1",
    fuelLogId: null,
    tripId: "trip-1",
    truckId: "truck-1",
    driverId: "driver-1",
    routeKey: "zone-a->zone-b",
    truckClass: "articulated",
    truckTankCapacityLiters: 100,
    physicalEfficiencyBounds: null,
    distanceKm: 200,
    reconciledConsumedLiters: 40,
    reconciliationExceptionCount: 0,
    openingTankLiters: 20,
    closingTankLiters: 20,
    netFuelAddedLiters: 40,
    fuelEvents: [event()],
    comparableCohorts: { truckRoute: [], truck: [], route: [], fleet: [] },
    evidenceAvailability: {
      tankCapacity: "known",
      tankLevels: "known",
      distance: "known",
      reconciliation: "known",
      gps: "unavailable",
      routeGeofence: "unavailable",
      physicalEfficiencyBounds: "unavailable",
      comparableHistory: "unavailable",
    },
    ...overrides,
  }
}

function codes(input: FuelAssessmentEvidence): string[] {
  return evaluateFuelIntegrityRules(input).map((finding) => finding.code)
}

describe("evaluateFuelIntegrityRules", () => {
  test("does not flag a fill exactly at the configured tank-capacity tolerance boundary", () => {
    const max = 100 * (1 + DEFAULT_FUEL_ANOMALY_POLICY.tankCapacityToleranceRatio)
    expect(codes(evidence({ fuelEvents: [event({ liters: max })] }))).not.toContain("FUEL_TANK_CAPACITY_EXCEEDED")
  })

  test("flags a verified fill above known tank capacity plus tolerance", () => {
    const max = 100 * (1 + DEFAULT_FUEL_ANOMALY_POLICY.tankCapacityToleranceRatio)
    expect(codes(evidence({ fuelEvents: [event({ liters: max + 0.01 })] }))).toContain("FUEL_TANK_CAPACITY_EXCEEDED")
  })

  test("suppresses tank-capacity checks when capacity is unknown", () => {
    expect(codes(evidence({ truckTankCapacityLiters: null, evidenceAvailability: { ...evidence().evidenceAvailability, tankCapacity: "unavailable" }, fuelEvents: [event({ liters: 500 })] }))).not.toContain("FUEL_TANK_CAPACITY_EXCEEDED")
  })

  test("flags contradictory before/after fuel levels", () => {
    expect(codes(evidence({ fuelEvents: [event({ liters: 40, fuelLevelBeforeLiters: 20, fuelLevelAfterLiters: 35 })] }))).toContain("FUEL_FILL_LEVEL_CONTRADICTION")
  })

  test("flags physically impossible negative tank consumption", () => {
    expect(codes(evidence({ openingTankLiters: 20, netFuelAddedLiters: 10, closingTankLiters: 40 }))).toContain("FUEL_TANK_BALANCE_NEGATIVE")
  })

  test("flags unexplained tank loss beyond reconciled consumption", () => {
    expect(codes(evidence({ openingTankLiters: 60, netFuelAddedLiters: 40, closingTankLiters: 10, reconciledConsumedLiters: 40 }))).toContain("FUEL_TANK_LOSS_UNEXPLAINED")
  })

  test("flags physical efficiency only when explicit truck-class bounds exist", () => {
    const bounded = evidence({
      reconciledConsumedLiters: 100,
      distanceKm: 100,
      physicalEfficiencyBounds: { minKmPerLiter: 2, maxKmPerLiter: 8 },
      evidenceAvailability: { ...evidence().evidenceAvailability, physicalEfficiencyBounds: "known" },
    })
    expect(codes(bounded)).toContain("FUEL_CONSUMPTION_EXTREME_PHYSICAL")
    expect(codes({ ...bounded, physicalEfficiencyBounds: null, evidenceAvailability: { ...bounded.evidenceAvailability, physicalEfficiencyBounds: "unavailable" } })).not.toContain("FUEL_CONSUMPTION_EXTREME_PHYSICAL")
  })

  test("flags material verified fuel added with near-zero authoritative distance", () => {
    expect(codes(evidence({ distanceKm: 0.5, netFuelAddedLiters: 30 }))).toContain("FUEL_ADDED_WITH_NO_DISTANCE")
  })

  test("adds only an advisory finding when meaningful movement has no usable fuel evidence", () => {
    const result = evaluateFuelIntegrityRules(evidence({ distanceKm: 150, netFuelAddedLiters: 0, reconciledConsumedLiters: null, fuelEvents: [] }))
    const finding = result.find((item) => item.code === "FUEL_DISTANCE_WITH_NO_USABLE_FUEL")
    expect(finding?.severity).toBe("info")
    expect(finding?.confidence).toBeLessThan(0.6)
  })

  test("flags clustered reconciliation exceptions", () => {
    expect(codes(evidence({ reconciliationExceptionCount: DEFAULT_FUEL_ANOMALY_POLICY.reconciliationExceptionClusterCount }))).toContain("FUEL_RECONCILIATION_EXCEPTION_CLUSTER")
  })

  test("flags receipt reuse across incompatible verified events", () => {
    const reused = [
      event({ id: "a", receiptNumber: "SAME", tripId: "trip-1", truckId: "truck-1" }),
      event({ id: "b", receiptNumber: "SAME", tripId: "trip-2", truckId: "truck-2", occurredAt: new Date("2026-10-07T10:00:00Z") }),
    ]
    expect(codes(evidence({ fuelEvents: reused }))).toContain("FUEL_RECEIPT_REUSE")
  })

  test("flags a near duplicate that escaped exact duplicate prevention", () => {
    const near = [
      event({ id: "a", receiptNumber: null, liters: 40, totalCost: 600, occurredAt: new Date("2026-10-07T08:00:00Z") }),
      event({ id: "b", receiptNumber: null, liters: 40.2, totalCost: 602, occurredAt: new Date("2026-10-07T08:12:00Z") }),
    ]
    expect(codes(evidence({ fuelEvents: near }))).toContain("FUEL_NEAR_DUPLICATE_EVENT")
  })

  test("flags reversal clusters without treating one legitimate reversal as suspicious", () => {
    const one = [event({ id: "r1", eventType: "reversal", liters: -20, totalCost: -300, reversalOfId: "f1" })]
    expect(codes(evidence({ fuelEvents: one }))).not.toContain("FUEL_REVERSAL_PATTERN")
    const many = Array.from({ length: DEFAULT_FUEL_ANOMALY_POLICY.reversalClusterCount }, (_, index) =>
      event({ id: `r${index}`, eventType: "reversal", liters: -20, totalCost: -300, reversalOfId: `f${index}`, occurredAt: new Date(`2026-10-07T0${index + 1}:00:00Z`) }),
    )
    expect(codes(evidence({ fuelEvents: many }))).toContain("FUEL_REVERSAL_PATTERN")
  })

  test("separately flags clustered reversals of previously verified events", () => {
    const events = Array.from({ length: DEFAULT_FUEL_ANOMALY_POLICY.postVerificationReversalClusterCount }, (_, index) =>
      event({ id: `r${index}`, eventType: "reversal", liters: -20, totalCost: -300, reversalOfId: `f${index}`, reversalTargetWasVerified: true, occurredAt: new Date(`2026-10-07T0${index + 1}:00:00Z`) }),
    )
    expect(codes(evidence({ fuelEvents: events }))).toContain("FUEL_POST_VERIFICATION_REVERSAL_CLUSTER")
  })

  test("flags outside-area fueling only when reliable route/geofence evidence exists", () => {
    const outside = event({ latitude: 5.6, longitude: -0.2, insideExpectedFuelingArea: false })
    const known = evidence({ fuelEvents: [outside], evidenceAvailability: { ...evidence().evidenceAvailability, gps: "known", routeGeofence: "known" } })
    expect(codes(known)).toContain("FUEL_LOCATION_OUTSIDE_EXPECTED_AREA")
    expect(codes({ ...known, evidenceAvailability: { ...known.evidenceAvailability, routeGeofence: "unavailable" } })).not.toContain("FUEL_LOCATION_OUTSIDE_EXPECTED_AREA")
  })

  test("flags missing GPS only when capture policy expected it", () => {
    const required = evidence({ fuelEvents: [event({ gpsRequiredByCapturePolicy: true, latitude: null, longitude: null })] })
    expect(codes(required)).toContain("FUEL_LOCATION_EVIDENCE_MISSING")
    expect(codes(evidence({ fuelEvents: [event({ gpsRequiredByCapturePolicy: false, latitude: null, longitude: null })] }))).not.toContain("FUEL_LOCATION_EVIDENCE_MISSING")
  })

  test("does not fabricate findings from absent optional evidence", () => {
    const sparse = evidence({
      truckTankCapacityLiters: null,
      openingTankLiters: null,
      closingTankLiters: null,
      reconciledConsumedLiters: null,
      physicalEfficiencyBounds: null,
      fuelEvents: [event({ fuelLevelBeforeLiters: null, fuelLevelAfterLiters: null, latitude: null, longitude: null })],
      evidenceAvailability: {
        tankCapacity: "unavailable",
        tankLevels: "unavailable",
        distance: "known",
        reconciliation: "partial",
        gps: "unavailable",
        routeGeofence: "unavailable",
        physicalEfficiencyBounds: "unavailable",
        comparableHistory: "unavailable",
      },
    })
    const result = codes(sparse)
    expect(result).not.toContain("FUEL_TANK_CAPACITY_EXCEEDED")
    expect(result).not.toContain("FUEL_TANK_BALANCE_NEGATIVE")
    expect(result).not.toContain("FUEL_TANK_LOSS_UNEXPLAINED")
    expect(result).not.toContain("FUEL_FILL_LEVEL_CONTRADICTION")
    expect(result).not.toContain("FUEL_CONSUMPTION_EXTREME_PHYSICAL")
    expect(result).not.toContain("FUEL_LOCATION_OUTSIDE_EXPECTED_AREA")
  })

  test("returns identical ordered findings for identical evidence", () => {
    const input = evidence({
      fuelEvents: [event({ liters: 150, fuelLevelBeforeLiters: 10, fuelLevelAfterLiters: 20 })],
      reconciliationExceptionCount: 4,
    })
    expect(evaluateFuelIntegrityRules(input)).toEqual(evaluateFuelIntegrityRules(input))
  })
})
