import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const route = readFileSync(join(import.meta.dir, "route.ts"), "utf8")
const report = readFileSync(join(import.meta.dir, "../../../lib/reports/report-data-new.ts"), "utf8")
const fuelReport = report.slice(report.indexOf("export async function fetchFuelAnalyticsData"), report.indexOf("// ── 17."))

test("fuel analytics API uses one trip population with reconciled metrics", () => {
  expect(route).toContain("normalizeFuelTrip")
  expect(route).toContain("aggregateFuelAnalytics")
  expect(route).toContain("TripReconciliation")
  expect(route).toContain("expectedFuelConsumption")
  expect(route).not.toContain("db.fuelLog.aggregate")
  expect(route).not.toContain("db.fuelLog.groupBy")
})

test("fuel analytics report uses reconciled trip metrics without fixed km-per-litre assumptions", () => {
  expect(fuelReport).toContain("normalizeFuelTrip")
  expect(fuelReport).toContain("TripReconciliation")
  expect(fuelReport).not.toContain("AVG_KM_PER_LITER")
  expect(fuelReport).not.toContain("db.fuelLog.findMany")
})
