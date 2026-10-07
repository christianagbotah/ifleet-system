import { describe, expect, test } from "bun:test"
import {
  generateDispatchRecommendations,
  type DispatchRecommendationEngineInput,
} from "./recommendation-engine"

function baseInput(): DispatchRecommendationEngineInput {
  return {
    context: { departureTime: new Date("2026-10-08T08:00:00Z") },
    trip: {
      departureTime: "2026-10-08T08:00:00Z",
      destinationZoneId: "zone-1",
      cargoUnit: "bags",
      quantity: 600,
    },
    drivers: [{
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
    }],
    trucks: [{
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
    }],
  }
}

describe("generateDispatchRecommendations", () => {
  test("returns deterministic recommendations when no model explainer is configured", async () => {
    const result = await generateDispatchRecommendations(baseInput())

    expect(result.explanationSource).toBe("deterministic")
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].score).toBe(86.25)
    expect(result.candidates[0].explanation.length).toBeGreaterThan(0)
  })

  test("keeps deterministic recommendations usable when model provider fails", async () => {
    const result = await generateDispatchRecommendations(baseInput(), async () => {
      throw new Error("provider timeout")
    })

    expect(result.explanationSource).toBe("deterministic")
    expect(result.candidates[0].score).toBe(86.25)
    expect(result.explanationError).toBe("provider timeout")
  })

  test("accepts valid explanation-only output without transferring score authority", async () => {
    const result = await generateDispatchRecommendations(baseInput(), async () => ({
      summary: "Strong operational choice.",
      explanations: [{
        driverId: "driver-1",
        truckId: "truck-1",
        explanation: "Valid licence, no active conflict and good operational evidence.",
        score: 0,
      }],
    }))

    expect(result.explanationSource).toBe("ai")
    expect(result.candidates[0].score).toBe(86.25)
    expect(result.candidates[0].explanation).toContain("Valid licence")
  })

  test("rejects invented model candidates and falls back without changing ranking", async () => {
    const result = await generateDispatchRecommendations(baseInput(), async () => ({
      summary: "Use invented resource",
      explanations: [{
        driverId: "driver-invented",
        truckId: "truck-invented",
        explanation: "invented",
      }],
    }))

    expect(result.explanationSource).toBe("deterministic")
    expect(result.candidates.map((candidate) => candidate.driverId)).toEqual(["driver-1"])
    expect(result.candidates[0].score).toBe(86.25)
  })

  test("limits explanation payload and output to the deterministic top N", async () => {
    const input = baseInput()
    input.trucks = Array.from({ length: 8 }, (_, index) => ({
      ...input.trucks[0],
      id: `truck-${index + 1}`,
      plateNumber: `GT-${1000 + index}-26`,
      fuelEfficiencyScore: 90 - index,
    }))
    input.maxRecommendations = 3

    let payloadCandidateCount = 0
    const result = await generateDispatchRecommendations(input, async (payload) => {
      payloadCandidateCount = payload.candidates.length
      return {
        summary: "Top three",
        explanations: payload.candidates.map((candidate) => ({
          driverId: candidate.driverId,
          truckId: candidate.truckId,
          explanation: "Ranked candidate",
        })),
      }
    })

    expect(payloadCandidateCount).toBe(3)
    expect(result.candidates).toHaveLength(3)
  })
})
