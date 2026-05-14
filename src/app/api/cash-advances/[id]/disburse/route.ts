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
    const { mobileMoneyRef } = body

    const advance = await db.cashAdvance.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    if (!advance) {
      return NextResponse.json({ error: 'Cash advance not found' }, { status: 404 })
    }

    if (advance.status !== 'approved') {
      return NextResponse.json(
        { error: 'Only approved advances can be disbursed' },
        { status: 400 }
      )
    }

    const updated = await db.cashAdvance.update({
      where: { id },
      data: {
        status: 'disbursed',
        disbursedBy: auth.userId,
        disbursedAt: new Date(),
        ...(mobileMoneyRef ? { mobileMoneyRef } : {}),
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
      details: {
        action: 'disburse',
        driverId: advance.driverId,
        driverName: `${advance.driver.firstName} ${advance.driver.lastName}`,
        amount: advance.amount,
        paymentMethod: advance.paymentMethod,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Cash advance disburse error:', error)
    return NextResponse.json({ error: 'Failed to disburse cash advance' }, { status: 500 })
  }
}
