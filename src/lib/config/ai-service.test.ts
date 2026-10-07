import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { getAiServiceConfig } from "./ai-service"

describe("AI service configuration", () => {
  test("returns explicit configuration and normalizes a trailing slash", () => {
    expect(getAiServiceConfig({
      AI_SERVICE_URL: "http://127.0.0.1:3007/",
      INTERNAL_API_KEY: "test-internal-key",
    } as NodeJS.ProcessEnv)).toEqual({
      url: "http://127.0.0.1:3007",
      internalApiKey: "test-internal-key",
    })
  })

  test("fails closed when AI_SERVICE_URL is missing or blank", () => {
    expect(() => getAiServiceConfig({ INTERNAL_API_KEY: "key" } as NodeJS.ProcessEnv)).toThrow("AI_SERVICE_URL")
    expect(() => getAiServiceConfig({ AI_SERVICE_URL: "   ", INTERNAL_API_KEY: "key" } as NodeJS.ProcessEnv)).toThrow("AI_SERVICE_URL")
  })

  test("fails closed when INTERNAL_API_KEY is missing or blank", () => {
    expect(() => getAiServiceConfig({ AI_SERVICE_URL: "http://127.0.0.1:3007" } as NodeJS.ProcessEnv)).toThrow("INTERNAL_API_KEY")
    expect(() => getAiServiceConfig({ AI_SERVICE_URL: "http://127.0.0.1:3007", INTERNAL_API_KEY: "   " } as NodeJS.ProcessEnv)).toThrow("INTERNAL_API_KEY")
  })

  test("dispatch route and AI mini-service contain no fallback internal credential", () => {
    const route = readFileSync("src/app/api/ai/dispatch-suggest/route.ts", "utf8")
    const service = readFileSync("mini-services/ai-service/index.ts", "utf8")

    expect(route).not.toContain("ifleetpro-internal-key-change-me")
    expect(service).not.toContain("ifleetpro-internal-key-change-me")
    expect(route).not.toContain("const AI_SERVICE_URL = 'http://localhost:3007'")
  })

  test("environment template exposes the AI service URL explicitly", () => {
    const envExample = readFileSync(".env.example", "utf8")
    expect(envExample).toContain("AI_SERVICE_URL=")
    expect(envExample).toContain("INTERNAL_API_KEY=")
  })
})
