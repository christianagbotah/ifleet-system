import { describe, expect, it, vi } from 'vitest'

import {
  processLocationRoutingIntelligence,
  type RoutingIntelligenceRepository,
} from '../intelligence'

const occurredAt = new Date('2026-10-09T00:30:00.000Z')

function repository(overrides: Partial<RoutingIntelligenceRepository> = {}): RoutingIntelligenceRepository {
  return {
    listGeofences: vi.fn().mockResolvedValue([]),
    getGeofenceState: vi.fn().mockResolvedValue(null),
    saveGeofenceState: vi.fn().mockResolvedValue(undefined),
    recordGeofenceTransition: vi.fn().mockResolvedValue(undefined),
    getPlannedRoute: vi.fn().mockResolvedValue(null),
    getRouteDeviationState: vi.fn().mockResolvedValue(null),
    recordRouteDeviation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('location routing intelligence', () => {
  it('records an idempotent geofence enter and persists current inside state', async () => {
    const repo = repository({
      listGeofences: vi.fn().mockResolvedValue([{
        id: 'zone-tema',
        zone: {
          geometryType: 'circle',
          center: { latitude: 5.6698, longitude: -0.0166 },
          radiusMeters: 500,
        },
        dwellThresholdMs: 15 * 60 * 1000,
      }]),
    })

    await processLocationRoutingIntelligence({
      eventId: 'event-001',
      assetType: 'tractor',
      assetId: 'truck-001',
      tripId: 'trip-001',
      point: { latitude: 5.6698, longitude: -0.0166 },
      occurredAt,
    }, repo)

    expect(repo.recordGeofenceTransition).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-001',
      geofenceZoneId: 'zone-tema',
      transition: 'enter',
      idempotencyKey: 'event-001:zone-tema:enter',
    }))
    expect(repo.saveGeofenceState).toHaveBeenCalledWith(expect.objectContaining({
      geofenceZoneId: 'zone-tema',
      inside: true,
      enteredAt: occurredAt,
      dwellEmitted: false,
    }))
  })

  it('records dwell once when an inside asset exceeds the configured threshold', async () => {
    const enteredAt = new Date('2026-10-09T00:00:00.000Z')
    const repo = repository({
      listGeofences: vi.fn().mockResolvedValue([{
        id: 'zone-yard',
        zone: {
          geometryType: 'polygon',
          points: [
            { latitude: 5.6700, longitude: -0.0190 },
            { latitude: 5.6700, longitude: -0.0140 },
            { latitude: 5.6660, longitude: -0.0140 },
            { latitude: 5.6660, longitude: -0.0190 },
          ],
        },
        dwellThresholdMs: 15 * 60 * 1000,
      }]),
      getGeofenceState: vi.fn().mockResolvedValue({ inside: true, enteredAt, dwellEmitted: false }),
    })

    await processLocationRoutingIntelligence({
      eventId: 'event-002',
      assetType: 'tractor',
      assetId: 'truck-001',
      tripId: 'trip-001',
      point: { latitude: 5.6680, longitude: -0.0160 },
      occurredAt,
    }, repo)

    expect(repo.recordGeofenceTransition).toHaveBeenCalledWith(expect.objectContaining({ transition: 'dwell' }))
    expect(repo.saveGeofenceState).toHaveBeenCalledWith(expect.objectContaining({ dwellEmitted: true }))
  })

  it('records deviation and recovery only when route state changes', async () => {
    const route = {
      id: 'route-001',
      toleranceMeters: 250,
      points: [
        { latitude: 5.6698, longitude: -0.0166 },
        { latitude: 5.7000, longitude: -0.1000 },
        { latitude: 5.9000, longitude: -0.5000 },
      ],
    }
    const deviationRepo = repository({
      getPlannedRoute: vi.fn().mockResolvedValue(route),
      getRouteDeviationState: vi.fn().mockResolvedValue({ deviated: false }),
    })

    await processLocationRoutingIntelligence({
      eventId: 'event-003',
      assetType: 'tractor',
      assetId: 'truck-001',
      tripId: 'trip-001',
      point: { latitude: 5.7200, longitude: -0.1500 },
      occurredAt,
    }, deviationRepo)

    expect(deviationRepo.recordRouteDeviation).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'event-003',
      plannedRouteId: 'route-001',
      eventType: 'deviation',
      idempotencyKey: 'event-003:route-001:deviation',
    }))

    const recoveryRepo = repository({
      getPlannedRoute: vi.fn().mockResolvedValue(route),
      getRouteDeviationState: vi.fn().mockResolvedValue({ deviated: true }),
    })

    await processLocationRoutingIntelligence({
      eventId: 'event-004',
      assetType: 'tractor',
      assetId: 'truck-001',
      tripId: 'trip-001',
      point: { latitude: 5.7002, longitude: -0.1001 },
      occurredAt,
    }, recoveryRepo)

    expect(recoveryRepo.recordRouteDeviation).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'recovery',
      idempotencyKey: 'event-004:route-001:recovery',
    }))
  })
})
