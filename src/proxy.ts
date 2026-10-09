import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { APP_NAME } from '@/lib/constants'
import { getJwtSecretKey } from '@/lib/jwt-secret'
import { canDemoAccessApi } from '@/lib/auth/demo-access'

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

let secretKey: Uint8Array | null = null
function getSecretKey(): Uint8Array {
  if (!secretKey) secretKey = getJwtSecretKey()
  return secretKey
}

const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/demo-login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/verify-reset-token',
  '/api/auth/reset-password',
  '/api/scheduler/warmup',
]

const MACHINE_AUTH_API_ROUTES = [
  '/api/internal/ingest/health',
  '/api/telematics/ingest/generic-http',
]

const PUBLIC_GET_ONLY_ROUTES = [
  '/api/settings',
  '/api/settings/channels',
  '/api/public/waybills/',
]

const NEXTAUTH_ROUTE = '/api/auth/'

interface RateLimitEntry {
  count: number
  resetAt: number
  blocked: boolean
  blockedUntil?: number
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

const GLOBAL_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60 * 1000,
  blockDurationMs: 60 * 1000,
}

const RATE_LIMIT_EXEMPT_ROUTES = [
  '/api/scheduler/warmup',
]

const rateLimitStore = new Map<string, RateLimitEntry>()
const STORE_SIZE_SOFT_LIMIT = 50_000

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

let lastCleanup = 0
const CLEANUP_INTERVAL_MS = 60 * 1000

function maybeCleanup(): void {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL_MS && rateLimitStore.size < STORE_SIZE_SOFT_LIMIT) return
  lastCleanup = now

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetAt && !entry.blocked) {
      rateLimitStore.delete(key)
      continue
    }
    if (entry.blocked && entry.blockedUntil && now >= entry.blockedUntil) rateLimitStore.delete(key)
  }
}

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

  return { success: true, remaining: config.maxRequests - entry.count, resetAt: entry.resetAt }
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(key, value)
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const clientIp = getClientIp(request)

  if (pathname.startsWith('/api/')) {
    const isExempt = RATE_LIMIT_EXEMPT_ROUTES.some((route) => pathname.startsWith(route))
    if (!isExempt) {
      const result = rateLimit(clientIp, GLOBAL_RATE_LIMIT)
      if (!result.success) {
        const response = NextResponse.json(
          { error: 'Too many requests. Please slow down.', retryAfter: result.retryAfter },
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

      request.headers.set('X-RateLimit-Remaining', String(result.remaining))
      request.headers.set('X-RateLimit-Reset', String(result.resetAt))
    }
  }

  if (pathname.startsWith('/driver')) {
    const tokenFromCookie = request.cookies.get('fleetpro-token')?.value
    const authHeader = request.headers.get('authorization')
    const token = tokenFromCookie || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null)

    if (token) {
      try {
        const { payload } = await jwtVerify(token, getSecretKey())
        const roleName = payload.roleName as string | undefined
        const isActive = payload.isActive as boolean | undefined
        const isDemo = payload.isDemo === true

        if (isDemo) {
          const url = request.nextUrl.clone()
          url.pathname = '/'
          url.searchParams.set('auth', 'demo')
          return applySecurityHeaders(NextResponse.redirect(url))
        }

        if (isActive === false) {
          const url = request.nextUrl.clone()
          url.pathname = '/'
          url.searchParams.set('auth', 'deactivated')
          return applySecurityHeaders(NextResponse.redirect(url))
        }
        if (roleName === 'Driver') return applySecurityHeaders(NextResponse.next())

        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.searchParams.set('auth', 'unauthorized')
        return applySecurityHeaders(NextResponse.redirect(url))
      } catch {
        // Invalid/expired token falls through to required-auth redirect.
      }
    }

    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('auth', 'required')
    return applySecurityHeaders(NextResponse.redirect(url))
  }

  if (!pathname.startsWith('/api/')) return applySecurityHeaders(NextResponse.next())

  if (PUBLIC_API_ROUTES.includes(pathname)) {
    return applySecurityHeaders(NextResponse.next())
  }

  if (MACHINE_AUTH_API_ROUTES.includes(pathname)) {
    return applySecurityHeaders(NextResponse.next())
  }

  if (request.method === 'GET' && PUBLIC_GET_ONLY_ROUTES.some((route) => pathname.startsWith(route))) {
    return applySecurityHeaders(NextResponse.next())
  }

  if (pathname.startsWith(NEXTAUTH_ROUTE) && pathname.includes('[...nextauth]')) {
    return applySecurityHeaders(NextResponse.next())
  }

  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7)
    try {
      const { payload } = await jwtVerify(token, getSecretKey())
      const userId = payload.userId as string | undefined
      const email = payload.email as string | undefined
      const roleName = payload.roleName as string | undefined
      const permissions = payload.permissions as string[] | undefined
      const driverId = payload.driverId as string | null | undefined
      const isActive = payload.isActive as boolean | undefined
      const isDemo = payload.isDemo === true
      const demoProfile = payload.demoProfile as string | undefined

      if (isActive === false) {
        return applySecurityHeaders(NextResponse.json(
          { error: 'Account is deactivated. Contact your administrator.' },
          { status: 403 },
        ))
      }

      if (isDemo && !canDemoAccessApi(pathname, request.method)) {
        const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())
        return applySecurityHeaders(NextResponse.json(
          {
            error: isMutation
              ? 'Demo mode is read-only. Sign in with a standard account to make changes.'
              : 'Public demo sessions are isolated and cannot access production APIs.',
          },
          { status: 403 },
        ))
      }

      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-auth-user-id', userId || '')
      requestHeaders.set('x-auth-user-role', roleName || '')
      requestHeaders.set('x-auth-user-email', email || '')
      requestHeaders.set('x-auth-user-permissions', JSON.stringify(permissions || []))
      requestHeaders.set('x-auth-driver-id', driverId || '')
      requestHeaders.set('x-auth-demo', isDemo ? 'true' : 'false')
      requestHeaders.set('x-auth-demo-profile', demoProfile || '')

      return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }))
    } catch (jwtError) {
      const isExpired = jwtError instanceof Error && jwtError.name === 'JWTExpiredError'
      return applySecurityHeaders(NextResponse.json(
        { error: isExpired ? 'Session expired. Please log in again.' : 'Invalid authentication token.' },
        { status: 401 },
      ))
    }
  }

  return applySecurityHeaders(NextResponse.json(
    { error: 'Authentication required. Please log in.' },
    { status: 401 },
  ))
}

export const config = {
  matcher: [
    '/api/:path*',
    '/driver/:path*',
  ],
}
