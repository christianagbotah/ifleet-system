import { describe, expect, test } from "bun:test"
import {
  dispatchDecisionSchema,
  dispatchRecommendationRequestSchema,
} from "./request-schema"

describe("dispatch API request schemas", () => {
  test("accepts a trip id request", () => {
    expect(dispatchRecommendationRequestSchema.parse({ tripId: "trip-1" })).toEqual({ tripId: "trip-1" })
  })

  test("accepts and normalizes a trip draft", () => {
    const parsed = dispatchRecommendationRequestSchema.parse({
      tripDraft: {
        departureTime: "2026-10-08T08:00:00.000Z",
        destinationZoneId: "zone-1",
        quantity: 600,
        cargoUnit: "bags",
      },
    })

    expect("tripDraft" in parsed && parsed.tripDraft.departureTime).toBeInstanceOf(Date)
  })

  test("rejects caller-supplied candidate arrays", () => {
    expect(() => dispatchRecommendationRequestSchema.parse({
      tripId: "trip-1",
      availableDrivers: [{ id: "driver-1" }],
    })).toThrow()
    expect(() => dispatchRecommendationRequestSchema.parse({
      tripId: "trip-1",
      availableTrucks: [{ id: "truck-1" }],
    })).toThrow()
  })

  test("rejects ambiguous or missing recommendation subjects", () => {
    expect(() => dispatchRecommendationRequestSchema.parse({})).toThrow()
    expect(() => dispatchRecommendationRequestSchema.parse({
      tripId: "trip-1",
      tripDraft: { departureTime: "2026-10-08T08:00:00.000Z" },
    })).toThrow()
  })

  test("validates human decisions without accepting an actor id", () => {
    expect(dispatchDecisionSchema.parse({
      decision: "accepted",
      selectedDriverId: "driver-1",
      selectedTruckId: "truck-1",
      reason: "Best verified fit",
    })).toEqual({
      decision: "accepted",
      selectedDriverId: "driver-1",
      selectedTruckId: "truck-1",
      reason: "Best verified fit",
    })

    expect(() => dispatchDecisionSchema.parse({
      decision: "accepted",
      selectedDriverId: "driver-1",
      selectedTruckId: "truck-1",
      userId: "spoofed-user",
    })).toThrow()

    expect(() => dispatchDecisionSchema.parse({ decision: "accepted" })).toThrow()
    expect(dispatchDecisionSchema.parse({ decision: "rejected", reason: "No suitable pair" })).toEqual({
      decision: "rejected",
      reason: "No suitable pair",
    })
  })
})
