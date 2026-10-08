import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, isDriverOrAdmin, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import type { DispatchClearanceCheckKey } from '@/lib/domain/dispatch/clearance'
import { evaluateTripDispatchClearance } from '@/lib/domain/dispatch/trip-clearance'
import {
  getDefaultNextStatus,
  requiresDispatchClearance,
  type TripStatusValue,
} from '@/lib/domain/dispatch/trip-state-machine'
import { transitionTrip, TripTransitionError } from '@/lib/domain/dispatch/transition-trip'
import { dispatchTripStatusNotification } from '@/lib/services/trip-status-notifier'

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

const CLEARANCE_CHECKS = new Set<DispatchClearanceCheckKey>([
  'assignment', 'gate', 'weighing', 'documents', 'seal', 'compliance',
])

function parseClearanceOverride(
  body: Record<string, unknown>,
  auth: { userId: string; roleName: string },
) {
  if (auth.roleName === ROLES.DRIVER) return null
  const raw = body.clearanceOverride
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const reason = typeof source.reason === 'string' ? source.reason.trim() : ''
  const checks = Array.isArray(source.checks)
    ? [...new Set(source.checks.map(String).filter((check): check is DispatchClearanceCheckKey => CLEARANCE_CHECKS.has(check as DispatchClearanceCheckKey)))]
    : []
  return {
    authorized: true,
    actorRole: auth.roleName,
    actorId: auth.userId,
    reason,
    checks,
  }
}

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

    let dispatchClearance = null
    if (requiresDispatchClearance(to as TripStatusValue)) {
      const clearanceOverride = parseClearanceOverride(body, auth)
      dispatchClearance = await evaluateTripDispatchClearance(id, clearanceOverride)
      if (!dispatchClearance.passed) {
        return NextResponse.json({
          error: 'Dispatch clearance blocked',
          code: 'DISPATCH_CLEARANCE_BLOCKED',
          clearance: dispatchClearance,
        }, { status: 409 })
      }

      if (dispatchClearance.overriddenChecks.length > 0) {
        createAuditLog({
          userId: auth.userId,
          action: 'dispatch_clearance_override_applied',
          entity: 'Trip',
          entityId: id,
          details: {
            tripNumber: trip.tripNumber,
            overriddenChecks: dispatchClearance.overriddenChecks,
            reason: dispatchClearance.override?.reason ?? null,
          },
          ipAddress: getClientIp(request),
        }).catch(() => {})
      }
    }

    const result = await transitionTrip({
      tripId: id,
      to: to as TripStatusValue,
      actorId: auth.userId,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      location: typeof body.location === 'string' ? body.location.trim() || null : null,
      evidence: body.evidence && typeof body.evidence === 'object' ? body.evidence as Record<string, unknown> : null,
      metadata: {
        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata as Record<string, unknown> : {}),
        ...(dispatchClearance ? {
          dispatchClearance: {
            passed: dispatchClearance.passed,
            overriddenChecks: dispatchClearance.overriddenChecks,
          },
        } : {}),
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'status_change',
      entity: 'Trip',
      entityId: id,
      details: { tripNumber: trip.tripNumber, toStatus: result.trip.status, method: 'guarded_transition' },
      ipAddress: getClientIp(request),
    }).catch(() => {})
    dispatchTripStatusNotification(id, result.trip.status as TripStatusValue).catch((error) => {
      console.error('Trip transition notification error:', error)
    })

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
