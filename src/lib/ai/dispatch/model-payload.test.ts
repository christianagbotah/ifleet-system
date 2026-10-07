import { describe, expect, test } from "bun:test"
import {
  buildDispatchExplanationPayload,
  mergeDispatchExplanations,
  type DispatchExplanationInput,
} from "./model-payload"
import { scoreDispatchPair } from "./scoring"

const ranked = [scoreDispatchPair({
  driverId: "driver-1",
  truckId: "truck-1",
  eligible: true,
  currentWorkload: 1,
  components: {
    availability: 100,
    compliance: 100,
    routeExperience: 80,
    historicalPerformance: 75,
    fuelEfficiency: 70,
    maintenanceReadiness: 90,
    workloadBalance: 80,
    locationFit: 60,
    capacityFit: 100,
  },
})]

function input(): DispatchExplanationInput {
  return {
    trip: {
      departureTime: "2026-10-08T08:00:00Z",
      destinationZoneId: "zone-1",
      cargoUnit: "bags",
      quantity: 600,
      // These are deliberately present upstream and must never cross the model boundary.
      customerPhone: "+233000000000",
      customerEmail: "private@example.com",
      internalNotes: "sensitive internal note",
    },
    rankedCandidates: ranked.map((candidate) => ({
      ...candidate,
      driverName: "Private Driver Name",
      driverPhone: "+233111111111",
      ghanaCardNumber: "GHA-PRIVATE",
      licenseNumber: "LIC-PRIVATE",
      email: "driver@example.com",
      truckInternalNotes: "do not send",
      secret: "top-secret",
    })),
  } as DispatchExplanationInput
}

describe("buildDispatchExplanationPayload", () => {
  test("serializes only allow-listed operational fields", () => {
    const payload = buildDispatchExplanationPayload(input())
    const serialized = JSON.stringify(payload)

    expect(payload.trip).toEqual({
      departureTime: "2026-10-08T08:00:00Z",
      destinationZoneId: "zone-1",
      cargoUnit: "bags",
      quantity: 600,
    })
    expect(payload.candidates).toHaveLength(1)
    expect(payload.candidates[0].driverId).toBe("driver-1")
    expect(payload.candidates[0].truckId).toBe("truck-1")
    expect(payload.candidates[0].score).toBe(86.25)

    for (const forbidden of [
      "+233000000000",
      "+233111111111",
      "private@example.com",
      "driver@example.com",
      "GHA-PRIVATE",
      "LIC-PRIVATE",
      "sensitive internal note",
      "do not send",
      "top-secret",
      "Private Driver Name",
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})

describe("mergeDispatchExplanations", () => {
  test("accepts explanation text only for known candidate IDs without changing score authority", () => {
    const merged = mergeDispatchExplanations(ranked, {
      summary: "Recommended because the pair has strong availability and compliance evidence.",
      explanations: [{
        driverId: "driver-1",
        truckId: "truck-1",
        explanation: "Strong compliant choice.",
        score: 1,
      }],
    })

    expect(merged.explanationSource).toBe("ai")
    expect(merged.summary).toContain("availability")
    expect(merged.candidates[0].score).toBe(86.25)
    expect(merged.candidates[0].explanation).toBe("Strong compliant choice.")
  })

  test("falls back to deterministic reasons when the model invents a candidate", () => {
    const merged = mergeDispatchExplanations(ranked, {
      summary: "Invented result",
      explanations: [{
        driverId: "driver-999",
        truckId: "truck-999",
        explanation: "Use this one",
      }],
    })

    expect(merged.explanationSource).toBe("deterministic")
    expect(merged.summary).toBeNull()
    expect(merged.candidates[0].score).toBe(86.25)
    expect(merged.candidates[0].explanation).toContain("strong evidence")
  })

  test("falls back safely for malformed response shapes", () => {
    for (const response of [null, "not-json", {}, { explanations: "wrong" }]) {
      const merged = mergeDispatchExplanations(ranked, response)
      expect(merged.explanationSource).toBe("deterministic")
      expect(merged.candidates[0].score).toBe(86.25)
    }
  })
})
