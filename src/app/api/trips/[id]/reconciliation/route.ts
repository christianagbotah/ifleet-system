import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, ROLES, type AuthContext } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { appendOperationalEvent } from '@/lib/domain/events/operational-event'
import { canTransition, type TripStatusValue } from '@/lib/domain/dispatch/trip-state-machine'
import { buildTripTransitionUpdate } from '@/lib/domain/dispatch/transition-trip'
import { planReconciliationExceptionResolution } from '@/lib/domain/reconciliation/exception-resolution'
import {
  buildReconciliationSnapshot,
  canFinalizeReconciliation,
  type ReconciliationInput,
  type ReconciliationSnapshot,
} from '@/lib/domain/reconciliation/reconcile-trip'

function requireReconciliationAccess(auth: AuthContext): true | NextResponse {
  if (auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER || auth.permissions.includes('expenses.view') || auth.permissions.includes('financial.view')) return true
  return NextResponse.json({ error: 'Financial reconciliation access is required.' }, { status: 403 })
}

async function loadInput(client: any, tripId: string): Promise<ReconciliationInput> {
  const [fuel, tolls, expenses, advances, deliveryExceptions, adjustments, reconciliationExceptions] = await Promise.all([
    client.fuelLog.findMany({ where: { tripId }, select: { id: true, totalCost: true, receiptNumber: true } }),
    client.tollRecord.findMany({ where: { tripId }, select: { id: true, amount: true, referenceNumber: true, status: true } }),
    client.expense.findMany({ where: { tripId }, select: { id: true, amount: true, category: true, reference: true, status: true } }),
    client.cashAdvance.findMany({ where: { tripId }, select: { id: true, amount: true, status: true } }),
    client.deliveryException.findMany({ where: { tripId }, select: { id: true, type: true, status: true, quantity: true } }),
    client.reconciliationAdjustment.findMany({ where: { tripId }, select: { id: true, amount: true, status: true, reason: true } }),
    client.reconciliationException.findMany({ where: { tripId }, select: { id: true, type: true, status: true } }),
  ])

  return {
    tripId,
    fuel: fuel.map((item: any) => ({ id: item.id, amount: Number(item.totalCost), reference: item.receiptNumber })),
    tolls: tolls.map((item: any) => ({ id: item.id, amount: Number(item.amount), reference: item.referenceNumber, status: item.status })),
    expenses: expenses.map((item: any) => ({ id: item.id, amount: Number(item.amount), category: item.category, reference: item.reference, status: item.status })),
    advances: advances.map((item: any) => ({ id: item.id, amount: Number(item.amount), status: item.status })),
    deliveryExceptions: deliveryExceptions.map((item: any) => ({ id: item.id, type: item.type, status: item.status, quantity: item.quantity })),
    adjustments: adjustments.map((item: any) => ({ id: item.id, amount: Number(item.amount), status: item.status, reason: item.reason })),
    reconciliationExceptions: reconciliationExceptions.map((item: any) => ({ id: item.id, type: item.type, status: item.status })),
  }
}

function serializeSnapshot(snapshot: ReconciliationSnapshot) {
  return JSON.stringify(snapshot)
}

