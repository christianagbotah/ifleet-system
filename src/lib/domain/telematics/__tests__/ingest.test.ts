import { describe, expect, it, vi } from 'vitest'

import type { LocationEventInput } from '../events'
import {
  createTelematicsIdempotencyKey,
  ingestTelematicsEvent,
  type TelematicsIngestRepository,
  type TelematicsRawEnvelope,
} from '../ingest'

const receivedAt = new Date('2026-10-08T10:00:00.000Z')
const deviceTimestamp = new Date('2026-10-08T09:59:58.000Z')

function location(overrides: Partial<LocationEventInput> = {}): LocationEventInput {
  return {
    kind: 'location',
    provider: 'generic-http',
    deviceId: 'device-001',
    providerEventId: 'evt-001',
    source: 'hardwired',
    trust: 'hardwired',
    externalAssetRef: 'spoofed-truck-id',
    deviceTimestamp,
    receivedAt,
    rawEventRef: 'raw-001',
    latitude: 5.6037,
    longitude: -0.187,
    speedKph: 36,
    headingDeg: 92,
    accuracyMeters: 7.5,
    ...overrides,
  }
}

function raw(overrides: Partial<TelematicsRawEnvelope> = {}): TelematicsRawEnvelope {
  return {
    rawEventRef: 'raw-001',
    provider: 'generic-http',
    deviceId: 'device-001',
    providerEventId: 'evt-001',
    payloadHash: 'a'.repeat(64),
    payload: '{"event":"location"}',
    receivedAt,
    ...overrides,
  }
}

function repository(overrides: Partial<TelematicsIngestRepository> = {}): TelematicsIngestRepository {
  return {
    findDevice: vi.fn().mockResolvedValue({ id: 'device-001', provider: 'generic-http', status: 'active' }),
    resolveInstallation: vi.fn().mockResolvedValue({
      id: 'install-001',
      deviceId: 'device-001',
      assetType: 'tractor',
      assetId: 'truck-authoritative',
      installedAt: new Date('2026-10-01T00:00:00.000Z'),
      uninstalledAt: null,
    }),
    resolveTrip: vi.fn().mockResolvedValue('trip-001'),
    findDuplicate: vi.fn().mockResolvedValue(null),
    persist: vi.fn().mockResolvedValue({
      eventId: 'event-001',
      rawEventRef: 'raw-001',
      liveStateUpdated: true,
      legacyLocationId: 'legacy-location-001',
    }),
    ...overrides,
  }
}

describe('telematics idempotency identity', () => {
  it('prefers provider event identity and falls back to raw payload identity', () => {
    const first = createTelematicsIdempotencyKey('generic-http', 'device-001', 'evt-42', 'a'.repeat(64))
    const retry = createTelematicsIdempotencyKey('generic-http', 'device-001', 'evt-42', 'b'.repeat(64))
    const fallbackA = createTelematicsIdempotencyKey('generic-http', 'device-001', null, 'a'.repeat(64))
    const fallbackB = createTelematicsIdempotencyKey('generic-http', 'device-001', null, 'b'.repeat(64))

    expect(retry).toBe(first)
    expect(fallbackB).not.toBe(fallbackA)
  })
})

