import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, isDriverOrAdmin, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { getDefaultNextStatus, type TripStatusValue } from '@/lib/domain/dispatch/trip-state-machine'
import { transitionTrip, TripTransitionError } from '@/lib/domain/dispatch/transition-trip'

const DRIVER_ALLOWED_TARGETS = new Set<TripStatusValue>([
  'en_route_to_loading_point',
  'gate_in',
  'queued',
  'loading',
  'loaded',
  'departed_loading_point',
  'in_transit',
  'arrived_destination',
  'offloading',
  'delivered',
  'return_journey',
  'arrived_base',
  'delayed',
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const trip = await db.trip.findUnique({ where: { id }, select: { id: true, driverId: true, tripNumber: true, status: true } })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    if (!isDriverOrAdmin(auth, trip.driverId)) {
      return NextResponse.json({ error: 'You can only transition trips assigned to you' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const requestedTo = typeof body.to === 'string' ? body.to : typeof body.status === 'string' ? body.status : ''
    const to = requestedTo || getDefaultNextStatus(trip.status as TripStatusValue)
    if (!to) return NextResponse.json({ error: `Trip in ${trip.status} requires an explicit transition` }, { status: 400 })

    if (auth.roleName === ROLES.DRIVER && !DRIVER_ALLOWED_TARGETS.has(to as TripStatusValue)) {
      return NextResponse.json({ error: `Driver cannot transition a trip to ${to}` }, { status: 403 })
    }

    const result = await transitionTrip({
      tripId: id,
      to: to as TripStatusValue,
      actorId: auth.userId,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      location: typeof body.location === 'string' ? body.location.trim() || null : null,
      evidence: body.evidence && typeof body.evidence === 'object' ? body.evidence as Record<string, unknown> : null,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : null,
    })

    createAuditLog({
      userId: auth.userId,
      action: 'status_change',
      entity: 'Trip',
      entityId: id,
      details: { tripNumber: trip.tripNumber, toStatus: result.trip.status, method: 'guarded_transition' },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(result.trip)
  } catch (error) {
    if (error instanceof TripTransitionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.code === 'NOT_FOUND' ? 404 : 409 }
      )
    }
    console.error('Trip transition error:', error)
    return NextResponse.json({ error: 'Failed to transition trip' }, { status: 500 })
  }
}
