// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ loadDashboard: vi.fn() }))

vi.mock('@/lib/jwt-secret', () => ({
  getJwtSecretKey: () => new TextEncoder().encode('phase-8-public-test-secret-at-least-32-characters'),
}))

vi.mock('@/lib/domain/client-portal/repository', () => ({
  loadClientPortalDashboard: mocks.loadDashboard,
}))

import { createPortalShareToken } from '@/lib/portal/share-token'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadDashboard.mockResolvedValue({ kind: 'ok', data: { client: { id: 'client-a' } } })
})

describe('GET /api/portal/public/client', () => {
  it('rejects a missing portal token before loading customer data', async () => {
    const response = await GET(new NextRequest('https://ifleetpro.example/api/portal/public/client'))
    expect(response.status).toBe(401)
    expect(mocks.loadDashboard).not.toHaveBeenCalled()
  })

  it('derives client identity from the verified token, not a request client id', async () => {
    const { token } = await createPortalShareToken({ clientId: 'client-a', issuedBy: 'operator-1' })
    const response = await GET(new NextRequest('https://ifleetpro.example/api/portal/public/client?clientId=client-b', {
      headers: { 'x-portal-token': token },
    }))

    expect(response.status).toBe(200)
    expect(mocks.loadDashboard).toHaveBeenCalledWith('client-a')
  })
})
