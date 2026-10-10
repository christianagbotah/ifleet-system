import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { createFuelReviewCase } from '@/lib/domain/ai-ops/fuel-review'
import { analyzeFuelLogForReview } from '@/lib/domain/ai-ops/fuel-review-service'
import { PrismaFuelReviewRepository } from '@/lib/domain/ai-ops/prisma-fuel-review-repository'

function canViewFuelReview(auth: { roleName: string; permissions: string[] }): boolean {
  return auth.roleName === ROLES.ADMIN
    || auth.roleName === ROLES.MANAGER
    || auth.permissions.some((permission) => ['fuel.view', 'financial.view', 'reports.view'].includes(permission))
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!canViewFuelReview(auth)) {
    return NextResponse.json({ error: 'Insufficient permissions to review fuel intelligence.' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50)))

  const cases = await db.aiReviewCase.findMany({
    where: {
      caseType: 'fuel_anomaly',
      ...(status && status !== 'all' ? { status } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: limit,
  })

  return NextResponse.json({ cases })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const body = await request.json().catch(() => null) as { fuelLogId?: string } | null
  const fuelLogId = body?.fuelLogId?.trim()
  if (!fuelLogId) return NextResponse.json({ error: 'fuelLogId is required' }, { status: 400 })

  const analysis = await analyzeFuelLogForReview(fuelLogId)
  if (!analysis) return NextResponse.json({ error: 'Fuel log not found' }, { status: 404 })

  const result = await createFuelReviewCase(analysis, {
    repository: new PrismaFuelReviewRepository(),
  })

  if (result.created && result.case) {
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'AiReviewCase',
      entityId: result.case.id,
      details: { caseType: 'fuel_anomaly', fuelLogId, modelKey: 'deterministic-fuel-anomaly' },
      ipAddress: getClientIp(request),
    }).catch(() => {})
  }

  return NextResponse.json({
    assessment: analysis.assessment,
    dataQuality: analysis.dataQuality,
    reviewCase: result.case,
    created: result.created,
  }, { status: result.created ? 201 : 200 })
}
