import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const advance = await db.cashAdvance.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true, status: true } },
      },
    })

    if (!advance) {
      return NextResponse.json({ error: 'Cash advance not found' }, { status: 404 })
    }

    return NextResponse.json(advance)
  } catch (error) {
    console.error('Cash advance detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch cash advance' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()

    const existing = await db.cashAdvance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Cash advance not found' }, { status: 404 })
    }

    // Only allow editing pending advances
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending advances can be edited' },
        { status: 400 }
      )
    }

    const { amount, purpose, paymentMethod, mobileMoneyRef, mobileMoneyNetwork, tripId, notes } = body

    const advance = await db.cashAdvance.update({
      where: { id },
      data: {
        ...(amount !== undefined ? { amount: parseFloat(amount), remainingBalance: parseFloat(amount) - existing.totalDeducted } : {}),
        ...(purpose !== undefined ? { purpose } : {}),
        ...(paymentMethod !== undefined ? { paymentMethod } : {}),
        ...(mobileMoneyRef !== undefined ? { mobileMoneyRef: mobileMoneyRef || null } : {}),
        ...(mobileMoneyNetwork !== undefined ? { mobileMoneyNetwork: mobileMoneyNetwork || null } : {}),
        ...(tripId !== undefined ? { tripId: tripId || null } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'CashAdvance',
      entityId: advance.id,
      details: { changes: body },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(advance)
  } catch (error) {
    console.error('Cash advance update error:', error)
    return NextResponse.json({ error: 'Failed to update cash advance' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.cashAdvance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Cash advance not found' }, { status: 404 })
    }

    // Only allow deleting pending or rejected advances
    if (!['pending', 'rejected'].includes(existing.status)) {
      return NextResponse.json(
        { error: 'Only pending or rejected advances can be deleted' },
        { status: 400 }
      )
    }

    await db.cashAdvance.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'CashAdvance',
      entityId: id,
      details: { driverId: existing.driverId, amount: existing.amount },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Cash advance delete error:', error)
    return NextResponse.json({ error: 'Failed to delete cash advance' }, { status: 500 })
  }
}
