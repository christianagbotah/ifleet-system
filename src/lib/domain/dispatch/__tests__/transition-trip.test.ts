import { describe, expect, it } from 'vitest'

import {
  TripTransitionError,
  transitionTrip,
  type TransitionRepository,
} from '@/lib/domain/dispatch/transition-trip'

function repository(status = 'scheduled') {
  const calls: Array<Record<string, unknown>> = []
  const repo: TransitionRepository = {
    async getTrip(id) {
      return { id, status, driverId: 'driver-1' }
    },
    async commitTransition(input) {
      calls.push(input as unknown as Record<string, unknown>)
      return {
        trip: { id: input.tripId, status: input.toStatus },
        event: { id: 'event-1', fromStatus: input.fromStatus, toStatus: input.toStatus },
      }
    },
  }
  return { repo, calls }
}

describe('transitionTrip', () => {
  it('commits an allowed transition with evidence metadata', async () => {
    const { repo, calls } = repository('scheduled')
    const result = await transitionTrip(
      {
        tripId: 'trip-1',
        to: 'assigned',
        actorId: 'user-1',
        location: 'Tema Plant',
        evidence: { assignmentId: 'assign-1' },
        metadata: { source: 'dispatch' },
      },
      repo
    )

    expect(result.trip.status).toBe('assigned')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      tripId: 'trip-1',
      fromStatus: 'scheduled',
      toStatus: 'assigned',
      actorId: 'user-1',
      driverId: 'driver-1',
      location: 'Tema Plant',
      evidence: { assignmentId: 'assign-1' },
      metadata: { source: 'dispatch' },
    })
  })

  it('rejects an illegal transition without committing anything', async () => {
    const { repo, calls } = repository('scheduled')

    await expect(
      transitionTrip({ tripId: 'trip-1', to: 'in_transit', actorId: 'user-1' }, repo)
    ).rejects.toBeInstanceOf(TripTransitionError)
    expect(calls).toHaveLength(0)
  })

  it('reports a missing trip without committing anything', async () => {
    const calls: unknown[] = []
    const repo: TransitionRepository = {
      async getTrip() { return null },
      async commitTransition(input) { calls.push(input); throw new Error('must not run') },
    }

    await expect(
      transitionTrip({ tripId: 'missing', to: 'assigned', actorId: 'user-1' }, repo)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(calls).toHaveLength(0)
  })
})
