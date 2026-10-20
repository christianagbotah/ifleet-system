import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/components/portal/ClientPortalView.tsx'),
  'utf8',
)

describe('staff client portal preview contract', () => {
  it('issues signed share links and previews through the secure public contract', () => {
    expect(source).toContain('/api/portal/share/client/')
    expect(source).toContain('/api/portal/public/client')
    expect(source).toContain('/api/portal/public/shipment/')
    expect(source).toContain("'x-portal-token'")
    expect(source).toContain('/portal#access=')
  })

  it('lets staff revoke all existing links and clears the current preview token', () => {
    expect(source).toContain('Revoke all shared links')
    expect(source).toContain("method: 'DELETE'")
    expect(source).toContain('setPreviewToken(null)')
    expect(source).toContain('setDashboard(null)')
  })

  it('gates portal link management on the dedicated portal.share permission', () => {
    expect(source).toContain("permissions.includes('portal.share')")
    expect(source).toContain("user?.role === 'Admin'")
    expect(source).toContain('canShareLinks')
    expect(source).toContain('!canShareLinks')
    expect(source).toContain('user?.isDemo !== true')
    expect(source).toContain('/api/auth/me')
    expect(source).toContain('freshShareAccess')
  })

  it('does not use raw ids as public credentials', () => {
    expect(source).not.toContain('?clientId=')
    expect(source).not.toContain('/api/portal/client/')
    expect(source).not.toContain('/api/portal/shipment/')
  })
})
