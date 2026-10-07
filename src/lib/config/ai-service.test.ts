import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { getAiServiceConfig } from "./ai-service"

function testEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AI_SERVICE_URL: undefined,
    INTERNAL_API_KEY: undefined,
    ...overrides,
  }
}

describe("AI service configuration", () => {
  test("returns explicit configuration and normalizes a trailing slash", () => {
    expect(getAiServiceConfig(testEnv({
      AI_SERVICE_URL: "http://127.0.0.1:3007/",
      INTERNAL_API_KEY: "test-internal-key",
    }))).toEqual({
      url: "http://127.0.0.1:3007",
      internalApiKey: "test-internal-key",
    })
  })

  test("fails closed when AI_SERVICE_URL is missing or blank", () => {
    expect(() => getAiServiceConfig(testEnv({ INTERNAL_API_KEY: "key" }))).toThrow("AI_SERVICE_URL")
    expect(() => getAiServiceConfig(testEnv({ AI_SERVICE_URL: "   ", INTERNAL_API_KEY: "key" }))).toThrow("AI_SERVICE_URL")
  })

  test("fails closed when INTERNAL_API_KEY is missing or blank", () => {
    expect(() => getAiServiceConfig(testEnv({ AI_SERVICE_URL: "http://127.0.0.1:3007" }))).toThrow("INTERNAL_API_KEY")
    expect(() => getAiServiceConfig(testEnv({ AI_SERVICE_URL: "http://127.0.0.1:3007", INTERNAL_API_KEY: "   " }))).toThrow("INTERNAL_API_KEY")
  })

  test("dispatch explanation boundary and supported AI-service launch paths fail closed", () => {
    const route = readFileSync("src/app/api/ai/dispatch-suggest/route.ts", "utf8")
    const explainer = readFileSync("src/lib/ai/dispatch/explainer-client.ts", "utf8")
    const bootstrap = readFileSync("mini-services/ai-service/bootstrap.ts", "utf8")
    const packageJson = readFileSync("mini-services/ai-service/package.json", "utf8")
    const startScript = readFileSync("mini-services/ai-service/start.sh", "utf8")
    const keepaliveScript = readFileSync("mini-services/ai-service/keepalive.sh", "utf8")

    expect(route).not.toContain("ifleetpro-internal-key-change-me")
    expect(route).not.toContain("const AI_SERVICE_URL = 'http://localhost:3007'")
    expect(route).toContain("explainDispatchRanking")
    expect(explainer).toContain("getAiServiceConfig")

    expect(bootstrap).toContain("INTERNAL_API_KEY")
    expect(bootstrap).toContain("refusing to start")
    expect(packageJson).toContain("bootstrap.ts")
    expect(startScript).toContain("bootstrap.ts")
    expect(keepaliveScript).toContain("bootstrap.ts")
  })

  test("environment template exposes the AI service URL explicitly", () => {
    const envExample = readFileSync(".env.example", "utf8")
    expect(envExample).toContain("AI_SERVICE_URL=")
    expect(envExample).toContain("INTERNAL_API_KEY=")
  })
})
