import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function POST(
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
    const { reason } = body

    const advance = await db.cashAdvance.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    if (!advance) {
      return NextResponse.json({ error: 'Cash advance not found' }, { status: 404 })
    }

    if (advance.status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending advances can be rejected' },
        { status: 400 }
      )
    }

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      )
    }

    const updated = await db.cashAdvance.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectionReason: reason,
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'rejection',
      entity: 'CashAdvance',
      entityId: advance.id,
      details: {
        driverId: advance.driverId,
        driverName: `${advance.driver.firstName} ${advance.driver.lastName}`,
        amount: advance.amount,
        purpose: advance.purpose,
        reason,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Cash advance reject error:', error)
    return NextResponse.json({ error: 'Failed to reject cash advance' }, { status: 500 })
  }
}
