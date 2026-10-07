import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "../..")
const read = (path: string) => readFileSync(join(root, path), "utf8")

describe("CI contract", () => {
  test("package scripts expose deterministic quality gates", () => {
    const pkg = JSON.parse(read("package.json"))
    expect(pkg.scripts.lint).not.toBe("eslint .")
    expect(pkg.scripts.lint).toContain("eslint src")
    expect(pkg.scripts.test).toBe("bun test src scripts mini-services")
    expect(pkg.scripts["test:integration"]).toBe("bun scripts/ci/run-integration-tests.ts")
    expect(pkg.scripts.typecheck).toBe("bun scripts/ci/typecheck-baseline.ts")
    expect(pkg.scripts["typecheck:strict"]).toBe("tsc --noEmit")
    expect(pkg.scripts["prisma:validate"]).toBe("prisma validate")
    expect(pkg.scripts.check).toBe("bun run lint && bun run typecheck && bun run test && bun run prisma:validate")
  })

  test("GitHub Actions runs unit, migration, integration and build gates", () => {
    const workflow = read(".github/workflows/ci.yml")
    for (const command of [
      "bun install --frozen-lockfile",
      "bash scripts/ci/check-no-secrets.sh",
      "bun run lint",
      "bun run typecheck",
      "bun run test",
      "bunx prisma validate",
      "bunx prisma migrate deploy",
      "bun run test:integration",
      "bun run build",
    ]) {
      expect(workflow).toContain(command)
    }
    expect(workflow).toContain("mariadb:11.8")
    expect(workflow).toContain("TEST_DATABASE_URL")
  })

  test("repository tooling excludes committed agent/generated trees", () => {
    const tsconfig = read("tsconfig.json")
    const eslint = read("eslint.config.mjs")
    for (const path of ["skills", "ifleet-fresh"]) {
      expect(tsconfig).toContain(path)
      expect(eslint).toContain(path)
    }
  })
})
