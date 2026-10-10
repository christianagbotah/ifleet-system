// @vitest-environment node
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadFleetEvidence: vi.fn(),
}))

vi.mock('@/lib/jwt-secret', () => ({
  JWT_SECRET: 'route-optimizer-test-secret-not-for-production-1234567890',
}))

vi.mock('@/lib/domain/route-intelligence/prisma-route-advisory-repository', () => ({
  PrismaRouteAdvisoryRepository: class {
    loadFleetEvidence = mocks.loadFleetEvidence
  },
}))

import { GET } from './route'

function request(
  query: string,
  permissions = ['trips.view', 'trips.create'],
  roleName = 'Dispatcher',
) {
  return new NextRequest(`https://ifleetpro.example/api/routes/optimize?${query}`, {
    headers: {
      'x-auth-user-id': 'user-test',
      'x-auth-user-role': roleName,
      'x-auth-user-permissions': JSON.stringify(permissions),
    },
  })
}

function fleetEvidence() {
  return {
    fleetFuelSamples: [
      { distanceKm: 300, fuelLiters: 100 },
      { distanceKm: 240, fuelLiters: 80 },
      { distanceKm: 270, fuelLiters: 90 },
      { distanceKm: 180, fuelLiters: 60 },
      { distanceKm: 210, fuelLiters: 70 },
    ],
    candidates: [{
      tractorId: 'truck-1',
      plateNumber: 'GT 1000-26',
      make: 'MAN',
      model: 'TGS',
      driverId: 'driver-1',
      driverName: 'Demo Driver',
      eligible: true,
      blocking: [],
      warnings: [],
      deadheadKm: 18,
      location: {
        latitude: 5.67,
        longitude: -0.02,
        source: 'teltonika',
        trust: 'trusted',
        receivedAt: new Date('2026-10-10T12:00:00.000Z'),
        freshness: 'fresh',
      },
      fuelSamples: [
        { distanceKm: 300, fuelLiters: 100 },
        { distanceKm: 240, fuelLiters: 80 },
        { distanceKm: 270, fuelLiters: 90 },
      ],
      dataQualityScore: 0.92,
    }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.loadFleetEvidence.mockResolvedValue(fleetEvidence())
})

describe('GET /api/routes/optimize', () => {
  it.each([
    'from=Accra&to=Kumasi&weight=NaN',
    'from=Accra&to=Kumasi&weight=-1',
    'from=Accra&to=Kumasi&weight=101',
    'from=Accra&to=Kumasi&fuelPrice=Infinity',
    'from=Accra&to=Kumasi&fuelPrice=0',
    'from=Accra&to=Kumasi&fuelPrice=101',
  ])('rejects malformed or unreasonable numeric inputs: %s', async (query) => {
    const response = await GET(request(query))
    expect(response.status).toBe(400)
    expect(mocks.loadFleetEvidence).not.toHaveBeenCalled()
  })

  it('rejects unknown cities and more than five intermediate stops', async () => {
    expect((await GET(request('from=Unknown&to=Kumasi'))).status).toBe(400)
    expect((await GET(request('from=Accra&to=Kumasi&stops=Tema,Ho,Koforidua,Tamale,Wa,Sunyani'))).status).toBe(400)
  })

  it('returns route advisory without fleet candidates to a view-only driver', async () => {
    const response = await GET(request('from=Accra&to=Kumasi&fuelPrice=16', ['trips.view'], 'Driver'))
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.advisoryVersion).toBe('route-advisory-v1')
    expect(body.route.source).toBe('static_fallback')
    expect(body.recommendationsAvailable).toBe(false)
    expect(body.recommendedTrucks).toEqual([])
    expect(mocks.loadFleetEvidence).not.toHaveBeenCalled()
  })

  it('returns sanitized evidence-labelled recommendations to an authorized dispatcher', async () => {
    const response = await GET(request('from=Accra&to=Kumasi&weight=30&fuelPrice=16'))
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(mocks.loadFleetEvidence).toHaveBeenCalledWith(expect.objectContaining({ origin: 'Accra' }))
    expect(body.recommendationsAvailable).toBe(true)
    expect(body.recommendedTrucks).toHaveLength(1)
    expect(body.recommendedTrucks[0]).toMatchObject({
      truckId: 'truck-1',
      driver: 'Demo Driver',
      locationSource: 'teltonika',
      locationFreshness: 'fresh',
    })
    expect(body.recommendedTrucks[0].confidence).toBeLessThanOrEqual(body.recommendedTrucks[0].dataQuality)
    expect(JSON.stringify(body.recommendedTrucks[0])).not.toMatch(/phone|licenseNumber|ghanaCard/i)
    expect(body.fuelEstimate.source).toBe('fleet_history')
    expect(body.fuelEstimate.priceSource).toBe('request')
  })

  it('fails explicitly when the static route graph has a missing leg', async () => {
    const response = await GET(request('from=Accra&to=Kumasi&stops=Bolgatanga'))
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.error).toBe('Route data unavailable for one or more legs')
    expect(body.missingRoutes.length).toBeGreaterThan(0)
  })
})
