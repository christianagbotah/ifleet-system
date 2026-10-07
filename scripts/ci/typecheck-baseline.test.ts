import { describe, expect, test } from "bun:test"
import { findNewDiagnostics, parseBaseline, parseTypeScriptDiagnostics } from "./typecheck-baseline"

describe("typecheck baseline gate", () => {
  test("counts repeated diagnostics without depending on line numbers", () => {
    const parsed = parseTypeScriptDiagnostics([
      "src/a.ts(1,2): error TS2322: Type x is not assignable",
      "src/a.ts(99,4): error TS2322: Type x is not assignable",
    ].join("\n"))
    expect(parsed.get("src/a.ts\tTS2322\tType x is not assignable")).toBe(2)
  })

  test("fails only when current diagnostics exceed the frozen baseline", () => {
    const baseline = parseBaseline("2\tsrc/a.ts\tTS2322\tType x is not assignable\n")
    const same = parseTypeScriptDiagnostics("src/a.ts(8,1): error TS2322: Type x is not assignable\n")
    expect(findNewDiagnostics(same, baseline)).toEqual([])
    same.set("src/a.ts\tTS2322\tType x is not assignable", 3)
    expect(findNewDiagnostics(same, baseline)).toEqual(["1\tsrc/a.ts\tTS2322\tType x is not assignable"])
  })
})
