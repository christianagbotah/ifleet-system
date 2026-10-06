import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chdir, cwd } from "node:process"

import { getDatabaseUrl } from "./database-url"

const projectRoot = join(import.meta.dir, "../../..")
const credentialedDbUri = /(?:mysql|mariadb):\/\/(?!<)[^\s:`"'<>]+:[^\s@`"'<>]+@/i

describe("getDatabaseUrl", () => {
  test("returns a configured mariadb URL unchanged", () => {
    const url = "mariadb://user:pass@localhost:3306/ifleet_test"
    expect(getDatabaseUrl({ DATABASE_URL: url })).toBe(url)
  })

  test("normalizes mysql URLs for the MariaDB adapter", () => {
    expect(getDatabaseUrl({ DATABASE_URL: "mysql://user:pass@localhost:3306/ifleet_test" })).toBe(
      "mariadb://user:pass@localhost:3306/ifleet_test"
    )
  })

  test("throws when DATABASE_URL is missing or blank", () => {
    expect(() => getDatabaseUrl({})).toThrow("DATABASE_URL is required")
    expect(() => getDatabaseUrl({ DATABASE_URL: "   " })).toThrow("DATABASE_URL is required")
  })

  test("never falls back to a repository .env file", () => {
    const originalCwd = cwd()
    const dir = mkdtempSync(join(tmpdir(), "ifleet-db-config-"))
    writeFileSync(join(dir, ".env"), "DATABASE_URL=mariadb://prod:secret@db.example/prod\n")

    try {
      chdir(dir)
      expect(() => getDatabaseUrl({})).toThrow("DATABASE_URL is required")
    } finally {
      chdir(originalCwd)
    }
  })

  test("database client delegates to environment configuration instead of reading .env from disk", () => {
    const source = readFileSync(join(import.meta.dir, "..", "db.ts"), "utf8")
    expect(source).toContain("getDatabaseUrl")
    expect(source).not.toContain("readFileSync")
    expect(source).not.toContain("resolve(process.cwd(), '.env')")
  })

  test("Prisma CLI configuration reads DATABASE_URL only from the process environment", () => {
    const source = readFileSync(join(projectRoot, "prisma.config.ts"), "utf8")
    expect(source).toContain("process.env.DATABASE_URL")
    expect(source).not.toContain("readFileSync")
    expect(source).not.toContain(".env.local")
    expect(source).not.toContain("loadDatabaseUrl")
  })

  test("tracked operational scripts and docs contain no credentialed database URI", () => {
    for (const relativePath of ["run-server.sh", "deploy.sh", "DEPLOYMENT.md"]) {
      const source = readFileSync(join(projectRoot, relativePath), "utf8")
      expect(source.match(credentialedDbUri), relativePath).toBeNull()
    }
  })
})
