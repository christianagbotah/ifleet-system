import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES, type AuthContext } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { createPortalShareToken, validatePortalShareTtlDays } from '@/lib/portal/share-token'

async function requirePortalShareWriteAccess(request: NextRequest): Promise<AuthContext | NextResponse> {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  if (auth.isDemo) {
    return NextResponse.json(
      { error: 'Demo mode is read-only. Sign in with a standard account to manage client portal links.' },
      { status: 403 },
    )
  }

  // Resolve the current database role instead of trusting potentially 30-day-old
  // JWT role/permission claims. This makes promotions and demotions immediate.
  const user = await db.user.findUnique({
    where: { id: auth.userId },
    select: {
      isActive: true,
      role: { select: { name: true, permissions: true } },
    },
  })

  if (!user?.isActive) {
    return NextResponse.json({ error: 'Account is inactive or unavailable.' }, { status: 403 })
  }

  if (user.role.name === ROLES.ADMIN) return auth

  let permissions: string[] = []
  try {
    const parsed = JSON.parse(user.role.permissions || '[]')
    if (Array.isArray(parsed) && parsed.every((permission) => typeof permission === 'string')) {
      permissions = parsed
    }
  } catch {
    permissions = []
  }

  if (!permissions.includes('portal.share')) {
    return NextResponse.json(
      { error: 'Insufficient permissions. Required: portal.share' },
      { status: 403 },
    )
  }

  return auth
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requirePortalShareWriteAccess(request)
  if (auth instanceof NextResponse) return auth

  const { clientId } = await params

  let expiresInDays = 7
  try {
    const body = await request.json().catch(() => ({})) as { expiresInDays?: unknown }
    if (body.expiresInDays !== undefined) {
      if (typeof body.expiresInDays !== 'number' || !validatePortalShareTtlDays(body.expiresInDays)) {
        return NextResponse.json(
          { error: 'expiresInDays must be a whole number between 1 and 30' },
          { status: 400 },
        )
      }
      expiresInDays = body.expiresInDays
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true, isActive: true, portalShareVersion: true },
  })

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.isActive) {
    return NextResponse.json({ error: 'Client portal is unavailable for inactive clients' }, { status: 403 })
  }

  const issued = await createPortalShareToken({
    clientId: client.id,
    issuedBy: auth.userId,
    ttlDays: expiresInDays,
    shareVersion: client.portalShareVersion,
  })

  return NextResponse.json({
    clientId: client.id,
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    path: `/portal#access=${encodeURIComponent(issued.token)}`,
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requirePortalShareWriteAccess(request)
  if (auth instanceof NextResponse) return auth

  const { clientId } = await params
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  })
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const updated = await db.client.update({
    where: { id: clientId },
    data: { portalShareVersion: { increment: 1 } },
    select: { id: true, portalShareVersion: true },
  })

  return NextResponse.json({
    clientId: updated.id,
    revoked: true,
    portalShareVersion: updated.portalShareVersion,
  })
}
