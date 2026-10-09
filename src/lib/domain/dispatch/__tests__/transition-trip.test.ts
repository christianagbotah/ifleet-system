import { describe, expect, it } from 'vitest'

import {
  TripTransitionError,
  buildTripTransitionUpdate,
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

  it('replays a prior client mutation without reading or changing the current trip again', async () => {
    let reads = 0
    let commits = 0
    const repo: TransitionRepository = {
      async findEventByClientMutationId(id) {
        expect(id).toBe('transition-1')
        return {
          trip: { id: 'trip-1', status: 'assigned' },
          event: { id: 'event-1', fromStatus: 'scheduled', toStatus: 'assigned' },
        }
      },
      async getTrip() { reads += 1; return { id: 'trip-1', status: 'scheduled', driverId: 'driver-1' } },
      async commitTransition(input) { commits += 1; throw new Error(`must not commit ${input.tripId}`) },
    }

    const result = await transitionTrip({
      tripId: 'trip-1',
      to: 'assigned',
      actorId: 'user-1',
      clientMutationId: 'transition-1',
    }, repo)

    expect(result.replayed).toBe(true)
    expect(result.trip.status).toBe('assigned')
    expect(reads).toBe(0)
    expect(commits).toBe(0)
  })
})


describe('buildTripTransitionUpdate', () => {
  const now = new Date('2026-10-08T08:00:00Z')

  it('records loading, delivery and arrival milestones when first reached', () => {
    expect(buildTripTransitionUpdate('loading', {}, now)).toMatchObject({ status: 'loading', loadingStartedAt: now })
    expect(buildTripTransitionUpdate('loaded', {}, now)).toMatchObject({ status: 'loaded', loadingCompletedAt: now })
    expect(buildTripTransitionUpdate('arrived_destination', {}, now)).toMatchObject({ status: 'arrived_destination', arrivalTime: now })
    expect(buildTripTransitionUpdate('offloading', {}, now)).toMatchObject({ status: 'offloading', offloadingStartedAt: now })
    expect(buildTripTransitionUpdate('delivered', {}, now)).toMatchObject({ status: 'delivered', offloadingCompletedAt: now })
  })

  it('never overwrites an existing operational timestamp', () => {
    const existing = new Date('2026-10-08T07:30:00Z')
    expect(buildTripTransitionUpdate('loading', { loadingStartedAt: existing }, now)).toEqual({ status: 'loading' })
    expect(buildTripTransitionUpdate('arrived_destination', { arrivalTime: existing }, now)).toEqual({ status: 'arrived_destination' })
    expect(buildTripTransitionUpdate('delivered', { offloadingCompletedAt: existing }, now)).toEqual({ status: 'delivered' })
  })
})
