import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { isDemoProfileId, type DemoProfileId } from '@/lib/auth/demo-profiles'
import { getDemoIdentityConfig } from '@/lib/auth/demo-server'
import { db } from '@/lib/db'
import { JWT_SECRET } from '@/lib/jwt-secret'

const DEMO_SESSION_TTL = '8h'

export async function GET() {
  return NextResponse.json(
    { enabled: process.env.DEMO_LOGIN_ENABLED === 'true' },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

async function ensureDemoUser(profile: DemoProfileId) {
  const identity = getDemoIdentityConfig(profile)
  const role = await db.role.findUnique({
    where: { name: identity.roleName },
    select: { id: true, name: true, permissions: true },
  })

  if (!role) {
    throw new Error(`Demo role is not configured: ${identity.roleName}`)
  }

  let user = await db.user.upsert({
    where: { email: identity.email },
    update: {
      name: identity.name,
      password: null,
      roleId: role.id,
      position: identity.position,
      department: identity.department,
      employeeNumber: identity.employeeNumber,
      isActive: true,
    },
    create: {
      email: identity.email,
      name: identity.name,
      password: null,
      roleId: role.id,
      position: identity.position,
      department: identity.department,
      employeeNumber: identity.employeeNumber,
      isActive: true,
    },
    include: {
      role: { select: { name: true, permissions: true } },
      driver: { select: { id: true } },
    },
  })

  if (profile === 'driver' && !user.driver) {
    await db.driver.upsert({
      where: { employeeId: 'DEMO-DRV-001' },
      update: {
        userId: user.id,
        status: 'active',
        verificationStatus: 'verified',
      },
      create: {
        userId: user.id,
        firstName: 'Demo',
        lastName: 'Driver',
        phone: '+233200000099',
        email: 'demo.driver.profile@ifleetpro.local',
        employeeId: 'DEMO-DRV-001',
        ghanaCardNumber: 'DEMO-GHA-000000001',
        ghanaCardExpiry: new Date('2035-12-31T00:00:00.000Z'),
        licenseNumber: 'DEMO-LIC-000001',
        licenseExpiry: new Date('2035-12-31T00:00:00.000Z'),
        licenseClass: 'C',
        verificationStatus: 'verified',
        status: 'active',
        hireDate: new Date('2026-01-01T00:00:00.000Z'),
      },
    })

    const refreshed = await db.user.findUnique({
      where: { id: user.id },
      include: {
        role: { select: { name: true, permissions: true } },
        driver: { select: { id: true } },
      },
    })
    if (refreshed) user = refreshed
  }

  return user
}

export async function POST(request: NextRequest) {
  try {
    if (process.env.DEMO_LOGIN_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Demo access is not enabled.' }, { status: 403 })
    }

    const body = (await request.json().catch(() => null)) as { profile?: unknown } | null
    if (!body || !isDemoProfileId(body.profile)) {
      return NextResponse.json({ error: 'Unknown demo profile.' }, { status: 400 })
    }

    const profile = body.profile
    const user = await ensureDemoUser(profile)
    if (!user?.email) {
      return NextResponse.json({ error: 'Demo identity could not be prepared.' }, { status: 503 })
    }

    let permissions: string[] = []
    try {
      permissions = JSON.parse(user.role.permissions)
    } catch {
      permissions = []
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        roleName: user.role.name,
        permissions,
        driverId: user.driver?.id ?? null,
        isActive: user.isActive,
        isDemo: true,
        demoProfile: profile,
      },
      JWT_SECRET,
      { expiresIn: DEMO_SESSION_TTL },
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
      isDemo: true,
      demoProfile: profile,
    }

    createAuditLog({
      userId: user.id,
      action: 'demo_login',
      entity: 'User',
      entityId: user.id,
      details: { profile },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ user: userData, token })
  } catch (error) {
    console.error('[Demo Login] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Demo login failed.' }, { status: 500 })
  }
}
