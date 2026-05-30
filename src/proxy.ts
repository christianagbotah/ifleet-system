import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { APP_NAME } from '@/lib/constants'
import { getJwtSecretKey } from '@/lib/jwt-secret'

// ${APP_NAME} — API Authentication Proxy
//
// Protects all /api/* routes except login and register.
// Validates JWT token from Authorization header using `jose`
// (Edge Runtime compatible — unlike `jsonwebtoken` which requires Node.js crypto).
// Injects userId/role into request headers for downstream route handlers.
//
// Also provides:
//   - Global rate limiting (Edge-compatible in-memory fixed-window)
//   - Security headers on all API responses
//
// Note: JWT signing happens in /api/auth/login using `jsonwebtoken` (Node.js runtime).
// Verification here uses `jose` (Edge Runtime). Both use the same NEXTAUTH_SECRET.

// ── Pre-compute the secret key (runs once at module load) ────────────────────

let secretKey: Uint8Array | null = null
function getSecretKey(): Uint8Array {
  if (!secretKey) {
    secretKey = getJwtSecretKey()
  }
  return secretKey
}

// ── Public route definitions ───────────────────────────────────────────────

// Routes that are publicly accessible (no auth required)
const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/verify-reset-token',
  '/api/auth/reset-password',
  '/api/scheduler/warmup',
]

// Routes where GET is public (for unauthenticated reads like currency provider)
// but other methods (PUT/POST/DELETE) require JWT auth and inject x-auth-* headers
const PUBLIC_GET_ONLY_ROUTES = [
  '/api/settings',          // GET = display config (currency, units). PUT = admin save.
  '/api/settings/channels', // GET = channel config (masked secrets). PUT = admin save.
]

// NextAuth routes are handled by NextAuth itself
const NEXTAUTH_ROUTE = '/api/auth/'

// ── Global rate limiting (Edge Runtime compatible) ───────────────────────────
//
// Uses a simple Map instead of globalThis/setInterval (unreliable in Edge).
// Lazy cleanup on each request prevents unbounded memory growth.
// This is the first-layer defense; individual route handlers can add stricter
// per-endpoint limits using the rate-limit.ts utility (Node.js runtime).

interface RateLimitEntry {
  count: number
  resetAt: number       // ms timestamp when the window expires
  blocked: boolean
  blockedUntil?: number // ms timestamp when the block expires
}

interface RateLimitConfig {
  maxRequests: number
  windowMs: number
  blockDurationMs?: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
}

/** 100 requests per minute for all API routes (matches RATE_LIMITS.api) */
const GLOBAL_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000,       // 1 minute
  blockDurationMs: 60 * 1000, // block for 1 minute after exceeding
}

/** Routes exempt from global rate limiting (health checks, warmup) */
const RATE_LIMIT_EXEMPT_ROUTES = [
  '/api/scheduler/warmup',
]

/** In-memory store (persists across warm invocations in Edge Runtime) */
const rateLimitStore = new Map<string, RateLimitEntry>()

/** Cleanup threshold — triggers lazy GC when store exceeds this size */
const STORE_SIZE_SOFT_LIMIT = 50_000

// ── Helper: extract client IP ──────────────────────────────────────────────

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || 'unknown'
}

// ── Lazy cleanup ────────────────────────────────────────────────────────────

let lastCleanup = 0
const CLEANUP_INTERVAL_MS = 60 * 1000

function maybeCleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && rateLimitStore.size < STORE_SIZE_SOFT_LIMIT) {
    return
  }
  lastCleanup = now

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt && !entry.blocked) {
      rateLimitStore.delete(key)
      continue
    }
    if (entry.blocked && entry.blockedUntil && now >= entry.blockedUntil) {
      rateLimitStore.delete(key)
    }
  }
}

// ── Core rate limit function ────────────────────────────────────────────────

function rateLimit(ip: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now()
  const blockDuration = config.blockDurationMs ?? config.windowMs

  maybeCleanup()

  let entry = rateLimitStore.get(ip)

  if (!entry) {
    entry = { count: 1, resetAt: now + config.windowMs, blocked: false }
    rateLimitStore.set(ip, entry)
    return { success: true, remaining: config.maxRequests - 1, resetAt: entry.resetAt }
  }

  if (entry.blocked && entry.blockedUntil) {
    if (now < entry.blockedUntil) {
      const retryAfterSecs = Math.ceil((entry.blockedUntil - now) / 1000)
      return { success: false, remaining: 0, resetAt: entry.resetAt, retryAfter: retryAfterSecs }
    }
    entry.blocked = false
    entry.blockedUntil = undefined
    entry.count = 0
    entry.resetAt = now + config.windowMs
  }

  if (now >= entry.resetAt) {
    entry.count = 0
    entry.resetAt = now + config.windowMs
  }

  entry.count++

  if (entry.count > config.maxRequests) {
    entry.blocked = true
    entry.blockedUntil = now + blockDuration
    const retryAfterSecs = Math.ceil(blockDuration / 1000)
    return { success: false, remaining: 0, resetAt: entry.resetAt, retryAfter: retryAfterSecs }
  }

  return {
    success: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  }
}

// ── Security headers ───────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

