import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/settings/IntegrationConnections.tsx'), 'utf8')

describe('integration connection truthfulness', () => {
  it('labels configuration state without implying a live connection', () => {
    expect(source).toContain("active: 'Enabled'")
    expect(source).toContain("inactive: 'Disabled'")
    expect(source).toContain("error: 'Error'")
    expect(source).not.toContain('>{item.status}</Badge>')
  })
})
