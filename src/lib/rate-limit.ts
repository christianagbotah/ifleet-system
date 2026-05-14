/**
 * Rate Limiting Utility for ${APP_NAME}
 *
 * Provides in-memory rate limiting using a fixed-window algorithm.
 * Supports multiple pre-defined configurations for different endpoint types
 * (login, general API, sensitive operations, notifications).
 *
 * Usage:
 *   import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
 *   const result = rateLimit('192.168.1.1:auth/login', RATE_LIMITS.login)
 *   if (!result.success) { ... return 429 ... }
 *
 * @module rate-limit
 */

import { APP_NAME } from '@/lib/constants'
import { NextRequest } from 'next/server'

// ── Types ──────────────────────────────────────────────────────────────────

/** Per-key state stored in the rate-limit map */
interface RateLimitEntry {
  count: number
  resetAt: number // timestamp (ms) when the current window expires
  blocked: boolean
  blockedUntil?: number // timestamp (ms) when a block expires
}

/** Configuration for a rate-limit window */
export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window */
  maxRequests: number
  /** Duration of each rate-limit window in milliseconds */
  windowMs: number
  /** How long to block after exceeding the limit (default: windowMs) */
  blockDurationMs?: number
}

/** Result returned by `rateLimit()` */
export interface RateLimitResult {
  /** Whether the request is allowed through */
  success: boolean
  /** How many requests remain in the current window */
  remaining: number
  /** Timestamp (ms) when the current window resets */
  resetAt: number
  /** Seconds until the block lifts (only present when `success` is false) */
  retryAfter?: number
}

// ── In-memory store ────────────────────────────────────────────────────────
//
// Persisted on `globalThis` so that the rate-limit counters survive
// Next.js dev-server hot-reloads (Fast Refresh).  Without this guard every
// file edit would silently reset all limits, making rate-limiting useless
// during local development.

const RATE_LIMIT_STORE_KEY = '__fleetpro_rate_limit_store__'
const RATE_LIMIT_TIMER_KEY = '__fleetpro_rate_limit_timer__'

function getStore(): Map<string, RateLimitEntry> {
  if (typeof globalThis === 'undefined') {
    // Fallback for environments where globalThis is not available
    return new Map<string, RateLimitEntry>()
  }
  if (!(globalThis as any)[RATE_LIMIT_STORE_KEY]) {
    (globalThis as any)[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitEntry>()
  }
  return (globalThis as any)[RATE_LIMIT_STORE_KEY] as Map<string, RateLimitEntry>
}

const store = getStore()

// Cleanup stale entries every 5 minutes to prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000

/**
 * Remove expired entries from the store.
 * Called on an interval and can also be invoked manually.
 */
function cleanup(): void {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    // Remove if the window has expired AND no active block
    if (now >= entry.resetAt && !entry.blocked) {
      store.delete(key)
      continue
    }
    // If blocked but block expired, remove
    if (entry.blocked && entry.blockedUntil && now >= entry.blockedUntil) {
      store.delete(key)
    }
  }
}

// Ensure cleanup runs on exactly one timer, even across hot-reloads.
// The flag is stored on globalThis so subsequent module evaluations
// (triggered by file edits in dev) see that the timer already exists.
if (typeof globalThis !== 'undefined') {
  if (!(globalThis as any)[RATE_LIMIT_TIMER_KEY]) {
    const timer = setInterval(cleanup, CLEANUP_INTERVAL_MS)
    // Allow the Node process to exit without waiting for the timer
    if (timer.unref) {
      timer.unref()
    }
    (globalThis as any)[RATE_LIMIT_TIMER_KEY] = timer
  }
}

// ── Core rate-limit function ───────────────────────────────────────────────

