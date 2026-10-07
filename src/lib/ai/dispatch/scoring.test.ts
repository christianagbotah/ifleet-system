import { describe, expect, test } from "bun:test"
import {
  DISPATCH_RULESET_VERSION,
  DISPATCH_SCORE_WEIGHTS,
  rankDispatchPairs,
  scoreDispatchPair,
  type DispatchScoreEvidence,
} from "./scoring"

function evidence(overrides: Partial<DispatchScoreEvidence> = {}): DispatchScoreEvidence {
  return {
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
    ...overrides,
  }
}

describe("scoreDispatchPair", () => {
  test("uses a versioned weight set that sums to 100", () => {
    expect(DISPATCH_RULESET_VERSION).toBe("dispatch-v1")
    expect(Object.values(DISPATCH_SCORE_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100)
  })

  test("calculates a deterministic weighted score with component provenance", () => {
    const result = scoreDispatchPair(evidence())

    expect(result.score).toBe(86.25)
    expect(result.dataQuality).toBe(1)
    expect(result.confidence).toBe(1)
    expect(result.rulesetVersion).toBe("dispatch-v1")
    expect(result.components.capacityFit).toEqual({ value: 100, weight: 5, known: true })
  })

  test("rejects an ineligible pair instead of allowing performance to compensate", () => {
    expect(() => scoreDispatchPair(evidence({ eligible: false }))).toThrow("ineligible")
  })

  test("uses neutral score for unknown optional evidence while lowering data quality", () => {
    const result = scoreDispatchPair(evidence({
      components: {
        availability: 100,
        compliance: 100,
        routeExperience: null,
        historicalPerformance: null,
        fuelEfficiency: null,
        maintenanceReadiness: 90,
        workloadBalance: 80,
        locationFit: null,
        capacityFit: null,
      },
    }))

    expect(result.components.routeExperience).toEqual({ value: 50, weight: 15, known: false })
    expect(result.score).toBe(73)
    expect(result.dataQuality).toBe(0.5)
    expect(result.confidence).toBe(0.5)
  })

  test("clamps malformed normalized inputs to the 0-100 scoring range", () => {
    const result = scoreDispatchPair(evidence({
      components: {
        availability: 120,
        compliance: 100,
        routeExperience: -10,
        historicalPerformance: 75,
        fuelEfficiency: 70,
        maintenanceReadiness: 90,
        workloadBalance: 80,
        locationFit: 60,
        capacityFit: 100,
      },
    }))

    expect(result.components.availability.value).toBe(100)
    expect(result.components.routeExperience.value).toBe(0)
    expect(result.score).toBeGreaterThanOrEqual(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })
})

describe("rankDispatchPairs", () => {
  test("sorts by score, then data quality, then lower workload, then stable IDs", () => {
    const a = scoreDispatchPair(evidence({ driverId: "driver-b", truckId: "truck-2", currentWorkload: 2 }))
    const b = scoreDispatchPair(evidence({ driverId: "driver-a", truckId: "truck-2", currentWorkload: 1 }))
    const c = scoreDispatchPair(evidence({
      driverId: "driver-c",
      truckId: "truck-1",
      currentWorkload: 0,
      components: {
        availability: 100,
        compliance: 100,
        routeExperience: null,
        historicalPerformance: 100,
        fuelEfficiency: 70,
        maintenanceReadiness: 90,
        workloadBalance: 80,
        locationFit: 75,
        capacityFit: 100,
      },
    }))

    const ranked = rankDispatchPairs([a, c, b])
    expect(ranked.map((row) => row.driverId)).toEqual(["driver-a", "driver-b", "driver-c"])
  })

  test("uses stable lexical IDs when all other ranking signals tie", () => {
    const first = scoreDispatchPair(evidence({ driverId: "driver-a", truckId: "truck-z", currentWorkload: 1 }))
    const second = scoreDispatchPair(evidence({ driverId: "driver-a", truckId: "truck-a", currentWorkload: 1 }))

    expect(rankDispatchPairs([first, second]).map((row) => row.truckId)).toEqual(["truck-a", "truck-z"])
  })
})
