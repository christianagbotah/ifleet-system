import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function source(path: string) {
  return readFileSync(join(root, path), 'utf8')
}

describe('modern login demo experience contract', () => {
  it('renders the dedicated demo login panel from the login view', () => {
    const loginView = source('src/components/auth/LoginView.tsx')
    expect(loginView).toContain('DemoLoginPanel')
    expect(loginView).toContain('Fleet intelligence')
    expect(loginView).not.toContain('admin123')
    expect(loginView).not.toContain('manager123')
    expect(loginView).not.toContain('driver123')
    expect(loginView).not.toContain('staff123')
  })

  it('exposes role-based demo choices without embedding legacy passwords', () => {
    const demoPanel = source('src/components/auth/DemoLoginPanel.tsx')
    const demoProfiles = source('src/lib/auth/demo-profiles.ts')
    const demoExperience = `${demoPanel}
${demoProfiles}`
    expect(demoPanel).toContain('Explore iFleetPro')
    expect(demoExperience).toContain('Fleet Manager')
    expect(demoExperience).toContain('Dispatcher')
    expect(demoExperience).toContain('Driver')
    expect(demoExperience).toContain('Mechanic')
    expect(demoExperience).toContain('Accountant')
    expect(demoExperience).not.toContain('admin123')
    expect(demoExperience).not.toContain('manager123')
    expect(demoExperience).not.toContain('driver123')
    expect(demoExperience).not.toContain('staff123')
  })
  it('keeps demo sessions visibly marked as read-only inside the app shell', () => {
    const header = source('src/components/layout/AppHeader.tsx')
    expect(header).toContain('user?.isDemo')
    expect(header).toContain('Demo Mode')
    expect(header).toContain('Read Only')
  })

})
