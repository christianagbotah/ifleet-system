import { describe, expect, it } from 'vitest'

import {
  appendOperationalEvent,
  type OperationalEventRecord,
  type OperationalEventRepository,
} from '../operational-event'

function repository() {
  const rows: OperationalEventRecord[] = []
  const repo: OperationalEventRepository = {
    findByIdempotencyKey: async (key) => rows.find((row) => row.idempotencyKey === key) ?? null,
    findById: async (id) => rows.find((row) => row.id === id) ?? null,
    insert: async (input) => {
      const row = { ...input, id: `evt-${rows.length + 1}`, createdAt: input.receivedAt }
      rows.push(row)
      return row
    },
  }
  return { repo, rows }
}

const base = {
  idempotencyKey: 'trip-1:assigned:1',
  eventKey: 'trip.assigned',
  type: 'trip.assigned',
  entityType: 'Trip',
  entityId: 'trip-1',
  tripId: 'trip-1',
  occurredAt: new Date('2026-10-10T08:00:00Z'),
  source: 'dispatch',
  actorType: 'user',
  actorId: 'user-1',
}

describe('appendOperationalEvent', () => {
  it('appends an immutable operational event with actor and source metadata', async () => {
    const { repo, rows } = repository()
    const result = await appendOperationalEvent({ ...base, metadata: { truckId: 'truck-1' } }, { repo, now: () => new Date('2026-10-10T08:00:03Z') })

    expect(result.created).toBe(true)
    expect(rows).toHaveLength(1)
    expect(result.event).toMatchObject({ eventKey: 'trip.assigned', actorId: 'user-1', source: 'dispatch', tripId: 'trip-1' })
    expect(result.event.metadata).toEqual({ truckId: 'truck-1' })
  })

  it('returns the existing event for a duplicate idempotency key', async () => {
    const { repo, rows } = repository()
    const first = await appendOperationalEvent(base, { repo })
    const second = await appendOperationalEvent({ ...base, metadata: { retry: true } }, { repo })

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.event.id).toBe(first.event.id)
    expect(rows).toHaveLength(1)
  })

  it('preserves delayed offline occurredAt separately from receivedAt', async () => {
    const { repo } = repository()
    const result = await appendOperationalEvent(base, { repo, now: () => new Date('2026-10-10T12:30:00Z') })

    expect(result.event.occurredAt.toISOString()).toBe('2026-10-10T08:00:00.000Z')
    expect(result.event.receivedAt.toISOString()).toBe('2026-10-10T12:30:00.000Z')
  })

  it('creates a correction that links to but does not mutate the superseded event', async () => {
    const { repo, rows } = repository()
    const original = await appendOperationalEvent(base, { repo })
    const correction = await appendOperationalEvent({
      ...base,
      idempotencyKey: 'trip-1:assigned:correction-1',
      eventKey: 'trip.assigned.corrected',
      type: 'event.correction',
      supersedesEventId: original.event.id,
      metadata: { reason: 'Corrected tractor assignment' },
    }, { repo })

    expect(correction.created).toBe(true)
    expect(correction.event.supersedesEventId).toBe(original.event.id)
    expect(rows[0]?.supersedesEventId).toBeNull()
    expect(rows).toHaveLength(2)
  })

  it('rejects a correction referencing a missing event', async () => {
    const { repo } = repository()
    await expect(appendOperationalEvent({ ...base, supersedesEventId: 'missing-event' }, { repo })).rejects.toThrow(/superseded event/i)
  })
})