/**
 * Check (and increment) the rate limit for a given identifier.
 *
 * @param identifier - Unique key, typically `{ip}:{endpoint}` or `{userId}:{endpoint}`
 * @param config     - Rate limit configuration (max requests, window, block duration)
 * @returns A `RateLimitResult` indicating whether the request is allowed
 *
 * @example
 * ```ts
 * const result = rateLimit('192.168.1.1:auth/login', RATE_LIMITS.login)
 * if (!result.success) {
 *   return NextResponse.json(
 *     { error: 'Too many requests', retryAfter: result.retryAfter },
 *     { status: 429, headers: { 'Retry-After': String(result.retryAfter) } }
 *   )
 * }
 * ```
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig,
): RateLimitResult {
  const now = Date.now()
  const blockDuration = config.blockDurationMs ?? config.windowMs

  let entry = store.get(identifier)

  // No existing entry — create a fresh one
  if (!entry) {
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
      blocked: false,
    }
    store.set(identifier, entry)
    return {
      success: true,
      remaining: config.maxRequests - 1,
      resetAt: entry.resetAt,
    }
  }

  // If currently blocked, check if the block has expired
  if (entry.blocked && entry.blockedUntil) {
    if (now < entry.blockedUntil) {
      const retryAfterSecs = Math.ceil((entry.blockedUntil - now) / 1000)
      return {
        success: false,
        remaining: 0,
        resetAt: entry.resetAt,
        retryAfter: retryAfterSecs,
      }
    }
    // Block has expired — reset for a fresh window
    entry.blocked = false
    entry.blockedUntil = undefined
    entry.count = 0
    entry.resetAt = now + config.windowMs
  }

  // If the window has expired, start a new window
  if (now >= entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + config.windowMs
  }

  // Increment the request counter
  entry.count++

  // Check if the limit has been exceeded
  if (entry.count > config.maxRequests) {
    entry.blocked = true
    entry.blockedUntil = now + blockDuration
    const retryAfterSecs = Math.ceil(blockDuration / 1000)
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfter: retryAfterSecs,
    }
  }

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  }
}

// ── Middleware-style factory ────────────────────────────────────────────────

/**
 * Create a rate-limit checker bound to a specific configuration.
 * Returns a function that accepts a `NextRequest` and extracts the client IP
 * to produce a `RateLimitResult`.
 *
 * @param config  - Rate limit configuration
 * @param prefix  - Optional endpoint prefix appended to the IP key (e.g. `'auth/login'`)
 * @returns A function `(request: NextRequest) => RateLimitResult`
 *
 * @example
 * ```ts
 * const checkLoginRate = createRateLimitMiddleware(RATE_LIMITS.login, 'auth/login')
 *
 * export async function POST(request: NextRequest) {
 *   const result = checkLoginRate(request)
 *   if (!result.success) {
 *     return NextResponse.json({ error: 'Too many attempts', retryAfter: result.retryAfter }, { status: 429 })
 *   }
 *   // ... handle request
 * }
 * ```
 */
export function createRateLimitMiddleware(
  config: RateLimitConfig,
  prefix: string,
): (request: NextRequest) => RateLimitResult {
  return (request: NextRequest): RateLimitResult => {
    const ip = getClientIp(request)
    const identifier = `${ip}:${prefix}`
    return rateLimit(identifier, config)
  }
}

// ── Helper: extract client IP ──────────────────────────────────────────────

/**
 * Extract the client IP address from request headers.
 * Checks `x-forwarded-for` (first entry), then `x-real-ip`, then falls back to `'unknown'`.
 *
 * @param request - The incoming Next.js request
 * @returns The client IP string
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

// ── Pre-defined rate limit configurations ──────────────────────────────────

/** Commonly-used rate limit presets for different endpoint categories */
export const RATE_LIMITS = {
  /**
   * Login endpoint: 5 attempts per 15-minute window, 30-minute block on overflow.
   * Aggressive to protect against brute-force attacks.
   */
  login: {
    maxRequests: 20,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes
  },

  /**
   * General API endpoints: 100 requests per minute.
   * Suitable for normal authenticated API usage.
   */
  api: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 1 minute
  },

  /**
   * Sensitive endpoints (e.g. password change): 20 per minute, 15-minute block.
   * Stricter than general API to prevent abuse.
   */
  sensitive: {
    maxRequests: 20,
    windowMs: 60 * 1000, // 1 minute
    blockDurationMs: 15 * 60 * 1000, // 15 minutes
  },

  /**
   * Notification endpoints: 30 requests per minute.
   * Prevents notification spam while allowing normal usage.
   */
  notification: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 1 minute
  },
} as const satisfies Record<string, RateLimitConfig>
