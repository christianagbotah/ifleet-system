import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

const panelPath = 'src/components/auth/QATestAccountsPanel.tsx'
const routePath = 'src/app/api/auth/qa-login/route.ts'
const configPath = 'src/lib/auth/qa-runtime-config.ts'
const bootstrapPath = 'scripts/bootstrap-qa-users.ts'

describe('QA test-account login contract', () => {
  it('keeps full-access QA login separate from the read-only public demo flow', () => {
    const login = read('src/components/auth/LoginView.tsx')
    const demoPanel = read('src/components/auth/DemoLoginPanel.tsx')
    expect(login).toContain('<DemoLoginPanel')
    expect(demoPanel).toContain('QATestAccountsPanel')
    expect(existsSync(join(root, panelPath))).toBe(true)
  })

  it('fails closed unless QA login is explicitly enabled for the runtime', () => {
    expect(existsSync(join(root, routePath))).toBe(true)
    if (!existsSync(join(root, routePath))) return
    const route = read(routePath)
    expect(route).toContain('QA_LOGIN_ENABLED')
    expect(route).toContain('QA_LOGIN_ALLOW_PRODUCTION')
    expect(route).toContain("process.env.NODE_ENV === 'production'")
    expect(route).toContain("'Cache-Control': 'no-store'")
  })

  it('uses explicitly configured real users and never provisions arbitrary accounts from the login endpoint', () => {
    expect(existsSync(join(root, configPath))).toBe(true)
    expect(existsSync(join(root, routePath))).toBe(true)
    if (!existsSync(join(root, configPath)) || !existsSync(join(root, routePath))) return

    const config = read(configPath)
    const route = read(routePath)
    expect(config).toContain('QA_PROFILES_JSON')
    expect(config).toContain('email')
    expect(route).toContain('db.user.findUnique')
    expect(route).toContain('profile.email')
    expect(route).toContain('role:')
    expect(route).toContain('driver:')
    expect(route).not.toContain('db.user.create')
    expect(route).not.toContain('db.user.upsert')
  })

  it('issues full real-role permissions instead of demo read-only permissions', () => {
    expect(existsSync(join(root, routePath))).toBe(true)
    if (!existsSync(join(root, routePath))) return
    const route = read(routePath)
    expect(route).toContain('JSON.parse(user.role.permissions')
    expect(route).toContain('isQa: true')
    expect(route).not.toContain('readOnlyPermissions')
    expect(route).not.toContain('isDemo: true')
  })

  it('requires a tester-supplied access code without embedding QA credentials in client code', () => {
    const auth = read('src/lib/store/auth.ts')
    expect(auth).toContain('qaLogin: (profile: string, accessCode: string) => Promise<void>')
    expect(auth).toContain("fetch('/api/auth/qa-login'")
    expect(auth).toContain('body: JSON.stringify({ profile, accessCode })')

    expect(existsSync(join(root, panelPath))).toBe(true)
    if (!existsSync(join(root, panelPath))) return
    const panel = read(panelPath)
    expect(panel).toContain('Test Accounts')
    expect(panel).toContain('QA access code')
    expect(panel).toContain('type="password"')
    expect(panel).toContain('accessCode')
    expect(panel).not.toMatch(/password\s*[:=]/i)

    const envExample = read('.env.example')
    expect(envExample).toContain('QA_LOGIN_ACCESS_CODE_HASH=')
  })

  it('routes a full-access QA Driver session into the dedicated Driver Portal', () => {
    const panel = read(panelPath)
    expect(panel).toContain("user?.role === 'Driver'")
    expect(panel).toContain("window.location.assign('/driver')")
    expect(panel).not.toContain('useRouter')
  })

  it('provides an explicit bootstrap command for creating the configured real QA users', () => {
    expect(existsSync(join(root, bootstrapPath))).toBe(true)
    if (!existsSync(join(root, bootstrapPath))) return

    const bootstrap = read(bootstrapPath)
    const pkg = read('package.json')
    expect(bootstrap).toContain("QA_BOOTSTRAP_ENABLED === 'true'")
    expect(bootstrap).toContain('QA_BOOTSTRAP_PASSWORD')
    expect(bootstrap).toContain('hashPassword')
    expect(bootstrap).toContain('db.user.create')
    expect(bootstrap).toContain('db.role.findUnique')
    expect(bootstrap).toContain('driverId')
    expect(bootstrap).not.toMatch(/console\.log\([^\n]*QA_BOOTSTRAP_PASSWORD/)
    expect(pkg).toContain('"qa:bootstrap"')
  })

  it('documents the server-only QA runtime configuration and keeps it disabled by default', () => {
    const envExample = read('.env.example')
    expect(envExample).toContain('QA_LOGIN_ENABLED=false')
    expect(envExample).toContain('QA_LOGIN_ALLOW_PRODUCTION=false')
    expect(envExample).toContain('QA_BOOTSTRAP_ENABLED=false')
    expect(envExample).toContain('QA_BOOTSTRAP_PASSWORD=')
    expect(envExample).toContain('QA_PROFILES_JSON=')
    expect(envExample).not.toMatch(/QA_.*PASSWORD=.*[^=\s]/)
  })
})
