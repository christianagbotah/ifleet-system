import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, ROLES, type AuthContext } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { appendOperationalEvent } from '@/lib/domain/events/operational-event'
import { resolveTransportRate } from '@/lib/domain/haulage/rate-card'
import type { TransportRateCandidate } from '@/lib/domain/haulage/types'
import {
  calculateHaulierSettlement,
  selectHaulierPayee,
  type HaulierRateCard,
} from '@/lib/domain/haulier-settlements/haulier-settlement'

function requireFinanceAccess(auth: AuthContext): true | NextResponse {
  if (auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER || auth.permissions.includes('financial.view')) return true
  return NextResponse.json({ error: 'Financial settlement access is required.' }, { status: 403 })
}

function parseTerms(value: string | null | undefined): Partial<HaulierRateCard> & { fuelAdjustmentAmount?: number } {
  if (!value?.trim()) return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const number = (key: string) => {
      const candidate = Number(parsed[key])
      return Number.isFinite(candidate) ? candidate : undefined
    }
    return {
      detentionFreeMinutes: number('detentionFreeMinutes'),
      detentionRatePerHour: number('detentionRatePerHour'),
      shortageRatePerUnit: number('shortageRatePerUnit'),
      taxRatePercent: number('taxRatePercent'),
      withholdingRatePercent: number('withholdingRatePercent'),
      fuelAdjustmentAmount: number('fuelAdjustmentAmount'),
    }
  } catch {
    throw new Error('INVALID_SETTLEMENT_TERMS')
  }
}

function effectivePods<T extends { id: string; supersedesId: string | null }>(pods: T[]): T[] {
  const superseded = new Set(pods.map((pod) => pod.supersedesId).filter((id): id is string => Boolean(id)))
  return pods.filter((pod) => !superseded.has(pod.id))
}

function categoryOf(line: { category: string | null }) {
  return line.category?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? ''
}

const EXTRA_CATEGORIES = new Set(['haulier_extra', 'transporter_extra', 'vehicle_owner_extra'])
const ADVANCE_CATEGORIES = new Set(['haulier_advance', 'transporter_advance', 'vehicle_owner_advance'])

