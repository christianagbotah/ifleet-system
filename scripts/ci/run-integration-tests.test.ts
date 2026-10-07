import { describe, expect, test } from "bun:test"
import { assertSafeIntegrationDatabase, INTEGRATION_TEST_FILES } from "./run-integration-tests"

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

  test("runs core integrity and dispatch copilot integration suites sequentially", () => {
    expect(INTEGRATION_TEST_FILES).toEqual([
      "tests/integration/core-integrity.test.ts",
      "tests/integration/dispatch-copilot.test.ts",
      "tests/integration/dispatch-copilot-stale-maintenance.test.ts",
    ])
  })
})
