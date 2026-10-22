import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/components/settings/SettingsView.tsx', 'utf8')

describe('settings production-readiness contract', () => {
  it('does not expose an inert sample-data deletion control on the live settings surface', () => {
    expect(source).not.toContain('Clear All Sample Data')
    expect(source).not.toContain('Remove demo data, keep company settings')
  })

  it('uses build metadata instead of stale hard-coded version and build values', () => {
    expect(source).not.toContain('>2.1.0<')
    expect(source).not.toContain('>2024.01.15<')
    expect(source).toContain('APP_VERSION')
    expect(source).toContain('APP_BUILD')
    expect(source).toContain('APP_ENVIRONMENT')
  })

  it('does not claim API or tracking health without a live health check', () => {
    expect(source).not.toContain('>API Status<')
    expect(source).not.toContain('>Tracking Service<')
    expect(source).not.toMatch(/>\s*Online\s*</)
    expect(source).not.toMatch(/>\s*Connected\s*</)
  })

  it('describes tracking capabilities without inventing source or infrastructure status', () => {
    expect(source).not.toMatch(/>\s*Active\s*<\/Badge>/)
    expect(source).not.toMatch(/>\s*Available\s*<\/Badge>/)
    expect(source).not.toContain('<span className="font-medium">MySQL</span>')
    expect(source).toContain('Per-truck')
    expect(source).toContain('Device registry')
  })
})