function publicSettlement(settlement: any) {
  return {
    ...settlement,
    baseFreight: Number(settlement.baseFreight),
    detentionAmount: Number(settlement.detentionAmount),
    extrasAmount: Number(settlement.extrasAmount),
    shortageDeduction: Number(settlement.shortageDeduction),
    fuelAdjustment: Number(settlement.fuelAdjustment),
    taxAmount: Number(settlement.taxAmount),
    withholdingAmount: Number(settlement.withholdingAmount),
    advanceDeduction: Number(settlement.advanceDeduction),
    netPayable: Number(settlement.netPayable),
    lines: settlement.lines?.map((line: any) => ({ ...line, amount: Number(line.amount) })) ?? [],
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const access = requireFinanceAccess(auth)
    if (access instanceof NextResponse) return access

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')?.trim() || undefined
    const payeeId = searchParams.get('payeeId')?.trim() || undefined

    const [settlements, allSettledTrips] = await Promise.all([
      db.haulierSettlement.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(payeeId ? { payeeId } : {}),
        },
        include: { lines: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        take: 250,
      }),
      db.haulierSettlement.findMany({ select: { tripId: true } }),
    ])

    const alreadySettledTripIds = allSettledTrips.map((settlement) => settlement.tripId)
    const eligibleTrips = await db.trip.findMany({
      where: {
        status: { in: ['reconciled', 'completed'] },
        ...(alreadySettledTripIds.length ? { id: { notIn: alreadySettledTripIds } } : {}),
      },
      select: {
        id: true,
        tripNumber: true,
        itemName: true,
        quantity: true,
        unit: true,
        destination: true,
        truck: { select: { plateNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ settlements: settlements.map(publicSettlement), eligibleTrips })
  } catch (error) {
    console.error('Haulier settlements GET error:', error)
    return NextResponse.json({ error: 'Failed to load haulier settlements.' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const access = requireFinanceAccess(auth)
    if (access instanceof NextResponse) return access

    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const tripId = typeof body.tripId === 'string' ? body.tripId.trim() : ''
    if (!tripId) return NextResponse.json({ error: 'tripId is required.' }, { status: 400 })

    const settlement = await db.$transaction(async (tx) => {
      const existing = await tx.haulierSettlement.findUnique({ where: { tripId } })
      if (existing) throw new Error('HAULIER_SETTLEMENT_ALREADY_EXISTS')

      const trip = await tx.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          tripNumber: true,
          status: true,
          quantity: true,
          unit: true,
          itemId: true,
          loadingPointId: true,
          destinationZoneId: true,
          departureTime: true,
          truck: {
            select: {
              id: true,
              plateNumber: true,
              transporter: { select: { id: true, name: true, isInternal: true } },
              vehicleOwner: { select: { id: true, name: true, isInternal: true } },
            },
          },
          loadOrder: {
            select: {
              shipperProfileId: true,
              shipperProfile: { select: { detentionFreeMinutes: true } },
            },
          },
        },
      })
      if (!trip) throw new Error('TRIP_NOT_FOUND')
      if (!['reconciled', 'completed'].includes(trip.status)) throw new Error('TRIP_NOT_RECONCILED')

      const reconciliation = await tx.tripReconciliation.findFirst({
        where: { tripId, status: 'approved' },
        include: { lines: { orderBy: { createdAt: 'asc' } } },
        orderBy: { version: 'desc' },
      })
      if (!reconciliation) throw new Error('APPROVED_RECONCILIATION_REQUIRED')

      const rawRateCards = await tx.transportRateCard.findMany({
        where: {
          isActive: true,
          OR: trip.truck.transporter?.id
            ? [{ transporterId: null }, { transporterId: trip.truck.transporter.id }]
            : [{ transporterId: null }],
        },
      })
      const candidates: TransportRateCandidate[] = rawRateCards.map((card) => ({
        id: card.id,
        contractId: card.contractId,
        transporterId: card.transporterId,
        shipperProfileId: card.shipperProfileId,
        loadingPointId: card.loadingPointId,
        destinationZoneId: card.destinationZoneId,
        itemId: card.itemId,
        unit: card.unit,
        rateAmount: Number(card.rateAmount),
        currency: card.currency,
        effectiveFrom: card.effectiveFrom,
        effectiveTo: card.effectiveTo,
        isActive: card.isActive,
        priority: card.priority,
      }))
      const resolved = resolveTransportRate({
        transporterId: trip.truck.transporter?.id ?? null,
        shipperProfileId: trip.loadOrder?.shipperProfileId ?? null,
        loadingPointId: trip.loadingPointId,
        destinationZoneId: trip.destinationZoneId,
        itemId: trip.itemId,
        unit: trip.unit,
        at: trip.departureTime,
        candidates,
      })
      if (!resolved) throw new Error('TRANSPORT_RATE_REQUIRED')
      const selectedRate = rawRateCards.find((card) => card.id === resolved.rateCardId)
      if (!selectedRate) throw new Error('TRANSPORT_RATE_REQUIRED')

      const contractedTransporter = selectedRate.transporterId
        ? await tx.transporter.findUnique({ where: { id: selectedRate.transporterId }, select: { id: true, name: true, isInternal: true } })
        : trip.truck.transporter
      const payee = selectHaulierPayee({
        rateCardTransporterId: selectedRate.transporterId,
        transporter: contractedTransporter ?? trip.truck.transporter,
        vehicleOwner: trip.truck.vehicleOwner,
      })
      if (!payee) throw new Error('EXTERNAL_HAULIER_REQUIRED')

      const pods = effectivePods(await tx.proofOfDelivery.findMany({
        where: { tripId },
        select: {
          id: true,
          supersedesId: true,
          acceptedQty: true,
          discrepancyQuantity: true,
          unit: true,
        },
      }))
      if (pods.length === 0) throw new Error('PROOF_OF_DELIVERY_REQUIRED')
      const normalizedUnits = new Set(pods.map((pod) => pod.unit.trim().toLowerCase()))
      if (normalizedUnits.size > 1) throw new Error('POD_UNIT_MISMATCH')
      const deliveredQuantity = pods.reduce((sum, pod) => sum + pod.acceptedQty, 0)
      const shortageQuantity = pods.reduce((sum, pod) => sum + pod.discrepancyQuantity, 0)

      const queues = await tx.factoryQueueEntry.findMany({
        where: { tripId, status: 'completed' },
        select: { joinedAt: true, completedAt: true, actualWait: true },
      })
      const detentionMinutes = queues.reduce((total, entry) => {
        if (entry.actualWait != null) return total + Math.max(0, entry.actualWait)
        if (!entry.completedAt) return total
        return total + Math.max(0, Math.round((entry.completedAt.getTime() - entry.joinedAt.getTime()) / 60000))
      }, 0)

      const approvedExtras = reconciliation.lines
        .filter((line) => line.sourceType === 'expense' && EXTRA_CATEGORIES.has(categoryOf(line)))
        .map((line) => ({ id: line.sourceId, description: line.category || 'Approved haulier extra', amount: Number(line.amount) }))
      const advanceAlreadyPaid = reconciliation.lines
        .filter((line) => line.sourceType === 'expense' && ADVANCE_CATEGORIES.has(categoryOf(line)))
        .reduce((sum, line) => sum + Number(line.amount), 0)

      const terms = parseTerms(selectedRate.settlementTerms)
      const calculation = calculateHaulierSettlement({
        tripId,
        deliveredQuantity,
        deliveredUnit: pods[0].unit,
        detentionMinutes,
        approvedExtras,
        shortageQuantity,
        fuelAdjustmentAmount: terms.fuelAdjustmentAmount ?? 0,
        advanceAlreadyPaid,
      }, {
        rateType: selectedRate.rateType,
        rateAmount: Number(selectedRate.rateAmount),
        detentionFreeMinutes: terms.detentionFreeMinutes ?? trip.loadOrder?.shipperProfile.detentionFreeMinutes ?? 0,
        detentionRatePerHour: terms.detentionRatePerHour,
        shortageRatePerUnit: terms.shortageRatePerUnit,
        taxRatePercent: terms.taxRatePercent,
        withholdingRatePercent: terms.withholdingRatePercent,
      })

      const snapshot = {
        version: 1,
        trip: { id: trip.id, tripNumber: trip.tripNumber, plateNumber: trip.truck.plateNumber },
        reconciliation: { id: reconciliation.id, version: reconciliation.version },
        rateCard: {
          id: selectedRate.id,
          contractId: selectedRate.contractId,
          rateType: selectedRate.rateType,
          rateAmount: Number(selectedRate.rateAmount),
          currency: selectedRate.currency,
          terms,
        },
        payee,
        facts: { deliveredQuantity, unit: pods[0].unit, shortageQuantity, detentionMinutes, advanceAlreadyPaid },
        calculation,
        generatedAt: new Date().toISOString(),
      }

      return tx.haulierSettlement.create({
        data: {
          tripId,
          reconciliationId: reconciliation.id,
          rateCardId: selectedRate.id,
          contractId: selectedRate.contractId,
          payeeType: payee.type,
          payeeId: payee.id,
          payeeName: payee.name,
          currency: selectedRate.currency,
          baseFreight: calculation.baseFreight,
          detentionAmount: calculation.detentionAmount,
          extrasAmount: calculation.extrasAmount,
          shortageDeduction: calculation.shortageDeduction,
          fuelAdjustment: calculation.fuelAdjustment,
          taxAmount: calculation.taxAmount,
          withholdingAmount: calculation.withholdingAmount,
          advanceDeduction: calculation.advanceDeduction,
          netPayable: calculation.netPayable,
          snapshotVersion: 1,
          snapshotJson: JSON.stringify(snapshot),
          createdBy: auth.userId,
          lines: {
            create: calculation.lines.map((line) => ({
              tripId,
              type: line.type,
              sourceId: line.sourceId,
              description: line.description,
              amount: line.amount,
            })),
          },
        },
        include: { lines: { orderBy: { createdAt: 'asc' } } },
      })
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'haulier_settlement_generated',
      entity: 'HaulierSettlement',
      entityId: settlement.id,
      details: { tripId: settlement.tripId, payeeType: settlement.payeeType, payeeId: settlement.payeeId, netPayable: Number(settlement.netPayable) },
      ipAddress: getClientIp(request),
    }).catch(() => {})
    await appendOperationalEvent({
      idempotencyKey: `haulier-settlement:${settlement.id}:generated`,
      eventKey: 'settlement.generated',
      type: 'finance.haulier_settlement',
      entityType: 'HaulierSettlement',
      entityId: settlement.id,
      tripId: settlement.tripId,
      actorType: 'user',
      actorId: auth.userId,
      occurredAt: settlement.createdAt,
      source: 'haulier-settlement',
      metadata: { status: settlement.status, payeeType: settlement.payeeType, payeeId: settlement.payeeId, netPayable: Number(settlement.netPayable) },
    })

    return NextResponse.json(publicSettlement(settlement), { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      const conflicts: Record<string, string> = {
        HAULIER_SETTLEMENT_ALREADY_EXISTS: 'This trip already has a haulier settlement.',
        TRIP_NOT_RECONCILED: 'Trip must be reconciled before haulier settlement generation.',
        APPROVED_RECONCILIATION_REQUIRED: 'Approved trip reconciliation is required.',
        TRANSPORT_RATE_REQUIRED: 'No effective transport rate card matches this trip.',
        EXTERNAL_HAULIER_REQUIRED: 'This is an internal fleet movement and does not require a third-party settlement.',
        PROOF_OF_DELIVERY_REQUIRED: 'Verified proof of delivery is required.',
        POD_UNIT_MISMATCH: 'Proof-of-delivery units are inconsistent.',
        INVALID_SETTLEMENT_TERMS: 'The selected rate card has invalid settlement terms.',
      }
      if (error.message === 'TRIP_NOT_FOUND') return NextResponse.json({ error: 'Trip not found.' }, { status: 404 })
      if (conflicts[error.message]) return NextResponse.json({ error: conflicts[error.message], code: error.message }, { status: 409 })
      if ((error as { code?: string }).code === 'P2002') return NextResponse.json({ error: 'This trip already has a haulier settlement.', code: 'HAULIER_SETTLEMENT_ALREADY_EXISTS' }, { status: 409 })
    }
    console.error('Haulier settlement POST error:', error)
    return NextResponse.json({ error: 'Failed to generate haulier settlement.' }, { status: 500 })
  }
}
