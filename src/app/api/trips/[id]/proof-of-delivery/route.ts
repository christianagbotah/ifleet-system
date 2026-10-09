import { NextRequest, NextResponse } from 'next/server'

import { isDriverOrAdmin, requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import {
  parsePodRequirements,
  redactProofOfDelivery,
  type PodEvidenceInput,
  type PodRequirement,
  type ProofOfDeliveryInput,
} from '@/lib/domain/delivery/proof-of-delivery'
import {
  PodSubmissionError,
  submitProofOfDelivery,
  type StoredPod,
} from '@/lib/domain/delivery/proof-of-delivery-service'

const DEFAULT_REQUIREMENTS: PodRequirement[] = ['receiver_identity', 'delivery_photo', 'location']
const EVIDENCE_TYPES = new Set(['delivery_photo', 'receiver_photo', 'document'])

type TripContext = Awaited<ReturnType<typeof loadTripContext>>
type DeliveryTarget = {
  kind: 'destination' | 'delivery_stop' | 'trip'
  id: string | null
  label: string
  customerName: string | null
  customerPhone: string | null
  expectedQty: number
  unit: string
}

async function loadTripContext(id: string) {
  return db.trip.findUnique({
    where: { id },
    select: {
      id: true,
      driverId: true,
      quantity: true,
      unit: true,
      destination: true,
      customerName: true,
      customerPhone: true,
      loadingPointId: true,
      deliveryStops: {
        orderBy: { stopOrder: 'asc' },
        select: {
          id: true,
          destination: true,
          customerName: true,
          customerPhone: true,
          expectedQty: true,
          unit: true,
        },
      },
      TripDeliveryDestination: {
        orderBy: { stopOrder: 'asc' },
        select: {
          id: true,
          customerName: true,
          customerPhone: true,
          address: true,
          TripItem: { select: { quantity: true, unit: true } },
        },
      },
      loadOrder: {
        select: {
          loadingPointId: true,
          shipperProfile: {
            select: {
              podRequirements: true,
              ShipperSiteRule: {
                where: { isActive: true },
                select: { loadingPointId: true, podRequirements: true },
              },
            },
          },
        },
      },
    },
  })
}

function requirementsForTrip(trip: NonNullable<TripContext>): PodRequirement[] {
  const profile = trip.loadOrder?.shipperProfile
  if (!profile) return DEFAULT_REQUIREMENTS
  const loadingPointId = trip.loadOrder?.loadingPointId ?? trip.loadingPointId
  const site = profile.ShipperSiteRule.find((rule) => rule.loadingPointId === loadingPointId)
  const parsed = parsePodRequirements(site?.podRequirements ?? profile.podRequirements)
  return parsed.length > 0 ? parsed : DEFAULT_REQUIREMENTS
}

function destinationTarget(trip: NonNullable<TripContext>, id: string): DeliveryTarget | null {
  const destination = trip.TripDeliveryDestination.find((candidate) => candidate.id === id)
  if (!destination) return null
  const units = [...new Set(destination.TripItem.map((line) => line.unit.trim().toLowerCase()))]
  if (units.length > 1) throw new Error('MIXED_DESTINATION_UNITS')
  const expectedQty = destination.TripItem.reduce((sum, line) => sum + line.quantity, 0)
  return {
    kind: 'destination',
    id: destination.id,
    label: destination.customerName || destination.address || 'Delivery destination',
    customerName: destination.customerName || null,
    customerPhone: destination.customerPhone || null,
    expectedQty: expectedQty || trip.quantity,
    unit: units[0] || trip.unit,
  }
}

function stopTarget(trip: NonNullable<TripContext>, id: string): DeliveryTarget | null {
  const stop = trip.deliveryStops.find((candidate) => candidate.id === id)
  if (!stop) return null
  return {
    kind: 'delivery_stop',
    id: stop.id,
    label: stop.destination,
    customerName: stop.customerName || null,
    customerPhone: stop.customerPhone || null,
    expectedQty: stop.expectedQty,
    unit: stop.unit,
  }
}

function allTargets(trip: NonNullable<TripContext>): DeliveryTarget[] {
  if (trip.TripDeliveryDestination.length > 0) {
    return trip.TripDeliveryDestination.map((destination) => destinationTarget(trip, destination.id)!).filter(Boolean)
  }
  if (trip.deliveryStops.length > 0) {
    return trip.deliveryStops.map((stop) => stopTarget(trip, stop.id)!).filter(Boolean)
  }
  return [{
    kind: 'trip',
    id: null,
    label: trip.destination,
    customerName: trip.customerName || null,
    customerPhone: trip.customerPhone || null,
    expectedQty: trip.quantity,
    unit: trip.unit,
  }]
}

function chooseTarget(trip: NonNullable<TripContext>, body: Record<string, unknown>): DeliveryTarget {
  const deliveryDestinationId = typeof body.deliveryDestinationId === 'string' ? body.deliveryDestinationId.trim() : ''
  const deliveryStopId = typeof body.deliveryStopId === 'string' ? body.deliveryStopId.trim() : ''
  if (deliveryDestinationId) {
    const target = destinationTarget(trip, deliveryDestinationId)
    if (!target) throw new Error('DELIVERY_TARGET_NOT_FOUND')
    return target
  }
  if (deliveryStopId) {
    const target = stopTarget(trip, deliveryStopId)
    if (!target) throw new Error('DELIVERY_TARGET_NOT_FOUND')
    return target
  }
  const targets = allTargets(trip)
  if (targets.length !== 1) throw new Error('DELIVERY_TARGET_REQUIRED')
  return targets[0]
}

function parseEvidence(value: unknown): PodEvidenceInput[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const type = typeof record.type === 'string' ? record.type.trim() : ''
    const ref = typeof record.ref === 'string' ? record.ref.trim() : ''
    if (!EVIDENCE_TYPES.has(type) || !ref || ref.length > 2_000_000) return []
    return [{ type: type as PodEvidenceInput['type'], ref }]
  })
}

