import { describe, expect, it } from 'vitest'

import {
  buildLateDeliveryFeatures,
  buildMaintenanceFeatures,
  buildQueueFeatures,
} from '../model-features'

const AS_OF = new Date('2026-10-10T12:00:00Z')

describe('point-in-time AI feature builders', () => {
  it('maintenance features ignore service outcomes recorded after asOf', () => {
    const result = buildMaintenanceFeatures({
      asOf: AS_OF,
      events: [
        { occurredAt: new Date('2026-09-01T10:00:00Z'), kind: 'service', severity: 0.2 },
        { occurredAt: new Date('2026-10-11T10:00:00Z'), kind: 'breakdown', severity: 1 },
      ],
    })

    expect(result.eventCount).toBe(1)
    expect(result.breakdownCount).toBe(0)
    expect(result.maxSeverity).toBe(0.2)
  })

  it('queue features use only completed historical waits available by asOf', () => {
    const result = buildQueueFeatures({
      asOf: AS_OF,
      visits: [
        { arrivedAt: new Date('2026-10-09T08:00:00Z'), completedAt: new Date('2026-10-09T09:00:00Z') },
        { arrivedAt: new Date('2026-10-10T11:00:00Z'), completedAt: new Date('2026-10-10T13:00:00Z') },
      ],
    })

    expect(result.completedVisitCount).toBe(1)
    expect(result.averageWaitMinutes).toBe(60)
  })

  it('queue features expose current elapsed wait without leaking future completion', () => {
    const result = buildQueueFeatures({
      asOf: AS_OF,
      visits: [{ arrivedAt: new Date('2026-10-10T11:15:00Z'), completedAt: new Date('2026-10-10T13:00:00Z') }],
      currentArrivalAt: new Date('2026-10-10T11:30:00Z'),
    })

    expect(result.completedVisitCount).toBe(0)
    expect(result.currentElapsedWaitMinutes).toBe(30)
  })

  it('late-delivery features exclude trips whose arrival outcome was not known by asOf', () => {
    const result = buildLateDeliveryFeatures({
      asOf: AS_OF,
      trips: [
        {
          promisedAt: new Date('2026-10-09T11:00:00Z'),
          arrivedAt: new Date('2026-10-09T12:00:00Z'),
          routeClass: 'tema-kumasi',
        },
        {
          promisedAt: new Date('2026-10-10T11:00:00Z'),
          arrivedAt: new Date('2026-10-10T13:00:00Z'),
          routeClass: 'tema-kumasi',
        },
      ],
      routeClass: 'tema-kumasi',
    })

    expect(result.completedTripCount).toBe(1)
    expect(result.lateTripRate).toBe(1)
  })

  it('sparse route history declares fallback instead of fabricating route precision', () => {
    const result = buildLateDeliveryFeatures({
      asOf: AS_OF,
      trips: [],
      routeClass: 'new-route',
      globalPriorLateRate: 0.18,
    })

    expect(result.completedTripCount).toBe(0)
    expect(result.lateTripRate).toBe(0.18)
    expect(result.source).toBe('global_prior')
  })
})
