import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

import { comparePassword } from '@/lib/auth-utils'
import { createAuditLog } from '@/lib/audit'
import { db } from '@/lib/db'
import { JWT_SECRET } from '@/lib/jwt-secret'
import {
  getClientIp as getClientIpFromRateLimit,
  getRateLimitStatus,
  rateLimit,
  rateLimitHeaders,
  RATE_LIMITS,
  resetRateLimit,
} from '@/lib/rate-limit'
import { loginSchema, parseBody } from '@/lib/schemas'

const ENDPOINT_KEY = 'auth/login'

function limitedResponse(
  result: ReturnType<typeof rateLimit>,
  config: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS],
  message: string,
) {
  const retryAfterSecs = result.retryAfter ?? Math.ceil((config.blockDurationMs ?? config.windowMs) / 1000)
  const retryAfterMin = Math.max(1, Math.ceil(retryAfterSecs / 60))

  return NextResponse.json(
    {
      error: `${message} Please try again in ${retryAfterMin} minute${retryAfterMin !== 1 ? 's' : ''}.`,
      retryAfter: retryAfterSecs,
    },
    {
      status: 429,
      headers: rateLimitHeaders({ ...result, retryAfter: retryAfterSecs }, config),
    },
  )
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json()
    const parsed = parseBody(loginSchema, raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 })
    }

    const { password } = parsed.data
    const email = parsed.data.email
    const normalizedEmail = email.trim().toLowerCase()
    const clientIp = getClientIpFromRateLimit(request)

    // Coarse resource protection. This intentionally counts every login POST,
    // while the stricter bucket below counts only failed credentials.
    const requestKey = `${clientIp}:${ENDPOINT_KEY}:request`
    const requestResult = rateLimit(requestKey, RATE_LIMITS.loginRequest)
    if (!requestResult.success) {
      return limitedResponse(requestResult, RATE_LIMITS.loginRequest, 'Too many login requests.')
    }

    // Check a credential-failure bucket without consuming an attempt. Failed
    // credentials increment this bucket later; successful auth clears it.
    const failureKey = `${clientIp}:${ENDPOINT_KEY}:failure:${normalizedEmail}`
    const failureStatus = getRateLimitStatus(failureKey, RATE_LIMITS.loginFailure)
    if (!failureStatus.success) {
      return limitedResponse(failureStatus, RATE_LIMITS.loginFailure, 'Too many login attempts.')
    }

    const recordCredentialFailure = () => {
      const failed = rateLimit(failureKey, RATE_LIMITS.loginFailure)
      if (!failed.success) {
        return limitedResponse(failed, RATE_LIMITS.loginFailure, 'Too many login attempts.')
      }
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        role: { select: { name: true, permissions: true } },
        driver: { select: { id: true } },
      },
    })

    if (!user) {
      return recordCredentialFailure()
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account is deactivated. Contact your administrator.' }, { status: 403 })
    }

    if (!user.password) {
      return recordCredentialFailure()
    }

    const isPasswordValid = await comparePassword(password, user.password)
    if (!isPasswordValid) {
      return recordCredentialFailure()
    }

    resetRateLimit(failureKey)

    let permissions: string[] = []
    try {
      permissions = JSON.parse(user.role.permissions)
    } catch {
      permissions = []
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

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
