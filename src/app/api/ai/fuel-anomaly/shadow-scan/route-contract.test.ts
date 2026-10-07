import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(import.meta.dir, "route.ts"), "utf8")

test("observer scan endpoint is admin/internal only and delegates to bounded scan service", () => {
  for (const required of ["ROLES.ADMIN", "INTERNAL_API_KEY", "scanFuelAnomalySubjects", "normalizeFuelAnomalyShadowScanInput", "export async function POST"]) {
    expect(source).toContain(required)
  }
  for (const forbidden of ["fuelLogs", "vehicleInfo", "findings", "scores", "db.", "trip.update", "fuelLog.update", "sendNotification"]) {
    expect(source).not.toContain(forbidden)
  }
})
