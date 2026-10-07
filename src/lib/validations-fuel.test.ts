import { describe, expect, test } from "bun:test"
import { fuelLogCreateSchema } from "./validations"

const base = {
  truckId: "truck-1",
  tripId: "trip-1",
  date: "2026-10-07T08:00:00Z",
  litersFilled: "100",
  totalCost: "1500",
  stationName: "Factory Fuel Bay",
  receiptNumber: "FUEL-001",
}

describe("fuelLogCreateSchema", () => {
  test("coerces normal fuel quantities and validates event metadata", () => {
    const parsed = fuelLogCreateSchema.parse({
      ...base,
      eventType: "purchase",
      source: "manual",
      latitude: 5.6037,
      longitude: -0.187,
    })
    expect(parsed.litersFilled).toBe(100)
    expect(parsed.totalCost).toBe(1500)
    expect(parsed.eventType).toBe("purchase")
    expect(parsed.source).toBe("manual")
  })

  test("rejects zero or negative litres/cost for normal fuel events", () => {
    for (const patch of [
      { litersFilled: 0 },
      { litersFilled: -1 },
      { totalCost: 0 },
      { totalCost: -1 },
    ]) {
      expect(fuelLogCreateSchema.safeParse({ ...base, eventType: "purchase", ...patch }).success).toBe(false)
    }
  })

  test("rejects invalid event type, source, and GPS bounds", () => {
    expect(fuelLogCreateSchema.safeParse({ ...base, eventType: "magic" }).success).toBe(false)
    expect(fuelLogCreateSchema.safeParse({ ...base, source: "unknown" }).success).toBe(false)
    expect(fuelLogCreateSchema.safeParse({ ...base, latitude: 91 }).success).toBe(false)
    expect(fuelLogCreateSchema.safeParse({ ...base, longitude: -181 }).success).toBe(false)
  })

  test("requires both reversal reference and reason", () => {
    expect(fuelLogCreateSchema.safeParse({ ...base, eventType: "reversal" }).success).toBe(false)
    expect(fuelLogCreateSchema.safeParse({ ...base, eventType: "reversal", reversalOfId: "fuel-1" }).success).toBe(false)
    expect(fuelLogCreateSchema.safeParse({
      ...base,
      eventType: "reversal",
      reversalOfId: "fuel-1",
      notes: "Duplicate supplier ticket",
    }).success).toBe(true)
  })
})
