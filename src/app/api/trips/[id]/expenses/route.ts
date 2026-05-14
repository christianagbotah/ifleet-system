import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Drivers can only view expenses for their own trips
    if (auth.roleName === ROLES.DRIVER && trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const where: Record<string, unknown> = { tripId: id }
    if (category) where.category = category

    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: 'desc' },
    })

    const total = await db.expense.count({ where })

    return NextResponse.json({ data: expenses, total })
  } catch (error) {
    console.error('Trip expenses fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch trip expenses' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const body = await request.json()
    const { category, description, amount, paymentMethod, reference } = body as {
      category: string
      description: string
      amount: number
      paymentMethod?: string
      reference?: string
    }

    if (!category || !description || !amount) {
      return NextResponse.json(
        { error: 'category, description, and amount are required' },
        { status: 400 }
      )
    }

    const trip = await db.trip.findUnique({ where: { id } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Drivers can only add expenses to their own trips
    if (auth.roleName === ROLES.DRIVER && trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Non-drivers still need write access
    if (auth.roleName !== ROLES.DRIVER) {
      const writeGuard = requireWriteAccess(auth)
      if (writeGuard instanceof NextResponse) return writeGuard
    }

    const expense = await db.expense.create({
      data: {
        truckId: trip.truckId,
        category,
        description,
        amount: parseFloat(String(amount)),
        date: new Date(),
        paymentMethod: paymentMethod || 'cash',
        reference,
        status: 'approved',
        tripId: id,
      },
    })

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Trip expense create error:', error)
    return NextResponse.json({ error: 'Failed to create trip expense' }, { status: 500 })
  }
}
