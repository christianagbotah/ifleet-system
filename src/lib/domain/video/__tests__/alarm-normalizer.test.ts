import { describe, expect, it } from 'vitest'

import {
  createVideoAlarmDedupeKey,
  normalizeVideoAlarm,
  type VideoAlarmNormalizationInput,
} from '../alarm-normalizer'

const base: VideoAlarmNormalizationInput = {
  provider: 'generic-http',
  deviceId: 'device-1',
  providerEventId: 'evt-100',
  providerCode: 'DMS_FATIGUE',
  occurredAt: new Date('2026-10-09T12:00:00.000Z'),
  receivedAt: new Date('2026-10-09T12:00:03.000Z'),
  assetType: 'tractor',
  assetId: 'truck-1',
  tripId: 'trip-1',
  latitude: 5.6037,
  longitude: -0.187,
  message: 'Driver fatigue detected',
}

describe('video alarm normalization', () => {
  it.each([
    ['collision', 'collision'],
    ['ADAS_CRASH', 'collision'],
    ['hard_brake', 'harsh-braking'],
    ['HARSH_ACCELERATION', 'harsh-acceleration'],
    ['overspeed', 'speeding'],
    ['DMS_FATIGUE', 'fatigue'],
    ['driver_distraction', 'distraction'],
    ['mobile_phone', 'phone-use'],
    ['route_deviation', 'route-deviation'],
    ['SOS', 'panic-sos'],
    ['cargo_door_open', 'cargo-door'],
    ['unauthorized_stop', 'unauthorized-stop'],
    ['power_cut', 'device-power-tamper'],
  ] as const)('maps provider code %s to %s', (providerCode, expected) => {
    expect(normalizeVideoAlarm({ ...base, providerCode }).alarmType).toBe(expected)
  })

  it('normalizes severity deterministically when a provider severity is absent or inconsistent', () => {
    expect(normalizeVideoAlarm({ ...base, providerCode: 'collision', severity: 'emergency' }).severity).toBe('critical')
    expect(normalizeVideoAlarm({ ...base, providerCode: 'overspeed' }).severity).toBe('warning')
    expect(normalizeVideoAlarm({ ...base, providerCode: 'cargo_door_open', severity: 'INFO' }).severity).toBe('info')
  })

  it('preserves an unknown provider code instead of dropping the alarm', () => {
    const event = normalizeVideoAlarm({ ...base, providerCode: 'VENDOR_X_9988' })

    expect(event.alarmType).toBe('unknown')
    expect(event.providerAlarmCode).toBe('VENDOR_X_9988')
    expect(event.severity).toBe('warning')
  })

  it('uses provider event identity for dedupe regardless of mutable message content', () => {
    const first = normalizeVideoAlarm(base)
    const replay = normalizeVideoAlarm({ ...base, message: 'translated message from retry' })

    expect(first.dedupeKey).toBe(replay.dedupeKey)
    expect(first.dedupeKey).toBe(createVideoAlarmDedupeKey('generic-http', 'device-1', 'evt-100', base.occurredAt, 'DMS_FATIGUE'))
  })

  it('falls back to stable event attributes when provider event id is absent', () => {
    const key1 = createVideoAlarmDedupeKey('generic-http', 'device-1', null, base.occurredAt, 'DMS_FATIGUE')
    const key2 = createVideoAlarmDedupeKey('generic-http', 'device-1', null, base.occurredAt, 'DMS_FATIGUE')
    const different = createVideoAlarmDedupeKey('generic-http', 'device-1', null, base.occurredAt, 'collision')

    expect(key1).toBe(key2)
    expect(key1).not.toBe(different)
  })

  it('retains trip, asset and location context for incident association', () => {
    const event = normalizeVideoAlarm(base)

    expect(event.tripId).toBe('trip-1')
    expect(event.assetType).toBe('tractor')
    expect(event.assetId).toBe('truck-1')
    expect(event.latitude).toBe(5.6037)
    expect(event.longitude).toBe(-0.187)
    expect(event.deviceId).toBe('device-1')
  })
})
