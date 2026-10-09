import { describe, expect, it } from 'vitest'

import { createVideoAlarmDedupeKey, normalizeVideoAlarm } from '../alarm-normalizer'

const context = {
  receivedAt: new Date('2026-10-09T16:30:00Z'),
  assetType: 'tractor' as const,
  assetId: 'truck-1',
  tripId: 'trip-1',
}

describe('normalizeVideoAlarm', () => {
  it.each([
    ['ADAS_COLLISION_WARNING', 'collision'],
    ['hard_brake', 'harsh_braking'],
    ['HARSH_ACCELERATION', 'harsh_acceleration'],
    ['overspeed', 'speeding'],
    ['driver_fatigue', 'fatigue'],
    ['phone_use', 'distraction'],
    ['route-deviation', 'route_deviation'],
    ['SOS', 'panic_sos'],
    ['cargo_door_open', 'cargo_door'],
    ['unauthorized_stop', 'unauthorized_stop'],
    ['device_power_cut', 'power_tamper'],
  ])('maps vendor alarm code %s to %s', (alarmCode, alarmType) => {
    const result = normalizeVideoAlarm({
      provider: 'generic-http',
      deviceId: 'device-1',
      providerEventId: `event-${alarmCode}`,
      alarmCode,
      occurredAt: '2026-10-09T16:29:30Z',
    }, context)

    expect(result.alarmType).toBe(alarmType)
  })

  it('uses provider event identity for stable replay deduplication', () => {
    const first = createVideoAlarmDedupeKey({
      provider: 'vendor-a',
      deviceId: 'device-1',
      providerEventId: 'alarm-7788',
      alarmCode: 'fatigue',
      occurredAt: new Date('2026-10-09T16:20:00Z'),
      message: 'first payload',
    })
    const replay = createVideoAlarmDedupeKey({
      provider: 'vendor-a',
      deviceId: 'device-1',
      providerEventId: 'alarm-7788',
      alarmCode: 'fatigue',
      occurredAt: new Date('2026-10-09T16:20:10Z'),
      message: 'replayed payload with different text',
    })

    expect(replay).toBe(first)
  })

  it.each([
    ['HIGH', 'critical'],
    [5, 'critical'],
    ['medium', 'warning'],
    [2, 'warning'],
    ['low', 'info'],
    [0, 'info'],
  ])('normalizes severity %s to %s', (severity, expected) => {
    const result = normalizeVideoAlarm({
      provider: 'generic-http',
      deviceId: 'device-1',
      providerEventId: `severity-${String(severity)}`,
      alarmCode: 'fatigue',
      severity,
      occurredAt: '2026-10-09T16:29:30Z',
    }, context)

    expect(result.severity).toBe(expected)
  })

  it('preserves unknown vendor codes without pretending they are known alarms', () => {
    const result = normalizeVideoAlarm({
      provider: 'vendor-x',
      deviceId: 'device-1',
      providerEventId: 'unknown-1',
      alarmCode: 'VENDOR_MAGIC_EVENT_99',
      occurredAt: '2026-10-09T16:29:30Z',
    }, context)

    expect(result.alarmType).toBe('unknown')
    expect(result.rawAlarmCode).toBe('VENDOR_MAGIC_EVENT_99')
  })

  it('carries resolved asset, trip, location, channel and recording context', () => {
    const result = normalizeVideoAlarm({
      provider: 'generic-http',
      deviceId: 'device-1',
      providerEventId: 'evt-context',
      alarmCode: 'collision',
      occurredAt: '2026-10-09T16:29:30Z',
      latitude: 5.6037,
      longitude: -0.187,
      channelKey: 'front',
      recordingRef: 'vendor-recording-abc',
    }, context)

    expect(result).toMatchObject({
      assetType: 'tractor',
      assetId: 'truck-1',
      tripId: 'trip-1',
      latitude: 5.6037,
      longitude: -0.187,
      channelKey: 'front',
      recordingRef: 'vendor-recording-abc',
    })
  })
})
