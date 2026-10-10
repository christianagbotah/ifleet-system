import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import {
  resolveFuelReviewCase,
  type FuelReviewAction,
} from '@/lib/domain/ai-ops/fuel-review'
import { PrismaFuelReviewRepository } from '@/lib/domain/ai-ops/prisma-fuel-review-repository'

const ACTIONS = new Set<FuelReviewAction>([
  'confirm_data_error',
  'explain',
  'dismiss',
  'escalate',
])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const body = await request.json().catch(() => null) as { action?: string; note?: string } | null
  const action = body?.action as FuelReviewAction | undefined
  if (!action || !ACTIONS.has(action)) {
    return NextResponse.json({ error: 'Invalid review action' }, { status: 400 })
  }

  const { id } = await params
  try {
    const reviewCase = await resolveFuelReviewCase(id, {
      action,
      note: body?.note ?? '',
      userId: auth.userId,
      now: new Date(),
    }, { repository: new PrismaFuelReviewRepository() })

    createAuditLog({
      userId: auth.userId,
      action: action === 'dismiss' ? 'rejection' : 'update',
      entity: 'AiReviewCase',
      entityId: id,
      details: { caseType: 'fuel_anomaly', action, note: body?.note ?? '' },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ reviewCase })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update fuel review case'
    const status = message.includes('not found') ? 404 : 409
    return NextResponse.json({ error: message }, { status })
  }
}
