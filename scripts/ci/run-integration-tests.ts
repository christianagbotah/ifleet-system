const testUrl = process.env.TEST_DATABASE_URL?.trim()
if (!testUrl) throw new Error("TEST_DATABASE_URL is required")
if (process.env.NODE_ENV === "production") throw new Error("Integration tests refuse to run with NODE_ENV=production")

const parsed = new URL(testUrl)
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""))
if (!databaseName) throw new Error("TEST_DATABASE_URL must include a database name")
const productionName = process.env.PRODUCTION_DATABASE_NAME?.trim()
if (productionName && databaseName === productionName) {
  throw new Error("Integration tests refuse to use the configured production database")
}
if (!/(test|ci|integration)/i.test(databaseName)) {
  throw new Error("Integration database name must contain test, ci, or integration")
}

const result = Bun.spawnSync(["bun", "test", "tests/integration/core-integrity.test.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: testUrl, NODE_ENV: "test" },
  stdout: "inherit",
  stderr: "inherit",
})
process.exit(result.exitCode ?? 1)
