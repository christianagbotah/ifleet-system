import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

import { findDemoProfile, parseDemoProfilesConfig, toPublicDemoProfile } from '@/lib/auth/demo-runtime-config'
import { resolveDemoSessionTtl } from '@/lib/auth/demo-session'
import { db } from '@/lib/db'
import { JWT_SECRET } from '@/lib/jwt-secret'

function isDemoLoginEnabled(): boolean {
  if (process.env.DEMO_LOGIN_ENABLED !== 'true') return false
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_LOGIN_ALLOW_PRODUCTION !== 'true') return false
  return true
}

function configuredProfiles() {
  return parseDemoProfilesConfig(process.env.DEMO_PROFILES_JSON)
}

function readOnlyPermissions(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((permission): permission is string => (
      typeof permission === 'string' && permission.endsWith('.view')
    ))
  } catch {
    return []
  }
}

export async function GET() {
  if (!isDemoLoginEnabled()) {
    return NextResponse.json(
      { enabled: false, profiles: [] },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  try {
    const profiles = configuredProfiles().map(toPublicDemoProfile)
    return NextResponse.json(
      { enabled: true, profiles },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[Demo Login] Runtime configuration is invalid:', error instanceof Error ? error.message : 'unknown error')
    return NextResponse.json(
      { enabled: false, profiles: [] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isDemoLoginEnabled()) {
      return NextResponse.json({ error: 'Demo access is not enabled.' }, { status: 403 })
    }

    const profiles = configuredProfiles()
    const body = (await request.json().catch(() => null)) as { profile?: unknown } | null
    const profile = findDemoProfile(profiles, body?.profile)
    if (!profile) {
      return NextResponse.json({ error: 'Unknown demo profile.' }, { status: 400 })
    }

    const role = await db.role.findUnique({
      where: { name: profile.roleName },
      select: { name: true, permissions: true },
    })
    if (!role) {
      console.error('[Demo Login] Configured role does not exist.')
      return NextResponse.json({ error: 'Demo access is temporarily unavailable.' }, { status: 503 })
    }

    const permissions = readOnlyPermissions(role.permissions)
    const ttl = resolveDemoSessionTtl(process.env.DEMO_SESSION_TTL)
    const userId = `demo:${profile.key}`

    const token = jwt.sign(
      {
        userId,
        email: '',
        name: profile.name,
        roleName: role.name,
        permissions,
        driverId: null,
        isActive: true,
        isDemo: true,
        demoProfile: profile.key,
      },
      JWT_SECRET,
      { expiresIn: ttl as jwt.SignOptions['expiresIn'] },
    )

    const userData = {
      id: userId,
      email: '',
      name: profile.name,
      phone: null,
      avatar: null,
      role: role.name,
      permissions,
      driverId: null,
      isActive: true,
      isDemo: true,
      demoProfile: profile.key,
      demoLabel: profile.label,
      demoDescription: profile.description,
      demoCapability: profile.capability,
      position: profile.position,
      department: profile.department,
    }

    console.info('[Demo Login] Session issued', {
      profile: profile.key,
      role: role.name,
    })

    return NextResponse.json(
      { user: userData, token },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[Demo Login] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Demo login failed.' }, { status: 503 })
  }
}
