import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, isDriverOrAdmin, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { evaluateTripDeliveryReadiness } from '@/lib/domain/delivery/delivery-readiness'
import { validateDriverEvidenceRefs } from '@/lib/domain/evidence/driver-evidence-server'
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

const DRIVER_MUTATION_ID_PATTERN = /^[A-Za-z0-9-]{8,191}$/

function stableJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`
}

function statusPayloadHash(input: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(input)).digest('hex')
}

function readDriverReplayPayloadHash(metadata: string | null): string | null {
  if (!metadata) return null
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    const driverReplay = parsed?.driverReplay
    if (!driverReplay || typeof driverReplay !== 'object' || Array.isArray(driverReplay)) return null
    const payloadHash = (driverReplay as Record<string, unknown>).payloadHash
    return typeof payloadHash === 'string' && payloadHash ? payloadHash : null
  } catch {
    return null
  }
}

function statusEvidencePhotos(evidence: Record<string, unknown> | null): string[] {
  if (!evidence || !Array.isArray(evidence.photos)) return []
  return evidence.photos.filter((photo): photo is string => typeof photo === 'string' && photo.trim().length > 0)
}

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
    const requestedTo = typeof body.to === 'string' ? body.to.trim() : typeof body.status === 'string' ? body.status.trim() : ''
    const clientMutationId = typeof body.clientMutationId === 'string' ? body.clientMutationId.trim() : ''
    const notes = typeof body.notes === 'string' ? body.notes.trim() || null : null
    const location = typeof body.location === 'string' ? body.location.trim() || null : null
    const submittedEvidence = body.evidence && typeof body.evidence === 'object' && !Array.isArray(body.evidence)
      ? body.evidence as Record<string, unknown>
      : null
    const rawUserMetadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {}
    const userMetadata = auth.roleName === ROLES.DRIVER ? {} : rawUserMetadata

    if (auth.roleName === ROLES.DRIVER && submittedEvidence) {
      const unsupportedKeys = Object.keys(submittedEvidence).filter((key) => key !== 'photos')
      const rawPhotos = submittedEvidence.photos
      const invalidPhotos = rawPhotos !== undefined && (
        !Array.isArray(rawPhotos)
        || rawPhotos.some((photo) => typeof photo !== 'string' || !photo.trim())
      )
      if (unsupportedKeys.length > 0 || invalidPhotos) {
        return NextResponse.json({ error: 'Driver status evidence only supports photo references' }, { status: 400 })
      }
    }
    const photoRefs = auth.roleName === ROLES.DRIVER ? statusEvidencePhotos(submittedEvidence) : []
    const evidence = auth.roleName === ROLES.DRIVER
      ? (photoRefs.length > 0 ? { photos: photoRefs } : null)
      : submittedEvidence
    const payloadHash = statusPayloadHash({
      requestedTo: requestedTo || null,
      notes,
      location,
      evidence,
      metadata: userMetadata,
    })

    if (auth.roleName === ROLES.DRIVER && !clientMutationId) {
      return NextResponse.json({ error: 'clientMutationId is required for driver status updates' }, { status: 400 })
    }
    if (clientMutationId && !DRIVER_MUTATION_ID_PATTERN.test(clientMutationId)) {
      return NextResponse.json({ error: 'clientMutationId is invalid' }, { status: 400 })
    }
    if (clientMutationId) {
      const replay = await db.tripEvent.findUnique({
        where: { clientMutationId },
        include: { trip: true },
      })
      if (replay) {
        if (replay.tripId !== id) {
          return NextResponse.json({ error: 'clientMutationId was already used for another trip' }, { status: 409 })
        }
        if (auth.roleName === ROLES.DRIVER) {
          if (replay.userId !== auth.userId || readDriverReplayPayloadHash(replay.metadata) !== payloadHash) {
            return NextResponse.json({ error: 'clientMutationId has already been used for a different status update' }, { status: 409 })
          }
        }
        return NextResponse.json({ ...replay.trip, replayed: true })
      }
    }

    if (auth.roleName === ROLES.DRIVER) {
      if (photoRefs.length > 5) {
        return NextResponse.json({ error: 'A maximum of 5 status evidence photos is allowed' }, { status: 400 })
      }
      if (photoRefs.length > 0 && (!auth.driverId || !(await validateDriverEvidenceRefs(
        { userId: auth.userId, driverId: auth.driverId },
        id,
        photoRefs,
      )))) {
        return NextResponse.json({ error: 'Status evidence is invalid or does not belong to this driver/trip' }, { status: 409 })
      }
    }

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

    if (to === 'delivered') {
      const deliveryReadiness = await evaluateTripDeliveryReadiness(id)
      if (!deliveryReadiness.passed) {
        return NextResponse.json({
          error: 'Proof of delivery is required for every delivery destination before this trip can be marked delivered.',
          code: 'POD_REQUIRED',
          deliveryReadiness,
        }, { status: 409 })
      }
    }

    const result = await transitionTrip({
      tripId: id,
      to: to as TripStatusValue,
      actorId: auth.userId,
      clientMutationId: clientMutationId || null,
      notes,
      location,
      evidence,
      metadata: {
        ...userMetadata,
        ...(auth.roleName === ROLES.DRIVER ? { driverReplay: { payloadHash } } : {}),
        ...(dispatchClearance ? {
          dispatchClearance: {
            passed: dispatchClearance.passed,
            overriddenChecks: dispatchClearance.overriddenChecks,
          },
        } : {}),
      },
    })

    if (!result.replayed) {
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
    }

    return NextResponse.json(result.replayed ? { ...result.trip, replayed: true } : result.trip)
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
