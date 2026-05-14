import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole, ROLES } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const { searchParams } = new URL(request.url)
    const month = searchParams.get('month')
    const year = searchParams.get('year')
    const driverId = searchParams.get('driverId')
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (month) where.month = parseInt(month)
    if (year) where.year = parseInt(year)
    if (driverId) where.driverId = driverId
    if (status) where.status = status

    const [records, total] = await Promise.all([
      db.payroll.findMany({
        where,
        include: {
          driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
        },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.payroll.count({ where }),
    ])

    // Calculate summary for filtered set
    const summary = await db.payroll.aggregate({
      _sum: {
        baseSalary: true,
        tripBonus: true,
        overtimePay: true,
        deductions: true,
        netPay: true,
      },
      where,
    })

    return NextResponse.json({
      data: records,
      total,
      page,
      limit,
      summary: {
        totalBaseSalary: summary._sum.baseSalary || 0,
        totalTripBonus: summary._sum.tripBonus || 0,
        totalOvertimePay: summary._sum.overtimePay || 0,
        totalDeductions: summary._sum.deductions || 0,
        totalNetPay: summary._sum.netPay || 0,
      },
    })
  } catch (error) {
    console.error('Payroll list error:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll records' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, [ROLES.ADMIN, ROLES.MANAGER])
    if (auth instanceof NextResponse) return auth
    const body = await request.json()

    const {
      driverId,
      month,
      year,
      baseSalary,
      tripBonus,
      overtimePay,
      deductions,
      notes,
    } = body

    if (!driverId || !month || !year || baseSalary === undefined) {
      return NextResponse.json(
        { error: 'driverId, month, year, and baseSalary are required' },
        { status: 400 }
      )
    }

    // Verify driver exists
    const driver = await db.driver.findUnique({ where: { id: driverId } })
    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    // Check for existing payroll for this driver/month/year
    const existing = await db.payroll.findFirst({
      where: { driverId, month: parseInt(month), year: parseInt(year) },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Payroll record already exists for this driver and period' },
        { status: 400 }
      )
    }

    const parsedBaseSalary = parseFloat(baseSalary)
    const parsedTripBonus = parseFloat(tripBonus || 0)
    const parsedOvertimePay = parseFloat(overtimePay || 0)
    const parsedDeductions = parseFloat(deductions || 0)
    const netPay = parsedBaseSalary + parsedTripBonus + parsedOvertimePay - parsedDeductions

    const payroll = await db.payroll.create({
      data: {
        driverId,
        month: parseInt(month),
        year: parseInt(year),
        baseSalary: parsedBaseSalary,
        tripBonus: parsedTripBonus,
        overtimePay: parsedOvertimePay,
        deductions: parsedDeductions,
        netPay,
        ...(notes !== undefined && { notes }),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
      },
    })

    return NextResponse.json(payroll, { status: 201 })
  } catch (error) {
    console.error('Payroll create error:', error)
    return NextResponse.json({ error: 'Failed to create payroll record' }, { status: 500 })
  }
}
