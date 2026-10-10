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

  it('does not use raw ids as public credentials', () => {
    expect(source).not.toContain('?clientId=')
    expect(source).not.toContain('/api/portal/client/')
    expect(source).not.toContain('/api/portal/shipment/')
  })
})
