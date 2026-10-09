import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(path.join(process.cwd(), 'prisma/models/telematics.prisma'), 'utf8')

describe('normalized telematics persistence contract', () => {
  it('stores provider-neutral events with raw evidence and dual timestamps', () => {
    expect(schema).toContain('model TelematicsEvent')
    for (const field of [
      'eventType',
      'deviceId',
      'provider',
      'assetType',
      'assetId',
      'tripId',
      'deviceTimestamp',
      'receivedAt',
      'latitude',
      'longitude',
      'speedKph',
      'headingDeg',
      'accuracyMeters',
      'ignitionOn',
      'source',
      'trust',
      'rawEventRef',
    ]) {
      expect(schema).toContain(field)
    }
  })

  it('indexes timeline, asset, trip and raw-evidence lookups', () => {
    expect(schema).toContain('@@index([assetType, assetId, deviceTimestamp])')
    expect(schema).toContain('@@index([tripId, deviceTimestamp])')
    expect(schema).toContain('@@index([deviceId, deviceTimestamp])')
    expect(schema).toContain('@@index([rawEventRef])')
  })
})
