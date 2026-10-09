import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/components/layout/TopHeader.tsx'), 'utf8')

describe('TopHeader authenticated identity contract', () => {
  it('renders the signed-in user from auth state instead of a compiled identity', () => {
    expect(source).toContain('useAuthStore')
    expect(source).toContain('user?.name')
    expect(source).toContain('user?.email')
    expect(source).toContain('user?.role')
    expect(source).toContain('getUserInitials')
    expect(source).not.toContain('admin@lightworldtech.com')
    expect(source).not.toContain('Admin User')
    expect(source).not.toContain('toast.info(\'Signed out (demo mode)\')')
  })

  it('uses the real auth logout action', () => {
    expect(source).toContain('logout')
    expect(source).toContain('onClick={logout}')
  })
})
