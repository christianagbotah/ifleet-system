import { describe, expect, test } from "bun:test"
import { calculateWeightVariance, WeightVarianceError } from "./variance"

describe("calculateWeightVariance", () => {
  test("treats missing declared weight as verified without a variance", () => {
    expect(calculateWeightVariance(30, null)).toEqual({
      variance: null, variancePercent: null, status: "verified", varianceClass: "within_tolerance",
    })
  })

  test("keeps exact plus/minus five percent within tolerance", () => {
    expect(calculateWeightVariance(105, 100)).toMatchObject({ status: "verified", varianceClass: "within_tolerance" })
    expect(calculateWeightVariance(95, 100)).toMatchObject({ status: "verified", varianceClass: "within_tolerance" })
  })

  test("classifies variance above five percent as over", () => {
    expect(calculateWeightVariance(105.1, 100)).toMatchObject({ status: "variance_detected", varianceClass: "over" })
  })

  test("classifies variance below minus five percent as under", () => {
    expect(calculateWeightVariance(94.9, 100)).toMatchObject({ status: "variance_detected", varianceClass: "under" })
  })

  test("rejects zero and negative declared weight", () => {
    for (const declared of [0, -1]) {
      try { calculateWeightVariance(100, declared); throw new Error("expected rejection") }
      catch (error) {
        expect(error).toBeInstanceOf(WeightVarianceError)
        expect((error as WeightVarianceError).code).toBe("INVALID_DECLARED_WEIGHT")
      }
    }
  })
})
