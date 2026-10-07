import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(import.meta.dir, "route.ts"), "utf8")

test("trip reconciliation API is manager/admin scoped and separates calculate from save", () => {
  expect(source).toContain("requireRole")
  expect(source).toContain("ROLES.ADMIN")
  expect(source).toContain("ROLES.MANAGER")
  expect(source).toContain("calculateTripReconciliation")
  expect(source).toContain("saveTripReconciliation")
  expect(source).toContain("export async function GET")
  expect(source).toContain("export async function POST")
})
