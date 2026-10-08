import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { MobileAppTelematicsProvider } from '../providers/mobile-app'
import type { TelematicsProviderAdapter } from '../provider'

const fixture = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/mobile-location.json'), 'utf8'),
) as Record<string, unknown>

const receivedAt = new Date('2026-10-08T10:00:00.000Z')

function adapter(): TelematicsProviderAdapter {
  return new MobileAppTelematicsProvider()
}

describe('telematics provider normalization contract', () => {
  it('normalizes the existing mobile location payload into canonical units', () => {
    const event = adapter().normalizeLocation(fixture, {
      receivedAt,
      rawEventRef: 'raw-mobile-001',
    })

    expect(event).toMatchObject({
      kind: 'location',
      provider: 'mobile-app',
      source: 'phone',
      trust: 'phone',
      externalAssetRef: 'truck-ghana-001',
      latitude: 5.6037,
      longitude: -0.187,
      accuracyMeters: 7.5,
      speedKph: 36,
      headingDeg: 92,
      rawEventRef: 'raw-mobile-001',
    })
    expect(event.deviceTimestamp.toISOString()).toBe('2026-10-08T09:59:58.000Z')
    expect(event.receivedAt.toISOString()).toBe('2026-10-08T10:00:00.000Z')
  })

  it('preserves received time separately when the phone clock drifts', () => {
    const event = adapter().normalizeLocation(
      { ...fixture, timestamp: '2026-10-08T09:55:00.000Z' },
      { receivedAt, rawEventRef: 'raw-mobile-drift' },
    )
    expect(event.deviceTimestamp.getTime()).toBeLessThan(event.receivedAt.getTime())
    expect(event.receivedAt.toISOString()).toBe('2026-10-08T10:00:00.000Z')
  })

  it('uses received time when the phone omits its timestamp', () => {
    const payload = { ...fixture }
    delete payload.timestamp
    const event = adapter().normalizeLocation(payload, { receivedAt, rawEventRef: 'raw-mobile-no-time' })
    expect(event.deviceTimestamp.toISOString()).toBe(receivedAt.toISOString())
  })

  it.each([
    [{ ...fixture, latitude: 91 }, 'latitude'],
    [{ ...fixture, longitude: -181 }, 'longitude'],
    [{ ...fixture, speed: -1 }, 'speed'],
    [{ ...fixture, heading: 361 }, 'heading'],
  ])('rejects malformed provider packets instead of coercing them', (payload, field) => {
    expect(() => adapter().normalizeLocation(payload, { receivedAt, rawEventRef: 'raw-invalid' }))
      .toThrow(new RegExp(field, 'i'))
  })

  it('reports adapter health without exposing vendor credentials', async () => {
    const health = await adapter().healthCheck({ checkedAt: receivedAt })
    expect(health).toEqual({ provider: 'mobile-app', healthy: true, checkedAt: receivedAt })
  })
})
