import { describe, expect, it } from 'vitest'

import {
  MemoryDriverOutboxStore,
  enqueueDriverMutation,
  flushDriverOutbox,
  type DriverMutationSendResult,
} from '../driver-outbox'

describe('driver offline outbox', () => {
  it('queues a mutation with its client-generated idempotency identity', async () => {
    const store = new MemoryDriverOutboxStore()
    const item = await enqueueDriverMutation(store, {
      clientMutationId: 'mut-expense-1',
      kind: 'expense',
      request: { method: 'POST', url: '/api/trips/trip-1/expenses', body: { amount: 25 } },
    })

    expect(item.clientMutationId).toBe('mut-expense-1')
    expect(item.status).toBe('pending')
    await expect(store.list()).resolves.toEqual([expect.objectContaining({ clientMutationId: 'mut-expense-1' })])
  })

  it('preserves submission order across a retryable failure', async () => {
    const store = new MemoryDriverOutboxStore()
    await enqueueDriverMutation(store, { clientMutationId: 'one', kind: 'status', request: { method: 'POST', url: '/one', body: {} } })
    await enqueueDriverMutation(store, { clientMutationId: 'two', kind: 'expense', request: { method: 'POST', url: '/two', body: {} } })

    const firstAttempt: string[] = []
    await flushDriverOutbox(store, async (item) => {
      firstAttempt.push(item.clientMutationId)
      throw new TypeError('network offline')
    })
    expect(firstAttempt).toEqual(['one'])

    const retryOrder: string[] = []
    await flushDriverOutbox(store, async (item) => {
      retryOrder.push(item.clientMutationId)
      return { ok: true, status: 200 } satisfies DriverMutationSendResult
    })
    expect(retryOrder).toEqual(['one', 'two'])
    await expect(store.list()).resolves.toHaveLength(0)
  })

  it('treats an idempotent replay acknowledgement as successfully synced', async () => {
    const store = new MemoryDriverOutboxStore()
    await enqueueDriverMutation(store, { clientMutationId: 'pod-1', kind: 'pod', request: { method: 'POST', url: '/pod', body: {} } })

    const summary = await flushDriverOutbox(store, async () => ({ ok: true, status: 200, replayed: true }))

    expect(summary.synced).toBe(1)
    await expect(store.list()).resolves.toHaveLength(0)
  })

  it('keeps permanent validation failures visible without retrying them forever', async () => {
    const store = new MemoryDriverOutboxStore()
    await enqueueDriverMutation(store, { clientMutationId: 'bad-1', kind: 'expense', request: { method: 'POST', url: '/expense', body: {} } })

    const summary = await flushDriverOutbox(store, async () => ({ ok: false, status: 422, error: 'amount is invalid' }))
    const [item] = await store.list()

    expect(summary.permanentFailures).toBe(1)
    expect(item.status).toBe('failed_permanent')
    expect(item.lastError).toContain('amount is invalid')
  })

  it('does not send a dependent POD before its evidence upload has synced', async () => {
    const store = new MemoryDriverOutboxStore()
    await enqueueDriverMutation(store, {
      clientMutationId: 'upload-1',
      kind: 'upload',
      request: { method: 'POST', url: '/upload', body: { ref: 'photo' } },
    })
    await enqueueDriverMutation(store, {
      clientMutationId: 'pod-2',
      kind: 'pod',
      dependencyIds: ['upload-1'],
      request: { method: 'POST', url: '/pod', body: { evidence: ['upload-1'] } },
    })

    const order: string[] = []
    await flushDriverOutbox(store, async (item) => {
      order.push(item.clientMutationId)
      return { ok: true, status: 201 }
    })

    expect(order).toEqual(['upload-1', 'pod-2'])
    await expect(store.list()).resolves.toHaveLength(0)
  })
})
