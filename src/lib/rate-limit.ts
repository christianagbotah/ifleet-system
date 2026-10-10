import { NextRequest } from 'next/server'

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  blockDurationMs?: number
}

export interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

interface RateLimitEntry {
  count: number
  resetAt: number
  blockedUntil?: number
}

interface RateLimitGlobal {
  __fleetpro_rate_limit_store__?: Map<string, RateLimitEntry>
}

const STORE_SIZE_SOFT_LIMIT = 50_000
const CLEANUP_INTERVAL_MS = 60 * 1000
let lastCleanupAt = 0

function getStore(): Map<string, RateLimitEntry> {
  const runtime = globalThis as typeof globalThis & RateLimitGlobal
  if (!runtime.__fleetpro_rate_limit_store__) {
    runtime.__fleetpro_rate_limit_store__ = new Map<string, RateLimitEntry>()
  }
  return runtime.__fleetpro_rate_limit_store__
}

const store = getStore()

function cleanupExpiredEntries(now = Date.now()): void {
  for (const [key, entry] of store.entries()) {
    if (entry.blockedUntil !== undefined) {
      if (now >= entry.blockedUntil) store.delete(key)
      continue
    }
    if (now >= entry.resetAt) store.delete(key)
  }
  lastCleanupAt = now
}

function maybeCleanup(now: number): void {
  if (now - lastCleanupAt >= CLEANUP_INTERVAL_MS || store.size >= STORE_SIZE_SOFT_LIMIT) {
    cleanupExpiredEntries(now)
  }
}

function ensureCapacity(identifier: string): void {
  if (store.has(identifier) || store.size < STORE_SIZE_SOFT_LIMIT) return
  const oldestKey = store.keys().next().value as string | undefined
  if (oldestKey) store.delete(oldestKey)
}

function freshStatus(config: RateLimitConfig, now: number): RateLimitResult {
  return {
    success: true,
    remaining: config.maxRequests,
    resetAt: now + config.windowMs,
  }
}

function statusForEntry(entry: RateLimitEntry, config: RateLimitConfig, now: number): RateLimitResult {
  if (entry.blockedUntil !== undefined) {
    if (now < entry.blockedUntil) {
      return {
        success: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfter: Math.ceil((entry.blockedUntil - now) / 1000),
      }
    }
    return freshStatus(config, now)
  }

  if (now >= entry.resetAt) return freshStatus(config, now)

  return {
    success: true,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.resetAt,
  }
}

export function getRateLimitStatus(identifier: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  maybeCleanup(now)

  const entry = store.get(identifier)
  if (!entry) return freshStatus(config, now)

  const status = statusForEntry(entry, config, now)
  if (status.success && (entry.blockedUntil !== undefined || now >= entry.resetAt)) {
    store.delete(identifier)
  }
  return status
}

export function resetRateLimit(identifier: string): void {
  store.delete(identifier)
}

export function rateLimit(identifier: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const blockDuration = config.blockDurationMs ?? config.windowMs
  maybeCleanup(now)

  let entry = store.get(identifier)
  if (entry?.blockedUntil !== undefined) {
    if (now < entry.blockedUntil) return statusForEntry(entry, config, now)
    store.delete(identifier)
    entry = undefined
  }

  if (entry && now >= entry.resetAt) {
    store.delete(identifier)
    entry = undefined
  }

  if (!entry) {
    ensureCapacity(identifier)
    const created: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    }
    store.set(identifier, created)
    return {
      success: true,
      remaining: Math.max(0, config.maxRequests - 1),
      resetAt: created.resetAt,
    }
  }

  entry.count += 1

  if (entry.count > config.maxRequests) {
    entry.blockedUntil = now + blockDuration
    return {
      success: false,
      remaining: 0,
      resetAt: entry.blockedUntil,
      retryAfter: Math.ceil(blockDuration / 1000),
    }
  }

  return {
    success: true,
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetAt: entry.resetAt,
  }
}

export function createRateLimitMiddleware(
  config: RateLimitConfig,
  prefix: string,
): (request: NextRequest) => RateLimitResult {
  return (request: NextRequest): RateLimitResult => {
    const ip = getClientIp(request)
    return rateLimit(`${ip}:${prefix}`, config)
  }
}

export function getClientIp(request: NextRequest): string {
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',').map((value) => value.trim()).find(Boolean)
    if (first) return first
  }

  return 'unknown'
}

export function rateLimitHeaders(
  result: RateLimitResult,
  config: RateLimitConfig,
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
  }
  if (result.retryAfter !== undefined) headers['Retry-After'] = String(result.retryAfter)
  return headers
}

export const RATE_LIMITS = {
  loginRequest: {
    maxRequests: 30,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 15 * 60 * 1000,
  },

  loginFailure: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  },

  loginAccountFailure: {
    maxRequests: 10,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  },

  login: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000,
    blockDurationMs: 30 * 60 * 1000,
  },

  api: {
    maxRequests: 100,
    windowMs: 60 * 1000,
    blockDurationMs: 60 * 1000,
  },

  sensitive: {
    maxRequests: 20,
    windowMs: 60 * 1000,
    blockDurationMs: 15 * 60 * 1000,
  },

  notification: {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
} as const satisfies Record<string, RateLimitConfig>
