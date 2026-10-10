import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireRole, ROLES } from '@/lib/auth-server'
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
  return { ...connection, config: parseConfig(connection.config), hasSecretRef: Boolean(connection.secretRef) }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, ROLES.ADMIN)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const existing = await db.integrationConnection.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Integration connection not found.' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Payload is required.' }, { status: 400 })

  const status = typeof body.status === 'string' ? body.status.trim().toLowerCase() : existing.status
  if (!['inactive', 'active', 'error'].includes(status)) {
    return NextResponse.json({ error: 'Status must be inactive, active, or error.' }, { status: 400 })
  }

  const validation = validateIntegrationConnection({
    name: body.name ?? existing.name,
    provider: body.provider ?? existing.provider,
    type: body.type ?? existing.type,
    config: body.config ?? parseConfig(existing.config),
    secretRef: body.secretRef === undefined ? existing.secretRef : body.secretRef,
  })
  if (!validation.success) return NextResponse.json({ error: validation.errors.join(' ') }, { status: 400 })

  const updated = await db.integrationConnection.update({
    where: { id },
    data: {
      ...validation.value,
      config: JSON.stringify(validation.value.config),
      status,
      updatedBy: auth.userId,
    },
  })

  createAuditLog({
    userId: auth.userId,
    action: 'settings_change',
    entity: 'IntegrationConnection',
    entityId: id,
    details: { action: 'update', status, provider: updated.provider, type: updated.type, hasSecretRef: Boolean(updated.secretRef) },
    ipAddress: getClientIp(request),
  }).catch(() => {})

  return NextResponse.json(publicConnection(updated))
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireRole(request, ROLES.ADMIN)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const existing = await db.integrationConnection.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Integration connection not found.' }, { status: 404 })

  await db.integrationConnection.delete({ where: { id } })
  createAuditLog({
    userId: auth.userId,
    action: 'settings_change',
    entity: 'IntegrationConnection',
    entityId: id,
    details: { action: 'delete', provider: existing.provider, type: existing.type },
    ipAddress: getClientIp(request),
  }).catch(() => {})

  return NextResponse.json({ success: true })
}
