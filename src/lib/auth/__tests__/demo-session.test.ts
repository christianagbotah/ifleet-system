import { describe, expect, it } from 'vitest'
import { isDemoRequestAllowed, resolveDemoSessionTtl } from '../demo-session'

describe('production demo session contract', () => {
  it('allows only read-only HTTP methods for demo sessions', () => {
    expect(isDemoRequestAllowed('GET')).toBe(true)
    expect(isDemoRequestAllowed('HEAD')).toBe(true)
    expect(isDemoRequestAllowed('OPTIONS')).toBe(true)
    expect(isDemoRequestAllowed('POST')).toBe(false)
    expect(isDemoRequestAllowed('PUT')).toBe(false)
    expect(isDemoRequestAllowed('PATCH')).toBe(false)
    expect(isDemoRequestAllowed('DELETE')).toBe(false)
  })

  it('requires demo session TTL to come from runtime configuration', () => {
    expect(() => resolveDemoSessionTtl(undefined)).toThrow(/DEMO_SESSION_TTL/)
    expect(() => resolveDemoSessionTtl('')).toThrow(/DEMO_SESSION_TTL/)
    expect(() => resolveDemoSessionTtl('not-a-duration')).toThrow(/DEMO_SESSION_TTL/)
    expect(() => resolveDemoSessionTtl('0h')).toThrow(/DEMO_SESSION_TTL/)
    expect(resolveDemoSessionTtl('90m')).toBe('90m')
    expect(resolveDemoSessionTtl('2h')).toBe('2h')
  })
})
