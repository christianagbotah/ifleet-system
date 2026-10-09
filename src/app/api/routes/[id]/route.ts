import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { validateRoutePoints } from '@/lib/domain/routing/route-plan'

interface RouteContext {
  params: Promise<{ id: string }>
}

const ALLOWED_ROUTE_STATUSES = new Set(['active', 'inactive', 'superseded'])

export async function GET(request: NextRequest, context: RouteContext) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await context.params
  const route = await db.plannedRoute.findUnique({ where: { id } })
  if (!route) return NextResponse.json({ error: 'Planned route not found' }, { status: 404 })
  return NextResponse.json({ data: { ...route, points: JSON.parse(route.pointsJson) } })
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await context.params
  const existing = await db.plannedRoute.findUnique({
    where: { id },
    select: { id: true, tripId: true },
  })
  if (!existing) return NextResponse.json({ error: 'Planned route not found' }, { status: 404 })

  const body = await request.json() as Record<string, unknown>
  const validation = body.points === undefined ? null : validateRoutePoints(body.points)
  if (validation && !validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

  const toleranceMeters = body.toleranceMeters === undefined
    ? undefined
    : typeof body.toleranceMeters === 'number' && Number.isFinite(body.toleranceMeters)
      ? Math.round(body.toleranceMeters)
      : Number.NaN
  if (toleranceMeters !== undefined && (!Number.isFinite(toleranceMeters) || toleranceMeters < 10 || toleranceMeters > 50_000)) {
    return NextResponse.json({ error: 'Invalid route tolerance.' }, { status: 400 })
  }

  const requestedStatus = body.status === undefined
    ? undefined
    : typeof body.status === 'string'
      ? body.status.trim()
      : ''
  if (requestedStatus !== undefined && !ALLOWED_ROUTE_STATUSES.has(requestedStatus)) {
    return NextResponse.json({ error: 'Invalid route status.' }, { status: 400 })
  }

  const data = {
    ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
    ...(validation?.ok ? { pointsJson: JSON.stringify(validation.points) } : {}),
    ...(toleranceMeters !== undefined ? { toleranceMeters } : {}),
    ...(requestedStatus !== undefined ? { status: requestedStatus } : {}),
  }

  const route = requestedStatus === 'active'
    ? await db.$transaction(async (tx) => {
        await tx.plannedRoute.updateMany({
          where: {
            tripId: existing.tripId,
            status: 'active',
            id: { not: id },
          },
          data: { status: 'superseded' },
        })
        return tx.plannedRoute.update({ where: { id }, data })
      }, { isolationLevel: 'Serializable' })
    : await db.plannedRoute.update({ where: { id }, data })

  return NextResponse.json({ data: { ...route, points: JSON.parse(route.pointsJson) } })
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard
  const { id } = await context.params

  const route = await db.plannedRoute.update({ where: { id }, data: { status: 'inactive' } })
  return NextResponse.json({ data: route })
}
