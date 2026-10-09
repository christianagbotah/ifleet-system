import { describe, expect, it } from 'vitest'
import {
  classifyLiveState,
  redactControlTowerRecord,
  selectPreferredLocation,
  validateHistoryQuery,
} from '../control-tower'

const NOW = new Date('2026-10-09T03:00:00Z')

function point(source: 'hardwired' | 'mdvr' | 'phone' | 'manual', secondsAgo: number) {
  return {
    id: `${source}-${secondsAgo}`,
    source,
    trust: source,
    deviceTimestamp: new Date(NOW.getTime() - secondsAgo * 1000),
    receivedAt: new Date(NOW.getTime() - secondsAgo * 1000 + 1000),
    latitude: 5.6037,
    longitude: -0.187,
    speedKph: 42,
  }
}

describe('Control Tower live-state selection', () => {
  it('prefers a fresh hardwired point over a newer phone fallback', () => {
    const selected = selectPreferredLocation([
      point('phone', 10),
      point('hardwired', 45),
    ], NOW)

    expect(selected?.source).toBe('hardwired')
  })

  it('falls back to a fresh phone point when hardwired telemetry is stale', () => {
    const selected = selectPreferredLocation([
      point('hardwired', 15 * 60),
      point('phone', 30),
    ], NOW)

    expect(selected?.source).toBe('phone')
  })

  it('uses server receipt time so a future-skewed device clock cannot mask a fresh phone fallback', () => {
    const futureSkewed = {
      ...point('hardwired', -60 * 60),
      receivedAt: new Date(NOW.getTime() - 40 * 60 * 1000),
    }
    const freshPhone = point('phone', 30)

    expect(selectPreferredLocation([futureSkewed, freshPhone], NOW)?.source).toBe('phone')
    expect(classifyLiveState(futureSkewed, NOW)).toBe('offline')
  })

  it('marks a vehicle stale then offline by last-seen age', () => {
    expect(classifyLiveState(point('hardwired', 60), NOW)).toBe('online')
    expect(classifyLiveState(point('hardwired', 8 * 60), NOW)).toBe('stale')
    expect(classifyLiveState(point('hardwired', 40 * 60), NOW)).toBe('offline')
  })
})

describe('Control Tower authorization shaping', () => {
  const record = {
    assetId: 'truck-1',
    plateNumber: 'GT-1000-24',
    driverName: 'Demo Driver',
    latitude: 5.6037,
    longitude: -0.187,
    tripId: 'trip-1',
    revenue: 12000,
    estimatedMargin: 3400,
    fuelCost: 2100,
  }

  it('redacts financial fields from driver responses', () => {
    const result = redactControlTowerRecord(record, 'Driver')
    expect(result).not.toHaveProperty('revenue')
    expect(result).not.toHaveProperty('estimatedMargin')
    expect(result).not.toHaveProperty('fuelCost')
    expect(result).toHaveProperty('plateNumber', 'GT-1000-24')
  })

  it('redacts financial fields from non-management operational roles', () => {
    const result = redactControlTowerRecord(record, 'Dispatcher')
    expect(result).not.toHaveProperty('revenue')
    expect(result).not.toHaveProperty('estimatedMargin')
    expect(result).not.toHaveProperty('fuelCost')
  })

  it('retains financial fields for managers', () => {
    const result = redactControlTowerRecord(record, 'Manager')
    expect(result).toHaveProperty('revenue', 12000)
    expect(result).toHaveProperty('estimatedMargin', 3400)
  })
})

describe('Control Tower route-history bounds', () => {
  it('accepts a bounded trip replay query', () => {
    const result = validateHistoryQuery({
      tripId: 'trip-1',
      from: '2026-10-08T00:00:00Z',
      to: '2026-10-09T00:00:00Z',
      resolution: '1m',
    })
    expect(result.resolution).toBe('1m')
    expect(result.maxPoints).toBeLessThanOrEqual(5000)
  })

  it('rejects unbounded or excessive history windows', () => {
    expect(() => validateHistoryQuery({ tripId: 'trip-1' })).toThrow(/from.*to/i)
    expect(() => validateHistoryQuery({
      tripId: 'trip-1',
      from: '2026-09-01T00:00:00Z',
      to: '2026-10-09T00:00:00Z',
      resolution: 'raw',
    })).toThrow(/window/i)
  })
})
