import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dir, "../..")
const deploy = readFileSync(join(root, "scripts/webhook-deploy.sh"), "utf8")
const deploymentDoc = readFileSync(join(root, "DEPLOYMENT.md"), "utf8")

describe("production deployment contract", () => {
  test("uses reviewed migrations and ordered health gates", () => {
    expect(deploy).not.toContain("prisma db push")
    expect(deploy).not.toContain("sed -i")
    expect(deploy).toContain("prisma migrate deploy")
    expect(deploy).toContain("scripts/deploy/preflight.sh")
    expect(deploy).toContain("DEPLOY_BACKUP_HOOK")
    expect(deploy).toContain("scripts/deploy/smoke-test.sh")

    const preflight = deploy.indexOf("scripts/deploy/preflight.sh")
    const backup = deploy.indexOf("DEPLOY_BACKUP_HOOK")
    const migrate = deploy.indexOf("prisma migrate deploy")
    const build = deploy.indexOf("bun run build")
    const restart = deploy.indexOf("pm2 restart")
    const smoke = deploy.indexOf("scripts/deploy/smoke-test.sh")
    expect(preflight).toBeGreaterThan(-1)
    expect(preflight).toBeLessThan(backup)
    expect(backup).toBeLessThan(migrate)
    expect(migrate).toBeLessThan(build)
    expect(build).toBeLessThan(restart)
    expect(restart).toBeLessThan(smoke)
  })

  test("preflight verifies secrets, migrations, disk, dependencies and database connectivity", () => {
    const path = join(root, "scripts/deploy/preflight.sh")
    expect(existsSync(path)).toBe(true)
    if (!existsSync(path)) return
    const source = readFileSync(path, "utf8")
    expect(source).toContain("DATABASE_URL")
    expect(source).toContain("NEXTAUTH_SECRET")
    expect(source).toContain("prisma/migrations")
    expect(source).toContain("df -Pk")
    expect(source).toContain("prisma db execute")
  })

  test("smoke test checks main health and an anonymous page", () => {
    const path = join(root, "scripts/deploy/smoke-test.sh")
    expect(existsSync(path)).toBe(true)
    if (!existsSync(path)) return
    const source = readFileSync(path, "utf8")
    expect(source).toContain("/api/health")
    expect(source).toContain("/login")
    expect(source).toContain("curl")
  })

  test("deployment documentation covers environment separation, rotation, baseline, backup and rollback", () => {
    expect(deploymentDoc).toContain("Development / staging / production separation")
    expect(deploymentDoc).toContain("Secret rotation")
    expect(deploymentDoc).toContain("20261007080000_baseline")
    expect(deploymentDoc).toContain("Backup before migration")
    expect(deploymentDoc).toContain("Rollback")
  })
})
