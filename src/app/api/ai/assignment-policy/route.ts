import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireRole, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { publishAssignmentPolicy } from '@/lib/domain/ai-ops/assignment-policy'

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, ROLES.ADMIN)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json().catch(() => null)
    const policy = await publishAssignmentPolicy(body, auth.userId)

    createAuditLog({
      userId: auth.userId,
      action: 'settings_change',
      entity: 'AssignmentPolicy',
      entityId: policy.id,
      details: {
        configVersion: policy.configVersion,
        modelKey: policy.modelKey,
        modelVersion: policy.modelVersion,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(policy, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to publish assignment policy'
    const status = message.includes('already exists') ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
