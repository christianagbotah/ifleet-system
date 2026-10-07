import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = readFileSync(join(import.meta.dir, "route.ts"), "utf8")
const detail = readFileSync(join(import.meta.dir, "[id]/route.ts"), "utf8")

test("fuel anomaly GET list/summary routes are manager/admin scoped and delegate to read-only query service", () => {
  for (const required of ["requireRole", "ROLES.ADMIN", "ROLES.MANAGER", "listFuelAnomalyAssessments", "getFuelAnomalyDashboardSummary"]) expect(root).toContain(required)
  for (const forbidden of ["inputSnapshot", "db.", "aggregateFuelAnomalyAssessment", "fuelLog.update", "trip.update"]) expect(root).not.toContain(forbidden)
})

test("fuel anomaly detail route delegates to safe detail projection without source writes", () => {
  for (const required of ["requireRole", "ROLES.ADMIN", "ROLES.MANAGER", "getFuelAnomalyAssessmentDetailView"]) expect(detail).toContain(required)
  for (const forbidden of ["inputSnapshot", "db.", "fuelLog.update", "trip.update", "odometerReading.update"]) expect(detail).not.toContain(forbidden)
})
