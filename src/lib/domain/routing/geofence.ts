export interface GeoPoint {
  latitude: number
  longitude: number
}

export type GeofenceZoneInput =
  | { geometryType: 'circle'; center: GeoPoint; radiusMeters: number }
  | { geometryType: 'polygon'; points: GeoPoint[] }

export interface GeofenceResult {
  inside: boolean
  distanceMeters: number
}

export interface GeofenceTransitionInput {
  previousInside: boolean
  currentInside: boolean
  at: Date
  enteredAt?: Date | null
  dwellThresholdMs?: number
  dwellEmitted?: boolean
}

export interface GeofenceTransitionResult {
  transition: 'enter' | 'dwell' | 'exit' | 'none'
  enteredAt: Date | null
}

const EARTH_RADIUS_METERS = 6_371_000
const BOUNDARY_EPSILON = 1e-10

function toRadians(value: number): number {
  return value * Math.PI / 180
}

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.latitude)
  const lat2 = toRadians(b.latitude)
  const deltaLat = toRadians(b.latitude - a.latitude)
  const deltaLng = toRadians(b.longitude - a.longitude)
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

function pointOnSegment(point: GeoPoint, a: GeoPoint, b: GeoPoint): boolean {
  const cross = (point.longitude - a.longitude) * (b.latitude - a.latitude)
    - (point.latitude - a.latitude) * (b.longitude - a.longitude)
  if (Math.abs(cross) > BOUNDARY_EPSILON) return false

  const dot = (point.longitude - a.longitude) * (b.longitude - a.longitude)
    + (point.latitude - a.latitude) * (b.latitude - a.latitude)
  if (dot < -BOUNDARY_EPSILON) return false

  const squaredLength = (b.longitude - a.longitude) ** 2 + (b.latitude - a.latitude) ** 2
  return dot <= squaredLength + BOUNDARY_EPSILON
}

function pointInPolygon(point: GeoPoint, points: GeoPoint[]): boolean {
  if (points.length < 3) return false

  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j]
    const b = points[i]
    if (pointOnSegment(point, a, b)) return true

    const intersects = ((b.latitude > point.latitude) !== (a.latitude > point.latitude))
      && point.longitude < ((a.longitude - b.longitude) * (point.latitude - b.latitude))
        / (a.latitude - b.latitude) + b.longitude
    if (intersects) inside = !inside
  }
  return inside
}

function polygonReferenceDistance(point: GeoPoint, points: GeoPoint[]): number {
  if (points.length === 0) return Number.POSITIVE_INFINITY
  return Math.min(...points.map((candidate) => distanceMeters(point, candidate)))
}

export function evaluateGeofence(point: GeoPoint, zone: GeofenceZoneInput): GeofenceResult {
  if (zone.geometryType === 'circle') {
    const distance = distanceMeters(point, zone.center)
    return {
      inside: distance <= zone.radiusMeters,
      distanceMeters: distance,
    }
  }

  return {
    inside: pointInPolygon(point, zone.points),
    distanceMeters: polygonReferenceDistance(point, zone.points),
  }
}

export function evaluateGeofenceTransition(input: GeofenceTransitionInput): GeofenceTransitionResult {
  if (!input.previousInside && input.currentInside) {
    return { transition: 'enter', enteredAt: input.at }
  }

  if (input.previousInside && !input.currentInside) {
    return { transition: 'exit', enteredAt: null }
  }

  const enteredAt = input.enteredAt ?? null
  if (
    input.previousInside
    && input.currentInside
    && enteredAt
    && !input.dwellEmitted
    && input.dwellThresholdMs !== undefined
    && input.at.getTime() - enteredAt.getTime() >= input.dwellThresholdMs
  ) {
    return { transition: 'dwell', enteredAt }
  }

  return { transition: 'none', enteredAt }
}

export function validatePolygonPoints(value: unknown): GeoPoint[] | null {
  if (!Array.isArray(value) || value.length < 3) return null
  const points: GeoPoint[] = []
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
    const point = candidate as Record<string, unknown>
    if (
      typeof point.latitude !== 'number'
      || !Number.isFinite(point.latitude)
      || point.latitude < -90
      || point.latitude > 90
      || typeof point.longitude !== 'number'
      || !Number.isFinite(point.longitude)
      || point.longitude < -180
      || point.longitude > 180
    ) return null
    points.push({ latitude: point.latitude, longitude: point.longitude })
  }
  return points
}

export function polygonCentroid(points: GeoPoint[]): GeoPoint {
  const total = points.reduce((acc, point) => ({
    latitude: acc.latitude + point.latitude,
    longitude: acc.longitude + point.longitude,
  }), { latitude: 0, longitude: 0 })
  return {
    latitude: total.latitude / points.length,
    longitude: total.longitude / points.length,
  }
}
