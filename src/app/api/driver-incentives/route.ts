import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')
    const driverId = searchParams.get('driverId')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (type) where.type = type
    if (driverId) where.driverId = driverId

    const [incentives, total] = await Promise.all([
      db.driverIncentive.findMany({
        where,
        include: {
          driver: { select: { id: true, firstName: true, lastName: true, phone: true, photo: true } },
          user_DriverIncentive_createdByToUser: { select: { id: true, name: true } },
          user_DriverIncentive_approvedByToUser: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.driverIncentive.count({ where }),
    ])

    const mappedData = incentives.map((record: Record<string, unknown>) => ({
      ...record,
      creator: record.user_DriverIncentive_createdByToUser,
      approver: record.user_DriverIncentive_approvedByToUser,
    }))
    return NextResponse.json({ data: mappedData, total, page, limit })
  } catch (error) {
    console.error('Driver incentives list error:', error)
    return NextResponse.json({ error: 'Failed to fetch driver incentives' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const {
      driverId, type, title, description, amount, period,
      periodStart, periodEnd, metrics, notes,
    } = body

    if (!driverId || !type || !title || !amount) {
      return NextResponse.json(
        { error: 'driverId, type, title, and amount are required' },
        { status: 400 }
      )
    }

    const driver = await db.driver.findUnique({ where: { id: driverId } })
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

    const incentive = await db.driverIncentive.create({
      data: {
        driverId, type, title,
        description: description || null,
        amount: parseFloat(amount),
        period: period || 'one_time',
        periodStart: periodStart ? new Date(periodStart) : null,
        periodEnd: periodEnd ? new Date(periodEnd) : null,
        metrics: metrics || null,
        notes: notes || null,
        createdBy: auth.userId,
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, photo: true } },
        user_DriverIncentive_createdByToUser: { select: { id: true, name: true } },
      },
    })

    createAuditLog({
      userId: auth.userId, action: 'create', entity: 'DriverIncentive', entityId: incentive.id,
      details: { title, amount, type }, ipAddress: getClientIp(request),
    })

    const mapped = {
      ...(incentive as Record<string, unknown>),
      creator: (incentive as Record<string, unknown>).user_DriverIncentive_createdByToUser,
    }
    return NextResponse.json(mapped, { status: 201 })
  } catch (error) {
    console.error('Driver incentive create error:', error)
    return NextResponse.json({ error: 'Failed to create driver incentive' }, { status: 500 })
  }
}
