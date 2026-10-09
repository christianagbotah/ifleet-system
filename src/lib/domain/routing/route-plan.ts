import type { GeoPoint } from './geofence'

export interface RoutePointValidation {
  ok: boolean
  points: GeoPoint[]
  error?: string
}

function finiteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateRoutePoints(value: unknown): RoutePointValidation {
  if (!Array.isArray(value) || value.length < 2) {
    return { ok: false, points: [], error: 'A planned route requires at least two points.' }
  }

  const points: GeoPoint[] = []
  for (const point of value) {
    if (!point || typeof point !== 'object' || Array.isArray(point)) {
      return { ok: false, points: [], error: 'Every route point must be an object.' }
    }
    const candidate = point as Record<string, unknown>
    const latitude = candidate.latitude
    const longitude = candidate.longitude
    if (
      !finiteCoordinate(latitude)
      || !finiteCoordinate(longitude)
      || latitude < -90
      || latitude > 90
      || longitude < -180
      || longitude > 180
    ) {
      return { ok: false, points: [], error: 'Route coordinates are invalid.' }
    }
    points.push({ latitude, longitude })
  }

  return { ok: true, points }
}

export function parseStoredRoutePoints(pointsJson: string): GeoPoint[] {
  try {
    const parsed = validateRoutePoints(JSON.parse(pointsJson))
    return parsed.ok ? parsed.points : []
  } catch {
    return []
  }
}
