import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const source = readFileSync(join(import.meta.dir, "route.ts"), "utf8")

test("fuel POST delegates validation and atomic persistence to the fuel service", () => {
  expect(source).toContain("fuelLogCreateSchema")
  expect(source).toContain("validateBody")
  expect(source).toContain("createFuelEvent")
  expect(source).not.toContain("best-effort trip update")
  expect(source).not.toContain(".catch(() =>")
})
