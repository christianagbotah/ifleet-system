import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { GenericHttpTelematicsProvider } from '../providers/generic-http'
import { MobileAppTelematicsProvider } from '../providers/mobile-app'

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'))
}

const receivedAt = new Date('2026-10-08T10:00:00.000Z')

describe('provider parity', () => {
  it('normalizes equivalent phone and hardwired packets into identical canonical location metrics', () => {
    const mobile = new MobileAppTelematicsProvider().normalizeLocation(
      fixture('mobile-location.json'),
      { receivedAt, rawEventRef: 'raw-mobile-001' },
    )
    const hardware = new GenericHttpTelematicsProvider().normalizeLocation(
      fixture('generic-http-location.json'),
      { receivedAt, rawEventRef: 'raw-hardware-001', deviceId: 'device-001' },
    )

    expect({
      latitude: hardware.latitude,
      longitude: hardware.longitude,
      speedKph: hardware.speedKph,
      headingDeg: hardware.headingDeg,
      accuracyMeters: hardware.accuracyMeters,
      deviceTimestamp: hardware.deviceTimestamp.toISOString(),
      receivedAt: hardware.receivedAt.toISOString(),
      externalAssetRef: hardware.externalAssetRef,
    }).toEqual({
      latitude: mobile.latitude,
      longitude: mobile.longitude,
      speedKph: mobile.speedKph,
      headingDeg: mobile.headingDeg,
      accuracyMeters: mobile.accuracyMeters,
      deviceTimestamp: mobile.deviceTimestamp.toISOString(),
      receivedAt: mobile.receivedAt.toISOString(),
      externalAssetRef: mobile.externalAssetRef,
    })

    expect(hardware).toMatchObject({
      provider: 'generic-http',
      source: 'hardwired',
      trust: 'hardwired',
      providerEventId: 'generic-event-001',
      deviceId: 'device-001',
      rawEventRef: 'raw-hardware-001',
    })
  })
  it('does not require a payload assetRef because installation history is authoritative', () => {
    const payload = fixture('generic-http-location.json')
    delete payload.assetRef
    const hardware = new GenericHttpTelematicsProvider().normalizeLocation(
      payload,
      { receivedAt, rawEventRef: 'raw-hardware-no-asset', deviceId: '352099001234567' },
    )
    expect(hardware.externalAssetRef).toBe('352099001234567')
  })

})
