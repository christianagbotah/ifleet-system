'use client'

import { useAuthStore } from '@/lib/store/auth'
import {
  IndexedDbDriverOutboxStore,
  enqueueDriverMutation,
  flushDriverOutbox,
  type DriverMutationKind,
  type DriverMutationRequest,
  type DriverMutationSendResult,
  type DriverOutboxItem,
} from './driver-outbox'

export const DRIVER_OUTBOX_CHANGED_EVENT = 'ifleetpro-driver-outbox-changed'

const store = new IndexedDbDriverOutboxStore()

export interface SubmitDriverMutationInput {
  clientMutationId: string
  kind: DriverMutationKind
  request: DriverMutationRequest
  dependencyIds?: string[]
}

export interface SubmitDriverMutationResult<T = unknown> {
  queued: boolean
  replayed: boolean
  data?: T
}

function notifyOutboxChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DRIVER_OUTBOX_CHANGED_EVENT))
}

function isRetryableStatus(status: number) {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  return response.json().catch(() => null)
}

async function sendDriverMutation(item: DriverOutboxItem): Promise<DriverMutationSendResult & { data?: unknown }> {
  const token = useAuthStore.getState().getToken()
  if (!token) return { ok: false, status: 401, error: 'Authentication required' }

  const headers: Record<string, string> = {
    ...(item.request.headers ?? {}),
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  const body = item.request.body && typeof item.request.body === 'object' && !Array.isArray(item.request.body)
    ? { ...(item.request.body as Record<string, unknown>), clientMutationId: item.clientMutationId }
    : item.request.body

  const response = await fetch(item.request.url, {
    method: item.request.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await parseResponse(response)
  const record = data && typeof data === 'object' ? data as Record<string, unknown> : null

  return {
    ok: response.ok,
    status: response.status,
    error: typeof record?.error === 'string' ? record.error : response.ok ? undefined : `Sync failed with HTTP ${response.status}`,
    replayed: record?.replayed === true,
    data,
  }
}

export async function submitDriverMutation<T = unknown>(
  input: SubmitDriverMutationInput,
): Promise<SubmitDriverMutationResult<T>> {
  const item = await enqueueDriverMutation(store, input)
  notifyOutboxChanged()

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { queued: true, replayed: false }
  }

  try {
    const result = await sendDriverMutation(item)
    if (result.ok || result.replayed) {
      await store.delete(item.clientMutationId)
      notifyOutboxChanged()
      return { queued: false, replayed: Boolean(result.replayed), data: result.data as T }
    }

    const next: DriverOutboxItem = {
      ...item,
      attempts: item.attempts + 1,
      lastError: result.error ?? `Sync failed with HTTP ${result.status}`,
      updatedAt: Date.now(),
      status: isRetryableStatus(result.status) ? 'pending' : 'failed_permanent',
    }
    await store.put(next)
    notifyOutboxChanged()

    if (next.status === 'failed_permanent') throw new Error(next.lastError ?? 'Submission was rejected')
    return { queued: true, replayed: false }
  } catch (error) {
    if (error instanceof TypeError) {
      await store.put({
        ...item,
        attempts: item.attempts + 1,
        lastError: error.message || 'Network unavailable',
        updatedAt: Date.now(),
      })
      notifyOutboxChanged()
      return { queued: true, replayed: false }
    }
    throw error
  }
}

export async function getDriverOutboxItems(): Promise<DriverOutboxItem[]> {
  return store.list()
}

export async function retryDriverOutbox() {
  const summary = await flushDriverOutbox(store, sendDriverMutation)
  notifyOutboxChanged()
  return summary
}
