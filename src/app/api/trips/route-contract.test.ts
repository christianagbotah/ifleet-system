import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(import.meta.dir, "route.ts"), "utf8")

test("trip POST delegates aggregate creation to transactional trip service", () => {
  expect(source).toContain("createTrip")
  expect(source).toContain("TripDomainError")
  expect(source).not.toContain("const tripCount = await db.trip.count")
  expect(source).not.toContain("await db.trip.create({")
  expect(source).not.toContain("await db.tripItem.createMany({")
  expect(source).not.toContain("await db.tripDeliveryDestination.createMany({")
  expect(source).not.toContain("Trip marked as completed on creation")
})
