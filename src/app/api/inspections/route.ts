import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'

const inspectionInclude = {
  truck: { select: { id: true, plateNumber: true, make: true, model: true } },
  driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
  trip: { select: { id: true, tripNumber: true } },
} as const

type InspectionReplayMetadata = {
  truckId?: string
  driverId?: string | null
  tripId?: string | null
  type?: string
}

function parseReplayMetadata(value: string | null): InspectionReplayMetadata {
  if (!value) return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as InspectionReplayMetadata
      : {}
  } catch {
    return {}
  }
}

function replayMatches(
  metadata: InspectionReplayMetadata,
  input: { truckId: string; driverId?: string | null; tripId?: string | null; type: string },
) {
  return metadata.truckId === input.truckId
    && (metadata.driverId ?? null) === (input.driverId ?? null)
    && (metadata.tripId ?? null) === (input.tripId ?? null)
    && metadata.type === input.type
}

const DRIVER_EVIDENCE_REF_PATTERN = /^\/uploads\/images\/driver-evidence-([A-Za-z0-9-]{8,128})-\d+\.(?:jpg|png|webp)$/

function parseEvidenceRefs(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

async function validateDriverEvidenceRefs(
  auth: { userId: string; driverId: string },
  tripId: string | null,
  photoRefs: string[],
): Promise<boolean> {
  const refsByMutation = new Map<string, string[]>()
  for (const ref of photoRefs) {
    const match = DRIVER_EVIDENCE_REF_PATTERN.exec(ref)
    if (!match) return false
    const evidenceMutationId = match[1]
    const refs = refsByMutation.get(evidenceMutationId) ?? []
    refs.push(ref)
    refsByMutation.set(evidenceMutationId, refs)
  }

  for (const [evidenceMutationId, refs] of refsByMutation) {
    const event = await db.operationalEvent.findUnique({
      where: { idempotencyKey: `driver-evidence-upload:${evidenceMutationId}` },
    })
    if (!event || event.actorId !== auth.userId || event.entityType !== 'driver_evidence_upload') return false
    const metadata = parseReplayMetadata(event.metadata)
    if (metadata.driverId !== auth.driverId || (metadata.tripId ?? null) !== tripId) return false
    const eventRefs = new Set(parseEvidenceRefs(event.evidenceRefs))
    if (refs.some((ref) => !eventRefs.has(ref))) return false
  }
  return true
}

async function findInspectionReplay(
  mutationId: string,
  input: { truckId: string; driverId?: string | null; tripId?: string | null; type: string },
) {
  const idempotencyKey = `driver-inspection:${mutationId}`
  const event = await db.operationalEvent.findUnique({ where: { idempotencyKey } })
  if (!event) return null

  const metadata = parseReplayMetadata(event.metadata)
  if (!replayMatches(metadata, input)) {
    return NextResponse.json(
      { error: 'clientMutationId has already been used for a different inspection' },
      { status: 409 },
    )
  }

  const inspection = await db.vehicleInspection.findUnique({
    where: { id: event.entityId },
    include: inspectionInclude,
  })
  if (!inspection) {
    return NextResponse.json(
      { error: 'Inspection replay record is unavailable' },
      { status: 409 },
    )
  }

  return NextResponse.json({ ...inspection, replayed: true })
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const driverId = searchParams.get('driverId')
    const type = searchParams.get('type')
    const result = searchParams.get('result')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (auth.roleName === ROLES.DRIVER) {
      if (!auth.driverId) {
        return NextResponse.json({ error: 'Driver profile is not linked' }, { status: 403 })
      }
      where.driverId = auth.driverId
    } else if (driverId) {
      where.driverId = driverId
    }
    if (type) where.type = type
    if (result) where.result = result

    if (dateFrom || dateTo) {
      where.inspectionDate = {}
      if (dateFrom) (where.inspectionDate as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.inspectionDate as Record<string, unknown>).lte = new Date(dateTo + 'T23:59:59')
    }

    const [records, total] = await Promise.all([
      db.vehicleInspection.findMany({
        where,
        include: inspectionInclude,
        orderBy: { inspectionDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.vehicleInspection.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Inspections list error:', error)
    return NextResponse.json({ error: 'Failed to fetch inspections' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()

    const {
      truckId,
      driverId,
      tripId,
      type,
      odometerReading,
      overallNotes,
      checkItems,
      photos,
      inspectorName,
      signature,
      location,
      latitude,
      longitude,
      requiresFollowUp,
      followUpNotes,
      clientMutationId,
    } = body

    if (!truckId || !type) {
      return NextResponse.json(
        { error: 'truckId and type are required' },
        { status: 400 }
      )
    }

    if (!['pre_trip', 'post_trip'].includes(type)) {
      return NextResponse.json(
        { error: 'type must be pre_trip or post_trip' },
        { status: 400 }
      )
    }

    const mutationId = typeof clientMutationId === 'string' ? clientMutationId.trim() : ''
    if (auth.roleName === ROLES.DRIVER && !mutationId) {
      return NextResponse.json({ error: 'clientMutationId is required for driver inspections' }, { status: 400 })
    }
    if (mutationId && !/^[A-Za-z0-9-]{8,128}$/.test(mutationId)) {
      return NextResponse.json({ error: 'clientMutationId is invalid' }, { status: 400 })
    }

    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    let effectiveDriverId = driverId ? String(driverId) : null
    if (auth.roleName === ROLES.DRIVER) {
      if (auth.isDemo) {
        return NextResponse.json({ error: 'Demo mode is read-only. Sign in with a standard account to make changes.' }, { status: 403 })
      }
      if (!auth.driverId) {
        return NextResponse.json({ error: 'Driver profile is not linked' }, { status: 403 })
      }
      if (!tripId && truck.driverId !== auth.driverId) {
        return NextResponse.json({ error: 'You can only inspect trucks assigned to you' }, { status: 403 })
      }
      effectiveDriverId = auth.driverId
    } else {
      const writeGuard = requireWriteAccess(auth)
      if (writeGuard instanceof NextResponse) return writeGuard
    }

    if (tripId) {
      const trip = await db.trip.findUnique({
        where: { id: String(tripId) },
        select: { id: true, truckId: true, driverId: true },
      })
      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
      }
      if (trip.truckId !== truckId) {
        return NextResponse.json({ error: 'Trip is not assigned to this truck' }, { status: 409 })
      }
      if (auth.roleName === ROLES.DRIVER && trip.driverId !== auth.driverId) {
        return NextResponse.json({ error: 'You can only inspect trips assigned to you' }, { status: 403 })
      }
      if (effectiveDriverId && trip.driverId && effectiveDriverId !== trip.driverId) {
        return NextResponse.json({ error: 'Inspection driver does not match the trip driver' }, { status: 409 })
      }
      effectiveDriverId = effectiveDriverId || trip.driverId || null
    }

    const replayIdentity = {
      truckId: String(truckId),
      driverId: effectiveDriverId,
      tripId: tripId ? String(tripId) : null,
      type: String(type),
    }

    if (mutationId) {
      const replay = await findInspectionReplay(mutationId, replayIdentity)
      if (replay) return replay
    }

    let parsedItems: { name: string; category: string; status: string; notes?: string; severity?: string }[] = []
    let totalChecks = 0
    let passCount = 0
    let warningCount = 0
    let failCount = 0
    let defectsFound = false
    const defectDetails: { item: string; severity: string; description: string; photoUrl?: string }[] = []

    if (Array.isArray(checkItems)) {
      parsedItems = checkItems
      totalChecks = parsedItems.length
      for (const item of parsedItems) {
        if (item.status === 'ok') passCount++
        else if (item.status === 'warning') warningCount++
        else if (item.status === 'fail') {
          failCount++
          defectsFound = true
          defectDetails.push({
            item: item.name,
            severity: item.severity || 'medium',
            description: item.notes || 'Failed check',
          })
        }
      }
    }

    let result: string
    if (failCount > 0) result = 'fail'
    else if (warningCount > 0) result = 'conditional_pass'
    else result = 'pass'

    const inspectionId = randomUUID()
    const occurredAt = new Date()
    const parsedLatitude = latitude ? parseFloat(latitude) : null
    const parsedLongitude = longitude ? parseFloat(longitude) : null
    const photoRefs = Array.isArray(photos) ? photos.filter((photo): photo is string => typeof photo === 'string' && photo.trim().length > 0) : []
    if (auth.roleName === ROLES.DRIVER && photoRefs.length > 0) {
      if (photoRefs.length > 5 || !auth.driverId || !(await validateDriverEvidenceRefs(
        { userId: auth.userId, driverId: auth.driverId },
        tripId ? String(tripId) : null,
        photoRefs,
      ))) {
        return NextResponse.json({ error: 'Inspection evidence is invalid or does not belong to this driver/trip' }, { status: 409 })
      }
    }
    const idempotencyKey = mutationId ? `driver-inspection:${mutationId}` : `inspection-created:${inspectionId}`

    try {
      const record = await db.$transaction(async (tx) => {
        const created = await tx.vehicleInspection.create({
          data: {
            id: inspectionId,
            truckId,
            driverId: effectiveDriverId,
            tripId: tripId || null,
            type,
            odometerReading: odometerReading ? parseFloat(odometerReading) : null,
            result,
            overallNotes: overallNotes || null,
            checkItems: JSON.stringify(parsedItems),
            totalChecks,
            passCount,
            warningCount,
            failCount,
            defectsFound,
            defectDetails: defectDetails.length > 0 ? JSON.stringify(defectDetails) : null,
            photos: photoRefs.length > 0 ? JSON.stringify(photoRefs) : null,
            inspectedBy: auth.userId,
            inspectorName: inspectorName || null,
            signature: signature || null,
            location: location || null,
            latitude: parsedLatitude,
            longitude: parsedLongitude,
            requiresFollowUp: requiresFollowUp || defectsFound,
            followUpNotes: followUpNotes || null,
          },
          include: inspectionInclude,
        })

        await tx.operationalEvent.create({
          data: {
            idempotencyKey,
            eventKey: 'inspection.created',
            type: 'inspection.created',
            entityType: 'vehicle_inspection',
            entityId: inspectionId,
            tripId: tripId || null,
            actorType: auth.roleName,
            actorId: auth.userId,
            occurredAt,
            latitude: parsedLatitude,
            longitude: parsedLongitude,
            evidenceRefs: photoRefs.length > 0 ? JSON.stringify(photoRefs) : null,
            metadata: JSON.stringify({ ...replayIdentity, result }),
            source: 'api.inspections',
          },
        })

        return created
      })

      return NextResponse.json(record, { status: 201 })
    } catch (error) {
      if (mutationId) {
        const replay = await findInspectionReplay(mutationId, replayIdentity)
        if (replay) return replay
      }
      throw error
    }
  } catch (error) {
    console.error('Inspection create error:', error)
    return NextResponse.json({ error: 'Failed to create inspection' }, { status: 500 })
  }
}
