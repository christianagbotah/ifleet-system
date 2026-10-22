import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const LEGACY_SURFACES = [
  'src/components/layout/PageRouter.tsx',
  'src/components/pages/DashboardPage.tsx',
  'src/components/pages/SettingsPage.tsx',
] as const

describe('production-readiness legacy cleanup', () => {
  it('removes unreachable legacy routing surfaces with stale dashboard/settings behavior', () => {
    for (const path of LEGACY_SURFACES) {
      expect(existsSync(path), path).toBe(false)
    }
  })
})
