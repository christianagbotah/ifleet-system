import { describe, expect, it } from 'vitest'

import { parseDemoProfilesConfig } from '../demo-runtime-config'

describe('runtime demo profile configuration', () => {
  it('fails closed when no profile configuration is supplied', () => {
    expect(() => parseDemoProfilesConfig(undefined)).toThrow(/DEMO_PROFILES_JSON/)
    expect(() => parseDemoProfilesConfig('')).toThrow(/DEMO_PROFILES_JSON/)
  })

  it('parses profile metadata from runtime configuration instead of source constants', () => {
    const profiles = parseDemoProfilesConfig(JSON.stringify([
      {
        key: 'ops-preview',
        label: 'Operations Preview',
        name: 'Demo Operations User',
        roleName: 'Dispatcher',
        description: 'Read-only operations preview',
        capability: 'Dispatch operations',
        position: 'Demo Operator',
        department: 'Operations',
        order: 20,
      },
      {
        key: 'finance-preview',
        label: 'Finance Preview',
        name: 'Demo Finance User',
        roleName: 'Accountant',
        order: 30,
      },
    ]))

    expect(profiles).toHaveLength(2)
    expect(profiles[0]).toMatchObject({
      key: 'ops-preview',
      label: 'Operations Preview',
      roleName: 'Dispatcher',
      order: 20,
    })
    expect(profiles[1].roleName).toBe('Accountant')
  })

  it('rejects credential and identity-secret fields from public demo configuration', () => {
    expect(() => parseDemoProfilesConfig(JSON.stringify([
      {
        key: 'unsafe',
        label: 'Unsafe',
        name: 'Unsafe Demo',
        roleName: 'Admin',
        password: 'should-never-exist',
      },
    ]))).toThrow(/password/i)

    expect(() => parseDemoProfilesConfig(JSON.stringify([
      {
        key: 'unsafe-email',
        label: 'Unsafe',
        name: 'Unsafe Demo',
        roleName: 'Admin',
        email: 'credential-like@example.test',
      },
    ]))).toThrow(/email/i)
  })

  it('rejects duplicate profile keys', () => {
    expect(() => parseDemoProfilesConfig(JSON.stringify([
      { key: 'same', label: 'One', name: 'One', roleName: 'Manager' },
      { key: 'same', label: 'Two', name: 'Two', roleName: 'Dispatcher' },
    ]))).toThrow(/duplicate/i)
  })
})
