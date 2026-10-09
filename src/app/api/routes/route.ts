import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { validateRoutePoints } from '@/lib/domain/routing/route-plan'

export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const url = new URL(request.url)
  const tripId = url.searchParams.get('tripId')?.trim()
  const status = url.searchParams.get('status')?.trim()

  const routes = await db.plannedRoute.findMany({
    where: {
      ...(tripId ? { tripId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { updatedAt: 'desc' },
  })

  return NextResponse.json({ data: routes.map((route) => ({
    ...route,
    points: JSON.parse(route.pointsJson),
  })) })
}

export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const body = await request.json() as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : ''
  const toleranceMeters = typeof body.toleranceMeters === 'number' && Number.isFinite(body.toleranceMeters)
    ? Math.round(body.toleranceMeters)
    : 500
  const validation = validateRoutePoints(body.points)

  if (!name || !tripId || !validation.ok || toleranceMeters < 10 || toleranceMeters > 50_000) {
    return NextResponse.json({ error: validation.error || 'name, tripId and a valid tolerance are required.' }, { status: 400 })
  }

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: { id: true, truckId: true },
  })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const route = await db.$transaction(async (tx) => {
    await tx.plannedRoute.updateMany({ where: { tripId, status: 'active' }, data: { status: 'superseded' } })
    return tx.plannedRoute.create({
      data: {
        name,
        tripId,
        assetType: 'tractor',
        assetId: trip.truckId,
        pointsJson: JSON.stringify(validation.points),
        toleranceMeters,
        status: 'active',
        createdById: auth.userId,
      },
    })
  }, { isolationLevel: 'Serializable' })

  return NextResponse.json({ data: { ...route, points: validation.points } }, { status: 201 })
}
