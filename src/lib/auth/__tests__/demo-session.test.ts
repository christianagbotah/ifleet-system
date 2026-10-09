import { describe, expect, it } from 'vitest'
import {
  isDemoRequestAllowed,
  resolveDemoSessionTtl,
  toPublicDemoAccount,
} from '../demo-session'

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
    expect(resolveDemoSessionTtl('90m')).toBe('90m')
    expect(resolveDemoSessionTtl('2h')).toBe('2h')
  })

  it('exposes only safe demo-account presentation fields', () => {
    const summary = toPublicDemoAccount({
      id: 'user-demo-1',
      name: 'Demo Operator',
      email: 'private@example.test',
      password: 'never-expose',
      demoLabel: 'Operations',
      demoOrder: 2,
      position: 'Dispatcher',
      department: 'Operations',
      role: { name: 'Dispatcher' },
    })

    expect(summary).toEqual({
      id: 'user-demo-1',
      name: 'Demo Operator',
      label: 'Operations',
      order: 2,
      position: 'Dispatcher',
      department: 'Operations',
      role: 'Dispatcher',
    })
    expect(summary).not.toHaveProperty('email')
    expect(summary).not.toHaveProperty('password')
  })
})
