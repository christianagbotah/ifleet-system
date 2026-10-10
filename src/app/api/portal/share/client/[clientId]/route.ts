import { NextRequest, NextResponse } from 'next/server'

import { requirePermission } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { createPortalShareToken, validatePortalShareTtlDays } from '@/lib/portal/share-token'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = requirePermission(request, 'trips.view')
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
    select: { id: true, isActive: true },
  })

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  if (!client.isActive) {
    return NextResponse.json({ error: 'Client portal is unavailable for inactive clients' }, { status: 403 })
  }

  const issued = await createPortalShareToken({
    clientId: client.id,
    issuedBy: auth.userId,
    ttlDays: expiresInDays,
  })

  return NextResponse.json({
    clientId: client.id,
    token: issued.token,
    expiresAt: issued.expiresAt.toISOString(),
    path: `/portal#access=${encodeURIComponent(issued.token)}`,
  })
}
