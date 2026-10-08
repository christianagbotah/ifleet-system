import { describe, expect, it } from 'vitest'

import { DEMO_PROFILES, isDemoProfileId } from '../demo-profiles'
import { getDemoIdentityConfig } from '../demo-server'

describe('demo account profiles', () => {
  it('offers the six approved demo personas', () => {
    expect(DEMO_PROFILES.map((profile) => profile.id)).toEqual([
      'admin',
      'manager',
      'dispatcher',
      'driver',
      'mechanic',
      'accountant',
    ])
  })

  it('validates only known demo profile identifiers', () => {
    expect(isDemoProfileId('admin')).toBe(true)
    expect(isDemoProfileId('driver')).toBe(true)
    expect(isDemoProfileId('owner')).toBe(false)
    expect(isDemoProfileId(null)).toBe(false)
  })

  it('maps each persona to a dedicated server identity without a password', () => {
    for (const profile of DEMO_PROFILES) {
      const identity = getDemoIdentityConfig(profile.id)
      expect(identity.email).toMatch(/^demo\./)
      expect(identity.name).toContain('Demo')
      expect(identity).not.toHaveProperty('password')
      expect(identity.roleName).toBe(profile.roleName)
    }
  })
})
