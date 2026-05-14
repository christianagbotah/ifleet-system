import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/trucks/[id]/expenses?dateFrom=xxx&dateTo=xxx — Truck expense summary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const { searchParams } = new URL(request.url)
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const includePending = searchParams.get('includePending') !== 'false'

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id }, select: { id: true, plateNumber: true } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    const where: Record<string, unknown> = { truckId: id }
    if (!includePending) where.status = 'approved'
    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [expenses, total, totalAmount] = await Promise.all([
      db.expense.findMany({
        where,
        include: {
          truck: { select: { plateNumber: true } },
        },
        orderBy: { date: 'desc' },
        take: 100,
      }),
      db.expense.count({ where }),
      db.expense.aggregate({
        where,
        _sum: { amount: true },
      }),
    ])

    // Group by trip
    const byTrip: Record<string, { tripId: string; tripNumber: string; total: number; expenses: typeof expenses }> = {}
    for (const exp of expenses) {
      const key = exp.tripId || 'no-trip'
      if (!byTrip[key]) {
        // Try to get trip number
        let tripNumber = 'Unassigned'
        if (exp.tripId) {
          const trip = await db.trip.findUnique({ where: { id: exp.tripId }, select: { tripNumber: true } })
          if (trip) tripNumber = trip.tripNumber
        }
        byTrip[key] = { tripId: exp.tripId || '', tripNumber, total: 0, expenses: [] }
      }
      byTrip[key].expenses.push(exp)
      byTrip[key].total += exp.amount
    }

    // Group by category
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
      total,
      totalAmount: totalAmount._sum.amount || 0,
      byTrip: Object.values(byTrip),
      byCategory,
    })
  } catch (error) {
    console.error('Truck expenses error:', error)
    return NextResponse.json({ error: 'Failed to fetch truck expenses' }, { status: 500 })
  }
}
