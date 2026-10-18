// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ clientFindUnique: vi.fn(), clientUpdate: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: { client: { findUnique: mocks.clientFindUnique, update: mocks.clientUpdate } },
}))

vi.mock('@/lib/jwt-secret', () => ({
  getJwtSecretKey: () => new TextEncoder().encode('phase-8-route-test-secret-at-least-32-characters'),
}))

import { DELETE, POST } from './route'
import { verifyPortalShareToken } from '@/lib/portal/share-token'

function request(body: unknown, permissions = ['trips.view']) {
  return new NextRequest('https://ifleetpro.example/api/portal/share/client/client-a', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-auth-user-id': 'operator-1',
      'x-auth-user-role': 'Dispatcher',
      'x-auth-user-permissions': JSON.stringify(permissions),
    },
    body: JSON.stringify(body),
  })
}

const context = { params: Promise.resolve({ clientId: 'client-a' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.clientFindUnique.mockResolvedValue({ id: 'client-a', isActive: true, portalShareVersion: 4 })
  mocks.clientUpdate.mockResolvedValue({ id: 'client-a', portalShareVersion: 5 })
})

describe('POST /api/portal/share/client/[clientId]', () => {
  it('requires trips.view permission', async () => {
    const response = await POST(request({}, []), context)
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

  it('atomically revokes all previously issued links for the client', async () => {
    const revokeRequest = new NextRequest('https://ifleetpro.example/api/portal/share/client/client-a', {
      method: 'DELETE',
      headers: {
        'x-auth-user-id': 'operator-1',
        'x-auth-user-role': 'Dispatcher',
        'x-auth-user-permissions': JSON.stringify(['trips.view']),
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
