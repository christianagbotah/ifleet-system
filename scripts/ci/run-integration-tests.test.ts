import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { assertSafeIntegrationDatabase } from "./run-integration-tests"

describe("integration database safety", () => {
  test("requires TEST_DATABASE_URL", () => {
    expect(() => assertSafeIntegrationDatabase({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toThrow("TEST_DATABASE_URL is required")
  })

  test("refuses production NODE_ENV", () => {
    expect(() => assertSafeIntegrationDatabase({
      NODE_ENV: "production",
      TEST_DATABASE_URL: "mysql://ci@127.0.0.1:3306/ifleet_ci",
    } as NodeJS.ProcessEnv)).toThrow("NODE_ENV=production")
  })

  test("refuses the configured production database name", () => {
    expect(() => assertSafeIntegrationDatabase({
      NODE_ENV: "test",
      TEST_DATABASE_URL: "mysql://ci@127.0.0.1:3306/ifleetpro",
      PRODUCTION_DATABASE_NAME: "ifleetpro",
    } as NodeJS.ProcessEnv)).toThrow("configured production database")
  })

  test("refuses production-like names even when they contain test", () => {
    expect(() => assertSafeIntegrationDatabase({
      NODE_ENV: "test",
      TEST_DATABASE_URL: "mysql://ci@127.0.0.1:3306/ifleet_prod_test",
    } as NodeJS.ProcessEnv)).toThrow("production-like database names")
  })

  test("accepts an isolated CI database", () => {
    const url = "mysql://ci@127.0.0.1:3306/ifleet_ci"
    expect(assertSafeIntegrationDatabase({ NODE_ENV: "test", TEST_DATABASE_URL: url } as NodeJS.ProcessEnv)).toBe(url)
  })

  test("runs core integrity and fuel anomaly intelligence suites sequentially under one guarded database", () => {
    const source = readFileSync(join(import.meta.dir, "run-integration-tests.ts"), "utf8")
    const core = source.indexOf("tests/integration/core-integrity.test.ts")
    const fuel = source.indexOf("tests/integration/fuel-anomaly-intelligence.test.ts")
    expect(core).toBeGreaterThanOrEqual(0)
    expect(fuel).toBeGreaterThan(core)
    expect(source).toContain("DATABASE_URL: testUrl")
    expect(source).toContain("NODE_ENV: \"test\"")
  })
})
