import { describe, expect, test } from "bun:test"
import {
  DISPATCH_DRIVER_SELECT,
  DISPATCH_TRUCK_SELECT,
  getDispatchRecommendations,
  recordDispatchDecision,
  type DispatchCopilotDependencies,
} from "./dispatch-copilot-service"

const actor = { userId: "manager-1", role: "Manager" }
const departureTime = new Date("2026-10-08T08:00:00Z")

function driver(overrides: Record<string, unknown> = {}) {
  return {
    id: "driver-1",
    name: "Driver One",
    status: "active" as const,
    verificationStatus: "verified" as const,
    licenseExpiry: new Date("2027-01-01T00:00:00Z"),
    hasConflictingTrip: false,
    currentWorkload: 1,
    routeExperienceScore: 80,
    historicalPerformanceScore: 75,
    locationFitScore: 70,
    ...overrides,
  }
}

function truck(overrides: Record<string, unknown> = {}) {
  return {
    id: "truck-1",
    plateNumber: "GT-1000-26",
    status: "active" as const,
    hasConflictingTrip: false,
    maintenanceBlocking: false,
    compliance: { insurance: "valid" as const, roadworthy: "valid" as const, dvla: "valid" as const },
    fuelEfficiencyScore: 70,
    maintenanceReadinessScore: 90,
    locationFitScore: 50,
    capacityFitScore: 100,
    ...overrides,
  }
}

function dependencies(overrides: Partial<DispatchCopilotDependencies> = {}): DispatchCopilotDependencies {
  let recommendation = {
    id: "rec-1",
    tripId: null as string | null,
    requestedBy: actor.userId,
    requestedAt: departureTime,
    rulesetVersion: "dispatch-v1",
    inputHash: "hash",
    inputSnapshot: "{}",
    rankedOutput: "[]",
    confidence: 1,
    dataQuality: 1,
    status: "pending",
    decision: null as string | null,
    selectedDriverId: null as string | null,
    selectedTruckId: null as string | null,
  }

  return {
    candidateSource: {
      loadDrivers: async () => [driver()],
      loadTrucks: async () => [truck()],
    },
    recommendationStore: {
      create: async (data) => {
        recommendation = { ...recommendation, ...data, id: "rec-1" }
        return recommendation
      },
      findById: async () => recommendation,
      recordDecision: async (_id, data) => {
        recommendation = { ...recommendation, ...data }
        return recommendation
      },
    },
    availability: {
      isPairAvailable: async () => true,
    },
    now: () => new Date("2026-10-07T10:00:00Z"),
    ...overrides,
  }
}

describe("dispatch copilot service", () => {
  test("allow-lists candidate fields and excludes sensitive driver data from authoritative loads", () => {
    expect(DISPATCH_DRIVER_SELECT).toMatchObject({
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      verificationStatus: true,
      licenseExpiry: true,
    })
    expect(DISPATCH_DRIVER_SELECT).not.toHaveProperty("phone")
    expect(DISPATCH_DRIVER_SELECT).not.toHaveProperty("email")
    expect(DISPATCH_DRIVER_SELECT).not.toHaveProperty("ghanaCardNumber")
    expect(DISPATCH_DRIVER_SELECT).not.toHaveProperty("licenseNumber")
    expect(DISPATCH_TRUCK_SELECT).toMatchObject({ id: true, plateNumber: true, status: true })
  })

  test("sources candidates internally, excludes blocked resources, ranks deterministically and persists provenance", async () => {
    let persisted: Record<string, unknown> | null = null
    const deps = dependencies({
      candidateSource: {
        loadDrivers: async () => [
          driver(),
          driver({ id: "driver-expired", licenseExpiry: new Date("2026-01-01T00:00:00Z") }),
        ],
        loadTrucks: async () => [
          truck(),
          truck({ id: "truck-maint", status: "maintenance" }),
        ],
      },
    })
    const originalCreate = deps.recommendationStore.create
    deps.recommendationStore.create = async (data) => {
      persisted = data as unknown as Record<string, unknown>
      return originalCreate(data)
    }

    const result = await getDispatchRecommendations({
      tripDraft: { departureTime, destinationZoneId: "zone-1", quantity: 900, cargoUnit: "bags" },
    }, actor, deps)

    expect(result.recommendationId).toBe("rec-1")
    expect(result.ranked).toHaveLength(1)
    expect(result.ranked[0]).toMatchObject({ driverId: "driver-1", truckId: "truck-1" })
    expect(result.blockedDrivers.map((row) => row.id)).toContain("driver-expired")
    expect(result.blockedTrucks.map((row) => row.id)).toContain("truck-maint")
    expect(persisted).toMatchObject({
      requestedBy: actor.userId,
      rulesetVersion: "dispatch-v1",
      status: "pending",
    })
    expect(String(persisted?.inputHash)).toHaveLength(64)
    expect(String(persisted?.inputSnapshot)).not.toContain("phone")
    expect(String(persisted?.rankedOutput)).toContain("driver-1")
  })

  test("returns structured blocked reasons when there is no eligible pair", async () => {
    const deps = dependencies({
      candidateSource: {
        loadDrivers: async () => [driver({ status: "suspended" })],
        loadTrucks: async () => [truck({ status: "maintenance" })],
      },
    })

    const result = await getDispatchRecommendations({
      tripDraft: { departureTime, destinationZoneId: "zone-1" },
    }, actor, deps)

    expect(result.ranked).toEqual([])
    expect(result.blockedDrivers[0].eligibility.hardBlocks.length).toBeGreaterThan(0)
    expect(result.blockedTrucks[0].eligibility.hardBlocks.length).toBeGreaterThan(0)
  })

  test("records a stale acceptance for audit but never mutates a trip assignment", async () => {
    const deps = dependencies({
      availability: { isPairAvailable: async () => false },
    })
    const mutatingDeps = deps as DispatchCopilotDependencies & { assignTrip?: unknown }
    expect(mutatingDeps.assignTrip).toBeUndefined()

    const result = await recordDispatchDecision(
      "rec-1",
      {
        decision: "accepted",
        selectedDriverId: "driver-1",
        selectedTruckId: "truck-1",
        reason: "Preferred available pair",
      },
      actor,
      deps,
    )

    expect(result.stale).toBe(true)
    expect(result.decision).toBe("accepted")
    expect(result.selectedDriverId).toBe("driver-1")
    expect(result.selectedTruckId).toBe("truck-1")
  })
})
