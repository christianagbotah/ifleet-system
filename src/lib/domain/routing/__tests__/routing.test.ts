import { describe, expect, it } from 'vitest'

import {
  evaluateGeofence,
  evaluateGeofenceTransition,
  type GeofenceZoneInput,
} from '../geofence'
import { evaluateRouteDeviation } from '../route-deviation'

const temaCircle: GeofenceZoneInput = {
  geometryType: 'circle',
  center: { latitude: 5.6698, longitude: -0.0166 },
  radiusMeters: 500,
}

const yardPolygon: GeofenceZoneInput = {
  geometryType: 'polygon',
  points: [
    { latitude: 5.6700, longitude: -0.0190 },
    { latitude: 5.6700, longitude: -0.0140 },
    { latitude: 5.6660, longitude: -0.0140 },
    { latitude: 5.6660, longitude: -0.0190 },
  ],
}

describe('geofence intelligence', () => {
  it('treats circle entry, exit and exact boundary as deterministic states', () => {
    expect(evaluateGeofence({ latitude: 5.6698, longitude: -0.0166 }, temaCircle).inside).toBe(true)
    expect(evaluateGeofence({ latitude: 5.6800, longitude: -0.0166 }, temaCircle).inside).toBe(false)

    const oneKm = evaluateGeofence({ latitude: 5.6788, longitude: -0.0166 }, {
      ...temaCircle,
      radiusMeters: 1001,
    })
    expect(oneKm.inside).toBe(true)
    expect(oneKm.distanceMeters).toBeGreaterThan(995)
    expect(oneKm.distanceMeters).toBeLessThan(1005)
  })

  it('evaluates polygon interior, exterior and edge points as inside on the boundary', () => {
    expect(evaluateGeofence({ latitude: 5.6680, longitude: -0.0160 }, yardPolygon).inside).toBe(true)
    expect(evaluateGeofence({ latitude: 5.6750, longitude: -0.0160 }, yardPolygon).inside).toBe(false)
    expect(evaluateGeofence({ latitude: 5.6700, longitude: -0.0160 }, yardPolygon).inside).toBe(true)
  })

  it('emits entry, dwell and exit transitions without duplicating dwell', () => {
    const enteredAt = new Date('2026-10-09T00:00:00.000Z')

    expect(evaluateGeofenceTransition({ previousInside: false, currentInside: true, at: enteredAt })).toMatchObject({
      transition: 'enter',
      enteredAt,
    })

    expect(evaluateGeofenceTransition({
      previousInside: true,
      currentInside: true,
      enteredAt,
      at: new Date('2026-10-09T00:16:00.000Z'),
      dwellThresholdMs: 15 * 60 * 1000,
      dwellEmitted: false,
    }).transition).toBe('dwell')

    expect(evaluateGeofenceTransition({
      previousInside: true,
      currentInside: true,
      enteredAt,
      at: new Date('2026-10-09T00:20:00.000Z'),
      dwellThresholdMs: 15 * 60 * 1000,
      dwellEmitted: true,
    }).transition).toBe('none')

    expect(evaluateGeofenceTransition({
      previousInside: true,
      currentInside: false,
      enteredAt,
      at: new Date('2026-10-09T00:21:00.000Z'),
    }).transition).toBe('exit')
  })
})

describe('planned route deviation', () => {
  const plannedRoute = [
    { latitude: 5.6698, longitude: -0.0166 },
    { latitude: 5.7000, longitude: -0.1000 },
    { latitude: 5.9000, longitude: -0.5000 },
  ]

  it('keeps a point inside the corridor when its nearest route distance is within tolerance', () => {
    const result = evaluateRouteDeviation(
      { latitude: 5.7003, longitude: -0.1002 },
      plannedRoute,
      100,
    )
    expect(result.deviated).toBe(false)
    expect(result.distanceMeters).toBeLessThanOrEqual(100)
  })

  it('flags a point outside the corridor and reports nearest route distance', () => {
    const result = evaluateRouteDeviation(
      { latitude: 5.7200, longitude: -0.1500 },
      plannedRoute,
      250,
    )
    expect(result.deviated).toBe(true)
    expect(result.distanceMeters).toBeGreaterThan(250)
  })

  it('marks recovery when the previous state was deviated and the asset returns to the corridor', () => {
    const result = evaluateRouteDeviation(
      { latitude: 5.7002, longitude: -0.1001 },
      plannedRoute,
      100,
      { previousDeviated: true },
    )
    expect(result.deviated).toBe(false)
    expect(result.recovered).toBe(true)
  })
})
