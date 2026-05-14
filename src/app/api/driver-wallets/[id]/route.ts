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

    const wallet = await db.driverWallet.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
      },
    })

    if (!wallet) {
      return NextResponse.json({ error: 'Driver wallet not found' }, { status: 404 })
    }

    // Get recent advances for this driver
    const recentAdvances = await db.cashAdvance.findMany({
      where: { driverId: wallet.driverId },
      take: 10,
      orderBy: { requestDate: 'desc' },
      include: {
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
      },
    })

    return NextResponse.json({ ...wallet, recentAdvances })
  } catch (error) {
    console.error('Driver wallet detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch driver wallet' }, { status: 500 })
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

    const existing = await db.driverWallet.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Driver wallet not found' }, { status: 404 })
    }

    const {
      monthlyAdvanceLimit,
      mobileMoneyNumber,
      mobileMoneyNetwork,
      preferredPaymentMethod,
    } = body

    const wallet = await db.driverWallet.update({
      where: { id },
      data: {
        ...(monthlyAdvanceLimit !== undefined ? { monthlyAdvanceLimit: monthlyAdvanceLimit ? parseFloat(monthlyAdvanceLimit) : null } : {}),
        ...(mobileMoneyNumber !== undefined ? { mobileMoneyNumber: mobileMoneyNumber || null } : {}),
        ...(mobileMoneyNetwork !== undefined ? { mobileMoneyNetwork: mobileMoneyNetwork || null } : {}),
        ...(preferredPaymentMethod !== undefined ? { preferredPaymentMethod } : {}),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'update',
      entity: 'DriverWallet',
      entityId: id,
      details: { driverId: existing.driverId, changes: body },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(wallet)
  } catch (error) {
    console.error('Driver wallet update error:', error)
    return NextResponse.json({ error: 'Failed to update driver wallet' }, { status: 500 })
  }
}
