import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "../../..")
const dashboardPath = join(import.meta.dir, "FuelIntelligenceDashboard.tsx")
const detailPath = join(import.meta.dir, "FuelAnomalyAssessmentDetail.tsx")
const pagePath = join(root, "src/app/(dashboard)/fuel-intelligence/page.tsx")
const shellPath = join(root, "src/app/page.tsx")
const constantsPath = join(root, "src/lib/constants.ts")

function source(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true)
  return readFileSync(path, "utf8")
}

describe("Fuel Intelligence manager/admin UI contract", () => {
  test("mounts the new review dashboard in both direct route and existing shell navigation", () => {
    const page = source(pagePath)
    const shell = source(shellPath)
    const constants = source(constantsPath)
    expect(page).toContain("FuelIntelligenceDashboard")
    expect(shell).toContain("@/components/fuel-intelligence/FuelIntelligenceDashboard")
    expect(shell).toContain("case 'fuel-anomaly'")
    expect(constants).toContain('{ id: "fuel-anomaly", label: "Fuel Intelligence"')
  })

  test("dashboard consumes server summary/list APIs and exposes required filters and observability", () => {
    const dashboard = source(dashboardPath)
    expect(dashboard).toContain("/api/ai/fuel-anomaly?view=summary")
    expect(dashboard).toContain("/api/ai/fuel-anomaly?")
    for (const text of [
      "Observer mode", "Open assessments", "Risk trend", "Finding distribution",
      "Data quality trend", "False-positive rate", "Top trucks", "Top routes", "Top stations",
      "Ruleset", "Baseline", "Status", "Severity",
    ]) expect(dashboard).toContain(text)
    for (const value of ["open", "acknowledged", "investigating", "resolved", "false_positive", "info", "low", "medium", "high", "critical"])
      expect(dashboard).toContain(value)
  })

  test("detail shows deterministic evidence, non-authoritative AI explanation and human review history", () => {
    const detail = source(detailPath)
    expect(detail).toContain("Fuel variance review")
    for (const text of ["Risk score", "Confidence", "Data quality", "Finding code", "Evidence", "Baseline cohort", "Sample size", "Review history"])
      expect(detail).toContain(text)
    expect(detail).toContain("AI explanation — non-authoritative")
    expect(detail).toContain("/review")
  })

  test("uses neutral review language and never recomputes authority or mutates source fuel/trip records", () => {
    const combined = [source(dashboardPath), source(detailPath)].join("\n")
    for (const forbidden of [
      "driver stole fuel", "theft confirmed", "aggregateFuelAnomalyAssessment", "evaluateFuelIntegrityRules",
      "/api/fuel-logs", "fuelLog.update", "trip.update", "odometerReading.update", "tripReconciliation.update",
    ]) expect(combined.toLowerCase()).not.toContain(forbidden.toLowerCase())
  })
})
