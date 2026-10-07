export const INTEGRATION_TEST_FILES = [
  "tests/integration/core-integrity.test.ts",
  "tests/integration/dispatch-copilot.test.ts",
] as const

export function assertSafeIntegrationDatabase(env: NodeJS.ProcessEnv = process.env): string {
  const testUrl = env.TEST_DATABASE_URL?.trim()
  if (!testUrl) throw new Error("TEST_DATABASE_URL is required")
  if (env.NODE_ENV === "production") {
    throw new Error("Integration tests refuse to run with NODE_ENV=production")
  }

  const parsed = new URL(testUrl)
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""))
  if (!databaseName) throw new Error("TEST_DATABASE_URL must include a database name")

  const normalizedName = databaseName.toLowerCase()
  const productionName = env.PRODUCTION_DATABASE_NAME?.trim().toLowerCase()
  if (productionName && normalizedName === productionName) {
    throw new Error("Integration tests refuse to use the configured production database")
  }
  if (/(^|[_-])(prod|production|live)([_-]|$)/i.test(databaseName)) {
    throw new Error("Integration tests refuse production-like database names")
  }
  if (!/(test|ci|integration)/i.test(databaseName)) {
    throw new Error("Integration database name must contain test, ci, or integration")
  }

  return testUrl
}

export function runIntegrationTests(env: NodeJS.ProcessEnv = process.env): number {
  const testUrl = assertSafeIntegrationDatabase(env)
  const testEnv = { ...env, DATABASE_URL: testUrl, NODE_ENV: "test" }

  for (const file of INTEGRATION_TEST_FILES) {
    const result = Bun.spawnSync(["bun", "test", file], {
      cwd: process.cwd(),
      env: testEnv,
      stdout: "inherit",
      stderr: "inherit",
    })
    const exitCode = result.exitCode ?? 1
    if (exitCode !== 0) return exitCode
  }

  return 0
}

if (import.meta.main) {
  process.exit(runIntegrationTests())
}
