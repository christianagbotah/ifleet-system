import { describe, expect, test } from "bun:test"
import { validateOdometerReading } from "./validation"

describe("validateOdometerReading", () => {
  test("accepts a reading above the latest verified reading", () => {
    expect(validateOdometerReading({
      latestVerifiedReading: 100000,
      candidateReading: 100500,
      readingType: "fuel",
    })).toEqual({ valid: true })
  })

  test("rejects rollback below the latest verified reading", () => {
    expect(validateOdometerReading({
      latestVerifiedReading: 100000,
      candidateReading: 99999,
      readingType: "fuel",
    })).toMatchObject({ valid: false, code: "ODOMETER_ROLLBACK" })
  })

  test("rejects trip end below the trip start reading", () => {
    expect(validateOdometerReading({
      latestVerifiedReading: 100000,
      tripStartReading: 100200,
      candidateReading: 100199,
      readingType: "trip_end",
    })).toMatchObject({ valid: false, code: "END_BEFORE_START" })
  })

  test("permits an equal non-trip-end observation", () => {
    expect(validateOdometerReading({
      latestVerifiedReading: 100000,
      candidateReading: 100000,
      readingType: "inspection",
    })).toEqual({ valid: true })
  })

  test("permits an explicit manual adjustment to supersede a bad prior reading", () => {
    expect(validateOdometerReading({
      latestVerifiedReading: 100500,
      candidateReading: 100100,
      readingType: "manual_adjustment",
      allowAdjustment: true,
    })).toEqual({ valid: true })
  })
})
