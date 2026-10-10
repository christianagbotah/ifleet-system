import { describe, expect, it } from 'vitest'

import type { VideoAlarmEvent } from '../alarm-normalizer'
import {
  persistVideoIncident,
  type PersistedVideoIncident,
  type VideoIncidentRepository,
} from '../incident-service'

const event: VideoAlarmEvent = {
  provider: 'generic-http',
  deviceId: 'device-1',
  providerEventId: 'evt-100',
  providerAlarmCode: 'DMS_FATIGUE',
  alarmType: 'fatigue',
  severity: 'critical',
  occurredAt: new Date('2026-10-09T12:00:00.000Z'),
  receivedAt: new Date('2026-10-09T12:00:03.000Z'),
  assetType: 'tractor',
  assetId: 'truck-1',
  tripId: 'trip-1',
  latitude: 5.6037,
  longitude: -0.187,
  message: 'Driver fatigue detected',
  channelKey: 'cabin',
  dedupeKey: 'dedupe-1',
}

function repository(existing: PersistedVideoIncident | null = null) {
  const calls: VideoAlarmEvent[] = []
  const repo: VideoIncidentRepository = {
    findByDedupeKey: async () => existing,
    create: async (input) => {
      calls.push(input)
      return { alarmEventId: 'alarm-1', incidentId: 'incident-1' }
    },
  }
  return { repo, calls }
}

describe('video incident persistence', () => {
  it('creates exactly one normalized alarm and incident for a new dedupe key', async () => {
    const { repo, calls } = repository()

    const result = await persistVideoIncident(event, repo)

    expect(result).toEqual({ duplicate: false, alarmEventId: 'alarm-1', incidentId: 'incident-1' })
    expect(calls).toEqual([event])
  })

  it('returns the existing alarm and incident for a replay without creating another row', async () => {
    const { repo, calls } = repository({ alarmEventId: 'alarm-existing', incidentId: 'incident-existing' })

    const result = await persistVideoIncident(event, repo)

    expect(result).toEqual({ duplicate: true, alarmEventId: 'alarm-existing', incidentId: 'incident-existing' })
    expect(calls).toHaveLength(0)
  })

  it('passes the resolved trip, asset and location context unchanged to persistence', async () => {
    const { repo, calls } = repository()

    await persistVideoIncident(event, repo)

    expect(calls[0]).toMatchObject({
      tripId: 'trip-1',
      assetType: 'tractor',
      assetId: 'truck-1',
      latitude: 5.6037,
      longitude: -0.187,
      channelKey: 'cabin',
    })
  })
})
