import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

test("SearchableSelect exposes the option contract used by application forms", () => {
  const source = readFileSync(join(import.meta.dir, "../../src/components/ui/searchable-select.tsx"), "utf8")
  expect(source).toContain("export interface SearchableOption")
  expect(source).toContain("description?: string")
})
