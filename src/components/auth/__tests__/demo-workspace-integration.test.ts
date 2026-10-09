import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : ''

describe('public demo workspace isolation', () => {
  it('routes demo users into an isolated workspace before the production application shell mounts', () => {
    const page = read('src/app/page.tsx')
    expect(page).toContain("@/components/auth/DemoWorkspace")
    expect(page).toContain('user.isDemo')
    expect(page).toContain('<DemoWorkspace')
  })

  it('derives visible areas from server-issued permissions and never calls production APIs', () => {
    const workspace = read('src/components/auth/DemoWorkspace.tsx')
    expect(workspace).toContain('user?.permissions')
    expect(workspace).toContain('Configured read-only areas')
    expect(workspace).toContain('Production APIs and customer records remain blocked')
    expect(workspace).not.toContain('SHARED_METRICS')
    expect(workspace).not.toContain('WORKSPACES')
    expect(workspace).not.toContain('Synthetic demo data')
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
