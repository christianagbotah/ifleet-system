import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, requireRole, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { validateIntegrationConnection } from '@/lib/domain/integrations/connection'

function parseConfig(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function publicConnection(connection: {
  id: string
  name: string
  provider: string
  type: string
  config: string
  secretRef: string | null
  status: string
  lastSuccessAt: Date | null
  lastErrorAt: Date | null
  lastError: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    ...connection,
    config: parseConfig(connection.config),
    hasSecretRef: Boolean(connection.secretRef),
  }
}

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  if (![ROLES.ADMIN, ROLES.MANAGER].includes(auth.roleName as typeof ROLES.ADMIN | typeof ROLES.MANAGER)) {
    return NextResponse.json({ error: 'Insufficient permissions.' }, { status: 403 })
  }

  const connections = await db.integrationConnection.findMany({ orderBy: [{ provider: 'asc' }, { name: 'asc' }] })
  return NextResponse.json(connections.map(publicConnection))
}

export async function POST(request: NextRequest) {
  const auth = requireRole(request, ROLES.ADMIN)
  if (auth instanceof NextResponse) return auth

  const body = await request.json().catch(() => null)
  const validation = validateIntegrationConnection(body ?? {})
  if (!validation.success) return NextResponse.json({ error: validation.errors.join(' ') }, { status: 400 })

  const created = await db.integrationConnection.create({
    data: {
      ...validation.value,
      config: JSON.stringify(validation.value.config),
      status: 'inactive',
      createdBy: auth.userId,
      updatedBy: auth.userId,
    },
  })

  createAuditLog({
    userId: auth.userId,
    action: 'settings_change',
    entity: 'IntegrationConnection',
    entityId: created.id,
    details: { action: 'create', provider: created.provider, type: created.type, hasSecretRef: Boolean(created.secretRef) },
    ipAddress: getClientIp(request),
  }).catch(() => {})

  return NextResponse.json(publicConnection(created), { status: 201 })
}
