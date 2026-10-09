import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { DriverSettlementPaymentError, markDriverSettlementPaid } from '@/lib/domain/settlements/mark-driver-settlement-paid'

// GET /api/settlements/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const settlement = await db.driverSettlement.findUnique({
      where: { id },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true, phone: true },
        },
        SettlementLine: {
          include: {
            trip: {
              select: {
                tripNumber: true, loadingLocation: true, destination: true,
                itemName: true, quantity: true, unit: true,
              },
            },
          },
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!settlement) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })
    return NextResponse.json({ data: { ...settlement, lines: settlement.SettlementLine } })
  } catch (error) {
    console.error('GET /api/settlements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch settlement' }, { status: 500 })
  }
}

// PUT /api/settlements/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>
    const status = typeof body.status === 'string' ? body.status : undefined
    const notes = typeof body.notes === 'string' || body.notes === null ? body.notes : undefined
    const bonusAmount = body.bonusAmount

    const existing = await db.driverSettlement.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })

    if (status) {
      const validTransitions: Record<string, string[]> = {
        pending: ['approved'],
        approved: ['paid'],
        paid: [],
      }
      const allowed = validTransitions[existing.status] ?? []
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from ${existing.status} to ${status}` },
          { status: 400 },
        )
      }
    }

    // Snapshot-backed settlements are immutable financial records. Legacy pending
    // rows may still be edited before they are regenerated into a snapshot.
    if (bonusAmount !== undefined && (existing.status !== 'pending' || existing.snapshotJson || existing.snapshotVersion)) {
      return NextResponse.json(
        { error: 'Settlement financials are locked. Use an approved adjustment workflow instead.', code: 'SETTLEMENT_FINANCIALS_LOCKED' },
        { status: 409 },
      )
    }

    if (status === 'approved' && (!existing.snapshotJson || !existing.snapshotVersion)) {
      return NextResponse.json(
        { error: 'A versioned settlement snapshot is required before approval.', code: 'SETTLEMENT_SNAPSHOT_REQUIRED' },
        { status: 409 },
      )
    }

    if (status === 'paid') {
      if (notes !== undefined) await db.driverSettlement.update({ where: { id }, data: { notes } })
      const paid = await markDriverSettlementPaid(id)
      return NextResponse.json({ data: paid })
    }

    const updateData: Record<string, unknown> = {}
    if (notes !== undefined) updateData.notes = notes

    if (bonusAmount !== undefined) {
      const parsedBonus = Number(bonusAmount)
      if (!Number.isFinite(parsedBonus)) return NextResponse.json({ error: 'bonusAmount must be a finite number.' }, { status: 400 })
      updateData.bonusAmount = parsedBonus
      updateData.netPay = Number(existing.grossEarnings)
        - Number(existing.fuelDeductions)
        - Number(existing.expenseDeductions)
        - Number(existing.advanceDeductions)
        + parsedBonus
    }

    if (status === 'approved') {
      updateData.status = 'approved'
      updateData.approvedBy = auth.userId
      updateData.approvedAt = new Date()
    }

    const settlement = await db.driverSettlement.update({
      where: { id },
      data: updateData,
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true } },
        SettlementLine: true,
      },
    })

    return NextResponse.json({ data: settlement })
  } catch (error) {
    if (error instanceof DriverSettlementPaymentError) {
      const status = error.code === 'SETTLEMENT_NOT_FOUND' ? 404 : 409
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    console.error('PUT /api/settlements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update settlement' }, { status: 500 })
  }
}

// DELETE /api/settlements/[id] — only pending drafts can be removed.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const existing = await db.driverSettlement.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })
    if (existing.status !== 'pending') {
      return NextResponse.json({ error: 'Only pending settlements can be deleted' }, { status: 400 })
    }

    await db.driverSettlement.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/settlements/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete settlement' }, { status: 500 })
  }
}
