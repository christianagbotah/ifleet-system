import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import type { AuthContext } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { cashAdvanceSchema, parseBody } from '@/lib/schemas'
import { z } from 'zod'

/** Create cash advance — fields differ from shared cashAdvanceSchema (uses 'purpose' not 'reason') */
const cashAdvanceCreateSchema = z.object({
  driverId: z.string().min(1, 'Driver is required'),
  tripId: z.string().optional(),
  amount: z.coerce.number().positive('Amount must be positive'),
  purpose: z.string().min(1, 'Purpose is required'),
  paymentMethod: z.string().optional(),
  mobileMoneyRef: z.string().optional(),
  mobileMoneyNetwork: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    let driverId = searchParams.get('driverId')
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const isDriver = auth.roleName === ROLES.DRIVER

    // Drivers can only see their own advances
    if (isDriver) {
      driverId = auth.driverId ?? null
    }

    const where: Record<string, unknown> = {}

    if (driverId) where.driverId = driverId
    if (status) where.status = status

    if (!isDriver && search) {
      where.OR = [
        { driver: { firstName: { contains: search } } },
        { driver: { lastName: { contains: search } } },
        { driver: { phone: { contains: search } } },
        { purpose: { contains: search } },
      ]
    }

    if (dateFrom || dateTo) {
      where.requestDate = {}
      if (dateFrom) (where.requestDate as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.requestDate as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [advances, total] = await Promise.all([
      db.cashAdvance.findMany({
        where,
        include: {
          driver: isDriver
            ? { select: { id: true, firstName: true, lastName: true } }
            : { select: { id: true, firstName: true, lastName: true, phone: true } },
          trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
        },
        orderBy: { requestDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.cashAdvance.count({ where }),
    ])

    // Only Admin/Manager see fleet-wide summary
    let summary: Record<string, unknown> | null = null
    if (!isDriver) {
      const [pendingResult, outstandingResult, thisMonthResult, allAdvancesResult] = await Promise.all([
        db.cashAdvance.aggregate({ _sum: { amount: true }, _count: true, where: { status: 'pending' } }),
        db.cashAdvance.aggregate({ _sum: { remainingBalance: true }, _count: true, where: { status: { in: ['approved', 'disbursed', 'partially_deducted'] } } }),
        db.cashAdvance.aggregate({ _sum: { amount: true }, _count: true, where: { requestDate: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }),
        db.cashAdvance.aggregate({ _avg: { amount: true }, _sum: { amount: true }, _count: true }),
      ])

      summary = {
        pendingAmount: pendingResult._sum.amount || 0,
        pendingCount: pendingResult._count,
        outstandingAmount: outstandingResult._sum.remainingBalance || 0,
        outstandingCount: outstandingResult._count,
        thisMonthAmount: thisMonthResult._sum.amount || 0,
        thisMonthCount: thisMonthResult._count,
        avgAmount: allAdvancesResult._avg.amount || 0,
        totalCount: allAdvancesResult._count,
      }
    }

    return NextResponse.json({ data: advances, total, page, limit, summary })
  } catch (error) {
    console.error('Cash advances list error:', error)
    return NextResponse.json({ error: 'Failed to fetch cash advances' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    // Drivers can create cash advance requests for themselves only
    const isDriver = auth.roleName === ROLES.DRIVER
    if (!isDriver) {
      const writeGuard = requireWriteAccess(auth)
      if (writeGuard instanceof NextResponse) return writeGuard
    }

    const raw = await request.json()
    const parsed = parseBody(cashAdvanceCreateSchema, raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.errors.join(', ') }, { status: 400 })
    }
    const {
      driverId,
      tripId,
      amount,
      purpose,
      paymentMethod,
      mobileMoneyRef,
      mobileMoneyNetwork,
      notes,
    } = parsed.data

    // Drivers must create requests for themselves only
    if (isDriver && driverId !== auth.driverId) {
      return NextResponse.json(
        { error: 'Drivers can only create cash advance requests for themselves' },
        { status: 403 }
      )
    }

    // Verify driver exists
    const driver = await db.driver.findUnique({ where: { id: driverId } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    // Verify trip if provided
    if (tripId) {
      const trip = await db.trip.findUnique({ where: { id: tripId } })
      if (!trip) {
        return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
      }
    }

    const advance = await db.cashAdvance.create({
      data: {
        driverId,
        tripId: tripId || null,
        amount,
        purpose,
        paymentMethod: paymentMethod || 'cash',
        mobileMoneyRef: mobileMoneyRef || null,
        mobileMoneyNetwork: mobileMoneyNetwork || null,
        remainingBalance: amount,
        notes: notes || null,
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        trip: { select: { id: true, tripNumber: true, loadingLocation: true, destination: true } },
      },
    })

    // Audit log
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'CashAdvance',
      entityId: advance.id,
      details: { driverId, amount: advance.amount, purpose, paymentMethod },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(advance, { status: 201 })
  } catch (error) {
    console.error('Cash advance create error:', error)
    return NextResponse.json({ error: 'Failed to create cash advance' }, { status: 500 })
  }
}
