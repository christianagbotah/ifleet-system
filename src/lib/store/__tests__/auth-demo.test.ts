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
  it('requests a server-issued runtime profile and persists the isolated demo session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          token: 'test-demo-token',
          user: {
            id: 'demo:operations-preview',
            email: '',
            name: 'Demo Operations User',
            phone: null,
            avatar: null,
            role: 'Dispatcher',
            permissions: ['dashboard.view', 'trips.view'],
            driverId: null,
            isActive: true,
            isDemo: true,
            demoProfile: 'operations-preview',
            demoLabel: 'Operations Preview',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    await useAuthStore.getState().demoLogin('operations-preview')

    expect(fetchMock).toHaveBeenCalledWith('/api/auth/demo-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: 'operations-preview' }),
    })
    expect(useAuthStore.getState()).toMatchObject({
      token: 'test-demo-token',
      isAuthenticated: true,
      user: { role: 'Dispatcher', isDemo: true, demoProfile: 'operations-preview' },
    })
    expect(JSON.parse(localStorage.getItem('fleetpro-auth') || '{}').user.isDemo).toBe(true)
  })

  it('keeps runtime demo permissions read-only regardless of the configured role name', () => {
    useAuthStore.setState({
      user: {
        id: 'demo:configured-preview',
        email: '',
        name: 'Configured Demo User',
        phone: null,
        avatar: null,
        role: 'Manager',
        permissions: ['dashboard.view', 'trips.view', 'trips.create', 'trips.update', 'expenses.approve'],
        driverId: null,
        isActive: true,
        isDemo: true,
        demoProfile: 'configured-preview',
      },
      isAuthenticated: true,
      token: 'test-demo-token',
    })

    expect(useAuthStore.getState().hasPermission('trips.view')).toBe(true)
    expect(useAuthStore.getState().hasPermission('trips.create')).toBe(false)
    expect(useAuthStore.getState().hasPermission('trips.update')).toBe(false)
    expect(useAuthStore.getState().hasPermission('expenses.approve')).toBe(false)
    expect(useAuthStore.getState().hasAnyPermission(['trips.create', 'trips.update'])).toBe(false)
  })
})
