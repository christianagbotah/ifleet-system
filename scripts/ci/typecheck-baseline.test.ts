import { describe, expect, test } from "bun:test"
import { findNewDiagnostics, parseBaseline, parseTypeScriptDiagnostics } from "./typecheck-baseline"

describe("typecheck baseline gate", () => {
  test("uses stable file and error-code signatures across line and message rendering changes", () => {
    const parsed = parseTypeScriptDiagnostics([
      "src/a.ts(1,2): error TS2322: Type import(\"/home/local/node_modules/pkg\").X is not assignable",
      "src/a.ts(99,4): error TS2322: Type import(\"/home/runner/node_modules/pkg\").Y is not assignable",
    ].join("\n"))
    expect(parsed.get("src/a.ts\tTS2322")).toBe(2)
    expect(parsed.size).toBe(1)
  })

  test("fails when a file/code count grows or a new error code appears", () => {
    const baseline = parseBaseline("2\tsrc/a.ts\tTS2322\n")
    const current = parseTypeScriptDiagnostics("src/a.ts(8,1): error TS2322: changed rendering\n")
    expect(findNewDiagnostics(current, baseline)).toEqual([])
    current.set("src/a.ts\tTS2322", 3)
    expect(findNewDiagnostics(current, baseline)).toEqual(["1\tsrc/a.ts\tTS2322"])
    current.set("src/a.ts\tTS2339", 1)
    expect(findNewDiagnostics(current, baseline)).toEqual(["1\tsrc/a.ts\tTS2322", "1\tsrc/a.ts\tTS2339"])
  })
})
