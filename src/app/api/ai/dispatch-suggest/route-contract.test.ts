import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"

const recommendationRoutePath = "src/app/api/ai/dispatch-suggest/route.ts"
const decisionRoutePath = "src/app/api/ai/dispatch-recommendations/[id]/decision/route.ts"

describe("dispatch copilot route contracts", () => {
  test("recommendation route delegates authority to the dispatch service", () => {
    const source = readFileSync(recommendationRoutePath, "utf8")

    expect(source).toContain("dispatchRecommendationRequestSchema")
    expect(source).toContain("getDispatchRecommendations")
    expect(source).toContain("explainDispatchRanking")
    expect(source).toContain("auth.userId")
    expect(source).toContain("auth.roleName")
    expect(source).not.toContain("availableDrivers")
    expect(source).not.toContain("availableTrucks")
    expect(source).not.toContain("/api/dispatch-suggest\`,")
  })

  test("decision route records a human decision without mutating trip assignment", () => {
    expect(existsSync(decisionRoutePath)).toBe(true)
    const source = readFileSync(decisionRoutePath, "utf8")

    expect(source).toContain("dispatchDecisionSchema")
    expect(source).toContain("recordDispatchDecision")
    expect(source).toContain("auth.userId")
    expect(source).toContain("auth.roleName")
    expect(source).not.toContain("db.trip.update")
    expect(source).not.toContain("db.trip.create")
    expect(source).not.toContain("updateTrip")
    expect(source).not.toContain("createTrip")
  })
})
