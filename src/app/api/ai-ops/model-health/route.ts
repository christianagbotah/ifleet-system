import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { buildModelHealthSnapshot, DEFAULT_MODEL_HEALTH_HOOKS } from '@/lib/domain/ai-ops/model-health'

function canViewModelHealth(auth: { roleName: string; permissions: string[] }): boolean {
  return auth.roleName === ROLES.ADMIN
    || auth.roleName === ROLES.MANAGER
    || auth.permissions.includes('reports.view')
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!canViewModelHealth(auth)) {
    return NextResponse.json({ error: 'Insufficient permissions to view AI model health.' }, { status: 403 })
  }

  const predictions = await db.aiPrediction.findMany({
    where: {
      OR: DEFAULT_MODEL_HEALTH_HOOKS.map((hook) => ({
        modelKey: hook.modelKey,
        modelVersion: hook.version,
      })),
    },
    select: {
      modelKey: true,
      modelVersion: true,
      dataQualityScore: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })

  const generatedAt = new Date()
  const models = buildModelHealthSnapshot({
    asOf: generatedAt,
    hooks: DEFAULT_MODEL_HEALTH_HOOKS,
    predictions,
  })

  return NextResponse.json({
    models,
    generatedAt: generatedAt.toISOString(),
    policy: {
      learnedModelsAreAdvisoryOnly: true,
      promotionRequiresOfflineGate: true,
      autonomousExecutionEnabled: false,
    },
  })
}
