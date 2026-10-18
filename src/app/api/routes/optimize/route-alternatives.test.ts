// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadFleetEvidence: vi.fn(),
}))

vi.mock('@/lib/jwt-secret', () => ({
  JWT_SECRET: 'route-alternative-test-secret-not-for-production-1234567890',
}))

vi.mock('@/lib/domain/route-intelligence/prisma-route-advisory-repository', () => ({
  PrismaRouteAdvisoryRepository: class {
    loadFleetEvidence = mocks.loadFleetEvidence
  },
}))

import { GET } from './route'

function request(query: string) {
  return new NextRequest(`https://ifleetpro.example/api/routes/optimize?${query}`, {
    headers: {
      'x-auth-user-id': 'user-test',
      'x-auth-user-role': 'Dispatcher',
      'x-auth-user-permissions': JSON.stringify(['trips.view', 'trips.create']),
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadFleetEvidence.mockResolvedValue({
    fleetFuelSamples: [
      { distanceKm: 300, fuelLiters: 100 },
      { distanceKm: 240, fuelLiters: 80 },
      { distanceKm: 270, fuelLiters: 90 },
      { distanceKm: 180, fuelLiters: 60 },
      { distanceKm: 210, fuelLiters: 70 },
    ],
    candidates: [],
  })
})

describe('GET /api/routes/optimize alternative advisories', () => {
  it('returns evidence-labelled direct-route alternatives instead of the legacy empty placeholder', async () => {
    const response = await GET(request('from=Accra&to=Kumasi&weight=30&fuelPrice=16'))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.alternatives.length).toBeGreaterThan(0)
    expect(body.alternatives.length).toBeLessThanOrEqual(3)

    for (const alternative of body.alternatives) {
      expect(alternative.source).toBe('static_fallback')
      expect(alternative.fuelEstimate.source).toBe('fleet_history')
      expect(alternative.fuelEstimate.priceSource).toBe('request')
      expect(alternative.confidence).toBeLessThanOrEqual(alternative.dataQuality)
      expect(alternative.notices).toContain('route_uses_static_ghana_graph')
    }
  })

  it('returns no whole-route alternatives for a multi-stop plan', async () => {
    const response = await GET(request('from=Accra&to=Kumasi&stops=Tema&fuelPrice=16'))
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.alternatives).toEqual([])
  })
})
