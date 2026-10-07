import { describe, expect, test } from "bun:test"
import { evaluateTruckEligibility } from "./eligibility"
import type { TruckEligibilityCandidate } from "./types"

const departureTime = new Date("2026-10-08T08:00:00Z")

function truck(capacitySufficient: boolean | null): TruckEligibilityCandidate {
  return {
    id: "truck-1",
    plateNumber: "GT-1000-26",
    status: "active",
    hasConflictingTrip: false,
    maintenanceBlocking: false,
    capacitySufficient,
    compliance: { insurance: "valid", roadworthy: "valid", dvla: "valid" },
  }
}

describe("truck dispatch capacity eligibility", () => {
  test("hard-blocks a truck when authoritative capacity proves the planned load will not fit", () => {
    const result = evaluateTruckEligibility(truck(false), { departureTime })
    expect(result.eligible).toBe(false)
    expect(result.hardBlocks.map((reason) => reason.code)).toContain("TRUCK_CAPACITY_INSUFFICIENT")
  })

  test("does not invent a capacity decision when the required conversion is unknown", () => {
    const result = evaluateTruckEligibility(truck(null), { departureTime })
    expect(result.eligible).toBe(true)
    expect(result.hardBlocks.map((reason) => reason.code)).not.toContain("TRUCK_CAPACITY_INSUFFICIENT")
  })
})
