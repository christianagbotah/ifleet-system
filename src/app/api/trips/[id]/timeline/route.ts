import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

function parseArray(value: string | null): string[] {
  if (!value) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : [] } catch { return [] }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const trip = await db.trip.findUnique({ where: { id }, select: { id: true, driverId: true } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
  if (auth.roleName === ROLES.DRIVER && auth.driverId !== trip.driverId) {
    return NextResponse.json({ error: 'You can only view your assigned trip timeline.' }, { status: 403 })
  }

  const [events, legacyEvents] = await Promise.all([
    db.operationalEvent.findMany({ where: { tripId: id }, orderBy: [{ occurredAt: 'asc' }, { receivedAt: 'asc' }, { createdAt: 'asc' }] }),
    db.tripEvent.findMany({ where: { tripId: id }, orderBy: { createdAt: 'asc' } }),
  ])
  const coveredLegacyIds = new Set(events.map((event) => parseObject(event.metadata).legacyTripEventId).filter((value): value is string => typeof value === 'string'))

  return NextResponse.json({
    data: [
      ...events.map((event) => ({ ...event, metadata: parseObject(event.metadata), evidenceRefs: parseArray(event.evidenceRefs), legacy: false })),
      ...legacyEvents.filter((event) => !coveredLegacyIds.has(event.id)).map((event) => ({
        id: `legacy:${event.id}`,
        idempotencyKey: `legacy:${event.id}`,
        eventKey: `trip.${event.toStatus}`,
        type: 'trip.status_changed',
        entityType: 'Trip',
        entityId: id,
        tripId: id,
        actorType: event.userId ? 'user' : null,
        actorId: event.userId,
        occurredAt: event.createdAt,
        receivedAt: event.createdAt,
        latitude: null,
        longitude: null,
        evidenceRefs: [],
        metadata: { fromStatus: event.fromStatus, toStatus: event.toStatus, notes: event.notes, location: event.location, ...parseObject(event.metadata) },
        source: 'legacy-trip-event',
        supersedesEventId: null,
        createdAt: event.createdAt,
        legacy: true,
      })),
    ].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
  })
}