/** Apply security headers to a NextResponse instance */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

// ── Main proxy function ────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const clientIp = getClientIp(request)

  // ── Step 1: Global rate limiting (API routes only) ─────────────────────
  if (pathname.startsWith('/api/')) {
    const isExempt = RATE_LIMIT_EXEMPT_ROUTES.some((route) => pathname.startsWith(route))

    if (!isExempt) {
      const result = rateLimit(clientIp, GLOBAL_RATE_LIMIT)

      if (!result.success) {
        const response = NextResponse.json(
          {
            error: 'Too many requests. Please slow down.',
            retryAfter: result.retryAfter,
          },
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(result.retryAfter ?? 60),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(result.resetAt),
            },
          },
        )
        return applySecurityHeaders(response)
      }

      // Inject rate-limit info headers into request for downstream handlers
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('X-RateLimit-Remaining', String(result.remaining))
      requestHeaders.set('X-RateLimit-Reset', String(result.resetAt))
      // Mutate the request headers for downstream use
      request.headers.set('X-RateLimit-Remaining', String(result.remaining))
      request.headers.set('X-RateLimit-Reset', String(result.resetAt))
    }
  }

  // ── Step 2: /driver route protection (page-level) ─────────────────────
  // Server-side guard: only Drivers with a valid JWT cookie may access.
  // Falls through to the /api/* logic below for all other routes.
  if (pathname.startsWith('/driver')) {
    // Try cookie first (page navigations send cookies), then Authorization header
    const tokenFromCookie = request.cookies.get('fleetpro-token')?.value
    const authHeader = request.headers.get('authorization')
    const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null)

    if (token) {
      try {
        const { payload } = await jwtVerify(token, getSecretKey())
        const roleName = payload.roleName as string | undefined
        const isActive = payload.isActive as boolean | undefined

        if (isActive === false) {
          // Deactivated account — redirect to home
          const url = request.nextUrl.clone()
          url.pathname = '/'
          url.searchParams.set('auth', 'deactivated')
          return applySecurityHeaders(NextResponse.redirect(url))
        }

        if (roleName === 'Driver') {
          // Authenticated Driver — allow through
          return applySecurityHeaders(NextResponse.next())
        }

        // Authenticated but NOT a Driver role — redirect to home
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.searchParams.set('auth', 'unauthorized')
        return applySecurityHeaders(NextResponse.redirect(url))
      } catch {
        // Invalid/expired token — treat as unauthenticated
      }
    }

    // Not authenticated — redirect to home
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('auth', 'required')
    return applySecurityHeaders(NextResponse.redirect(url))
  }

  // ── Step 3: /api/* route protection ───────────────────────────────────
  if (!pathname.startsWith('/api/')) {
    return applySecurityHeaders(NextResponse.next())
  }

  // Allow public auth routes (all methods)
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return applySecurityHeaders(NextResponse.next())
  }

  // Allow GET requests on public-get-only routes (e.g. /api/settings for currency provider)
  // Other methods (PUT/POST/DELETE) fall through to JWT verification below
  if (request.method === 'GET' && PUBLIC_GET_ONLY_ROUTES.some((route) => pathname.startsWith(route))) {
    return applySecurityHeaders(NextResponse.next())
  }

  // Allow NextAuth routes (they handle their own auth)
  if (pathname.startsWith(NEXTAUTH_ROUTE) && pathname.includes('[...nextauth]')) {
    return applySecurityHeaders(NextResponse.next())
  }

  // Extract the Authorization header
  const authHeader = request.headers.get('authorization')

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)

    try {
      const { payload } = await jwtVerify(token, getSecretKey())

      // Type-safe access to decoded payload
      const userId = payload.userId as string | undefined
      const email = payload.email as string | undefined
      const roleName = payload.roleName as string | undefined
      const permissions = payload.permissions as string[] | undefined
      const driverId = payload.driverId as string | null | undefined
      const isActive = payload.isActive as boolean | undefined

      // Check if user is still active
      if (isActive === false) {
        const response = NextResponse.json(
          { error: 'Account is deactivated. Contact your administrator.' },
          { status: 403 },
        )
        return applySecurityHeaders(response)
      }

      // Clone the request and inject user info as headers
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-auth-user-id', userId || '')
      requestHeaders.set('x-auth-user-role', roleName || '')
      requestHeaders.set('x-auth-user-email', email || '')
      requestHeaders.set('x-auth-user-permissions', JSON.stringify(permissions || []))
      requestHeaders.set('x-auth-driver-id', driverId || '')

      return applySecurityHeaders(NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      }))
    } catch (jwtError) {
      // jose throws JWTExpiredError for expired tokens
      const isExpired = jwtError instanceof Error && jwtError.name === 'JWTExpiredError'
      const response = NextResponse.json(
        { error: isExpired ? 'Session expired. Please log in again.' : 'Invalid authentication token.' },
        { status: 401 },
      )
      return applySecurityHeaders(response)
    }
  }

  // No valid auth found — require authentication
  const response = NextResponse.json(
    { error: 'Authentication required. Please log in.' },
    { status: 401 },
  )
  return applySecurityHeaders(response)
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match driver portal routes
    '/driver/:path*',
  ],
}
