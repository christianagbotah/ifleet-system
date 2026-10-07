import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const source = readFileSync("src/components/trips/DispatchCopilotPanel.tsx", "utf8")

describe("DispatchCopilotPanel contract", () => {
  test("requests server-owned recommendations and records human decisions", () => {
    expect(source).toContain("/api/ai/dispatch-suggest")
    expect(source).toContain("/api/ai/dispatch-recommendations/${recommendationId}/decision")
    expect(source).toContain("onUseRecommendation")
    expect(source).toContain("stale")
  })

  test("cannot save or mutate a trip autonomously", () => {
    expect(source).not.toContain("createTrip(")
    expect(source).not.toContain("updateTrip(")
    expect(source).not.toContain("/api/trips")
    expect(source).not.toContain("availableDrivers")
    expect(source).not.toContain("availableTrucks")
  })

  test("shows score confidence data quality and deterministic reasons", () => {
    expect(source).toContain("candidate.score")
    expect(source).toContain("candidate.confidence")
    expect(source).toContain("candidate.dataQuality")
    expect(source).toContain("candidate.reasons")
    expect(source).toContain("Use recommendation")
  })
})