describe('durable telematics ingest', () => {
  it('rejects an unknown or inactive machine device before persistence', async () => {
    const repo = repository({ findDevice: vi.fn().mockResolvedValue(null) })

    await expect(ingestTelematicsEvent(location(), raw(), repo)).rejects.toThrow(/unknown device/i)
    expect(repo.persist).not.toHaveBeenCalled()
  })

  it('resolves an external IMEI/serial reference to the canonical internal device before persistence', async () => {
    const resolveInstallation = vi.fn().mockResolvedValue({
      id: 'install-001',
      deviceId: 'device-internal',
      assetType: 'tractor',
      assetId: 'truck-authoritative',
      installedAt: new Date('2026-10-01T00:00:00.000Z'),
      uninstalledAt: null,
    })
    const persist = vi.fn().mockResolvedValue({ eventId: 'event-001', rawEventRef: 'raw-001', liveStateUpdated: true, legacyLocationId: null })
    const repo = repository({
      findDevice: vi.fn().mockResolvedValue({ id: 'device-internal', provider: 'generic-http', status: 'active' }),
      resolveInstallation,
      persist,
    })

    await ingestTelematicsEvent(
      location({ deviceId: '352099001234567' }),
      raw({ deviceId: '352099001234567' }),
      repo,
    )

    expect(resolveInstallation).toHaveBeenCalledWith('device-internal', deviceTimestamp)
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      event: expect.objectContaining({ deviceId: 'device-internal' }),
      raw: expect.objectContaining({ deviceId: 'device-internal' }),
    }))
  })

  it('uses installation history as authoritative hardware asset attribution', async () => {
    const repo = repository()
    const result = await ingestTelematicsEvent(location(), raw(), repo)

    expect(repo.resolveInstallation).toHaveBeenCalledWith('device-001', deviceTimestamp)
    expect(repo.resolveTrip).toHaveBeenCalledWith('tractor', 'truck-authoritative', deviceTimestamp)
    expect(repo.persist).toHaveBeenCalledWith(expect.objectContaining({
      assetType: 'tractor',
      assetId: 'truck-authoritative',
      tripId: 'trip-001',
    }))
    expect(result.assetId).toBe('truck-authoritative')
  })

  it('returns the existing event for duplicate provider event IDs without another write', async () => {
    const repo = repository({
      findDuplicate: vi.fn().mockResolvedValue({ eventId: 'event-existing', rawEventRef: 'raw-existing' }),
    })

    const result = await ingestTelematicsEvent(location(), raw(), repo)
    expect(result).toMatchObject({ duplicate: true, eventId: 'event-existing' })
    expect(repo.persist).not.toHaveBeenCalled()
  })

  it('persists out-of-order history but never regresses the live snapshot', async () => {
    const persist = vi.fn().mockImplementation(async (input) => ({
      eventId: 'event-old',
      rawEventRef: input.raw.rawEventRef,
      liveStateUpdated: input.updateLiveState,
      legacyLocationId: 'legacy-old',
    }))
    const repo = repository({
      persist,
      getLiveStateTiming: vi.fn().mockResolvedValue({ deviceTimestamp: new Date('2026-10-08T10:00:30.000Z'), receivedAt: new Date('2026-10-08T10:00:31.000Z') }),
    })

    const result = await ingestTelematicsEvent(
      location({ providerEventId: 'evt-old', deviceTimestamp: new Date('2026-10-08T09:58:00.000Z') }),
      raw({ providerEventId: 'evt-old' }),
      repo,
    )

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ updateLiveState: false }))
    expect(result.liveStateUpdated).toBe(false)
  })

  it('recovers from a future-skewed live snapshot using server receipt time for ordering', async () => {
    const persist = vi.fn().mockImplementation(async (input) => ({
      eventId: 'event-recovered',
      rawEventRef: input.raw.rawEventRef,
      liveStateUpdated: input.updateLiveState,
      legacyLocationId: 'legacy-recovered',
    }))
    const repo = repository({
      persist,
      getLiveStateTiming: vi.fn().mockResolvedValue({
        deviceTimestamp: new Date('2026-10-08T11:00:00.000Z'),
        receivedAt: new Date('2026-10-08T10:00:00.000Z'),
      }),
    })

    const nextReceivedAt = new Date('2026-10-08T10:00:05.000Z')
    const result = await ingestTelematicsEvent(
      location({
        providerEventId: 'evt-recovered',
        deviceTimestamp: new Date('2026-10-08T10:00:04.000Z'),
        receivedAt: nextReceivedAt,
        rawEventRef: 'raw-recovered',
      }),
      raw({
        providerEventId: 'evt-recovered',
        receivedAt: nextReceivedAt,
        rawEventRef: 'raw-recovered',
      }),
      repo,
    )

    expect(persist).toHaveBeenCalledWith(expect.objectContaining({ updateLiveState: true }))
    expect(result.liveStateUpdated).toBe(true)
  })

  it('allows phone fallback without a registered device when the route supplies an authoritative tractor', async () => {
    const repo = repository({ findDevice: vi.fn() })
    const phoneEvent = location({
      provider: 'mobile-app',
      source: 'phone',
      trust: 'phone',
      deviceId: null,
      providerEventId: null,
      externalAssetRef: 'truck-phone-owned',
    })

    const result = await ingestTelematicsEvent(
      phoneEvent,
      raw({ provider: 'mobile-app', deviceId: null, providerEventId: null }),
      repo,
      { authoritativeAsset: { assetType: 'tractor', assetId: 'truck-phone-owned' } },
    )

    expect(repo.findDevice).not.toHaveBeenCalled()
    expect(repo.resolveInstallation).not.toHaveBeenCalled()
    expect(repo.persist).toHaveBeenCalledWith(expect.objectContaining({
      assetType: 'tractor',
      assetId: 'truck-phone-owned',
    }))
    expect(result.assetId).toBe('truck-phone-owned')
  })
})
