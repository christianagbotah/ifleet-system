import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/trips/expenses?tripId=xxx
// POST /api/trips/expenses - Create a trip expense
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tripId = searchParams.get('tripId')

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 })
    }

    const expenses = await db.expense.findMany({
      where: { tripId },
      orderBy: { date: 'desc' },
    })

    return NextResponse.json({ data: expenses })
  } catch (error) {
    console.error('Trip expenses fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch trip expenses' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { tripId, category, description, amount, paymentMethod, reference } = body

    if (!tripId || !category || !description || !amount) {
      return NextResponse.json(
        { error: 'tripId, category, description, and amount are required' },
        { status: 400 }
      )
    }

    // Verify trip exists
    const trip = await db.trip.findUnique({ where: { id: tripId } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Valid expense categories for drivers
    const validCategories = ['fuel', 'toll', 'fine', 'parking', 'food', 'miscellaneous']
    if (!validCategories.includes(category)) {
      return NextResponse.json({ error: `Invalid category: ${category}` }, { status: 400 })
    }

    const expense = await db.expense.create({
      data: {
        truckId: trip.truckId,
        tripId,
        category,
        description,
        amount: parseFloat(amount),
        date: new Date(),
        paymentMethod: paymentMethod || 'cash',
        reference,
        status: 'approved',
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Trip expense create error:', error)
    return NextResponse.json({ error: 'Failed to create trip expense' }, { status: 500 })
  }
}
