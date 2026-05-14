// ── Offline Storage Utility ──────────────────────────────────────────────────
// Provides a caching layer using IndexedDB for API data + localStorage for the
// action queue.  Falls back to localStorage-only when IndexedDB is unavailable.

// ── Types ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  cachedAt: number
  ttl: number // time-to-live in ms
  key: string
}

export interface PendingAction {
  id: string
  url: string
  method: string
  body: string | null
  headers: Record<string, string>
  createdAt: number
  retries: number
  maxRetries: number
}

// ── Pre-defined Cache TTLs ───────────────────────────────────────────────────

export const CACHE_TTL = {
  dashboard: 5 * 60 * 1000, // 5 minutes
  trips: 10 * 60 * 1000, // 10 minutes
  trucks: 30 * 60 * 1000, // 30 minutes
  drivers: 30 * 60 * 1000, // 30 minutes
  analytics: 15 * 60 * 1000, // 15 minutes
  notifications: 2 * 60 * 1000, // 2 minutes
  static: 24 * 60 * 60 * 1000, // 24 hours
} as const

// ── IndexedDB helpers ────────────────────────────────────────────────────────

const DB_NAME = 'fleetpro-offline'
const DB_VERSION = 1
const CACHE_STORE = 'cache'
const QUEUE_STORE = 'queue'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not available'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

  return dbPromise
}

function idbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
  )
}

// ── Offline Store ────────────────────────────────────────────────────────────

