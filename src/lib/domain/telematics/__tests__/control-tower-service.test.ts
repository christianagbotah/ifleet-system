import { describe, expect, it } from 'vitest'
import { loadControlTowerLive, loadControlTowerHistory, type ControlTowerRepository } from '../control-tower-service'

const NOW = new Date('2026-10-09T03:00:00Z')

function candidate(source: 'hardwired' | 'mdvr' | 'phone' | 'manual', secondsAgo: number) {
  return {
    id: `${source}-${secondsAgo}`,
    assetType: 'tractor',
    assetId: 'truck-1',
    deviceId: source === 'phone' ? null : 'device-1',
    tripId: 'trip-1',
    provider: source === 'phone' ? 'mobile-app' : 'generic-http',
    source,
    trust: source,
    deviceTimestamp: new Date(NOW.getTime() - secondsAgo * 1000),
    receivedAt: new Date(NOW.getTime() - secondsAgo * 1000 + 500),
    latitude: 5.6037,
    longitude: -0.187,
    speedKph: 42,
    headingDeg: 90,
    accuracyMeters: 6,
    ignitionOn: true,
  }
}

function repository(overrides: Partial<ControlTowerRepository> = {}): ControlTowerRepository {
  return {
    listLatestSnapshots: async () => [candidate('phone', 10)],
    listRecentLocationCandidates: async () => [candidate('phone', 10), candidate('hardwired', 45)],
    loadAssetContexts: async () => [{
      assetType: 'tractor',
      assetId: 'truck-1',
      label: 'GT-1000-24',
      driverName: 'Kofi Test',
      tripId: 'trip-1',
      tripNumber: 'TRP-001',
      tripStatus: 'in_transit',
      destination: 'Kumasi',
      revenue: 12000,
      fuelCost: 2100,
    }],
    listTripLocationHistory: async () => [candidate('hardwired', 180), candidate('hardwired', 120), candidate('hardwired', 60)],
    ...overrides,
  }
}

describe('Control Tower query service', () => {
  it('returns one preferred normalized live record per asset', async () => {
    const records = await loadControlTowerLive(repository(), { now: NOW, roleName: 'Manager' })
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      assetId: 'truck-1',
      label: 'GT-1000-24',
      source: 'hardwired',
      connectionState: 'online',
      tripNumber: 'TRP-001',
    })
  })

  it('redacts financial fields for drivers', async () => {
    const records = await loadControlTowerLive(repository(), { now: NOW, roleName: 'Driver' })
    expect(records[0]).not.toHaveProperty('revenue')
    expect(records[0]).not.toHaveProperty('fuelCost')
  })

  it('uses durable latest state when no recent source candidate exists', async () => {
    const records = await loadControlTowerLive(repository({ listRecentLocationCandidates: async () => [] }), { now: NOW, roleName: 'Manager' })
    expect(records[0]).toMatchObject({ source: 'phone', assetId: 'truck-1' })
  })

  it('returns chronologically ordered bounded replay points', async () => {
    const result = await loadControlTowerHistory(repository(), {
      tripId: 'trip-1',
      from: '2026-10-08T00:00:00Z',
      to: '2026-10-09T00:00:00Z',
      resolution: '1m',
    })
    expect(result.points.map((point) => point.deviceTimestamp.toISOString())).toEqual([
      '2026-10-09T02:57:00.000Z',
      '2026-10-09T02:58:00.000Z',
      '2026-10-09T02:59:00.000Z',
    ])
    expect(result.points.length).toBeLessThanOrEqual(5000)
  })
})
