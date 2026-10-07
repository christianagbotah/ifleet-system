import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const route = readFileSync(join(import.meta.dir, "route.ts"), "utf8")
const review = readFileSync(join(import.meta.dir, "[id]/review/route.ts"), "utf8")

test("fuel anomaly assessment API is manager/admin scoped and delegates to authoritative services", () => {
  for (const required of ["requireRole", "ROLES.ADMIN", "ROLES.MANAGER", "parseFuelAnomalySubject", "assessFuelAnomaly", "explainFuelAnomalyAssessment", "recordFuelAnomalyExplanation", "export async function POST", "export async function GET"]) {
    expect(route).toContain(required)
  }
  for (const forbidden of ["fuelLogs", "vehicleInfo", "db.", "fuelLog.find", "trip.update", "fuelLog.update", "odometerReading.update"]) {
    expect(route).not.toContain(forbidden)
  }
})

test("fuel anomaly review API records audit state only", () => {
  for (const required of ["requireRole", "ROLES.ADMIN", "ROLES.MANAGER", "parseFuelAnomalyReviewInput", "recordFuelAnomalyReview"]) {
    expect(review).toContain(required)
  }
  for (const forbidden of ["db.", "trip.update", "fuelLog.update", "odometerReading.update", "tripReconciliation.update"]) {
    expect(review).not.toContain(forbidden)
  }
})
