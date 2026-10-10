// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import {
  RATE_LIMITS,
  getClientIp,
  getRateLimitStatus,
  rateLimit,
  resetRateLimit,
} from '../rate-limit'

afterEach(() => {
  vi.useRealTimers()
})

describe('rate limit hardening', () => {
  it('separates coarse requests, source/account failures, and distributed account failures', () => {
    expect(RATE_LIMITS.loginRequest.maxRequests).toBeGreaterThan(RATE_LIMITS.loginFailure.maxRequests)
    expect(RATE_LIMITS.loginFailure.maxRequests).toBe(5)
    expect(RATE_LIMITS.loginFailure.windowMs).toBe(15 * 60 * 1000)
    expect(RATE_LIMITS.loginFailure.blockDurationMs).toBe(30 * 60 * 1000)

    expect(RATE_LIMITS.loginAccountFailure.maxRequests).toBeGreaterThan(RATE_LIMITS.loginFailure.maxRequests)
    expect(RATE_LIMITS.loginAccountFailure.windowMs).toBe(15 * 60 * 1000)
    expect(RATE_LIMITS.loginAccountFailure.blockDurationMs).toBe(30 * 60 * 1000)
  })

  it('can inspect a bucket without consuming another request and reset it after success', () => {
    const key = `test-status-${crypto.randomUUID()}`
    const config = { maxRequests: 2, windowMs: 60_000, blockDurationMs: 60_000 }

    expect(rateLimit(key, config).remaining).toBe(1)
    expect(getRateLimitStatus(key, config)).toMatchObject({ success: true, remaining: 1 })
    expect(getRateLimitStatus(key, config)).toMatchObject({ success: true, remaining: 1 })

    resetRateLimit(key)
    expect(getRateLimitStatus(key, config)).toMatchObject({ success: true, remaining: 2 })
  })

  it('arms the block when the final allowed attempt is consumed so the next request is rejected before work', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T18:00:00.000Z'))
    const key = `test-threshold-${crypto.randomUUID()}`
    const config = { maxRequests: 2, windowMs: 60_000, blockDurationMs: 120_000 }

    expect(rateLimit(key, config)).toMatchObject({ success: true, remaining: 1 })
    expect(rateLimit(key, config)).toMatchObject({ success: true, remaining: 0 })

    expect(getRateLimitStatus(key, config)).toMatchObject({
      success: false,
      remaining: 0,
      retryAfter: 120,
    })
  })

  it('unblocks after block expiry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-10T18:00:00.000Z'))
    const key = `test-expiry-${crypto.randomUUID()}`
    const config = { maxRequests: 1, windowMs: 1_000, blockDurationMs: 2_000 }

    expect(rateLimit(key, config).success).toBe(true)
    expect(rateLimit(key, config).success).toBe(false)

    vi.advanceTimersByTime(2_001)
    expect(getRateLimitStatus(key, config).success).toBe(true)
  })

  it('prefers x-real-ip from the trusted deployment proxy over a forwarded chain', () => {
    const request = new NextRequest('https://ifleetpro.example/api/auth/login', {
      headers: {
        'x-real-ip': '203.0.113.20',
        'x-forwarded-for': '198.51.100.99, 203.0.113.20',
      },
    })

    expect(getClientIp(request)).toBe('203.0.113.20')
  })
})
