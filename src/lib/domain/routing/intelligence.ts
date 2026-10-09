import {
  evaluateGeofence,
  evaluateGeofenceTransition,
  type GeoPoint,
  type GeofenceZoneInput,
} from './geofence'
import { evaluateRouteDeviation } from './route-deviation'

export interface RoutingGeofence {
  id: string
  zone: GeofenceZoneInput
  dwellThresholdMs?: number
}

export interface GeofenceState {
  inside: boolean
  enteredAt: Date | null
  dwellEmitted: boolean
}

export interface PlannedRouteSnapshot {
  id: string
  toleranceMeters: number
  points: GeoPoint[]
}

export interface RoutingIntelligenceRepository {
  listGeofences(): Promise<RoutingGeofence[]>
  getGeofenceState(assetType: 'tractor' | 'trailer', assetId: string, geofenceZoneId: string): Promise<GeofenceState | null>
  saveGeofenceState(input: {
    assetType: 'tractor' | 'trailer'
    assetId: string
    geofenceZoneId: string
    inside: boolean
    enteredAt: Date | null
    dwellEmitted: boolean
    lastEventId: string
    updatedAt: Date
  }): Promise<void>
  recordGeofenceTransition(input: {
    idempotencyKey: string
    eventId: string
    assetType: 'tractor' | 'trailer'
    assetId: string
    tripId: string | null
    geofenceZoneId: string
    transition: 'enter' | 'dwell' | 'exit'
    point: GeoPoint
    occurredAt: Date
  }): Promise<void>
  getPlannedRoute(tripId: string): Promise<PlannedRouteSnapshot | null>
  getRouteDeviationState(plannedRouteId: string, assetType: 'tractor' | 'trailer', assetId: string): Promise<{ deviated: boolean } | null>
  recordRouteDeviation(input: {
    idempotencyKey: string
    eventId: string
    plannedRouteId: string
    assetType: 'tractor' | 'trailer'
    assetId: string
    tripId: string
    eventType: 'deviation' | 'recovery'
    point: GeoPoint
    distanceMeters: number
    toleranceMeters: number
    occurredAt: Date
  }): Promise<void>
}

export interface LocationRoutingInput {
  eventId: string
  assetType: 'tractor' | 'trailer'
  assetId: string
  tripId: string | null
  point: GeoPoint
  occurredAt: Date
}

export async function processLocationRoutingIntelligence(
  input: LocationRoutingInput,
  repository: RoutingIntelligenceRepository,
): Promise<void> {
  const geofences = await repository.listGeofences()

  for (const geofence of geofences) {
    const state = await repository.getGeofenceState(input.assetType, input.assetId, geofence.id)
    const evaluated = evaluateGeofence(input.point, geofence.zone)
    const transition = evaluateGeofenceTransition({
      previousInside: state?.inside ?? false,
      currentInside: evaluated.inside,
      enteredAt: state?.enteredAt ?? null,
      at: input.occurredAt,
      dwellThresholdMs: geofence.dwellThresholdMs,
      dwellEmitted: state?.dwellEmitted ?? false,
    })

    if (transition.transition !== 'none') {
      await repository.recordGeofenceTransition({
        idempotencyKey: `${input.eventId}:${geofence.id}:${transition.transition}`,
        eventId: input.eventId,
        assetType: input.assetType,
        assetId: input.assetId,
        tripId: input.tripId,
        geofenceZoneId: geofence.id,
        transition: transition.transition,
        point: input.point,
        occurredAt: input.occurredAt,
      })
    }

    const dwellEmitted = transition.transition === 'dwell'
      ? true
      : transition.transition === 'enter' || transition.transition === 'exit'
        ? false
        : state?.dwellEmitted ?? false

    await repository.saveGeofenceState({
      assetType: input.assetType,
      assetId: input.assetId,
      geofenceZoneId: geofence.id,
      inside: evaluated.inside,
      enteredAt: transition.enteredAt,
      dwellEmitted,
      lastEventId: input.eventId,
      updatedAt: input.occurredAt,
    })
  }

  if (!input.tripId) return

  const plannedRoute = await repository.getPlannedRoute(input.tripId)
  if (!plannedRoute) return

  const previous = await repository.getRouteDeviationState(plannedRoute.id, input.assetType, input.assetId)
  const evaluated = evaluateRouteDeviation(
    input.point,
    plannedRoute.points,
    plannedRoute.toleranceMeters,
    { previousDeviated: previous?.deviated ?? false },
  )
  const previousDeviated = previous?.deviated ?? false

  if (evaluated.deviated === previousDeviated) return

  const eventType = evaluated.deviated ? 'deviation' : 'recovery'
  await repository.recordRouteDeviation({
    idempotencyKey: `${input.eventId}:${plannedRoute.id}:${eventType}`,
    eventId: input.eventId,
    plannedRouteId: plannedRoute.id,
    assetType: input.assetType,
    assetId: input.assetId,
    tripId: input.tripId,
    eventType,
    point: input.point,
    distanceMeters: evaluated.distanceMeters,
    toleranceMeters: plannedRoute.toleranceMeters,
    occurredAt: input.occurredAt,
  })
}
