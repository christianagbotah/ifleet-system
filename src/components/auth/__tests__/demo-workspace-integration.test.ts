import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : ''

describe('public demo workspace isolation', () => {
  it('routes demo users into a synthetic workspace before the production application shell mounts', () => {
    const page = read('src/app/page.tsx')
    expect(page).toContain("@/components/auth/DemoWorkspace")
    expect(page).toContain('user.isDemo')
    expect(page).toContain('<DemoWorkspace')
  })

  it('uses role-specific synthetic data and never calls production APIs', () => {
    const workspace = read('src/components/auth/DemoWorkspace.tsx')
    expect(workspace).toContain('Synthetic demo data')
    expect(workspace).toContain('Administrator')
    expect(workspace).toContain('Fleet Manager')
    expect(workspace).toContain('Dispatcher')
    expect(workspace).toContain('Driver')
    expect(workspace).toContain('Mechanic')
    expect(workspace).toContain('Accountant')
    expect(workspace).not.toContain("fetch('/api/")
    expect(workspace).not.toContain('fetch(`/api/')
  })

  it('makes read-only mode and logout visible in the demo workspace', () => {
    const workspace = read('src/components/auth/DemoWorkspace.tsx')
    expect(workspace).toContain('Demo Mode')
    expect(workspace).toContain('Read Only')
    expect(workspace).toContain('logout')
  })
})
