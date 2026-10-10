// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ clientFindUnique: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: { client: { findUnique: mocks.clientFindUnique } },
}))

vi.mock('@/lib/jwt-secret', () => ({
  getJwtSecretKey: () => new TextEncoder().encode('phase-8-route-test-secret-at-least-32-characters'),
}))

import { POST } from './route'

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
  mocks.clientFindUnique.mockResolvedValue({ id: 'client-a', isActive: true })
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
