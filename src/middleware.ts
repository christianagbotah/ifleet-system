import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { APP_NAME } from '@/lib/constants'

// ${APP_NAME} — API Authentication Middleware
//
// Protects all /api/* routes except login and register.
// Validates JWT token from Authorization header using `jose`
// (Edge Runtime compatible — unlike `jsonwebtoken` which requires Node.js crypto).
// Injects userId/role into request headers for downstream route handlers.
//
// Note: JWT signing happens in /api/auth/login using `jsonwebtoken` (Node.js runtime).
// Verification here uses `jose` (Edge Runtime). Both use the same NEXTAUTH_SECRET.

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'fleetpro-fallback-secret'

// Pre-compute the secret key (runs once at module load)
let secretKey: Uint8Array | null = null
function getSecretKey(): Uint8Array {
  if (!secretKey) {
    secretKey = new TextEncoder().encode(JWT_SECRET)
  }
  return secretKey
}

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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── /driver route protection (page-level) ─────────────────────────────
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
          return NextResponse.redirect(url)
        }

        if (roleName === 'Driver') {
          // Authenticated Driver — allow through
          return NextResponse.next()
        }

        // Authenticated but NOT a Driver role — redirect to home
        const url = request.nextUrl.clone()
        url.pathname = '/'
        url.searchParams.set('auth', 'unauthorized')
        return NextResponse.redirect(url)
      } catch {
        // Invalid/expired token — treat as unauthenticated
      }
    }

    // Not authenticated — redirect to home
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.searchParams.set('auth', 'required')
    return NextResponse.redirect(url)
  }

  // ── /api/* route protection ────────────────────────────────────────────
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Allow public auth routes (all methods)
  if (PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow GET requests on public-get-only routes (e.g. /api/settings for currency provider)
  // Other methods (PUT/POST/DELETE) fall through to JWT verification below
  if (request.method === 'GET' && PUBLIC_GET_ONLY_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next()
  }

  // Allow NextAuth routes (they handle their own auth)
  if (pathname.startsWith(NEXTAUTH_ROUTE) && pathname.includes('[...nextauth]')) {
    return NextResponse.next()
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
        return NextResponse.json(
          { error: 'Account is deactivated. Contact your administrator.' },
          { status: 403 }
        )
      }

      // Clone the request and inject user info as headers
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-auth-user-id', userId || '')
      requestHeaders.set('x-auth-user-role', roleName || '')
      requestHeaders.set('x-auth-user-email', email || '')
      requestHeaders.set('x-auth-user-permissions', JSON.stringify(permissions || []))
      requestHeaders.set('x-auth-driver-id', driverId || '')

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      })
    } catch (jwtError) {
      // jose throws JWTExpiredError for expired tokens
      const isExpired = jwtError instanceof Error && jwtError.name === 'JWTExpiredError'
      return NextResponse.json(
        { error: isExpired ? 'Session expired. Please log in again.' : 'Invalid authentication token.' },
        { status: 401 }
      )
    }
  }

  // No valid auth found — require authentication
  return NextResponse.json(
    { error: 'Authentication required. Please log in.' },
    { status: 401 }
  )
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match driver portal routes
    '/driver/:path*',
  ],
}
