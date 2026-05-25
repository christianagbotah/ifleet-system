import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'

const TERMINAL_STATUSES = ['completed', 'cancelled']

// GET /api/settlements?driverId=&status=&period=&page=&limit=
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    let driverId = searchParams.get('driverId')
    const status = searchParams.get('status')
    const period = searchParams.get('period')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const isDriver = auth.roleName === ROLES.DRIVER

    // Drivers can only see their own settlements
    if (isDriver) {
      driverId = auth.driverId || undefined
    }

    const where: Record<string, unknown> = {}
    if (driverId) where.driverId = driverId
    if (status) where.status = status
    if (period) where.period = period

    const [settlements, total] = await Promise.all([
      db.driverSettlement.findMany({
        where,
        include: {
          driver: {
            select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true },
          },
          _count: { select: { SettlementLine: true } },
        },
        orderBy: { periodStart: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.driverSettlement.count({ where }),
    ])

    // Only Admin/Manager see fleet-wide summary
    let summary = null
    if (!isDriver) {
      const [pendingStats, approvedStats, paidThisMonth] = await Promise.all([
        db.driverSettlement.aggregate({ where: { status: 'pending' }, _count: true, _sum: { netPay: true } }),
        db.driverSettlement.aggregate({ where: { status: 'approved' }, _count: true, _sum: { netPay: true } }),
        db.driverSettlement.aggregate({ where: { status: 'paid', paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }, _sum: { netPay: true } }),
      ])

      const avgResult = await db.driverSettlement.aggregate({ _avg: { netPay: true } })
      const avgSettlement = avgResult._avg.netPay || 0

      summary = {
        pendingCount: pendingStats._count,
        pendingTotal: pendingStats._sum.netPay || 0,
        approvedCount: approvedStats._count,
        approvedTotal: approvedStats._sum.netPay || 0,
        paidThisMonth: paidThisMonth._sum.netPay || 0,
        avgSettlement,
      }
    }

    return NextResponse.json({
      data: settlements,
      total,
      page,
      limit,
      summary,
    })
  } catch (error) {
    console.error('GET /api/settlements error:', error)
    return NextResponse.json({ error: 'Failed to fetch settlements' }, { status: 500 })
  }
}

// POST /api/settlements — manual create
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const {
      driverId, period, periodStart, periodEnd,
      grossEarnings, fuelDeductions, expenseDeductions,
      bonusAmount, netPay, notes, lines,
    } = body

    if (!driverId || !period || !periodStart || !periodEnd) {
      return NextResponse.json({ error: 'Missing required fields: driverId, period, periodStart, periodEnd' }, { status: 400 })
    }

    // Check for existing settlement
    const existing = await db.driverSettlement.findFirst({
      where: { driverId, period },
    })
    if (existing) {
      return NextResponse.json({ error: `Settlement already exists for this driver and period` }, { status: 409 })
    }

    const settlement = await db.driverSettlement.create({
      data: {
        driverId,
        period,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        grossEarnings: grossEarnings || 0,
        fuelDeductions: fuelDeductions || 0,
        expenseDeductions: expenseDeductions || 0,
        bonusAmount: bonusAmount || 0,
        netPay: netPay || (grossEarnings || 0) - (fuelDeductions || 0) - (expenseDeductions || 0) + (bonusAmount || 0),
        notes: notes || null,
        SettlementLine: lines ? {
          create: lines.map((line: { tripId?: string; description: string; type: string; amount: number }) => ({
            tripId: line.tripId || null,
            description: line.description,
            type: line.type,
            amount: line.amount,
          })),
        } : undefined,
      },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true },
        },
        SettlementLine: { include: { trip: { select: { tripNumber: true, loadingLocation: true, destination: true } } } },
      },
    })

    return NextResponse.json({ data: settlement }, { status: 201 })
  } catch (error) {
    console.error('POST /api/settlements error:', error)
    return NextResponse.json({ error: 'Failed to create settlement' }, { status: 500 })
  }
}
