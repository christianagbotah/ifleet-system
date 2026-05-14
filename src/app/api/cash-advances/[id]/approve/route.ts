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
        { error: 'Only pending advances can be approved' },
        { status: 400 }
      )
    }

    // Update advance status
    const updated = await db.cashAdvance.update({
      where: { id },
      data: {
        status: 'approved',
        approvedBy: auth.userId,
        approvedAt: new Date(),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
      },
    })

    // Update or create driver wallet
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const wallet = await db.driverWallet.upsert({
      where: { driverId: advance.driverId },
      create: {
        driverId: advance.driverId,
        totalAdvances: advance.amount,
        monthlyAdvancesThisMonth: advance.amount,
        lastAdvanceDate: now,
        availableBalance: -advance.amount, // Driver now owes the fleet
      },
      update: {
        totalAdvances: { increment: advance.amount },
        monthlyAdvancesThisMonth: { increment: advance.amount },
        lastAdvanceDate: now,
        availableBalance: { decrement: advance.amount },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'approval',
      entity: 'CashAdvance',
      entityId: advance.id,
      details: {
        driverId: advance.driverId,
        driverName: `${advance.driver.firstName} ${advance.driver.lastName}`,
        amount: advance.amount,
        purpose: advance.purpose,
      },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Cash advance approve error:', error)
    return NextResponse.json({ error: 'Failed to approve cash advance' }, { status: 500 })
  }
}
