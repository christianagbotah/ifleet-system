import { describe, expect, it, vi } from 'vitest'

import { validateTrackingSession } from './auth'

describe('tracking socket session validation', () => {
  it('rejects missing tokens without calling the application', async () => {
    const fetchImpl = vi.fn()
    await expect(validateTrackingSession('http://127.0.0.1:3000', '', fetchImpl)).resolves.toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects invalid or demo-isolated sessions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'unauthorized' }) })
    await expect(validateTrackingSession('http://127.0.0.1:3000', 'bad-token', fetchImpl)).resolves.toBe(false)
  })

  it('accepts an active standard user returned by the authenticated app boundary', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'user-1', role: 'Manager', permissions: ['trucks.view'], driverId: null, isActive: true } }),
    })
    await expect(validateTrackingSession('http://127.0.0.1:3000', 'valid-token', fetchImpl)).resolves.toBe(true)
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/auth/me',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer valid-token' }),
      }),
    )
  })
})

import { canViewFleetTracking, loadTrackingSession } from './auth'

describe('tracking viewer authorization', () => {
  it('returns role and permissions from the application session boundary', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: 'dispatcher-1', role: 'Dispatcher', permissions: ['trucks.view'], driverId: null, isActive: true } }),
    })
    await expect(loadTrackingSession('http://127.0.0.1:3000', 'valid-token', fetchImpl)).resolves.toMatchObject({
      userId: 'dispatcher-1',
      roleName: 'Dispatcher',
      permissions: ['trucks.view'],
    })
  })

  it('allows fleet viewers but not driver-only sessions into live viewer rooms', () => {
    expect(canViewFleetTracking({ userId: 'admin', roleName: 'Admin', permissions: [], driverId: null })).toBe(true)
    expect(canViewFleetTracking({ userId: 'ops', roleName: 'Dispatcher', permissions: ['trucks.view'], driverId: null })).toBe(true)
    expect(canViewFleetTracking({ userId: 'driver', roleName: 'Driver', permissions: ['trips.view'], driverId: 'driver-1' })).toBe(false)
  })
})
