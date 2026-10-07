import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const schema = [
  readFileSync("prisma/schema.prisma", "utf8"),
  readFileSync("prisma/dispatch.prisma", "utf8"),
].join("\n")

function modelBlock(name: string): string {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, "m"))
  return match?.[1] ?? ""
}

describe("dispatch recommendation provenance schema", () => {
  test("stores immutable recommendation provenance, explanation audit and human decision metadata", () => {
    const block = modelBlock("DispatchRecommendation")

    expect(block).not.toBe("")
    expect(block).toContain("id")
    expect(block).toContain("tripId")
    expect(block).toContain("requestedBy")
    expect(block).toContain("requestedAt")
    expect(block).toContain("rulesetVersion")
    expect(block).toContain("provider")
    expect(block).toContain("model")
    expect(block).toContain("explanationSource")
    expect(block).toContain("explanationOutput")
    expect(block).toContain("inputHash")
    expect(block).toContain("inputSnapshot")
    expect(block).toContain("rankedOutput")
    expect(block).toContain("confidence")
    expect(block).toContain("dataQuality")
    expect(block).toContain("status")
    expect(block).toContain("decision")
    expect(block).toContain("decisionBy")
    expect(block).toContain("decisionAt")
    expect(block).toContain("decisionReason")
    expect(block).toContain("selectedDriverId")
    expect(block).toContain("selectedTruckId")
    expect(block).toContain("createdAt")
    expect(block).toContain("updatedAt")
  })

  test("indexes operational lookup fields", () => {
    const block = modelBlock("DispatchRecommendation")

    expect(block).toContain("@@index([requestedAt])")
    expect(block).toContain("@@index([tripId])")
    expect(block).toContain("@@index([status])")
    expect(block).toContain("@@index([selectedDriverId])")
    expect(block).toContain("@@index([selectedTruckId])")
  })
})
