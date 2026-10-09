import { describe, expect, it } from 'vitest'

import { ingestVideoAlarm, type VideoIncidentRepository } from '../incident-service'
import { normalizeVideoAlarm } from '../alarm-normalizer'

function normalizedAlarm() {
  return normalizeVideoAlarm({
    provider: 'generic-http',
    deviceId: 'device-1',
    providerEventId: 'event-100',
    alarmCode: 'driver_fatigue',
    severity: 'high',
    occurredAt: '2026-10-09T16:30:00Z',
    latitude: 5.6037,
    longitude: -0.187,
    channelKey: 'cabin',
    recordingRef: 'recording-100',
  }, {
    receivedAt: new Date('2026-10-09T16:30:03Z'),
    assetType: 'tractor',
    assetId: 'truck-1',
    tripId: 'trip-1',
  })
}

class MemoryRepository implements VideoIncidentRepository {
  writes = 0
  existing: { alarmEventId: string; incidentId: string } | null = null

  async findByDedupeKey() {
    return this.existing
  }

  async persist() {
    this.writes += 1
    this.existing = { alarmEventId: 'alarm-1', incidentId: 'incident-1' }
    return this.existing
  }
}

describe('ingestVideoAlarm', () => {
  it('creates one normalized alarm event and incident on first receipt', async () => {
    const repository = new MemoryRepository()

    const result = await ingestVideoAlarm(normalizedAlarm(), repository)

    expect(result).toEqual({
      duplicate: false,
      alarmEventId: 'alarm-1',
      incidentId: 'incident-1',
    })
    expect(repository.writes).toBe(1)
  })

  it('returns the existing incident without persisting a replayed alarm', async () => {
    const repository = new MemoryRepository()
    const alarm = normalizedAlarm()

    await ingestVideoAlarm(alarm, repository)
    const replay = await ingestVideoAlarm(alarm, repository)

    expect(replay).toEqual({
      duplicate: true,
      alarmEventId: 'alarm-1',
      incidentId: 'incident-1',
    })
    expect(repository.writes).toBe(1)
  })
})