function mapStored(row: any): StoredPod {
  return {
    id: row.id,
    tripId: row.tripId,
    deliveryStopId: row.deliveryStopId,
    deliveryDestinationId: row.deliveryDestinationId,
    idempotencyKey: row.idempotencyKey,
    payloadFingerprint: row.payloadFingerprint,
    activeTargetKey: row.activeTargetKey ?? '',
    actorId: row.actorId,
    receiverName: row.receiverName,
    receiverPhone: row.receiverPhone,
    expectedQty: row.expectedQty,
    receivedQty: row.receivedQty,
    damagedQty: row.damagedQty,
    rejectedQty: row.rejectedQty,
    unit: row.unit,
    latitude: row.latitude,
    longitude: row.longitude,
    completedAt: row.completedAt.toISOString(),
    signatureRef: row.signatureRef,
    pinVerified: row.pinVerified,
    evidence: (row.evidence ?? []).map((item: any) => ({ type: item.type, ref: item.storageRef })),
    discrepancyNotes: row.discrepancyNotes,
    discrepancyType: row.discrepancyType,
    discrepancyQuantity: row.discrepancyQuantity,
  }
}

function driverSafe(row: any) {
  return redactProofOfDelivery(mapStored(row))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const trip = await loadTripContext(id)
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    if (!isDriverOrAdmin(auth, trip.driverId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const proofs = await db.proofOfDelivery.findMany({
      where: { tripId: id },
      include: { evidence: true, exceptions: true },
      orderBy: { createdAt: 'desc' },
    })
    const completedKeys = new Set(proofs.map((proof) => proof.deliveryDestinationId ? `destination:${proof.deliveryDestinationId}` : proof.deliveryStopId ? `delivery_stop:${proof.deliveryStopId}` : 'trip'))
    const targets = allTargets(trip).map((target) => ({
      ...target,
      completed: completedKeys.has(target.kind === 'trip' ? 'trip' : `${target.kind}:${target.id}`),
    }))

    return NextResponse.json({
      requirements: requirementsForTrip(trip),
      targets,
      proofs: auth.roleName === ROLES.DRIVER ? proofs.map(driverSafe) : proofs.map((proof) => ({ ...driverSafe(proof), exceptions: proof.exceptions })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'MIXED_DESTINATION_UNITS') {
      return NextResponse.json({ error: 'A destination contains mixed cargo units and needs line-level POD handling.' }, { status: 409 })
    }
    console.error('Proof of delivery GET error:', error)
    return NextResponse.json({ error: 'Failed to load proof of delivery' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const trip = await loadTripContext(id)
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    if (!isDriverOrAdmin(auth, trip.driverId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const target = chooseTarget(trip, body)
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : ''
    const receiverName = typeof body.receiverName === 'string' ? body.receiverName : ''
    const receiverPhone = typeof body.receiverPhone === 'string' ? body.receiverPhone : null
    const receivedQty = Number(body.receivedQty)
    const damagedQty = body.damagedQty == null ? 0 : Number(body.damagedQty)
    const rejectedQty = body.rejectedQty == null ? 0 : Number(body.rejectedQty)
    const latitude = body.latitude == null ? null : Number(body.latitude)
    const longitude = body.longitude == null ? null : Number(body.longitude)
    const signatureRef = typeof body.signatureRef === 'string' ? body.signatureRef : null
    const discrepancyNotes = typeof body.discrepancyNotes === 'string' ? body.discrepancyNotes : null
    const proof: ProofOfDeliveryInput = {
      receiverName,
      receiverPhone,
      expectedQty: target.expectedQty,
      receivedQty,
      damagedQty,
      rejectedQty,
      unit: target.unit,
      latitude,
      longitude,
      completedAt: new Date().toISOString(),
      signatureRef,
      pinVerified: body.pinVerified === true,
      evidence: parseEvidence(body.evidence),
      discrepancyNotes,
    }

    const repository = {
      async findByIdempotencyKey(key: string) {
        const existing = await db.proofOfDelivery.findUnique({ where: { idempotencyKey: key }, include: { evidence: true } })
        return existing ? mapStored(existing) : null
      },
      async findCurrentByTarget(targetKey: string) {
        const existing = await db.proofOfDelivery.findUnique({ where: { activeTargetKey: targetKey }, include: { evidence: true } })
        return existing ? mapStored(existing) : null
      },
      async create(input: Omit<StoredPod, 'id'>) {
        return db.$transaction(async (tx) => {
          const acceptedQty = input.receivedQty - (input.damagedQty ?? 0) - (input.rejectedQty ?? 0)
          const created = await tx.proofOfDelivery.create({
            data: {
              tripId: input.tripId,
              deliveryStopId: target.kind === 'delivery_stop' ? target.id : null,
              deliveryDestinationId: target.kind === 'destination' ? target.id : null,
              idempotencyKey: input.idempotencyKey,
              payloadFingerprint: input.payloadFingerprint,
              activeTargetKey: input.activeTargetKey,
              actorId: input.actorId,
              receiverName: input.receiverName,
              receiverPhone: input.receiverPhone,
              expectedQty: input.expectedQty,
              receivedQty: input.receivedQty,
              damagedQty: input.damagedQty ?? 0,
              rejectedQty: input.rejectedQty ?? 0,
              acceptedQty,
              unit: input.unit,
              latitude: input.latitude,
              longitude: input.longitude,
              completedAt: new Date(input.completedAt),
              signatureRef: input.signatureRef,
              pinVerified: input.pinVerified === true,
              discrepancyType: input.discrepancyType,
              discrepancyQuantity: input.discrepancyQuantity,
              discrepancyNotes: input.discrepancyNotes,
              evidence: { create: input.evidence.map((item) => ({ type: item.type, storageRef: item.ref })) },
            },
            include: { evidence: true },
          })

          const exceptions: Array<{ type: string; quantity: number }> = []
          if (input.discrepancyQuantity > 0) exceptions.push({ type: 'shortage', quantity: input.discrepancyQuantity })
          if ((input.damagedQty ?? 0) > 0) exceptions.push({ type: 'damage', quantity: input.damagedQty ?? 0 })
          if ((input.rejectedQty ?? 0) > 0) exceptions.push({ type: 'rejection', quantity: input.rejectedQty ?? 0 })
          if (exceptions.length > 0) {
            await tx.deliveryException.createMany({
              data: exceptions.map((exception) => ({
                tripId: id,
                proofOfDeliveryId: created.id,
                deliveryStopId: target.kind === 'delivery_stop' ? target.id : null,
                deliveryDestinationId: target.kind === 'destination' ? target.id : null,
                type: exception.type,
                quantity: exception.quantity,
                notes: input.discrepancyNotes,
              })),
            })
          }

          if (target.kind === 'delivery_stop' && target.id) {
            await tx.deliveryStop.update({
              where: { id: target.id },
              data: { actualQty: input.receivedQty, status: 'completed', offloadCompleted: new Date(input.completedAt) },
            })
          } else if (target.kind === 'destination' && target.id) {
            await tx.tripDeliveryDestination.update({
              where: { id: target.id },
              data: { actualQty: input.receivedQty, status: 'completed' },
            })
          }
          return mapStored(created)
        }, { isolationLevel: 'Serializable' })
      },
    }

    const submit = () => submitProofOfDelivery({
      tripId: id,
      deliveryStopId: target.kind === 'delivery_stop' ? target.id : null,
      deliveryDestinationId: target.kind === 'destination' ? target.id : null,
      idempotencyKey,
      actorId: auth.userId,
      proof,
      requirements: requirementsForTrip(trip),
    }, repository)

    let result
    try {
      result = await submit()
    } catch (error: any) {
      if (error?.code === 'P2002') result = await submit()
      else throw error
    }

    return NextResponse.json({ proof: driverSafe({ ...result.proof, evidence: result.proof.evidence }), replayed: result.replayed }, { status: result.replayed ? 200 : 201 })
  } catch (error) {
    if (error instanceof PodSubmissionError) {
      return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: ['IDEMPOTENCY_CONFLICT', 'TARGET_ALREADY_COMPLETED'].includes(error.code) ? 409 : 400 })
    }
    if (error instanceof Error) {
      if (error.message === 'DELIVERY_TARGET_REQUIRED') return NextResponse.json({ error: 'Select a delivery destination before submitting POD.' }, { status: 400 })
      if (error.message === 'DELIVERY_TARGET_NOT_FOUND') return NextResponse.json({ error: 'Delivery destination not found for this trip.' }, { status: 404 })
      if (error.message === 'MIXED_DESTINATION_UNITS') return NextResponse.json({ error: 'A destination contains mixed cargo units and needs line-level POD handling.' }, { status: 409 })
    }
    console.error('Proof of delivery POST error:', error)
    return NextResponse.json({ error: 'Failed to submit proof of delivery' }, { status: 500 })
  }
}
