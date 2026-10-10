import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'src/proxy.ts'), 'utf8')

describe('portal proxy boundary', () => {
  it('publicly exposes only token-verifying portal GET routes', () => {
    expect(source).toContain("'/api/portal/public/client'")
    expect(source).toContain("'/api/portal/public/shipment/'")
    expect(source).not.toContain("'/api/portal/client/'")
    expect(source).not.toContain("'/api/portal/shipment/'")
    expect(source).not.toContain("'/api/portal/share/'")
  })
})
