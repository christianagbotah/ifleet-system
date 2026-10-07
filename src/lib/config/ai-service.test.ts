import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getAiServiceConfig } from "./ai-service"

describe("AI service fail-closed configuration", () => {
  test("requires explicit service URL and internal key", () => {
    expect(() => getAiServiceConfig({})).toThrow("AI_SERVICE_URL")
    expect(() => getAiServiceConfig({ AI_SERVICE_URL: "http://127.0.0.1:3007" })).toThrow("INTERNAL_API_KEY")
    expect(getAiServiceConfig({ AI_SERVICE_URL: " http://127.0.0.1:3007/ ", INTERNAL_API_KEY: " secret " })).toEqual({
      url: "http://127.0.0.1:3007",
      internalApiKey: "secret",
    })
  })

  test("legacy fuel anomaly route and mini-service contain no fallback internal credential", () => {
    const repo = join(import.meta.dir, "../../..")
    const route = readFileSync(join(repo, "src/app/api/ai/fuel-anomaly/route.ts"), "utf8")
    const service = readFileSync(join(repo, "mini-services/ai-service/index.ts"), "utf8")
    expect(route).not.toContain("ifleetpro-internal-key-change-me")
    expect(service).not.toContain("ifleetpro-internal-key-change-me")
    expect(route).not.toContain("http://localhost:3007")
  })
})