async function latestReconciliation(tripId: string) {
  return db.tripReconciliation.findFirst({
    where: { tripId },
    include: { lines: { orderBy: { createdAt: 'asc' } } },
    orderBy: { version: 'desc' },
  })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const access = requireReconciliationAccess(auth)
    if (access instanceof NextResponse) return access
    const { id } = await params
    const trip = await db.trip.findUnique({ where: { id }, select: { id: true, tripNumber: true, status: true } })
    if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

    const input = await loadInput(db, id)
    const snapshot = buildReconciliationSnapshot(input)
    const latest = await latestReconciliation(id)
    return NextResponse.json({ trip, snapshot, decision: canFinalizeReconciliation(snapshot), latest })
  } catch (error) {
    console.error('Trip reconciliation GET error:', error)
    return NextResponse.json({ error: 'Failed to load trip reconciliation' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const access = requireReconciliationAccess(auth)
    if (access instanceof NextResponse) return access
    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const action = typeof body.action === 'string' ? body.action : 'finalize'

    if (action === 'create_adjustment') {
      const amount = Number(body.amount)
      const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (!Number.isFinite(amount) || !reason) return NextResponse.json({ error: 'Adjustment amount and reason are required.' }, { status: 400 })
      const adjustment = await db.reconciliationAdjustment.create({ data: { tripId: id, amount, reason, createdBy: auth.userId } })
      return NextResponse.json(adjustment, { status: 201 })
    }

    if (action === 'approve_adjustment') {
      if (auth.roleName !== ROLES.ADMIN && auth.roleName !== ROLES.MANAGER) return NextResponse.json({ error: 'Admin or Manager approval is required.' }, { status: 403 })
      const adjustmentId = typeof body.adjustmentId === 'string' ? body.adjustmentId : ''
      const adjustment = await db.reconciliationAdjustment.findFirst({ where: { id: adjustmentId, tripId: id } })
      if (!adjustment) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 })
      const updated = await db.reconciliationAdjustment.update({ where: { id: adjustment.id }, data: { status: 'approved', approvedBy: auth.userId, approvedAt: new Date() } })
      return NextResponse.json(updated)
    }

    if (action === 'resolve_exception') {
      if (auth.roleName !== ROLES.ADMIN && auth.roleName !== ROLES.MANAGER) {
        return NextResponse.json({ error: 'Admin or Manager review is required.' }, { status: 403 })
      }
      const exceptionId = typeof body.exceptionId === 'string' ? body.exceptionId.trim() : ''
      const resolutionNotes = typeof body.resolutionNotes === 'string' ? body.resolutionNotes : ''
      const adjustmentAmount = body.adjustmentAmount == null || body.adjustmentAmount === '' ? 0 : Number(body.adjustmentAmount)
      const adjustmentReason = typeof body.adjustmentReason === 'string' ? body.adjustmentReason : null
      if (!exceptionId) return NextResponse.json({ error: 'exceptionId is required.' }, { status: 400 })

      const reviewed = await db.$transaction(async (tx) => {
        const exception = await tx.reconciliationException.findFirst({ where: { id: exceptionId, tripId: id } })
        if (!exception) throw new Error('RECONCILIATION_EXCEPTION_NOT_FOUND')
        const plan = planReconciliationExceptionResolution({
          status: exception.status,
          resolutionNotes,
          adjustmentAmount,
          adjustmentReason,
        })

        const adjustment = plan.adjustment
          ? await tx.reconciliationAdjustment.create({
            data: {
              tripId: id,
              amount: plan.adjustment.amount,
              reason: plan.adjustment.reason,
              status: 'approved',
              createdBy: auth.userId,
              approvedBy: auth.userId,
              approvedAt: new Date(),
            },
          })
          : null

        const resolved = await tx.reconciliationException.update({
          where: { id: exception.id },
          data: {
            status: 'resolved',
            resolutionNotes: resolutionNotes.trim(),
            resolvedBy: auth.userId,
            resolvedAt: new Date(),
          },
        })
        return { exception: resolved, adjustment }
      }, { isolationLevel: 'Serializable' })

      createAuditLog({
        userId: auth.userId,
        action: 'reconciliation_exception_resolved',
        entity: 'ReconciliationException',
        entityId: reviewed.exception.id,
        details: {
          tripId: id,
          adjustmentId: reviewed.adjustment?.id ?? null,
          adjustmentAmount: reviewed.adjustment ? Number(reviewed.adjustment.amount) : 0,
        },
        ipAddress: getClientIp(request),
      }).catch(() => {})
      return NextResponse.json(reviewed)
    }

    if (action !== 'finalize') return NextResponse.json({ error: 'Unsupported reconciliation action.' }, { status: 400 })

    const result = await db.$transaction(async (tx) => {
      const trip = await tx.trip.findUnique({
        where: { id },
        select: {
          id: true,
          tripNumber: true,
          status: true,
          driverId: true,
          arrivalTime: true,
          loadingStartedAt: true,
          loadingCompletedAt: true,
          offloadingStartedAt: true,
          offloadingCompletedAt: true,
        },
      })
      if (!trip) throw new Error('TRIP_NOT_FOUND')
      const decision = canTransition(trip.status as TripStatusValue, 'reconciled')
      if (!decision.allowed) throw new Error(`INVALID_STATE:${decision.reason ?? 'Trip must be awaiting reconciliation'}`)

      const input = await loadInput(tx, id)
      const snapshot = buildReconciliationSnapshot(input)
      const finalization = canFinalizeReconciliation(snapshot)
      if (!finalization.allowed) {
        const error = new Error('RECONCILIATION_BLOCKED') as Error & { snapshot?: ReconciliationSnapshot }
        error.snapshot = snapshot
        throw error
      }

      const latest = await tx.tripReconciliation.findFirst({ where: { tripId: id }, select: { version: true }, orderBy: { version: 'desc' } })
      const version = (latest?.version ?? 0) + 1
      const reconciliation = await tx.tripReconciliation.create({
        data: {
          tripId: id,
          version,
          status: 'approved',
          fuelTotal: snapshot.totals.fuel,
          tollTotal: snapshot.totals.tolls,
          expenseTotal: snapshot.totals.expenses,
          adjustmentTotal: snapshot.totals.adjustments,
          operationalCost: snapshot.totals.operationalCost,
          advanceTotal: snapshot.totals.advances,
          snapshotJson: serializeSnapshot(snapshot),
          blockersJson: JSON.stringify(snapshot.blockers),
          createdBy: auth.userId,
          approvedBy: auth.userId,
          approvedAt: new Date(),
          lines: {
            create: snapshot.lines.map((line) => ({
              sourceType: line.sourceType,
              sourceId: line.sourceId,
              category: line.category ?? null,
              reference: line.reference,
              amount: line.amount,
              includedInCost: line.sourceType !== 'advance',
              metadata: line.reason ? JSON.stringify({ reason: line.reason }) : null,
            })),
          },
        },
        include: { lines: true },
      })

      const tripUpdate = buildTripTransitionUpdate('reconciled', trip)
      const updatedTrip = await tx.trip.update({ where: { id }, data: tripUpdate as never })
      await tx.tripEvent.create({
        data: {
          tripId: id,
          fromStatus: trip.status,
          toStatus: 'reconciled',
          userId: auth.userId,
          notes: `Trip reconciliation v${version} approved`,
          metadata: JSON.stringify({ reconciliationId: reconciliation.id, operationalCost: snapshot.totals.operationalCost, advanceTotal: snapshot.totals.advances }),
        },
      })
      return { reconciliation, trip: updatedTrip, snapshot }
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: 'trip_reconciliation_approved',
      entity: 'Trip',
      entityId: id,
      details: { reconciliationId: result.reconciliation.id, version: result.reconciliation.version, operationalCost: result.snapshot.totals.operationalCost },
      ipAddress: getClientIp(request),
    }).catch(() => {})
    await appendOperationalEvent({
      idempotencyKey: `trip-reconciliation:${result.reconciliation.id}`,
      eventKey: 'trip.reconciled',
      type: 'finance.reconciliation_approved',
      entityType: 'TripReconciliation',
      entityId: result.reconciliation.id,
      tripId: id,
      actorType: 'user',
      actorId: auth.userId,
      occurredAt: result.reconciliation.approvedAt ?? result.reconciliation.createdAt,
      source: 'reconciliation',
      metadata: { version: result.reconciliation.version, operationalCost: result.snapshot.totals.operationalCost, advanceTotal: result.snapshot.totals.advances },
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'TRIP_NOT_FOUND') return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
      if (error.message === 'RECONCILIATION_EXCEPTION_NOT_FOUND') return NextResponse.json({ error: 'Reconciliation exception not found.' }, { status: 404 })
      if (/already resolved/i.test(error.message)) return NextResponse.json({ error: error.message, code: 'RECONCILIATION_EXCEPTION_ALREADY_RESOLVED' }, { status: 409 })
      if (/resolution notes|adjustment reason|finite number/i.test(error.message)) return NextResponse.json({ error: error.message, code: 'INVALID_RECONCILIATION_EXCEPTION_RESOLUTION' }, { status: 400 })
      if (error.message.startsWith('INVALID_STATE:')) return NextResponse.json({ error: error.message.slice('INVALID_STATE:'.length), code: 'INVALID_RECONCILIATION_STATE' }, { status: 409 })
      if (error.message === 'RECONCILIATION_BLOCKED') return NextResponse.json({ error: 'Reconciliation has unresolved blockers.', code: 'RECONCILIATION_BLOCKED', snapshot: (error as Error & { snapshot?: ReconciliationSnapshot }).snapshot }, { status: 409 })
    }
    console.error('Trip reconciliation POST error:', error)
    return NextResponse.json({ error: 'Failed to finalize trip reconciliation' }, { status: 500 })
  }
}
