import { describe, expect, test } from "bun:test"
import { evaluateDriverEligibility, evaluateTruckEligibility } from "./eligibility"
import type { DriverEligibilityCandidate, TruckEligibilityCandidate } from "./types"

const departureTime = new Date("2026-10-08T08:00:00Z")

function driver(overrides: Partial<DriverEligibilityCandidate> = {}): DriverEligibilityCandidate {
  return {
    id: "driver-1",
    name: "Eligible Driver",
    status: "active",
    verificationStatus: "verified",
    licenseExpiry: new Date("2027-01-01T00:00:00Z"),
    hasConflictingTrip: false,
    ...overrides,
  }
}

function truck(overrides: Partial<TruckEligibilityCandidate> = {}): TruckEligibilityCandidate {
  return {
    id: "truck-1",
    plateNumber: "GT-1000-26",
    status: "active",
    hasConflictingTrip: false,
    maintenanceBlocking: false,
    compliance: {
      insurance: "valid",
      roadworthy: "valid",
      dvla: "valid",
    },
    ...overrides,
  }
}

describe("evaluateDriverEligibility", () => {
  test("accepts an active verified driver with a valid licence and no active trip", () => {
    const result = evaluateDriverEligibility(driver(), { departureTime })
    expect(result.eligible).toBe(true)
    expect(result.hardBlocks).toHaveLength(0)
  })

  test("blocks suspended or otherwise inactive drivers", () => {
    const result = evaluateDriverEligibility(driver({ status: "suspended" }), { departureTime })
    expect(result.eligible).toBe(false)
    expect(result.hardBlocks.map((reason) => reason.code)).toContain("DRIVER_NOT_ACTIVE")
  })

  test("blocks a licence that expires at or before planned departure", () => {
    const atDeparture = evaluateDriverEligibility(driver({ licenseExpiry: departureTime }), { departureTime })
    const beforeDeparture = evaluateDriverEligibility(
      driver({ licenseExpiry: new Date("2026-10-08T07:59:59Z") }),
      { departureTime },
    )

    expect(atDeparture.hardBlocks.map((reason) => reason.code)).toContain("DRIVER_LICENCE_EXPIRED")
    expect(beforeDeparture.hardBlocks.map((reason) => reason.code)).toContain("DRIVER_LICENCE_EXPIRED")
  })

  test("blocks a driver already committed to another active trip", () => {
    const result = evaluateDriverEligibility(driver({ hasConflictingTrip: true }), { departureTime })
    expect(result.eligible).toBe(false)
    expect(result.hardBlocks.map((reason) => reason.code)).toContain("DRIVER_TRIP_CONFLICT")
  })

  test("requires verified drivers by default but can surface pending verification as a warning under explicit policy", () => {
    const strict = evaluateDriverEligibility(driver({ verificationStatus: "pending" }), { departureTime })
    expect(strict.eligible).toBe(false)
    expect(strict.hardBlocks.map((reason) => reason.code)).toContain("DRIVER_NOT_VERIFIED")

    const transitional = evaluateDriverEligibility(
      driver({ verificationStatus: "pending" }),
      { departureTime, policy: { requireVerifiedDriver: false } },
    )
    expect(transitional.eligible).toBe(true)
    expect(transitional.warnings.map((reason) => reason.code)).toContain("DRIVER_VERIFICATION_PENDING")
  })

  test("always blocks explicitly rejected or expired verification", () => {
    for (const verificationStatus of ["rejected", "expired"] as const) {
      const result = evaluateDriverEligibility(
        driver({ verificationStatus }),
        { departureTime, policy: { requireVerifiedDriver: false } },
      )
      expect(result.eligible).toBe(false)
      expect(result.hardBlocks.map((reason) => reason.code)).toContain("DRIVER_VERIFICATION_INVALID")
    }
  })
})

describe("evaluateTruckEligibility", () => {
  test("accepts an active available truck with known-valid compliance", () => {
    const result = evaluateTruckEligibility(truck(), { departureTime })
    expect(result.eligible).toBe(true)
    expect(result.hardBlocks).toHaveLength(0)
  })

  test("blocks maintenance and out-of-service trucks", () => {
    const maintenance = evaluateTruckEligibility(truck({ status: "maintenance" }), { departureTime })
    const blockedByMaintenance = evaluateTruckEligibility(truck({ maintenanceBlocking: true }), { departureTime })
    const outOfService = evaluateTruckEligibility(truck({ status: "out_of_service" }), { departureTime })

    expect(maintenance.hardBlocks.map((reason) => reason.code)).toContain("TRUCK_NOT_ACTIVE")
    expect(blockedByMaintenance.hardBlocks.map((reason) => reason.code)).toContain("TRUCK_MAINTENANCE_BLOCK")
    expect(outOfService.hardBlocks.map((reason) => reason.code)).toContain("TRUCK_NOT_ACTIVE")
  })

  test("blocks a truck already committed to another active trip", () => {
    const result = evaluateTruckEligibility(truck({ hasConflictingTrip: true }), { departureTime })
    expect(result.eligible).toBe(false)
    expect(result.hardBlocks.map((reason) => reason.code)).toContain("TRUCK_TRIP_CONFLICT")
  })

  test("blocks explicitly expired compliance evidence", () => {
    const result = evaluateTruckEligibility(truck({
      compliance: { insurance: "expired", roadworthy: "valid", dvla: "valid" },
    }), { departureTime })

    expect(result.eligible).toBe(false)
    expect(result.hardBlocks.map((reason) => reason.code)).toContain("TRUCK_INSURANCE_EXPIRED")
  })

  test("reports missing compliance without inventing validity, and can enforce complete compliance by policy", () => {
    const incomplete = truck({
      compliance: { insurance: "valid", roadworthy: "unknown", dvla: "missing" },
    })

    const advisory = evaluateTruckEligibility(incomplete, { departureTime })
    expect(advisory.eligible).toBe(true)
    expect(advisory.missingData).toEqual(expect.arrayContaining(["roadworthy", "dvla"]))
    expect(advisory.warnings.map((reason) => reason.code)).toContain("TRUCK_COMPLIANCE_INCOMPLETE")

    const strict = evaluateTruckEligibility(incomplete, {
      departureTime,
      policy: { requireCompleteTruckCompliance: true },
    })
    expect(strict.eligible).toBe(false)
    expect(strict.hardBlocks.map((reason) => reason.code)).toContain("TRUCK_COMPLIANCE_INCOMPLETE")
  })
})
