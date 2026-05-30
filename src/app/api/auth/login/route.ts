import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { comparePassword } from '@/lib/auth-utils'
import jwt from 'jsonwebtoken'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { rateLimit, RATE_LIMITS, getClientIp as getClientIpFromRateLimit } from '@/lib/rate-limit'
import { JWT_SECRET } from '@/lib/jwt-secret'
import { loginSchema, parseBody } from '@/lib/schemas'

const ENDPOINT_KEY = 'auth/login'

// ── Login handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json()
    const parsed = parseBody(loginSchema, raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 })
    }
    const { email, password } = parsed.data

    // Rate limiting by client IP using shared utility
    const clientIp = getClientIpFromRateLimit(request)
    const rateResult = rateLimit(`${clientIp}:${ENDPOINT_KEY}`, RATE_LIMITS.login)

    if (!rateResult.success) {
      const retryAfterSecs = rateResult.retryAfter ?? Math.ceil(RATE_LIMITS.login.blockDurationMs! / 1000)
      const retryAfterMin = Math.ceil(retryAfterSecs / 60)

      return NextResponse.json(
        {
          error: `Too many login attempts. Please try again in ${retryAfterMin} minute${retryAfterMin !== 1 ? 's' : ''}.`,
          retryAfter: retryAfterSecs,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSecs) },
        }
      )
    }

    // Find user with role and optional driver
    const user = await db.user.findUnique({
      where: { email },
      include: {
        role: { select: { name: true, permissions: true } },
        driver: { select: { id: true } },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account is deactivated. Contact your administrator.' }, { status: 403 })
    }

    if (!user.password) {
      return NextResponse.json({ error: 'No password set for this account' }, { status: 401 })
    }

    // Compare password using bcrypt only
    const isPasswordValid = await comparePassword(password, user.password)

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // Parse permissions from JSON string
    let permissions: string[] = []
    try {
      permissions = JSON.parse(user.role.permissions)
    } catch {
      permissions = []
    }

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    // Generate a JWT token for the client
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      name: user.name,
      roleName: user.role.name,
      permissions,
      driverId: user.driver?.id ?? null,
      isActive: user.isActive,
    }

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '30d' })

    const userData = {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatar: user.avatar,
      role: user.role.name,
      permissions,
      driverId: user.driver?.id ?? null,
      isActive: user.isActive,
    }

    // Audit log: successful login (fire-and-forget)
    createAuditLog({
      userId: user.id,
      action: 'login',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: clientIp,
    }).catch(() => {})

    return NextResponse.json({ user: userData, token })
  } catch (error) {
    console.error('[Login] Error during login:', error instanceof Error ? error.message : error)
    console.error('[Login] Stack:', error instanceof Error ? error.stack : 'N/A')
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
