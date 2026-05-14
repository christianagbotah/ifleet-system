'use client'

import * as React from 'react'
import { OfflineStore, CACHE_TTL } from './offline-store'
import { toast } from 'sonner'

// ── Offline-aware Hook ───────────────────────────────────────────────────────

/**
 * Provides reactive `isOnline` state and `hasPendingActions` flag.
 * Automatically processes the action queue when the browser comes back online.
 */
export function useOfflineAware() {
  const [isOnline, setIsOnline] = React.useState(true)
  const [hasPendingActions, setHasPendingActions] = React.useState(false)

  const checkPendingQueue = React.useCallback(async () => {
    try {
      const queue = await OfflineStore.getPendingQueue()
      setHasPendingActions(queue.length > 0)
    } catch {
      // Ignore
    }
  }, [])

  React.useEffect(() => {
    // Set initial state
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)

    const handleOnline = async () => {
      setIsOnline(true)

      // Process queued actions
      try {
        const result = await OfflineStore.processQueue()
        if (result.processed > 0) {
          toast.success(`Synced ${result.processed} action${result.processed > 1 ? 's' : ''} successfully.`)
        }
        if (result.failed > 0) {
          toast.warning(`${result.failed} action${result.failed > 1 ? 's' : ''} failed after max retries.`)
        }
      } catch {
        // Ignore sync errors
      }

      await checkPendingQueue()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check initial queue state
    checkPendingQueue()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [checkPendingQueue])

  return { isOnline, hasPendingActions, checkPendingQueue }
}

// ── Offline-aware Fetch ──────────────────────────────────────────────────────

/**
 * A drop-in replacement for `fetch` that:
 * - Returns cached data when offline (for GET requests)
 * - Queues POST/PUT/DELETE requests when offline for later sync
 * - Caches successful GET responses with an optional TTL
 *
 * @example
 * const data = await offlineAwareFetch('/api/dashboard', undefined, 'dashboard', CACHE_TTL.dashboard)
 */
export async function offlineAwareFetch<T>(
  url: string,
  options?: RequestInit,
  cacheKey?: string,
  ttl?: number
): Promise<T> {
  const method = options?.method?.toUpperCase() || 'GET'
  const isGet = method === 'GET' || method === 'HEAD'

  if (isGet) {
    // ── Read path ────────────────────────────────────────────────────────

    if (!navigator.onLine) {
      // Offline — try to return cached data
      const key = cacheKey || url
      const cached = await OfflineStore.getData<T>(key)
      if (cached) return cached
      throw new OfflineError(
        'You are offline and no cached data is available.',
        false
      )
    }

    // Online — fetch, cache, and return
    const response = await fetch(url, options)
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`)
    }
    const data: T = await response.json()
    const key = cacheKey || url
    await OfflineStore.setData(key, data, ttl)
    return data
  }

  // ── Write path ─────────────────────────────────────────────────────────

  if (!navigator.onLine) {
    // Offline — queue the action for later
    await OfflineStore.queueAction({
      url,
      method,
      body: options?.body ? String(options.body) : null,
      headers: extractHeaders(options?.headers),
      maxRetries: 3,
    })
    throw new OfflineError(
      'You are offline. Your action has been queued and will be synced when you reconnect.',
      true
    )
  }

  // Online — execute immediately
  const response = await fetch(url, options)
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

// ── Error class ──────────────────────────────────────────────────────────────

export class OfflineError extends Error {
  /** True when the action was successfully queued for later. */
  readonly queued: boolean

  constructor(message: string, queued: boolean) {
    super(message)
    this.name = 'OfflineError'
    this.queued = queued
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractHeaders(
  headers: HeadersInit | undefined
): Record<string, string> {
  if (!headers) return {}

  if (headers instanceof Headers) {
    const out: Record<string, string> = {}
    headers.forEach((v, k) => {
      out[k] = v
    })
    return out
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }

  return { ...headers }
}

// Re-export cache TTLs so consumers only need one import
export { CACHE_TTL }
