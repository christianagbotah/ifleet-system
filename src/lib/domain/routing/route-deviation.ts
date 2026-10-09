import type { GeoPoint } from './geofence'

export interface RouteDeviationResult {
  deviated: boolean
  recovered: boolean
  distanceMeters: number
}

const EARTH_RADIUS_METERS = 6_371_000

function toRadians(value: number): number {
  return value * Math.PI / 180
}

function project(point: GeoPoint, origin: GeoPoint): { x: number; y: number } {
  const latitudeScale = EARTH_RADIUS_METERS
  const longitudeScale = EARTH_RADIUS_METERS * Math.cos(toRadians(origin.latitude))
  return {
    x: toRadians(point.longitude - origin.longitude) * longitudeScale,
    y: toRadians(point.latitude - origin.latitude) * latitudeScale,
  }
}

function distanceToSegmentMeters(point: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const p = project(point, point)
  const pA = project(a, point)
  const pB = project(b, point)
  const dx = pB.x - pA.x
  const dy = pB.y - pA.y
  const lengthSquared = dx * dx + dy * dy

  if (lengthSquared === 0) return Math.hypot(pA.x - p.x, pA.y - p.y)

  const t = Math.max(0, Math.min(1, ((p.x - pA.x) * dx + (p.y - pA.y) * dy) / lengthSquared))
  const nearestX = pA.x + t * dx
  const nearestY = pA.y + t * dy
  return Math.hypot(p.x - nearestX, p.y - nearestY)
}

export function evaluateRouteDeviation(
  point: GeoPoint,
  plannedRoute: GeoPoint[],
  toleranceMeters: number,
  state: { previousDeviated?: boolean } = {},
): RouteDeviationResult {
  if (plannedRoute.length < 2) {
    return { deviated: false, recovered: false, distanceMeters: 0 }
  }

  let nearest = Number.POSITIVE_INFINITY
  for (let index = 1; index < plannedRoute.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegmentMeters(point, plannedRoute[index - 1], plannedRoute[index]))
  }

  const deviated = nearest > toleranceMeters
  return {
    deviated,
    recovered: state.previousDeviated === true && !deviated,
    distanceMeters: nearest,
  }
}
