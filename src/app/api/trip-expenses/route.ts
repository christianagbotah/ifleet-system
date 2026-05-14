import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/trip-expenses?tripId=xxx — List expenses for a trip
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tripId = searchParams.get('tripId')
    const truckId = searchParams.get('truckId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    if (!tripId && !truckId) {
      return NextResponse.json({ error: 'tripId or truckId is required' }, { status: 400 })
    }

    const where: Record<string, unknown> = {}

    if (tripId) where.tripId = tripId
    if (truckId) where.truckId = truckId

    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    const expenses = await db.expense.findMany({
      where,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
      orderBy: { date: 'desc' },
    })

    // Calculate totals
    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)

    // Group by category for summary
    const byCategory: Record<string, { count: number; total: number }> = {}
    for (const exp of expenses) {
      if (!byCategory[exp.category]) {
        byCategory[exp.category] = { count: 0, total: 0 }
      }
      byCategory[exp.category].count += 1
      byCategory[exp.category].total += exp.amount
    }

    return NextResponse.json({
      data: expenses,
      total: expenses.length,
      totalExpenses,
      byCategory,
    })
  } catch (error) {
    console.error('Trip expenses list error:', error)
    return NextResponse.json({ error: 'Failed to fetch trip expenses' }, { status: 500 })
  }
}

// POST /api/trip-expenses — Create a trip expense (driver logs expense)
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const {
      tripId,
      truckId,
      category,
      description,
      amount,
      date,
      paymentMethod = 'cash',
      reference,
    } = body

    if (!tripId || !truckId || !category || !amount) {
      return NextResponse.json(
        { error: 'tripId, truckId, category, and amount are required' },
        { status: 400 }
      )
    }

    // Validate trip exists and is not terminal
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { id: true, status: true, driverId: true, truckId: true },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    if (trip.status === 'completed' || trip.status === 'cancelled') {
      return NextResponse.json(
        { error: `Cannot log expenses for a ${trip.status} trip` },
        { status: 400 }
      )
    }

    if (trip.truckId !== truckId) {
      return NextResponse.json(
        { error: 'Truck does not belong to this trip' },
        { status: 400 }
      )
    }

    const expense = await db.expense.create({
      data: {
        tripId,
        truckId,
        category,
        description: description || category,
        amount: parseFloat(amount),
        date: date ? new Date(date) : new Date(),
        paymentMethod,
        reference: reference || null,
        status: 'pending', // Trip expenses start as pending for admin review
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Trip expense create error:', error)
    return NextResponse.json({ error: 'Failed to create trip expense' }, { status: 500 })
  }
}
