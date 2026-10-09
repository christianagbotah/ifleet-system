import { Prisma } from '@/generated/client'
import { db } from '@/lib/db'

import { validatePolygonPoints, type GeofenceZoneInput } from './geofence'
import { parseStoredRoutePoints } from './route-plan'
import type {
  GeofenceState,
  PlannedRouteSnapshot,
  RoutingGeofence,
  RoutingIntelligenceRepository,
} from './intelligence'

type RoutingClient = Prisma.TransactionClient

function toZone(row: {
  geometryType: string
  geometryJson: string | null
  latitude: number
  longitude: number
  radius: number
}): GeofenceZoneInput | null {
  if (row.geometryType === 'polygon') {
    if (!row.geometryJson) return null
    try {
      const points = validatePolygonPoints(JSON.parse(row.geometryJson))
      return points ? { geometryType: 'polygon', points } : null
    } catch {
      return null
    }
  }

  return {
    geometryType: 'circle',
    center: { latitude: row.latitude, longitude: row.longitude },
    radiusMeters: row.radius,
  }
}

export class PrismaRoutingIntelligenceRepository implements RoutingIntelligenceRepository {
  constructor(private readonly client: RoutingClient = db) {}

  async listGeofences(): Promise<RoutingGeofence[]> {
    const rows = await this.client.geofenceZone.findMany({
      select: {
        id: true,
        latitude: true,
        longitude: true,
        radius: true,
        geometryType: true,
        geometryJson: true,
        dwellThresholdMinutes: true,
      },
    })

    return rows.flatMap((row) => {
      const zone = toZone(row)
      return zone ? [{
        id: row.id,
        zone,
        dwellThresholdMs: row.dwellThresholdMinutes * 60 * 1000,
      }] : []
    })
  }

  async getGeofenceState(assetType: 'tractor' | 'trailer', assetId: string, geofenceZoneId: string): Promise<GeofenceState | null> {
    return this.client.geofenceAssetState.findUnique({
      where: { assetType_assetId_geofenceZoneId: { assetType, assetId, geofenceZoneId } },
      select: { inside: true, enteredAt: true, dwellEmitted: true },
    })
  }

  async saveGeofenceState(input: {
    assetType: 'tractor' | 'trailer'
    assetId: string
    geofenceZoneId: string
    inside: boolean
    enteredAt: Date | null
    dwellEmitted: boolean
    lastEventId: string
    updatedAt: Date
  }): Promise<void> {
    await this.client.geofenceAssetState.upsert({
      where: {
        assetType_assetId_geofenceZoneId: {
          assetType: input.assetType,
          assetId: input.assetId,
          geofenceZoneId: input.geofenceZoneId,
        },
      },
      update: {
        inside: input.inside,
        enteredAt: input.enteredAt,
        dwellEmitted: input.dwellEmitted,
        lastEventId: input.lastEventId,
      },
      create: {
        assetType: input.assetType,
        assetId: input.assetId,
        geofenceZoneId: input.geofenceZoneId,
        inside: input.inside,
        enteredAt: input.enteredAt,
        dwellEmitted: input.dwellEmitted,
        lastEventId: input.lastEventId,
      },
    })
  }

  async recordGeofenceTransition(input: {
    idempotencyKey: string
    eventId: string
    assetType: 'tractor' | 'trailer'
    assetId: string
    tripId: string | null
    geofenceZoneId: string
    transition: 'enter' | 'dwell' | 'exit'
    point: { latitude: number; longitude: number }
    occurredAt: Date
  }): Promise<void> {
    await this.client.geofenceTransitionEvent.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        idempotencyKey: input.idempotencyKey,
        telematicsEventId: input.eventId,
        assetType: input.assetType,
        assetId: input.assetId,
        tripId: input.tripId,
        geofenceZoneId: input.geofenceZoneId,
        transition: input.transition,
        latitude: input.point.latitude,
        longitude: input.point.longitude,
        occurredAt: input.occurredAt,
      },
    })
  }

  async getPlannedRoute(tripId: string): Promise<PlannedRouteSnapshot | null> {
    const route = await this.client.plannedRoute.findFirst({
      where: { tripId, status: 'active' },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, toleranceMeters: true, pointsJson: true },
    })
    if (!route) return null
    const points = parseStoredRoutePoints(route.pointsJson)
    return points.length >= 2 ? { id: route.id, toleranceMeters: route.toleranceMeters, points } : null
  }

  async getRouteDeviationState(
    plannedRouteId: string,
    assetType: 'tractor' | 'trailer',
    assetId: string,
  ): Promise<{ deviated: boolean } | null> {
    const latest = await this.client.routeDeviationEvent.findFirst({
      where: { plannedRouteId, assetType, assetId },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      select: { eventType: true },
    })
    return latest ? { deviated: latest.eventType === 'deviation' } : null
  }

  async recordRouteDeviation(input: {
    idempotencyKey: string
    eventId: string
    plannedRouteId: string
    assetType: 'tractor' | 'trailer'
    assetId: string
    tripId: string
    eventType: 'deviation' | 'recovery'
    point: { latitude: number; longitude: number }
    distanceMeters: number
    toleranceMeters: number
    occurredAt: Date
  }): Promise<void> {
    await this.client.routeDeviationEvent.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      update: {},
      create: {
        idempotencyKey: input.idempotencyKey,
        telematicsEventId: input.eventId,
        plannedRouteId: input.plannedRouteId,
        assetType: input.assetType,
        assetId: input.assetId,
        tripId: input.tripId,
        eventType: input.eventType,
        latitude: input.point.latitude,
        longitude: input.point.longitude,
        distanceMeters: input.distanceMeters,
        toleranceMeters: input.toleranceMeters,
        occurredAt: input.occurredAt,
      },
    })
  }
}
