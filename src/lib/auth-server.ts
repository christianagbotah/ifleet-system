import { NextRequest, NextResponse } from 'next/server'

// ============ Types ============

export interface AuthContext {
  userId: string
  email: string
  roleName: string
  permissions: string[]
  driverId: string | null
}

// ============ Role Definitions ============

export const ROLES = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  DRIVER: 'Driver',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

// ============ Auth Helper Functions ============

/**
 * Extract and validate the JWT-authenticated user context from request headers.
 * Called inside API route handlers AFTER the middleware has already validated the JWT.
 * Returns null if headers are missing (shouldn't happen if middleware is working).
 */
export function getAuthContext(request: NextRequest): AuthContext | null {
  const userId = request.headers.get('x-auth-user-id')
  const roleName = request.headers.get('x-auth-user-role')
  const email = request.headers.get('x-auth-user-email')
  const permissionsHeader = request.headers.get('x-auth-user-permissions')
  const driverId = request.headers.get('x-auth-driver-id')

  if (!userId || !roleName) {
    return null
  }

  let permissions: string[] = []
  if (permissionsHeader) {
    try {
      permissions = JSON.parse(permissionsHeader)
    } catch {
      permissions = []
    }
  }

  return {
    userId,
    email: email || '',
    roleName,
    permissions,
    driverId: driverId || null,
  }
}

/**
 * Require authentication — returns AuthContext or a 401 NextResponse.
 * Use at the top of every protected route handler.
 *
 * @example
 * const auth = requireAuth(request)
 * if (auth instanceof NextResponse) return auth // 401 response already sent
 * console.log(auth.userId, auth.roleName)
 */
export function requireAuth(request: NextRequest): AuthContext | NextResponse {
  const ctx = getAuthContext(request)
  if (!ctx) {
    return NextResponse.json(
      { error: 'Authentication required. Please log in.' },
      { status: 401 }
    )
  }
  return ctx
}

/**
 * Require a specific role — returns AuthContext or a 403 NextResponse.
 * Shortcut for requireAuth + role check.
 *
 * @example
 * const auth = requireRole(request, ROLES.ADMIN)
 * if (auth instanceof NextResponse) return auth // 401 or 403 response already sent
 */
export function requireRole(
  request: NextRequest,
  roles: RoleName | RoleName[]
): AuthContext | NextResponse {
  const ctx = requireAuth(request)
  if (ctx instanceof NextResponse) return ctx

  const allowedRoles = Array.isArray(roles) ? roles : [roles]

  if (!allowedRoles.includes(ctx.roleName as RoleName)) {
    return NextResponse.json(
      { error: 'Insufficient permissions. This action requires admin access.' },
      { status: 403 }
    )
  }

  return ctx
}

/**
 * Require a specific permission — returns AuthContext or a 403 NextResponse.
 * Admin role always has all permissions.
 *
 * @example
 * const auth = requirePermission(request, 'users.create')
 * if (auth instanceof NextResponse) return auth
 */
export function requirePermission(
  request: NextRequest,
  permission: string
): AuthContext | NextResponse {
  const ctx = requireAuth(request)
  if (ctx instanceof NextResponse) return ctx

  // Admin has all permissions
  if (ctx.roleName === ROLES.ADMIN) return ctx

  if (!ctx.permissions.includes(permission)) {
    return NextResponse.json(
      { error: `Insufficient permissions. Required: ${permission}` },
      { status: 403 }
    )
  }

  return ctx
}

/**
 * Require any of the listed permissions — returns AuthContext or a 403 NextResponse.
 * Admin role always has all permissions.
 *
 * @example
 * const auth = requireAnyPermission(request, ['payroll.view', 'settlements.view'])
 * if (auth instanceof NextResponse) return auth
 */
export function requireAnyPermission(
  request: NextRequest,
  permissions: string[]
): AuthContext | NextResponse {
  const ctx = requireAuth(request)
  if (ctx instanceof NextResponse) return ctx

  // Admin has all permissions
  if (ctx.roleName === ROLES.ADMIN) return ctx

  if (!permissions.some((p) => ctx.permissions.includes(p))) {
    return NextResponse.json(
      { error: `Insufficient permissions. Required one of: ${permissions.join(', ')}` },
      { status: 403 }
    )
  }

  return ctx
}

/**
 * Check if the authenticated user is a driver, and optionally verify
 * they own the resource via driverId.
 *
 * @example
 * // In a driver-scoped endpoint:
 * const auth = getAuthContext(request)
 * if (!auth) return error(401) // getAuthContext returns null on failure
 * if (!isDriverOrAdmin(auth, resource.driverId)) return error(403)
 */
export function isDriverOrAdmin(auth: AuthContext, resourceDriverId?: string | null): boolean {
  if (auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER) return true
  if (auth.roleName === ROLES.DRIVER && resourceDriverId && auth.driverId === resourceDriverId) return true
  return false
}

/**
 * Admin/Manager write guard — returns 403 if the user is a Driver trying to write.
 * Use in POST/PUT/DELETE handlers to prevent drivers from modifying data.
 *
 * @example
 * const auth = requireAuth(request)
 * if (auth instanceof NextResponse) return auth
 * const writeGuard = requireWriteAccess(auth)
 * if (writeGuard instanceof NextResponse) return writeGuard // 403 response sent
 */
export function requireWriteAccess(auth: AuthContext): true | NextResponse {
  if (auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER) return true

  return NextResponse.json(
    { error: 'Drivers have read-only access. Contact your administrator.' },
    { status: 403 }
  )
}
