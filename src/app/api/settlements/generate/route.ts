import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

const TERMINAL_STATUSES = ['completed', 'cancelled']

// POST /api/settlements/generate — auto-generate settlement from trips
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { driverId, periodStart, periodEnd } = body

    if (!driverId || !periodStart || !periodEnd) {
      return NextResponse.json(
        { error: 'Missing required fields: driverId, periodStart, periodEnd' },
        { status: 400 }
      )
    }

    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    // Format period as "YYYY-MM"
    const month = start.getMonth() + 1
    const year = start.getFullYear()
    const period = `${year}-${String(month).padStart(2, '0')}`

    // Check for existing settlement
    const existing = await db.driverSettlement.findFirst({
      where: { driverId, period },
    })
    if (existing) {
      return NextResponse.json(
        { error: `Settlement already exists for this driver and period (${period})` },
        { status: 409 }
      )
    }

    // Find completed trips for this driver in the period
    const trips = await db.trip.findMany({
      where: {
        driverId,
        status: { in: TERMINAL_STATUSES },
        createdAt: { gte: start, lte: end },
      },
      include: {
        truck: { select: { plateNumber: true } },
      },
    })

    // Find expenses for this driver in the period (via trip expenses)
    // We look at expenses linked to trips for this driver
    const driverTrips = await db.trip.findMany({
      where: { driverId },
      select: { id: true },
    })
    const driverTripIds = driverTrips.map(t => t.id)

    const expenses = await db.expense.findMany({
      where: {
        tripId: { in: driverTripIds },
        date: { gte: start, lte: end },
        category: { not: 'fuel' }, // fuel is handled separately
        status: 'approved',
      },
    })

    // Build settlement lines
    const lines: { tripId?: string; description: string; type: string; amount: number }[] = []

    let grossEarnings = 0
    let fuelDeductions = 0
    let expenseDeductions = 0

    // Trip revenue lines
    for (const trip of trips) {
      const revenue = trip.totalRevenue || 0
      if (revenue > 0) {
        grossEarnings += revenue
        lines.push({
          tripId: trip.id,
          description: `Trip ${trip.tripNumber} — ${trip.loadingLocation} to ${trip.destination}`,
          type: 'trip_revenue',
          amount: revenue,
        })
      }

      // Fuel deduction from trip
      const fuelCost = trip.fuelCost || 0
      if (fuelCost > 0) {
        fuelDeductions += fuelCost
        lines.push({
          tripId: trip.id,
          description: `Fuel cost — Trip ${trip.tripNumber} (${trip.truck.plateNumber})`,
          type: 'fuel_deduction',
          amount: -fuelCost,
        })
      }
    }

    // Expense deduction lines
    for (const expense of expenses) {
      expenseDeductions += expense.amount
      lines.push({
        description: `${expense.description} (${expense.category})`,
        type: 'expense_deduction',
        amount: -expense.amount,
      })
    }

    const bonusAmount = 0
    const netPay = grossEarnings - fuelDeductions - expenseDeductions + bonusAmount

    // Create settlement
    const settlement = await db.driverSettlement.create({
      data: {
        driverId,
        period,
        periodStart: start,
        periodEnd: end,
        grossEarnings,
        fuelDeductions,
        expenseDeductions,
        bonusAmount,
        netPay,
        lines: {
          create: lines.map(line => ({
            tripId: line.tripId || null,
            description: line.description,
            type: line.type,
            amount: line.amount,
          })),
        },
      },
      include: {
        driver: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, photo: true },
        },
        lines: {
          include: {
            trip: {
              select: {
                tripNumber: true, loadingLocation: true, destination: true,
                itemName: true, quantity: true, unit: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    return NextResponse.json({ data: settlement }, { status: 201 })
  } catch (error) {
    console.error('POST /api/settlements/generate error:', error)
    return NextResponse.json({ error: 'Failed to generate settlement' }, { status: 500 })
  }
}