export const OfflineStore = {
  // ── Connectivity ─────────────────────────────────────────────────────────

  /** Check if the browser currently believes it is online. */
  isOnline(): boolean {
    if (typeof navigator === 'undefined') return true
    return navigator.onLine
  },

  // ── Cache: read / write / delete ────────────────────────────────────────

  /** Store data in IndexedDB with an optional TTL. Defaults to 1 hour. */
  async setData<T>(key: string, data: T, ttlMs: number = 60 * 60 * 1000): Promise<void> {
    try {
      const entry: CacheEntry<T> = {
        data,
        cachedAt: Date.now(),
        ttl: ttlMs,
        key,
      }
      await idbTransaction<void>(CACHE_STORE, 'readwrite', (store) => store.put(entry))
    } catch {
      // IndexedDB unavailable — fall back to localStorage
      try {
        const entry: CacheEntry<T> = {
          data,
          cachedAt: Date.now(),
          ttl: ttlMs,
          key,
        }
        localStorage.setItem(`fp_cache_${key}`, JSON.stringify(entry))
      } catch {
        // Storage full — silently fail
      }
    }
  },

  /** Retrieve cached data. Returns null if expired or not found. */
  async getData<T>(key: string): Promise<T | null> {
    try {
      const entry = await idbTransaction<CacheEntry<T> | undefined>(
        CACHE_STORE,
        'readonly',
        (store) => store.get(key)
      )
      if (!entry) return null
      if (Date.now() - entry.cachedAt > entry.ttl) {
        // Expired — clean up
        await this.removeData(key)
        return null
      }
      return entry.data
    } catch {
      // Fallback to localStorage
      try {
        const raw = localStorage.getItem(`fp_cache_${key}`)
        if (!raw) return null
        const entry: CacheEntry<T> = JSON.parse(raw)
        if (Date.now() - entry.cachedAt > entry.ttl) {
          localStorage.removeItem(`fp_cache_${key}`)
          return null
        }
        return entry.data
      } catch {
        return null
      }
    }
  },

  /** Remove a single cache entry. */
  async removeData(key: string): Promise<void> {
    try {
      await idbTransaction<void>(CACHE_STORE, 'readwrite', (store) => store.delete(key))
    } catch {
      try {
        localStorage.removeItem(`fp_cache_${key}`)
      } catch { /* noop */ }
    }
  },

  /** Clear all cached data. */
  async clearAll(): Promise<void> {
    try {
      await idbTransaction<void>(CACHE_STORE, 'readwrite', (store) => store.clear())
    } catch {
      // Remove all fp_cache_ keys from localStorage
      try {
        const keysToRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k?.startsWith('fp_cache_')) keysToRemove.push(k)
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k))
      } catch { /* noop */ }
    }
  },

  /** Get summary info about the cache. */
  async getCacheInfo(): Promise<{ keys: string[]; totalSize: number }> {
    try {
      const all = await idbTransaction<CacheEntry<unknown>[]>(
        CACHE_STORE,
        'readonly',
        (store) => store.getAll()
      )
      const now = Date.now()
      const valid = all.filter((e) => now - e.cachedAt <= e.ttl)
      const totalSize = new Blob(valid.map((e) => JSON.stringify(e))).size
      return {
        keys: valid.map((e) => e.key),
        totalSize,
      }
    } catch {
      // Fallback: scan localStorage
      const keys: string[] = []
      let totalSize = 0
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k?.startsWith('fp_cache_')) {
            const raw = localStorage.getItem(k)
            if (raw) {
              try {
                const entry = JSON.parse(raw) as CacheEntry<unknown>
                if (Date.now() - entry.cachedAt <= entry.ttl) {
                  keys.push(entry.key)
                  totalSize += raw.length * 2 // rough UTF-16 byte size
                }
              } catch { /* skip bad entries */ }
            }
          }
        }
      } catch { /* noop */ }
      return { keys, totalSize }
    }
  },

  // ── Pending Action Queue ───────────────────────────────────────────────

  /** Queue a failed API call for retry when back online. Returns the action ID. */
  async queueAction(
    action: Omit<PendingAction, 'id' | 'createdAt' | 'retries'>
  ): Promise<string> {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    const pending: PendingAction = {
      ...action,
      id,
      createdAt: Date.now(),
      retries: 0,
    }

    try {
      await idbTransaction<void>(QUEUE_STORE, 'readwrite', (store) => store.put(pending))
    } catch {
      // Fallback: localStorage
      try {
        const queue = this._getQueueFromLS()
        queue.push(pending)
        localStorage.setItem('fp_pending_queue', JSON.stringify(queue))
      } catch { /* storage full */ }
    }

    return id
  },

  /** Process all queued actions. Returns count of processed and failed. */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    const items = await this.getPendingQueue()
    let processed = 0
    let failed = 0

    for (const item of items) {
      try {
        const response = await fetch(item.url, {
          method: item.method,
          headers: item.headers,
          body: item.body || undefined,
        })

        if (response.ok) {
          processed++
          await this._removeAction(item.id)
        } else {
          const updated = { ...item, retries: item.retries + 1 }
          if (updated.retries >= updated.maxRetries) {
            failed++
            await this._removeAction(item.id)
          } else {
            await this._updateAction(updated)
          }
        }
      } catch {
        const updated = { ...item, retries: item.retries + 1 }
        if (updated.retries >= updated.maxRetries) {
          failed++
          await this._removeAction(item.id)
        } else {
          await this._updateAction(updated)
        }
      }
    }

    return { processed, failed }
  },

  /** Get all pending actions in the queue. */
  async getPendingQueue(): Promise<PendingAction[]> {
    try {
      const items = await idbTransaction<PendingAction[]>(
        QUEUE_STORE,
        'readonly',
        (store) => store.getAll()
      )
      return items.sort((a, b) => a.createdAt - b.createdAt)
    } catch {
      return this._getQueueFromLS()
    }
  },

  /** Remove all queued actions. */
  async clearQueue(): Promise<void> {
    try {
      await idbTransaction<void>(QUEUE_STORE, 'readwrite', (store) => store.clear())
    } catch {
      try {
        localStorage.removeItem('fp_pending_queue')
      } catch { /* noop */ }
    }
  },

  // ── Internal helpers ────────────────────────────────────────────────────

  _getQueueFromLS(): PendingAction[] {
    try {
      const raw = localStorage.getItem('fp_pending_queue')
      if (!raw) return []
      return JSON.parse(raw) as PendingAction[]
    } catch {
      return []
    }
  },

  async _removeAction(id: string): Promise<void> {
    try {
      await idbTransaction<void>(QUEUE_STORE, 'readwrite', (store) => store.delete(id))
    } catch {
      try {
        const queue = this._getQueueFromLS().filter((a) => a.id !== id)
        localStorage.setItem('fp_pending_queue', JSON.stringify(queue))
      } catch { /* noop */ }
    }
  },

  async _updateAction(action: PendingAction): Promise<void> {
    try {
      await idbTransaction<void>(QUEUE_STORE, 'readwrite', (store) => store.put(action))
    } catch {
      try {
        const queue = this._getQueueFromLS().map((a) => (a.id === action.id ? action : a))
        localStorage.setItem('fp_pending_queue', JSON.stringify(queue))
      } catch { /* noop */ }
    }
  },
}
