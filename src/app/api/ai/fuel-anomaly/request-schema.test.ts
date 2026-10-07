import { describe, expect, test } from "bun:test"
import { parseFuelAnomalyReviewInput, parseFuelAnomalySubject } from "./request-schema"

describe("fuel anomaly API request schema", () => {
  test("accepts exactly one server-owned assessment subject", () => {
    expect(parseFuelAnomalySubject({ fuelLogId: "fuel-1" })).toEqual({ fuelLogId: "fuel-1" })
    expect(parseFuelAnomalySubject({ tripId: "trip-1" })).toEqual({ tripId: "trip-1" })
    expect(parseFuelAnomalySubject({ truckId: "truck-1", startDate: "2026-10-01T00:00:00Z", endDate: "2026-10-07T00:00:00Z" })).toEqual({
      truckId: "truck-1",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-10-07T00:00:00.000Z"),
    })
  })

  test("rejects missing, ambiguous and caller-owned evidence/authority fields", () => {
    for (const body of [
      {},
      { fuelLogId: "fuel-1", tripId: "trip-1" },
      { truckId: "truck-1", startDate: "2026-10-07", endDate: "2026-10-01" },
      { tripId: "trip-1", fuelLogs: [] },
      { tripId: "trip-1", vehicleInfo: {} },
      { tripId: "trip-1", baselines: [] },
      { tripId: "trip-1", findings: [] },
      { tripId: "trip-1", scores: {} },
      { tripId: "trip-1", driverHistory: [] },
      { tripId: "trip-1", userId: "spoof" },
      { tripId: "trip-1", actorId: "spoof" },
    ]) {
      expect(() => parseFuelAnomalySubject(body)).toThrow()
    }
  })

  test("accepts review state/outcome/notes only and rejects actor spoofing", () => {
    expect(parseFuelAnomalyReviewInput({ toStatus: "resolved", outcomeCode: "verified_legitimate", notes: "Receipt verified" })).toEqual({
      toStatus: "resolved", outcomeCode: "verified_legitimate", notes: "Receipt verified",
    })
    expect(() => parseFuelAnomalyReviewInput({ toStatus: "resolved", outcomeCode: "theft_confirmed" })).toThrow()
    expect(() => parseFuelAnomalyReviewInput({ toStatus: "acknowledged", userId: "spoof" })).toThrow()
    expect(() => parseFuelAnomalyReviewInput({ toStatus: "acknowledged", actorId: "spoof" })).toThrow()
  })
})
