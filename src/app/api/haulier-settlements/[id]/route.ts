import { NextRequest, NextResponse } from 'next/server'

import { createAuditLog, getClientIp } from '@/lib/audit'
import { requireAuth, ROLES, type AuthContext } from '@/lib/auth-server'
import { db } from '@/lib/db'

function requireFinanceAccess(auth: AuthContext): true | NextResponse {
  if (auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER || auth.permissions.includes('financial.view')) return true
  return NextResponse.json({ error: 'Financial settlement access is required.' }, { status: 403 })
}

const FINANCIAL_FIELDS = new Set([
  'baseFreight', 'detentionAmount', 'extrasAmount', 'shortageDeduction', 'fuelAdjustment',
  'taxAmount', 'withholdingAmount', 'advanceDeduction', 'netPayable', 'payeeId', 'payeeType',
  'tripId', 'reconciliationId', 'rateCardId', 'snapshotJson', 'snapshotVersion',
])

function serialize(settlement: any) {
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const access = requireFinanceAccess(auth)
    if (access instanceof NextResponse) return access
    const { id } = await params
    const settlement = await db.haulierSettlement.findUnique({
      where: { id },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
    })
    if (!settlement) return NextResponse.json({ error: 'Haulier settlement not found.' }, { status: 404 })
    return NextResponse.json(serialize(settlement))
  } catch (error) {
    console.error('Haulier settlement GET error:', error)
    return NextResponse.json({ error: 'Failed to load haulier settlement.' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const access = requireFinanceAccess(auth)
    if (access instanceof NextResponse) return access
    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    if (Object.keys(body).some((key) => FINANCIAL_FIELDS.has(key))) {
      return NextResponse.json({
        error: 'Settlement financial facts are snapshot-controlled and cannot be edited.',
        code: 'HAULIER_SETTLEMENT_FINANCIALS_LOCKED',
      }, { status: 409 })
    }

    const target = typeof body.status === 'string' ? body.status.trim().toLowerCase() : ''
    if (!['approved', 'paid'].includes(target)) {
      return NextResponse.json({ error: 'status must be approved or paid.' }, { status: 400 })
    }

    const updated = await db.$transaction(async (tx) => {
      const settlement = await tx.haulierSettlement.findUnique({
        where: { id },
        include: { lines: { orderBy: { createdAt: 'asc' } } },
      })
      if (!settlement) throw new Error('NOT_FOUND')

      if (target === 'approved') {
        if (settlement.status === 'approved') return settlement
        if (settlement.status !== 'draft') throw new Error('INVALID_TRANSITION')
        if (!settlement.snapshotJson?.trim() || settlement.snapshotVersion < 1) throw new Error('HAULIER_SETTLEMENT_SNAPSHOT_REQUIRED')
        return tx.haulierSettlement.update({
          where: { id },
          data: { status: 'approved', approvedBy: auth.userId, approvedAt: new Date() },
          include: { lines: { orderBy: { createdAt: 'asc' } } },
        })
      }

      if (settlement.status === 'paid') return settlement
      if (settlement.status !== 'approved') throw new Error('INVALID_TRANSITION')
      if (!settlement.snapshotJson?.trim() || settlement.snapshotVersion < 1) throw new Error('HAULIER_SETTLEMENT_SNAPSHOT_REQUIRED')
      return tx.haulierSettlement.update({
        where: { id },
        data: { status: 'paid', paidAt: new Date() },
        include: { lines: { orderBy: { createdAt: 'asc' } } },
      })
    }, { isolationLevel: 'Serializable' })

    createAuditLog({
      userId: auth.userId,
      action: target === 'paid' ? 'haulier_settlement_paid' : 'haulier_settlement_approved',
      entity: 'HaulierSettlement',
      entityId: id,
      details: { status: target, tripId: updated.tripId, payeeId: updated.payeeId, netPayable: Number(updated.netPayable) },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(serialize(updated))
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'NOT_FOUND') return NextResponse.json({ error: 'Haulier settlement not found.' }, { status: 404 })
      if (error.message === 'HAULIER_SETTLEMENT_SNAPSHOT_REQUIRED') return NextResponse.json({ error: 'Settlement snapshot is required before approval/payment.', code: 'HAULIER_SETTLEMENT_SNAPSHOT_REQUIRED' }, { status: 409 })
      if (error.message === 'INVALID_TRANSITION') return NextResponse.json({ error: 'Invalid settlement status transition.', code: 'INVALID_HAULIER_SETTLEMENT_TRANSITION' }, { status: 409 })
    }
    console.error('Haulier settlement PUT error:', error)
    return NextResponse.json({ error: 'Failed to update haulier settlement.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const access = requireFinanceAccess(auth)
    if (access instanceof NextResponse) return access
    const { id } = await params
    const settlement = await db.haulierSettlement.findUnique({ where: { id } })
    if (!settlement) return NextResponse.json({ error: 'Haulier settlement not found.' }, { status: 404 })
    if (settlement.status !== 'draft') {
      return NextResponse.json({ error: 'Approved or paid settlements are immutable.', code: 'HAULIER_SETTLEMENT_FINANCIALS_LOCKED' }, { status: 409 })
    }
    await db.haulierSettlement.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Haulier settlement DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete haulier settlement.' }, { status: 500 })
  }
}
