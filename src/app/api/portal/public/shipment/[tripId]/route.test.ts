// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ loadShipment: vi.fn() }))

vi.mock('@/lib/jwt-secret', () => ({
  getJwtSecretKey: () => new TextEncoder().encode('phase-8-public-test-secret-at-least-32-characters'),
}))

vi.mock('@/lib/domain/client-portal/repository', () => ({
  loadClientShipmentDetail: mocks.loadShipment,
}))

import { createPortalShareToken } from '@/lib/portal/share-token'
import { GET } from './route'

const context = { params: Promise.resolve({ tripId: 'trip-b' }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadShipment.mockResolvedValue(null)
})

describe('GET /api/portal/public/shipment/[tripId]', () => {
  it('rejects a missing portal token before querying a shipment', async () => {
    const response = await GET(
      new NextRequest('https://ifleetpro.example/api/portal/public/shipment/trip-b'),
      context,
    )
    expect(response.status).toBe(401)
    expect(mocks.loadShipment).not.toHaveBeenCalled()
  })

  it('binds lookup to the client in the token so cross-client trip ids return not found', async () => {
    const { token } = await createPortalShareToken({ clientId: 'client-a', issuedBy: 'operator-1' })
    const response = await GET(
      new NextRequest('https://ifleetpro.example/api/portal/public/shipment/trip-b', {
        headers: { 'x-portal-token': token },
      }),
      context,
    )

    expect(mocks.loadShipment).toHaveBeenCalledWith('client-a', 'trip-b')
    expect(response.status).toBe(404)
  })
})
