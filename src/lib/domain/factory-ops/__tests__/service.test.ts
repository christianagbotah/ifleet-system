import { describe, expect, it } from 'vitest'

import {
  FactoryOpsError,
  createGateService,
  createQueueService,
  type FactoryOpsRepository,
} from '@/lib/domain/factory-ops/service'

function repository(overrides: Partial<FactoryOpsRepository> = {}): FactoryOpsRepository {
  return {
    isVehicleAuthorized: async () => true,
    findLatestGateEvent: async () => null,
    createGateEvent: async (input) => ({ id: 'gate-new', ...input }),
    getQueueEntry: async () => ({
      id: 'queue-1',
      status: 'waiting',
      joinedAt: new Date('2026-10-08T08:00:00Z'),
      siteId: 'site-1',
      bayId: null,
    }),
    updateQueueEntry: async (_id, update) => ({ id: 'queue-1', ...update }),
    ...overrides,
  }
}

describe('createGateService', () => {
  it('does not persist a duplicate gate scan', async () => {
    let writes = 0
    const existing = {
      id: 'gate-existing',
      direction: 'in' as const,
      occurredAt: new Date('2026-10-08T08:00:00Z'),
    }
    const service = createGateService(repository({
      findLatestGateEvent: async () => existing,
      createGateEvent: async (input) => {
        writes += 1
        return { id: 'gate-new', ...input }
      },
    }))

    const result = await service.record({
      siteId: 'site-1',
      truckId: 'truck-1',
      tripId: 'trip-1',
      direction: 'in',
      occurredAt: new Date('2026-10-08T08:02:00Z'),
      actorId: 'user-1',
    })

    expect(result.duplicate).toBe(true)
    expect(result.event.id).toBe('gate-existing')
    expect(writes).toBe(0)
  })

  it('rejects an unauthorized truck without writing a gate event', async () => {
    let writes = 0
    const service = createGateService(repository({
      isVehicleAuthorized: async () => false,
      createGateEvent: async (input) => {
        writes += 1
        return { id: 'gate-new', ...input }
      },
    }))

    await expect(service.record({
      siteId: 'site-1',
      truckId: 'truck-1',
      tripId: 'trip-1',
      direction: 'in',
      occurredAt: new Date('2026-10-08T08:00:00Z'),
      actorId: 'user-1',
    })).rejects.toMatchObject({ code: 'vehicle_not_authorized' })
    expect(writes).toBe(0)
  })

  it('persists an accepted gate-out as a new immutable event', async () => {
    const service = createGateService(repository({
      findLatestGateEvent: async () => ({
        id: 'gate-in',
        direction: 'in',
        occurredAt: new Date('2026-10-08T08:00:00Z'),
      }),
    }))

    const result = await service.record({
      siteId: 'site-1',
      truckId: 'truck-1',
      tripId: 'trip-1',
      direction: 'out',
      occurredAt: new Date('2026-10-08T09:00:00Z'),
      actorId: 'user-1',
    })

    expect(result.duplicate).toBe(false)
    expect(result.event).toMatchObject({
      id: 'gate-new',
      siteId: 'site-1',
      truckId: 'truck-1',
      tripId: 'trip-1',
      direction: 'out',
      actorId: 'user-1',
    })
  })
})

describe('createQueueService', () => {
  it('calls a waiting truck to a bay through the queue transition rules', async () => {
    let updateSeen: Record<string, unknown> | null = null
    const service = createQueueService(repository({
      updateQueueEntry: async (_id, update) => {
        updateSeen = update
        return { id: 'queue-1', ...update }
      },
    }))

    const result = await service.advance({
      queueId: 'queue-1',
      action: 'call_to_bay',
      occurredAt: new Date('2026-10-08T08:20:00Z'),
      bayId: 'bay-3',
    })

    expect(result.status).toBe('in_progress')
    expect(updateSeen).toMatchObject({
      status: 'in_progress',
      bayId: 'bay-3',
    })
    expect(updateSeen?.startedAt).toEqual(new Date('2026-10-08T08:20:00Z'))
  })

  it('throws a typed error for an invalid queue transition', async () => {
    const service = createQueueService(repository({
      getQueueEntry: async () => ({
        id: 'queue-1',
        status: 'completed',
        joinedAt: new Date('2026-10-08T08:00:00Z'),
        siteId: 'site-1',
        bayId: null,
      }),
    }))

    await expect(service.advance({
      queueId: 'queue-1',
      action: 'start_loading',
      occurredAt: new Date('2026-10-08T09:10:00Z'),
    })).rejects.toBeInstanceOf(FactoryOpsError)
  })
})
