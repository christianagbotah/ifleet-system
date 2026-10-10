import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/components/portal/PublicClientPortal.tsx'),
  'utf8',
)

describe('public client portal contract', () => {
  it('reads the share token from the URL fragment and removes the fragment', () => {
    expect(source).toContain('window.location.hash')
    expect(source).toContain('history.replaceState')
    expect(source).toContain('access')
  })

  it('uses token-bound public APIs and never persists the token to browser storage', () => {
    expect(source).toContain('/api/portal/public/client')
    expect(source).toContain('/api/portal/public/shipment/')
    expect(source).toContain("'x-portal-token'")
    expect(source).not.toContain('localStorage')
    expect(source).not.toContain('sessionStorage')
  })
})
