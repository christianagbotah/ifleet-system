import { NextRequest, NextResponse } from 'next/server'

import { isDriverOrAdmin, requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { appendOperationalEvent } from '@/lib/domain/events/operational-event'
import { planPodCorrection } from '@/lib/domain/delivery/pod-correction'
import {
  buildPodFingerprint,
  evaluateProofOfDelivery,
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

function targetFromStoredProof(
  trip: NonNullable<TripContext>,
  proof: { deliveryStopId: string | null; deliveryDestinationId: string | null },
): DeliveryTarget {
  if (proof.deliveryDestinationId) {
    const target = destinationTarget(trip, proof.deliveryDestinationId)
    if (!target) throw new Error('DELIVERY_TARGET_NOT_FOUND')
    return target
  }
  if (proof.deliveryStopId) {
    const target = stopTarget(trip, proof.deliveryStopId)
    if (!target) throw new Error('DELIVERY_TARGET_NOT_FOUND')
    return target
  }
  const targets = allTargets(trip)
  if (targets.length !== 1 || targets[0].kind !== 'trip') throw new Error('DELIVERY_TARGET_NOT_FOUND')
  return targets[0]
}

function correctedProofFromBody(body: Record<string, unknown>, target: DeliveryTarget): ProofOfDeliveryInput {
  return {
    receiverName: typeof body.receiverName === 'string' ? body.receiverName : '',
    receiverPhone: typeof body.receiverPhone === 'string' ? body.receiverPhone : null,
    expectedQty: target.expectedQty,
    receivedQty: Number(body.receivedQty),
    damagedQty: body.damagedQty == null ? 0 : Number(body.damagedQty),
    rejectedQty: body.rejectedQty == null ? 0 : Number(body.rejectedQty),
    unit: target.unit,
    latitude: body.latitude == null ? null : Number(body.latitude),
    longitude: body.longitude == null ? null : Number(body.longitude),
    completedAt: new Date().toISOString(),
    signatureRef: typeof body.signatureRef === 'string' ? body.signatureRef : null,
    pinVerified: body.pinVerified === true,
    evidence: parseEvidence(body.evidence),
    discrepancyNotes: typeof body.discrepancyNotes === 'string' ? body.discrepancyNotes : null,
  }
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
      proofs: auth.roleName === ROLES.DRIVER ? proofs.map(driverSafe) : proofs.map((proof) => ({
        ...driverSafe(proof),
        deliveryStopId: proof.deliveryStopId,
        deliveryDestinationId: proof.deliveryDestinationId,
        activeTargetKey: proof.activeTargetKey,
        supersedesId: proof.supersedesId,
        correctionReason: proof.correctionReason,
        exceptions: proof.exceptions,
      })),
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

    await appendOperationalEvent({
      idempotencyKey: `pod:${result.proof.id}`,
      eventKey: 'delivery.pod_submitted',
      type: 'delivery.proof_of_delivery',
      entityType: 'ProofOfDelivery',
      entityId: result.proof.id,
      tripId: id,
      actorType: 'user',
      actorId: auth.userId,
      occurredAt: result.proof.completedAt,
      latitude: result.proof.latitude,
      longitude: result.proof.longitude,
      evidenceRefs: result.proof.evidence.map((item) => item.ref),
      source: 'proof-of-delivery',
      metadata: { targetKind: target.kind, targetId: target.id, receivedQty: result.proof.receivedQty, damagedQty: result.proof.damagedQty, rejectedQty: result.proof.rejectedQty, replayed: result.replayed },
    })
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


export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    if (auth.roleName !== ROLES.ADMIN && auth.roleName !== ROLES.MANAGER) {
      return NextResponse.json({ error: 'Admin or Manager access is required to correct proof of delivery.' }, { status: 403 })
    }

    const { id } = await params
    const trip = await loadTripContext(id)
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const proofOfDeliveryId = typeof body.proofOfDeliveryId === 'string' ? body.proofOfDeliveryId.trim() : ''
    const correctionReason = typeof body.correctionReason === 'string' ? body.correctionReason.trim() : ''
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : ''
    if (!proofOfDeliveryId || !idempotencyKey) {
      return NextResponse.json({ error: 'proofOfDeliveryId and idempotencyKey are required.' }, { status: 400 })
    }

    const existingProof = await db.proofOfDelivery.findFirst({
      where: { id: proofOfDeliveryId, tripId: id },
      select: { id: true, deliveryStopId: true, deliveryDestinationId: true },
    })
    if (!existingProof) return NextResponse.json({ error: 'Proof of delivery not found.' }, { status: 404 })

    const target = targetFromStoredProof(trip, existingProof)
    const correctedProof = correctedProofFromBody(body, target)
    const evaluation = evaluateProofOfDelivery(correctedProof, requirementsForTrip(trip))
    if (!evaluation.valid) {
      return NextResponse.json({
        error: 'Corrected proof of delivery is incomplete.',
        code: 'VALIDATION_FAILED',
        details: { missingRequirements: evaluation.missingRequirements, discrepancy: evaluation.discrepancy },
      }, { status: 400 })
    }
    const payloadFingerprint = buildPodFingerprint(correctedProof)

    const result = await db.$transaction(async (tx) => {
      const current = await tx.proofOfDelivery.findFirst({
        where: { id: proofOfDeliveryId, tripId: id },
        include: { evidence: true },
      })
      if (!current) throw new Error('POD_NOT_FOUND')

      const replay = await tx.proofOfDelivery.findUnique({
        where: { idempotencyKey },
        include: { evidence: true },
      })
      if (replay) {
        if (
          replay.supersedesId === current.id
          && replay.payloadFingerprint === payloadFingerprint
          && replay.correctionReason?.trim() === correctionReason
        ) {
          return { proof: replay, replayed: true, financialReviewRequired: false }
        }
        throw new Error('IDEMPOTENCY_CONFLICT')
      }

      const approvedReconciliation = await tx.tripReconciliation.findFirst({
        where: { tripId: id, status: 'approved' },
        select: { id: true },
        orderBy: { version: 'desc' },
      })
      const plan = planPodCorrection({
        current: {
          id: current.id,
          tripId: current.tripId,
          deliveryStopId: current.deliveryStopId,
          deliveryDestinationId: current.deliveryDestinationId,
          activeTargetKey: current.activeTargetKey ?? '',
        },
        reason: correctionReason,
        hasApprovedFinancialHistory: Boolean(approvedReconciliation),
      })

      await tx.proofOfDelivery.update({
        where: { id: current.id },
        data: { activeTargetKey: null },
      })
      await tx.deliveryException.updateMany({
        where: {
          proofOfDeliveryId: current.id,
          status: { notIn: ['resolved', 'closed'] },
        },
        data: {
          status: 'closed',
          resolutionNotes: `Superseded by corrected proof of delivery: ${correctionReason}`,
          resolvedBy: auth.userId,
          resolvedAt: new Date(),
        },
      })

      const acceptedQty = correctedProof.receivedQty - (correctedProof.damagedQty ?? 0) - (correctedProof.rejectedQty ?? 0)
      const created = await tx.proofOfDelivery.create({
        data: {
          tripId: id,
          deliveryStopId: current.deliveryStopId,
          deliveryDestinationId: current.deliveryDestinationId,
          idempotencyKey,
          payloadFingerprint,
          activeTargetKey: plan.activeTargetKey,
          actorId: auth.userId,
          receiverName: correctedProof.receiverName,
          receiverPhone: correctedProof.receiverPhone,
          expectedQty: correctedProof.expectedQty,
          receivedQty: correctedProof.receivedQty,
          damagedQty: correctedProof.damagedQty ?? 0,
          rejectedQty: correctedProof.rejectedQty ?? 0,
          acceptedQty,
          unit: correctedProof.unit,
          latitude: correctedProof.latitude,
          longitude: correctedProof.longitude,
          completedAt: new Date(correctedProof.completedAt),
          signatureRef: correctedProof.signatureRef,
          pinVerified: correctedProof.pinVerified === true,
          discrepancyType: evaluation.discrepancy.type,
          discrepancyQuantity: evaluation.discrepancy.quantity,
          discrepancyNotes: correctedProof.discrepancyNotes,
          supersedesId: plan.supersedesId,
          correctionReason,
          evidence: { create: correctedProof.evidence.map((item) => ({ type: item.type, storageRef: item.ref })) },
        },
        include: { evidence: true },
      })

      const exceptions: Array<{ type: string; quantity: number }> = []
      if (evaluation.discrepancy.quantity > 0) exceptions.push({ type: 'shortage', quantity: evaluation.discrepancy.quantity })
      if ((correctedProof.damagedQty ?? 0) > 0) exceptions.push({ type: 'damage', quantity: correctedProof.damagedQty ?? 0 })
      if ((correctedProof.rejectedQty ?? 0) > 0) exceptions.push({ type: 'rejection', quantity: correctedProof.rejectedQty ?? 0 })
      if (exceptions.length > 0) {
        await tx.deliveryException.createMany({
          data: exceptions.map((exception) => ({
            tripId: id,
            proofOfDeliveryId: created.id,
            deliveryStopId: current.deliveryStopId,
            deliveryDestinationId: current.deliveryDestinationId,
            type: exception.type,
            quantity: exception.quantity,
            notes: correctedProof.discrepancyNotes,
          })),
        })
      }

      if (current.deliveryStopId) {
        await tx.deliveryStop.update({
          where: { id: current.deliveryStopId },
          data: { actualQty: correctedProof.receivedQty, status: 'completed', offloadCompleted: new Date(correctedProof.completedAt) },
        })
      } else if (current.deliveryDestinationId) {
        await tx.tripDeliveryDestination.update({
          where: { id: current.deliveryDestinationId },
          data: { actualQty: correctedProof.receivedQty, status: 'completed' },
        })
      }

      if (plan.requiresFinancialReview && plan.financialReviewType) {
        await tx.reconciliationException.create({
          data: {
            tripId: id,
            reconciliationId: approvedReconciliation?.id ?? null,
            type: 'pod_correction_after_financial_approval',
            sourceType: 'proof_of_delivery',
            sourceId: created.id,
            status: 'open',
            notes: correctionReason,
          },
        })
      }

      return {
        proof: created,
        replayed: false,
        financialReviewRequired: plan.requiresFinancialReview,
      }
    }, { isolationLevel: 'Serializable' })

    await appendOperationalEvent({
      idempotencyKey: `pod:${result.proof.id}`,
      eventKey: 'delivery.pod_corrected',
      type: 'delivery.proof_of_delivery_corrected',
      entityType: 'ProofOfDelivery',
      entityId: result.proof.id,
      tripId: id,
      actorType: 'user',
      actorId: auth.userId,
      occurredAt: result.proof.completedAt,
      latitude: result.proof.latitude,
      longitude: result.proof.longitude,
      evidenceRefs: result.proof.evidence.map((item: any) => item.storageRef ?? item.ref).filter(Boolean),
      source: 'proof-of-delivery',
      metadata: { supersedesPodId: result.proof.supersedesId, correctionReason: result.proof.correctionReason, financialReviewRequired: result.financialReviewRequired },
    })
    return NextResponse.json({
      proof: driverSafe(result.proof),
      replayed: result.replayed,
      financialReviewRequired: result.financialReviewRequired,
    }, { status: result.replayed ? 200 : 201 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'POD_NOT_FOUND') return NextResponse.json({ error: 'Proof of delivery not found.' }, { status: 404 })
      if (error.message === 'IDEMPOTENCY_CONFLICT') return NextResponse.json({ error: 'Idempotency key was already used for a different POD correction.', code: 'IDEMPOTENCY_CONFLICT' }, { status: 409 })
      if (/correction reason/i.test(error.message)) return NextResponse.json({ error: error.message, code: 'CORRECTION_REASON_REQUIRED' }, { status: 400 })
      if (/active proof/i.test(error.message)) return NextResponse.json({ error: error.message, code: 'POD_ALREADY_SUPERSEDED' }, { status: 409 })
      if (error.message === 'DELIVERY_TARGET_NOT_FOUND') return NextResponse.json({ error: 'Delivery destination not found for this proof.' }, { status: 404 })
      if (error.message === 'MIXED_DESTINATION_UNITS') return NextResponse.json({ error: 'A destination contains mixed cargo units and needs line-level POD handling.' }, { status: 409 })
    }
    console.error('Proof of delivery PUT error:', error)
    return NextResponse.json({ error: 'Failed to correct proof of delivery' }, { status: 500 })
  }
}
