import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '../auth'

beforeEach(() => {
  localStorage.clear()
  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    isHydrated: true,
  })
  vi.restoreAllMocks()
})

describe('demo authentication', () => {
  it('requests a server-issued demo session and persists its demo identity', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'demo-token',
          user: {
            id: 'demo-manager',
            email: 'demo.manager@ifleetpro.local',
            name: 'Demo Fleet Manager',
            phone: null,
            avatar: null,
            role: 'Manager',
            permissions: ['dashboard.view'],
            driverId: null,
            isActive: true,
            isDemo: true,
            demoProfile: 'manager',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await useAuthStore.getState().demoLogin('manager')

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'manager' }),
    })
    expect(useAuthStore.getState()).toMatchObject({
      token: 'demo-token',
      isAuthenticated: true,
      user: { role: 'Manager', isDemo: true, demoProfile: 'manager' },
    })
    expect(JSON.parse(localStorage.getItem('fleetpro-auth') || '{}').user.isDemo).toBe(true)
  })

  it('keeps demo role permissions read-only even for Admin and Manager', () => {
    useAuthStore.setState({
      user: {
        id: 'demo-admin',
        email: 'demo.admin@ifleetpro.local',
        name: 'Demo Administrator',
        phone: null,
        avatar: null,
        role: 'Admin',
        permissions: ['dashboard.view', 'trips.view', 'trips.create', 'trips.update', 'expenses.approve'],
        driverId: null,
        isActive: true,
        isDemo: true,
        demoProfile: 'admin',
      },
      isAuthenticated: true,
      token: 'demo-token',
    })

    expect(useAuthStore.getState().hasPermission('trips.view')).toBe(true)
    expect(useAuthStore.getState().hasPermission('trips.create')).toBe(false)
    expect(useAuthStore.getState().hasPermission('trips.update')).toBe(false)
    expect(useAuthStore.getState().hasPermission('expenses.approve')).toBe(false)
    expect(useAuthStore.getState().hasAnyPermission(['trips.create', 'trips.update'])).toBe(false)
  })
})
