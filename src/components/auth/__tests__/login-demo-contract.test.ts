import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('modern login demo experience contract', () => {
  it('renders the dedicated demo login panel from the login view without embedded credentials', () => {
    const loginView = source('src/components/auth/LoginView.tsx')
    expect(loginView).toContain('DemoLoginPanel')
    expect(loginView).toContain('Fleet intelligence')
    expect(loginView).not.toMatch(/admin123|manager123|driver123|staff123/)
    expect(loginView).not.toContain('Tema Port → Kumasi')
    expect(loginView).not.toContain('2h 18m')
  })

  it('loads demo choices from the server instead of a compiled role catalogue', () => {
    const demoPanel = source('src/components/auth/DemoLoginPanel.tsx')
    expect(demoPanel).toContain("fetch('/api/auth/demo-login')")
    expect(demoPanel).toContain('profiles')
    expect(demoPanel).not.toContain('DEMO_PROFILES')
    expect(demoPanel).not.toContain('Record<DemoProfileId')
    expect(existsSync(join(root, 'src/lib/auth/demo-profiles.ts'))).toBe(false)
  })

  it('keeps the public demo workspace isolated without compiled synthetic business data', () => {
    const workspace = source('src/components/auth/DemoWorkspace.tsx')
    expect(workspace).toContain('user?.permissions')
    expect(workspace).toContain('Demo Mode')
    expect(workspace).toContain('Read Only')
    expect(workspace).not.toContain('WORKSPACES')
    expect(workspace).not.toContain('SHARED_METRICS')
    expect(workspace).not.toContain('42 units')
    expect(workspace).not.toContain('₵184,600')
    expect(workspace).not.toContain('DEMO-WB-018')
    expect(workspace).not.toContain('Tema → Kumasi')
  })

  it('does not compile demo identities, default TTLs, or auto-provisioning into the route', () => {
    const route = source('src/app/api/auth/demo-login/route.ts')
    expect(route).toContain('process.env.DEMO_PROFILES_JSON')
    expect(route).toContain('process.env.DEMO_SESSION_TTL')
    expect(route).not.toContain("const DEMO_SESSION_TTL = '8h'")
    expect(route).not.toContain('db.user.upsert')
    expect(route).not.toContain('db.driver.upsert')
    expect(route).not.toContain('@ifleetpro.local')
    expect(existsSync(join(root, 'src/lib/auth/demo-server.ts'))).toBe(false)
  })

  it('keeps demo sessions visibly marked as read-only inside shared UI', () => {
    const header = source('src/components/layout/AppHeader.tsx')
    expect(header).toContain('user?.isDemo')
    expect(header).toContain('Demo Mode')
    expect(header).toContain('Read Only')
  })
})
