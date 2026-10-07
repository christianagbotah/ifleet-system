import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import {
  buildDispatchExplanationRequest,
  parseDispatchExplanationResponse,
} from "./dispatch-explainer"

const rankedCandidates = [
  {
    driverId: "driver-1",
    truckId: "truck-1",
    score: 88.5,
    confidence: 0.91,
    dataQuality: 0.84,
    components: { compliance: 100, routeExperience: 80 },
    reasons: ["Eligible", "No active trip"],
  },
  {
    driverId: "driver-2",
    truckId: "truck-2",
    score: 81.2,
    confidence: 0.82,
    dataQuality: 0.73,
    components: { compliance: 70, routeExperience: 75 },
    reasons: ["Eligible", "Compliance data incomplete"],
  },
]

describe("dispatch explanation-only mini-service contract", () => {
  test("accepts only an explicit explanation-only request with server-ranked candidates", () => {
    const request = buildDispatchExplanationRequest({
      explanationOnly: true,
      tripDetails: {
        departureTime: "2026-10-10T08:00:00.000Z",
        destinationZoneId: "zone-1",
        cargoUnit: "bags",
        quantity: 600,
      },
      rankedCandidates,
      rulesetVersion: "dispatch-v1",
    })

    expect(request.candidates.map((candidate) => `${candidate.driverId}:${candidate.truckId}`)).toEqual([
      "driver-1:truck-1",
      "driver-2:truck-2",
    ])
    expect(request.prompt).toContain("explain only")
    expect(request.prompt).toContain("Do not add, remove, reorder, rescore, approve, or assign")
    expect(request.prompt).not.toContain("availableDrivers")
    expect(request.prompt).not.toContain("availableTrucks")
  })

  test("rejects legacy caller-owned candidate arrays and non-explanation requests", () => {
    expect(() => buildDispatchExplanationRequest({
      explanationOnly: false,
      tripDetails: {},
      rankedCandidates,
    })).toThrow("explanationOnly")

    expect(() => buildDispatchExplanationRequest({
      explanationOnly: true,
      tripDetails: {},
      rankedCandidates,
      availableDrivers: [{ id: "driver-invented" }],
    })).toThrow("caller-supplied candidate")
  })

  test("wires the HTTP endpoint through the explanation-only validator and parser", () => {
    const service = readFileSync("mini-services/ai-service/index.ts", "utf8")
    expect(service).toContain("buildDispatchExplanationRequest(body)")
    expect(service).toContain("parseDispatchExplanationResponse(")
    expect(service).not.toContain("const { tripDetails, availableDrivers, availableTrucks } = body")
    expect(service).not.toContain("callGroq(DISPATCH_PROMPT")
  })

  test("returns explanation text only for known supplied pairs", () => {
    const parsed = parseDispatchExplanationResponse(JSON.stringify({
      summary: "The first pair has the strongest verified evidence.",
      explanations: [
        { driverId: "driver-1", truckId: "truck-1", explanation: "Strong compliance and route evidence." },
        { driverId: "driver-2", truckId: "truck-2", explanation: "Eligible, with lower data completeness." },
      ],
    }), rankedCandidates)

    expect(parsed).toEqual({
      summary: "The first pair has the strongest verified evidence.",
      explanations: [
        { driverId: "driver-1", truckId: "truck-1", explanation: "Strong compliance and route evidence." },
        { driverId: "driver-2", truckId: "truck-2", explanation: "Eligible, with lower data completeness." },
      ],
    })
    expect(JSON.stringify(parsed)).not.toContain("score")
  })

  test("rejects invented pairs, authority-bearing fields, duplicates and malformed output", () => {
    expect(() => parseDispatchExplanationResponse(JSON.stringify({
      explanations: [{ driverId: "driver-x", truckId: "truck-x", explanation: "Invented" }],
    }), rankedCandidates)).toThrow("unknown candidate")

    expect(() => parseDispatchExplanationResponse(JSON.stringify({
      explanations: [{ driverId: "driver-1", truckId: "truck-1", explanation: "Text", score: 100 }],
    }), rankedCandidates)).toThrow("authority-bearing")

    expect(() => parseDispatchExplanationResponse(JSON.stringify({
      explanations: [
        { driverId: "driver-1", truckId: "truck-1", explanation: "First" },
        { driverId: "driver-1", truckId: "truck-1", explanation: "Duplicate" },
      ],
    }), rankedCandidates)).toThrow("duplicate")

    expect(() => parseDispatchExplanationResponse("not-json", rankedCandidates)).toThrow("valid JSON")
  })
})
