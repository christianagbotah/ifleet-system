// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ clientFindUnique: vi.fn(), clientUpdate: vi.fn(), userFindUnique: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: {
    client: { findUnique: mocks.clientFindUnique, update: mocks.clientUpdate },
    user: { findUnique: mocks.userFindUnique },
  },
}))

vi.mock('@/lib/jwt-secret', () => ({
  getJwtSecretKey: () => new TextEncoder().encode('phase-8-route-test-secret-at-least-32-characters'),
}))

import { DELETE, POST } from './route'
import { verifyPortalShareToken } from '@/lib/portal/share-token'

function request(body: unknown, permissions = ['portal.share'], roleName = 'Dispatcher', isDemo = false) {
  return new NextRequest('https://ifleetpro.example/api/portal/share/client/client-a', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-auth-user-id': 'operator-1',
      'x-auth-user-role': roleName,
      'x-auth-user-permissions': JSON.stringify(permissions),
      'x-auth-demo': isDemo ? 'true' : 'false',
    },
    body: JSON.stringify(body),
  })
}

const context = { params: Promise.resolve({ clientId: 'client-a' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.clientFindUnique.mockResolvedValue({ id: 'client-a', isActive: true, portalShareVersion: 4 })
  mocks.clientUpdate.mockResolvedValue({ id: 'client-a', portalShareVersion: 5 })
  mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Dispatcher', permissions: JSON.stringify(['portal.share']) } })
})

describe('POST /api/portal/share/client/[clientId]', () => {
  it('requires portal.share on the user current database role rather than broad trips.view', async () => {
    mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Driver', permissions: JSON.stringify(['trips.view']) } })
    const response = await POST(request({}, ['trips.view']), context)
    expect(response.status).toBe(403)
    expect(mocks.clientFindUnique).not.toHaveBeenCalled()
  })

  it('does not let a Driver issue client links merely because they can view trips', async () => {
    mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Driver', permissions: JSON.stringify(['trips.view']) } })
    const response = await POST(request({ expiresInDays: 7 }, ['trips.view'], 'Driver'), context)
    expect(response.status).toBe(403)
    expect(mocks.clientFindUnique).not.toHaveBeenCalled()
  })

  it('honors a newly granted portal.share permission for an already-issued token', async () => {
    const response = await POST(request({ expiresInDays: 7 }, ['trips.view'], 'Dispatcher'), context)
    expect(response.status).toBe(200)
    expect(mocks.userFindUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'operator-1' } }))
  })

  it('honors a current permission revocation even when an older token still carries portal.share', async () => {
    mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Driver', permissions: JSON.stringify(['trips.view']) } })
    const response = await POST(request({ expiresInDays: 7 }, ['portal.share'], 'Dispatcher'), context)
    expect(response.status).toBe(403)
    expect(mocks.clientFindUnique).not.toHaveBeenCalled()
  })

  it('keeps the current database Admin role able to manage links without an explicit permission row', async () => {
    mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Admin', permissions: '[]' } })
    const response = await POST(request({ expiresInDays: 7 }, [], 'Admin'), context)
    expect(response.status).toBe(200)
  })

  it('honors a current Admin promotion even when the older token still says Dispatcher', async () => {
    mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Admin', permissions: '[]' } })
    const response = await POST(request({ expiresInDays: 7 }, [], 'Dispatcher'), context)
    expect(response.status).toBe(200)
  })

  it('does not trust a stale Admin token after the user has moved to another role', async () => {
    mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Driver', permissions: JSON.stringify(['trips.view']) } })
    const response = await POST(request({ expiresInDays: 7 }, [], 'Admin'), context)
    expect(response.status).toBe(403)
    expect(mocks.clientFindUnique).not.toHaveBeenCalled()
  })

  it('keeps demo sessions read-only even when their profile carries portal.share', async () => {
    const response = await POST(request({ expiresInDays: 7 }, ['portal.share'], 'Dispatcher', true), context)
    expect(response.status).toBe(403)
    expect(mocks.clientFindUnique).not.toHaveBeenCalled()
  })

  it('issues a signed fragment share path for an active client', async () => {
    const response = await POST(request({ expiresInDays: 7 }), context)
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.token).toEqual(expect.any(String))
    expect(body.expiresAt).toEqual(expect.any(String))
    expect(body.path).toBe(`/portal#access=${encodeURIComponent(body.token)}`)
    expect(body.clientId).toBe('client-a')
  })

  it('embeds the current client share version in newly issued links', async () => {
    const response = await POST(request({ expiresInDays: 7 }), context)
    expect(response.status).toBe(200)
    const body = await response.json()
    const claims = await verifyPortalShareToken(body.token)
    expect(claims.shareVersion).toBe(4)
  })

  it('does not let trips.view-only users revoke client portal links', async () => {
    mocks.userFindUnique.mockResolvedValue({ isActive: true, role: { name: 'Driver', permissions: JSON.stringify(['trips.view']) } })
    const revokeRequest = new NextRequest('https://ifleetpro.example/api/portal/share/client/client-a', {
      method: 'DELETE',
      headers: {
        'x-auth-user-id': 'operator-1',
        'x-auth-user-role': 'Dispatcher',
        'x-auth-user-permissions': JSON.stringify(['trips.view']),
      },
    })
    const response = await DELETE(revokeRequest, context)
    expect(response.status).toBe(403)
    expect(mocks.clientUpdate).not.toHaveBeenCalled()
  })

  it('does not let demo sessions revoke links even with portal.share', async () => {
    const revokeRequest = new NextRequest('https://ifleetpro.example/api/portal/share/client/client-a', {
      method: 'DELETE',
      headers: {
        'x-auth-user-id': 'operator-1',
        'x-auth-user-role': 'Dispatcher',
        'x-auth-user-permissions': JSON.stringify(['portal.share']),
        'x-auth-demo': 'true',
      },
    })
    const response = await DELETE(revokeRequest, context)
    expect(response.status).toBe(403)
    expect(mocks.clientUpdate).not.toHaveBeenCalled()
  })

  it('atomically revokes all previously issued links for the client', async () => {
    const revokeRequest = new NextRequest('https://ifleetpro.example/api/portal/share/client/client-a', {
      method: 'DELETE',
      headers: {
        'x-auth-user-id': 'operator-1',
        'x-auth-user-role': 'Dispatcher',
        'x-auth-user-permissions': JSON.stringify(['portal.share']),
      },
    })
    const response = await DELETE(revokeRequest, context)
    expect(response.status).toBe(200)
    expect(mocks.clientUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'client-a' },
      data: { portalShareVersion: { increment: 1 } },
    }))
    await expect(response.json()).resolves.toMatchObject({ revoked: true, portalShareVersion: 5 })
  })

  it('rejects inactive clients', async () => {
    mocks.clientFindUnique.mockResolvedValue({ id: 'client-a', isActive: false })
    const response = await POST(request({ expiresInDays: 7 }), context)
    expect(response.status).toBe(403)
  })

  it('rejects out-of-range lifetime requests', async () => {
    const response = await POST(request({ expiresInDays: 31 }), context)
    expect(response.status).toBe(400)
    expect(mocks.clientFindUnique).not.toHaveBeenCalled()
  })
})
