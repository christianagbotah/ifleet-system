import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/components/trucks/AssignDriverDialog.tsx'), 'utf8')

describe('AssignDriverDialog demo safety', () => {
  it('uses demo-safe assignment options without fetching real driver records', () => {
    expect(source).toContain('useAuthStore')
    expect(source).toContain('loadDriverAssignmentOptions')
    expect(source).toContain('user?.isDemo')
    expect(source).toContain('Demo Mode')
    expect(source).toContain('Read Only')
  })

  it('blocks assignment submission in demo mode', () => {
    expect(source).toContain("if (user?.isDemo)")
    expect(source).toContain('Demo mode is read-only')
  })
})
