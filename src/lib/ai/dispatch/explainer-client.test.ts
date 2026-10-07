import { describe, expect, test } from "bun:test"
import { explainDispatchRanking } from "./explainer-client"
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

const trip = {
  departureTime: "2026-10-08T08:00:00Z",
  destinationZoneId: "zone-1",
  cargoUnit: "bags",
  quantity: 600,
  customerPhone: "+233000000000",
  internalNotes: "sensitive",
}

describe("dispatch explanation client", () => {
  test("sends only the sanitized deterministic payload and ignores model score authority", async () => {
    let sentBody = ""
    const fetcher: typeof fetch = async (_input, init) => {
      sentBody = String(init?.body ?? "")
      return new Response(JSON.stringify({
        success: true,
        response: JSON.stringify({
          summary: "Strong operational fit.",
          recommendations: [{
            driverId: "driver-1",
            truckId: "truck-1",
            score: 1,
            reason: "Strong compliant choice.",
          }],
        }),
      }), { status: 200, headers: { "content-type": "application/json" } })
    }

    const result = await explainDispatchRanking({ trip, rankedCandidates: ranked }, {
      config: { url: "http://ai.local:3007", internalApiKey: "test-key" },
      fetcher,
      timeoutMs: 1000,
    })

    expect(sentBody).not.toContain("+233000000000")
    expect(sentBody).not.toContain("sensitive")
    expect(sentBody).toContain("driver-1")
    expect(result.explanationSource).toBe("ai")
    expect(result.candidates[0].score).toBe(86.25)
    expect(result.candidates[0].explanation).toBe("Strong compliant choice.")
  })

  test("falls back deterministically when the model invents a candidate", async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({
      success: true,
      response: JSON.stringify({
        recommendations: [{ driverId: "driver-999", truckId: "truck-999", reason: "Invented" }],
      }),
    }), { status: 200, headers: { "content-type": "application/json" } })

    const result = await explainDispatchRanking({ trip, rankedCandidates: ranked }, {
      config: { url: "http://ai.local:3007", internalApiKey: "test-key" },
      fetcher,
      timeoutMs: 1000,
    })

    expect(result.explanationSource).toBe("deterministic")
    expect(result.candidates[0].score).toBe(86.25)
  })

  test("falls back deterministically on provider errors and timeouts", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error("provider unavailable")
    }

    const result = await explainDispatchRanking({ trip, rankedCandidates: ranked }, {
      config: { url: "http://ai.local:3007", internalApiKey: "test-key" },
      fetcher: failingFetch,
      timeoutMs: 5,
    })

    expect(result.explanationSource).toBe("deterministic")
    expect(result.candidates[0].score).toBe(86.25)
  })
})
