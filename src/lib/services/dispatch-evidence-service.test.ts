import { describe, expect, test } from "bun:test"
import {
  loadDispatchCandidateEvidence,
  type DispatchEvidenceDatabase,
} from "./dispatch-evidence-service"

function mockDatabase() {
  const calls: Array<{ model: string; args: unknown }> = []
  let tripCall = 0

  const database: DispatchEvidenceDatabase = {
    driver: {
      findMany: async (args) => {
        calls.push({ model: "driver", args })
        return [{
          id: "driver-1",
          firstName: "Driver",
          lastName: "One",
          status: "active",
          verificationStatus: "verified",
          licenseExpiry: new Date("2027-01-01T00:00:00Z"),
          rating: 4.5,
        }]
      },
    },
    truck: {
      findMany: async (args) => {
        calls.push({ model: "truck", args })
        return [{
          id: "truck-1",
          plateNumber: "GT-1000-26",
          status: "active",
          currentMileage: 100000,
          nextServiceDate: new Date("2026-12-01T00:00:00Z"),
        }]
      },
    },
    trip: {
      findMany: async (args) => {
        calls.push({ model: "trip", args })
        tripCall += 1
        if (tripCall === 1) return []
        return [
          { driverId: "driver-1", truckId: "truck-old", destinationZoneId: "zone-1" },
          { driverId: "driver-1", truckId: "truck-old-2", destinationZoneId: "zone-1" },
        ]
      },
    },
    maintenanceRecord: {
      findMany: async (args) => {
        calls.push({ model: "maintenanceRecord", args })
        return [{
          truckId: "truck-1",
          status: "scheduled",
          nextDueDate: new Date("2026-12-01T00:00:00Z"),
          nextDueMileage: 110000,
        }]
      },
    },
    insurance: {
      findMany: async (args) => {
        calls.push({ model: "insurance", args })
        return [{ truckId: "truck-1", status: "active", endDate: new Date("2027-01-01T00:00:00Z") }]
      },
    },
    roadworthyInspection: {
      findMany: async (args) => {
        calls.push({ model: "roadworthyInspection", args })
        return [{
          truckId: "truck-1",
          result: "pass",
          certificateIssued: true,
          certificateExpiry: new Date("2027-01-01T00:00:00Z"),
        }]
      },
    },
    dvlaRegistration: {
      findMany: async (args) => {
        calls.push({ model: "dvlaRegistration", args })
        return [{
          truckId: "truck-1",
          status: "active",
          expiryDate: new Date("2027-01-01T00:00:00Z"),
          grossVehicleWeight: 30000,
          unladenWeight: 10000,
        }]
      },
    },
  }

  return { database, calls }
}

describe("loadDispatchCandidateEvidence", () => {
  test("loads only allow-listed driver identity/operational fields", async () => {
    const { database, calls } = mockDatabase()
    await loadDispatchCandidateEvidence({
      departureTime: new Date("2026-10-08T08:00:00Z"),
      destinationZoneId: "zone-1",
      cargoUnit: "tonnes",
      quantity: 20,
    }, database)

    const driverCall = calls.find((call) => call.model === "driver")
    const serialized = JSON.stringify(driverCall?.args)
    expect(serialized).toContain("licenseExpiry")
    expect(serialized).not.toContain("licenseNumber")
    expect(serialized).not.toContain("ghanaCard")
    expect(serialized).not.toContain("phone")
    expect(serialized).not.toContain("email")
    expect(serialized).not.toContain("address")
    expect(serialized).not.toContain("verificationNotes")
  })

  test("normalizes route history, performance, maintenance, compliance and known tonne capacity", async () => {
    const { database } = mockDatabase()
    const result = await loadDispatchCandidateEvidence({
      departureTime: new Date("2026-10-08T08:00:00Z"),
      destinationZoneId: "zone-1",
      cargoUnit: "tonnes",
      quantity: 20,
    }, database)

    expect(result.drivers).toHaveLength(1)
    expect(result.drivers[0]).toMatchObject({
      id: "driver-1",
      name: "Driver One",
      hasConflictingTrip: false,
      currentWorkload: 0,
      routeExperienceScore: 20,
      historicalPerformanceScore: 90,
      locationFitScore: null,
    })

    expect(result.trucks[0]).toMatchObject({
      id: "truck-1",
      maintenanceBlocking: false,
      capacitySufficient: true,
      capacityFitScore: 100,
      fuelEfficiencyScore: null,
      maintenanceReadinessScore: 100,
      locationFitScore: null,
      compliance: { insurance: "valid", roadworthy: "valid", dvla: "valid" },
    })
  })

  test("hard evidence marks an overweight tonne load as capacity-insufficient", async () => {
    const { database } = mockDatabase()
    const result = await loadDispatchCandidateEvidence({
      departureTime: new Date("2026-10-08T08:00:00Z"),
      destinationZoneId: "zone-1",
      cargoUnit: "tonnes",
      quantity: 25,
    }, database)

    expect(result.trucks[0].capacitySufficient).toBe(false)
    expect(result.trucks[0].capacityFitScore).toBe(80)
  })

  test("does not guess capacity for bags when no bag-weight conversion is configured", async () => {
    const { database } = mockDatabase()
    const result = await loadDispatchCandidateEvidence({
      departureTime: new Date("2026-10-08T08:00:00Z"),
      destinationZoneId: "zone-1",
      cargoUnit: "bags",
      quantity: 600,
    }, database)

    expect(result.trucks[0].capacitySufficient).toBeNull()
    expect(result.trucks[0].capacityFitScore).toBeNull()
  })

  test("derives active-trip conflicts and overdue maintenance as hard evidence", async () => {
    const { database } = mockDatabase()
    let tripCall = 0
    database.trip.findMany = async () => {
      tripCall += 1
      return tripCall === 1
        ? [{ driverId: "driver-1", truckId: "truck-1", destinationZoneId: "zone-2" }]
        : []
    }
    database.maintenanceRecord.findMany = async () => [{
      truckId: "truck-1",
      status: "scheduled",
      nextDueDate: new Date("2026-10-01T00:00:00Z"),
      nextDueMileage: null,
    }]

    const result = await loadDispatchCandidateEvidence({
      departureTime: new Date("2026-10-08T08:00:00Z"),
      destinationZoneId: "zone-1",
      cargoUnit: "bags",
      quantity: 600,
    }, database)

    expect(result.drivers[0].hasConflictingTrip).toBe(true)
    expect(result.trucks[0].hasConflictingTrip).toBe(true)
    expect(result.trucks[0].maintenanceBlocking).toBe(true)
  })
})
