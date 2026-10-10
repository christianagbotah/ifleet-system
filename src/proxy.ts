import { jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

import { canDemoAccessApi } from '@/lib/auth/demo-access'
import { getJwtSecretKey } from '@/lib/jwt-secret'
import { getClientIp, rateLimit, rateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit'

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
  '/api/video/ingest/generic-http',
]

function isMachineAuthRoute(pathname: string): boolean {
  if (MACHINE_AUTH_API_ROUTES.includes(pathname)) return true
  return /^\/api\/integrations\/load-orders\/[^/]+\/webhook$/.test(pathname)
}

const PUBLIC_GET_EXACT_ROUTES = [
  '/api/settings',
  '/api/settings/channels',
  '/api/portal/public/client',
]

const PUBLIC_GET_PREFIX_ROUTES = [
  '/api/public/waybills/',
  '/api/portal/public/shipment/',
]

function isPublicGetRoute(pathname: string): boolean {
  return PUBLIC_GET_EXACT_ROUTES.includes(pathname)
    || PUBLIC_GET_PREFIX_ROUTES.some((prefix) => pathname.startsWith(prefix))
}

const NEXTAUTH_ROUTE = '/api/auth/'

const RATE_LIMIT_EXEMPT_ROUTES = [
  '/api/scheduler/warmup',
]

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
      const result = rateLimit(`global:${clientIp}`, RATE_LIMITS.api)
      if (!result.success) {
        const response = NextResponse.json(
          { error: 'Too many requests. Please slow down.', retryAfter: result.retryAfter },
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              ...rateLimitHeaders(result, RATE_LIMITS.api),
            },
          },
        )
        return applySecurityHeaders(response)
      }

      request.headers.set('X-RateLimit-Limit', String(RATE_LIMITS.api.maxRequests))
      request.headers.set('X-RateLimit-Remaining', String(result.remaining))
      request.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)))
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

  if (isMachineAuthRoute(pathname)) {
    return applySecurityHeaders(NextResponse.next())
  }

  if (request.method === 'GET' && isPublicGetRoute(pathname)) {
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
