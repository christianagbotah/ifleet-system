import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const createRoute = readFileSync(join(import.meta.dir, "route.ts"), "utf8")
const updateRoute = readFileSync(join(import.meta.dir, "[id]/route.ts"), "utf8")
const ui = readFileSync(join(import.meta.dir, "../../../components/operations/WeightVerificationView.tsx"), "utf8")

test("weighbridge API separates verification status from variance classification", () => {
  expect(createRoute).toContain("calculateWeightVariance")
  expect(createRoute).toContain("varianceClass")
  expect(createRoute).not.toContain("status: 'overweight'")
  expect(createRoute).not.toContain("status: 'underweight'")
  expect(updateRoute).toContain("calculateWeightVariance")
  expect(updateRoute).toContain("varianceClass")
})

test("weight UI renders status and variance classification separately", () => {
  expect(ui).toContain("VARIANCE_CLASS_CONFIG")
  expect(ui).toContain("Classification")
  expect(ui).toContain("variance_detected")
  expect(ui).not.toContain('value="overweight"')
  expect(ui).not.toContain('value="underweight"')
})
