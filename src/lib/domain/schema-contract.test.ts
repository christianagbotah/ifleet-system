import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const schema = readFileSync(join(import.meta.dir, "../../../prisma/schema.prisma"), "utf8")

function block(kind: "model" | "enum", name: string): string {
  const match = schema.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`))
  expect(match, `${kind} ${name} must exist`).not.toBeNull()
  return match?.[1] ?? ""
}

function expectFields(source: string, fields: string[]) {
  for (const field of fields) {
    expect(source, `missing field ${field}`).toMatch(new RegExp(`^\\s*${field}\\s+`, "m"))
  }
}

describe("core-integrity Prisma schema contract", () => {
  test("defines the canonical ledger and reconciliation enums", () => {
    expect(block("enum", "OdometerReadingType")).toContain("trip_start")
    expect(block("enum", "ObservationSource")).toContain("driver_app")
    expect(block("enum", "VerificationStatus")).toContain("superseded")
    expect(block("enum", "FuelEventType")).toContain("reversal")
    expect(block("enum", "WeightVarianceClass")).toContain("within_tolerance")
  })

  test("defines a per-year transactional trip sequence", () => {
    const model = block("model", "TripSequence")
    expectFields(model, ["year", "lastValue", "createdAt", "updatedAt"])
    expect(model).toMatch(/^\s*year\s+Int\s+@unique/m)
    expect(model).toMatch(/^\s*lastValue\s+Int/m)
  })

  test("defines an immutable odometer-reading ledger contract", () => {
    const model = block("model", "OdometerReading")
    expectFields(model, ["truckId", "tripId", "reading", "recordedAt", "readingType", "source", "verificationStatus", "evidence", "capturedBy", "adjustmentReason", "supersedesId"])
    expect(model).toMatch(/^\s*tripId\s+String\?/m)
    expect(model).toMatch(/@@index\(\[truckId, recordedAt\]\)/)
    expect(model).toMatch(/@@index\(\[tripId, recordedAt\]\)/)
    expect(model).toMatch(/@@index\(\[verificationStatus\]\)/)
  })

  test("defines a one-per-trip reconciliation snapshot with frozen metrics", () => {
    const model = block("model", "TripReconciliation")
    expectFields(model, ["tripId", "distanceKm", "fuelAddedLiters", "consumedLiters", "fuelCost", "kmPerLiter", "litersPer100Km", "fuelCostPerKm", "expenseCost", "revenue", "exceptionCount", "reconciledAt", "reconciledBy"])
    expect(model).toMatch(/^\s*tripId\s+String\s+@unique/m)
  })

  test("extends FuelLog as the authoritative fuel event for this phase", () => {
    const model = block("model", "FuelLog")
    expectFields(model, ["eventType", "source", "verificationStatus", "capturedBy", "latitude", "longitude", "paymentSource", "reversalOfId"])
    expect(model).toMatch(/^\s*reversalOfId\s+String\?/m)
  })

  test("separates weight verification state from variance classification", () => {
    const status = block("enum", "WeightVerificationStatus")
    expect(status).toContain("pending")
    expect(status).toContain("verified")
    expect(status).toContain("failed")
    expect(status).toContain("variance_detected")
    expect(status).not.toContain("overweight")
    expect(status).not.toContain("underweight")
    const model = block("model", "WeightVerification")
    expectFields(model, ["status", "varianceClass"])
  })
})
