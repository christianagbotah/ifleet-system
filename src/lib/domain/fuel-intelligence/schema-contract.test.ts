import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const prismaDir = join(import.meta.dir, "../../../../prisma")
const schemaFiles = readdirSync(prismaDir)
  .filter((name) => name.endsWith(".prisma"))
  .sort()
const schema = schemaFiles
  .map((name) => readFileSync(join(prismaDir, name), "utf8"))
  .join("\n")

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

describe("fuel anomaly provenance schema", () => {
  test("uses a dedicated multi-file fuel intelligence schema", () => {
    expect(existsSync(join(prismaDir, "fuel-intelligence.prisma"))).toBe(true)
  })

  test("defines stable fuel anomaly enums", () => {
    expect(block("enum", "FuelAnomalySubjectType")).toContain("fuel_event")
    expect(block("enum", "FuelAnomalySubjectType")).toContain("truck_window")
    expect(block("enum", "FuelAnomalySeverity")).toContain("critical")
    expect(block("enum", "FuelAnomalyAssessmentStatus")).toContain("false_positive")
    expect(block("enum", "FuelAnomalyOutcomeCode")).toContain("insufficient_evidence")
  })

  test("stores immutable assessment provenance and current review projection", () => {
    const model = block("model", "FuelAnomalyAssessment")
    expectFields(model, [
      "subjectType", "subjectKey", "fuelLogId", "tripId", "truckId",
      "requestedBy", "requestedAt", "rulesetVersion", "baselineVersion",
      "inputHash", "inputSnapshot", "overallRiskScore", "overallSeverity",
      "confidence", "dataQuality", "status", "explanationSource",
      "explanationProvider", "explanationModel", "explanationOutput",
      "explanationAt", "reviewedBy", "reviewedAt", "reviewNotes",
      "outcomeCode", "createdAt", "updatedAt",
    ])
    expect(model).toMatch(/@@unique\(\[subjectType, subjectKey, rulesetVersion, baselineVersion, inputHash\](?:,\s*map:\s*"[^"]+")?\)/)
    expect(model).toMatch(/@@index\(\[status\]\)/)
    expect(model).toMatch(/@@index\(\[overallSeverity\]\)/)
    expect(model).toMatch(/@@index\(\[truckId\]\)/)
    expect(model).toMatch(/@@index\(\[tripId\]\)/)
    expect(model).toMatch(/@@index\(\[fuelLogId\]\)/)
    expect(model).toMatch(/@@index\(\[requestedAt\]\)/)
  })

  test("stores immutable structured findings", () => {
    const model = block("model", "FuelAnomalyFinding")
    expectFields(model, [
      "assessmentId", "code", "severity", "riskContribution", "confidence",
      "dataQuality", "evidence", "reason", "recommendedAction", "fuelLogId",
      "tripId", "truckId", "driverId", "createdAt",
    ])
    expect(model).toMatch(/@@index\(\[assessmentId\]\)/)
    expect(model).toMatch(/@@index\(\[code\]\)/)
    expect(model).toMatch(/@@index\(\[severity\]\)/)
  })

  test("stores append-only human review transitions", () => {
    const model = block("model", "FuelAnomalyReviewEvent")
    expectFields(model, [
      "assessmentId", "fromStatus", "toStatus", "outcomeCode", "notes",
      "actorId", "createdAt",
    ])
    expect(model).toMatch(/@@index\(\[assessmentId, createdAt\]\)/)
  })
})
