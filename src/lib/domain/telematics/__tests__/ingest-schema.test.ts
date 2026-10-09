import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const schema = readFileSync(path.join(process.cwd(), 'prisma/models/telematics.prisma'), 'utf8')

describe('durable ingest schema', () => {
  it('stores raw packet evidence with a unique idempotency key', () => {
    expect(schema).toContain('model RawTelematicsPacket')
    for (const field of ['provider', 'deviceId', 'providerEventId', 'idempotencyKey', 'payloadHash', 'payload', 'receivedAt']) {
      expect(schema).toContain(field)
    }
    expect(schema).toContain('idempotencyKey String   @unique')
  })

  it('stores exactly one current live-state snapshot per asset', () => {
    expect(schema).toContain('model VehicleLiveState')
    for (const field of ['assetType', 'assetId', 'latestEventId', 'deviceTimestamp', 'receivedAt', 'source', 'trust']) {
      expect(schema).toContain(field)
    }
    expect(schema).toContain('@@unique([assetType, assetId])')
  })

  it('links normalized events to their deterministic idempotency identity', () => {
    expect(schema).toContain('idempotencyKey  String   @unique')
  })
})
