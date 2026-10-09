export type DriverMutationKind = 'pod' | 'expense' | 'fuel' | 'status' | 'upload'
export type DriverMutationStatus = 'pending' | 'failed_permanent'

export interface DriverMutationRequest {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  headers?: Record<string, string>
}

export interface DriverOutboxItem {
  clientMutationId: string
  kind: DriverMutationKind
  request: DriverMutationRequest
  dependencyIds: string[]
  status: DriverMutationStatus
  attempts: number
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface DriverOutboxStore {
  list(): Promise<DriverOutboxItem[]>
  get(id: string): Promise<DriverOutboxItem | null>
  put(item: DriverOutboxItem): Promise<void>
  delete(id: string): Promise<void>
}

export interface EnqueueDriverMutationInput {
  clientMutationId: string
  kind: DriverMutationKind
  request: DriverMutationRequest
  dependencyIds?: string[]
}

export interface DriverMutationSendResult {
  ok: boolean
  status: number
  error?: string
  replayed?: boolean
}

export interface DriverOutboxFlushSummary {
  synced: number
  retryableFailures: number
  permanentFailures: number
  blockedByDependency: number
}

export class MemoryDriverOutboxStore implements DriverOutboxStore {
  private readonly items = new Map<string, DriverOutboxItem>()

  async list() {
    return [...this.items.values()].sort((a, b) => a.createdAt - b.createdAt)
  }

  async get(id: string) {
    return this.items.get(id) ?? null
  }

  async put(item: DriverOutboxItem) {
    this.items.set(item.clientMutationId, { ...item })
  }

  async delete(id: string) {
    this.items.delete(id)
  }
}

export async function enqueueDriverMutation(
  store: DriverOutboxStore,
  input: EnqueueDriverMutationInput,
): Promise<DriverOutboxItem> {
  const id = input.clientMutationId.trim()
  if (!id) throw new Error('clientMutationId is required')
  const existing = await store.get(id)
  if (existing) return existing

  const now = Date.now()
  const item: DriverOutboxItem = {
    clientMutationId: id,
    kind: input.kind,
    request: input.request,
    dependencyIds: [...new Set(input.dependencyIds ?? [])],
    status: 'pending',
    attempts: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  }
  await store.put(item)
  return item
}

function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500
}

export async function flushDriverOutbox(
  store: DriverOutboxStore,
  send: (item: DriverOutboxItem) => Promise<DriverMutationSendResult>,
): Promise<DriverOutboxFlushSummary> {
  const summary: DriverOutboxFlushSummary = {
    synced: 0,
    retryableFailures: 0,
    permanentFailures: 0,
    blockedByDependency: 0,
  }

  const items = await store.list()
  for (const item of items) {
    if (item.status === 'failed_permanent') continue

    let dependencyPending = false
    for (const dependencyId of item.dependencyIds) {
      if (await store.get(dependencyId)) {
        dependencyPending = true
        break
      }
    }
    if (dependencyPending) {
      summary.blockedByDependency += 1
      continue
    }

    try {
      const result = await send(item)
      if (result.ok || result.replayed) {
        await store.delete(item.clientMutationId)
        summary.synced += 1
        continue
      }

      const next = {
        ...item,
        attempts: item.attempts + 1,
        lastError: result.error ?? `Sync failed with HTTP ${result.status}`,
        updatedAt: Date.now(),
      }
      if (isRetryableStatus(result.status)) {
        await store.put(next)
        summary.retryableFailures += 1
        break
      }

      await store.put({ ...next, status: 'failed_permanent' })
      summary.permanentFailures += 1
    } catch (error) {
      await store.put({
        ...item,
        attempts: item.attempts + 1,
        lastError: error instanceof Error ? error.message : 'Network sync failed',
        updatedAt: Date.now(),
      })
      summary.retryableFailures += 1
      break
    }
  }

  return summary
}

const DB_NAME = 'ifleetpro-driver-offline'
const STORE_NAME = 'outbox'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline database'))
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'clientMutationId' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Offline database operation failed'))
  })
}

export class IndexedDbDriverOutboxStore implements DriverOutboxStore {
  async list(): Promise<DriverOutboxItem[]> {
    const db = await openDatabase()
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const rows = await transactionResult(tx.objectStore(STORE_NAME).getAll()) as DriverOutboxItem[]
      return rows.sort((a, b) => a.createdAt - b.createdAt)
    } finally {
      db.close()
    }
  }

  async get(id: string): Promise<DriverOutboxItem | null> {
    const db = await openDatabase()
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      return (await transactionResult(tx.objectStore(STORE_NAME).get(id)) as DriverOutboxItem | undefined) ?? null
    } finally {
      db.close()
    }
  }

  async put(item: DriverOutboxItem): Promise<void> {
    const db = await openDatabase()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      await transactionResult(tx.objectStore(STORE_NAME).put(item))
    } finally {
      db.close()
    }
  }

  async delete(id: string): Promise<void> {
    const db = await openDatabase()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      await transactionResult(tx.objectStore(STORE_NAME).delete(id))
    } finally {
      db.close()
    }
  }
}
