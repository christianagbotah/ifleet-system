import { describe, expect, it } from 'vitest'

import {
  activeTruckIdsFromLocations,
  classifyTelemetryFreshness,
} from '../freshness'

const NOW = new Date('2026-10-22T17:30:00.000Z')

function ago(milliseconds: number): string {
  return new Date(NOW.getTime() - milliseconds).toISOString()
}

describe('telemetry freshness truthfulness', () => {
  it('keeps the exact Control Tower online/stale/offline boundaries', () => {
    expect(classifyTelemetryFreshness(ago(2 * 60 * 1000), NOW)).toBe('online')
    expect(classifyTelemetryFreshness(ago(2 * 60 * 1000 + 1), NOW)).toBe('stale')
    expect(classifyTelemetryFreshness(ago(30 * 60 * 1000), NOW)).toBe('stale')
    expect(classifyTelemetryFreshness(ago(30 * 60 * 1000 + 1), NOW)).toBe('offline')
  })

  it('fails closed for missing or invalid telemetry timestamps', () => {
    expect(classifyTelemetryFreshness(undefined, NOW)).toBe('offline')
    expect(classifyTelemetryFreshness('not-a-timestamp', NOW)).toBe('offline')
  })

  it('returns only genuinely online trucks for the active-trucks socket contract', () => {
    const locations = [
      { truckId: 'fresh', receivedAt: ago(60 * 1000), timestamp: ago(90 * 1000) },
      { truckId: 'stale', receivedAt: ago(8 * 60 * 1000), timestamp: ago(8 * 60 * 1000) },
      { truckId: 'old', receivedAt: ago(45 * 60 * 1000), timestamp: ago(45 * 60 * 1000) },
      { truckId: 'timestamp-fallback', timestamp: ago(30 * 1000) },
    ]

    expect(activeTruckIdsFromLocations(locations, NOW)).toEqual(['fresh', 'timestamp-fallback'])
  })
})
