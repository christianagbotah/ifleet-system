import { describe, expect, test } from "bun:test"
import { rankEligibleDispatchCandidates, type DispatchDriverEvidence, type DispatchTruckEvidence } from "./candidate-ranking"

const context = { departureTime: new Date("2026-10-08T08:00:00Z") }

function driver(overrides: Partial<DispatchDriverEvidence> = {}): DispatchDriverEvidence {
  return {
    id: "driver-1",
    name: "Driver One",
    status: "active",
    verificationStatus: "verified",
    licenseExpiry: new Date("2027-01-01T00:00:00Z"),
    hasConflictingTrip: false,
    currentWorkload: 1,
    routeExperienceScore: 80,
    historicalPerformanceScore: 75,
    locationFitScore: 70,
    ...overrides,
  }
}

function truck(overrides: Partial<DispatchTruckEvidence> = {}): DispatchTruckEvidence {
  return {
    id: "truck-1",
    plateNumber: "GT-1000-26",
    status: "active",
    hasConflictingTrip: false,
    maintenanceBlocking: false,
    compliance: { insurance: "valid", roadworthy: "valid", dvla: "valid" },
    fuelEfficiencyScore: 70,
    maintenanceReadinessScore: 90,
    locationFitScore: 50,
    capacityFitScore: 100,
    ...overrides,
  }
}

describe("rankEligibleDispatchCandidates", () => {
  test("never creates a recommendation containing an ineligible driver or truck", () => {
    const result = rankEligibleDispatchCandidates(
      [driver(), driver({ id: "driver-expired", licenseExpiry: new Date("2026-01-01T00:00:00Z") })],
      [truck(), truck({ id: "truck-maint", status: "maintenance" })],
      context,
    )

    expect(result.ranked).toHaveLength(1)
    expect(result.ranked[0].driverId).toBe("driver-1")
    expect(result.ranked[0].truckId).toBe("truck-1")
    expect(result.blockedDrivers[0].id).toBe("driver-expired")
    expect(result.blockedTrucks[0].id).toBe("truck-maint")
  })

  test("derives pair components deterministically from normalized evidence", () => {
    const result = rankEligibleDispatchCandidates([driver()], [truck()], context)
    const candidate = result.ranked[0]

    expect(candidate.components.availability.value).toBe(100)
    expect(candidate.components.compliance.value).toBe(100)
    expect(candidate.components.routeExperience.value).toBe(80)
    expect(candidate.components.locationFit.value).toBe(60)
    expect(candidate.components.workloadBalance.value).toBe(80)
    expect(candidate.score).toBe(86.25)
  })

  test("keeps missing optional evidence neutral and lowers data quality instead of guessing", () => {
    const result = rankEligibleDispatchCandidates(
      [driver({ routeExperienceScore: null, historicalPerformanceScore: null, locationFitScore: null })],
      [truck({ fuelEfficiencyScore: null, locationFitScore: null, capacityFitScore: null })],
      context,
    )
    const candidate = result.ranked[0]

    expect(candidate.components.routeExperience).toMatchObject({ value: 50, known: false })
    expect(candidate.components.locationFit).toMatchObject({ value: 50, known: false })
    expect(candidate.components.capacityFit).toMatchObject({ value: 50, known: false })
    expect(candidate.dataQuality).toBeLessThan(1)
  })

  test("reduces compliance component when eligibility is advisory because evidence is incomplete", () => {
    const result = rankEligibleDispatchCandidates(
      [driver()],
      [truck({ compliance: { insurance: "valid", roadworthy: "unknown", dvla: "missing" } })],
      context,
    )

    expect(result.ranked).toHaveLength(1)
    expect(result.ranked[0].components.compliance.value).toBe(70)
    expect(result.ranked[0].components.compliance.known).toBe(false)
  })

  test("returns identical ordering for identical evidence snapshots", () => {
    const drivers = [driver({ id: "driver-b" }), driver({ id: "driver-a" })]
    const trucks = [truck({ id: "truck-b" }), truck({ id: "truck-a" })]

    const first = rankEligibleDispatchCandidates(drivers, trucks, context)
    const second = rankEligibleDispatchCandidates(drivers, trucks, context)

    expect(first.ranked.map((row) => `${row.driverId}:${row.truckId}`)).toEqual(
      second.ranked.map((row) => `${row.driverId}:${row.truckId}`),
    )
  })
})
