import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

import { createAuditLog } from '@/lib/audit'
import { db } from '@/lib/db'
import { JWT_SECRET } from '@/lib/jwt-secret'
import { getClientIp, rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import {
  findQaProfile,
  parseQaProfilesConfig,
  toPublicQaProfile,
} from '@/lib/auth/qa-runtime-config'

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' }
const ENDPOINT_KEY = 'auth/qa-login'

function qaLoginEnabled(): boolean {
  if (process.env.QA_LOGIN_ENABLED !== 'true') return false
  if (process.env.NODE_ENV === 'production' && process.env.QA_LOGIN_ALLOW_PRODUCTION !== 'true') {
    return false
  }
  return true
}

function disabledResponse() {
  return NextResponse.json(
    { enabled: false, profiles: [] },
    { status: 200, headers: NO_STORE_HEADERS },
  )
}

function loadProfiles() {
  return parseQaProfilesConfig(process.env.QA_PROFILES_JSON)
}

export async function GET() {
  if (!qaLoginEnabled()) return disabledResponse()

  try {
    const profiles = loadProfiles().map(toPublicQaProfile)
    return NextResponse.json(
      { enabled: true, profiles },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    console.error('[QA Login] Runtime configuration is invalid:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { enabled: false, profiles: [], error: 'QA test accounts are unavailable.' },
      { status: 503, headers: NO_STORE_HEADERS },
    )
  }
}

export async function POST(request: NextRequest) {
  if (!qaLoginEnabled()) {
    return NextResponse.json(
      { error: 'QA test-account login is disabled.' },
      { status: 403, headers: NO_STORE_HEADERS },
    )
  }

  const clientIp = getClientIp(request)
  const requestLimit = rateLimit(`${clientIp}:${ENDPOINT_KEY}`, RATE_LIMITS.loginRequest)
  if (!requestLimit.success) {
    return NextResponse.json(
      { error: 'Too many QA login requests. Please try again shortly.' },
      { status: 429, headers: NO_STORE_HEADERS },
    )
  }

  try {
    const profiles = loadProfiles()
    const body = await request.json().catch(() => ({})) as { profile?: unknown }
    const profile = findQaProfile(profiles, body.profile)

    if (!profile) {
      return NextResponse.json(
        { error: 'Unknown QA test account.' },
        { status: 400, headers: NO_STORE_HEADERS },
      )
    }

    const user = await db.user.findUnique({
      where: { email: profile.email },
      include: {
        role: { select: { name: true, permissions: true } },
        driver: { select: { id: true } },
      },
    })

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'This QA test account is unavailable. Run the QA bootstrap or contact an administrator.' },
        { status: 503, headers: NO_STORE_HEADERS },
      )
    }

    if (user.role.name !== profile.roleName) {
      return NextResponse.json(
        { error: 'QA account role does not match its configured test profile.' },
        { status: 503, headers: NO_STORE_HEADERS },
      )
    }

    if (profile.roleName === 'Driver') {
      if (!user.driver?.id) {
        return NextResponse.json(
          { error: 'The QA Driver account is not linked to a driver profile.' },
          { status: 503, headers: NO_STORE_HEADERS },
        )
      }
      if (profile.driverId && user.driver.id !== profile.driverId) {
        return NextResponse.json(
          { error: 'The QA Driver account is linked to the wrong driver profile.' },
          { status: 503, headers: NO_STORE_HEADERS },
        )
      }
    }

    let permissions: string[] = []
    try {
      const parsed = JSON.parse(user.role.permissions || '[]')
      permissions = Array.isArray(parsed)
        ? parsed.filter((permission): permission is string => typeof permission === 'string')
        : []
    } catch {
      permissions = []
    }

    await db.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    })

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        roleName: user.role.name,
        permissions,
        driverId: user.driver?.id ?? null,
        isActive: user.isActive,
        isQa: true,
        qaProfile: profile.key,
      },
      JWT_SECRET,
      { expiresIn: '8h' },
    )

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
      isQa: true,
      qaProfile: profile.key,
      position: user.position,
      department: user.department,
    }

    createAuditLog({
      userId: user.id,
      action: 'qa_login',
      entity: 'User',
      entityId: user.id,
      details: { profile: profile.key, roleName: user.role.name },
      ipAddress: clientIp,
    }).catch(() => {})

    return NextResponse.json(
      { user: userData, token },
      { headers: NO_STORE_HEADERS },
    )
  } catch (error) {
    console.error('[QA Login] Failed:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      { error: 'QA test-account login failed.' },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}
