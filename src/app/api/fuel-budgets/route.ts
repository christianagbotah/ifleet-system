import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || '')
    const month = parseInt(searchParams.get('month') || '')
    const truckId = searchParams.get('truckId')

    const where: Record<string, unknown> = {}
    if (!isNaN(year)) where.year = year
    if (!isNaN(month)) where.month = month
    if (truckId) where.truckId = truckId

    const budgets = await db.fuelBudget.findMany({
      where,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    })

    // Compute actual spend and liters from fuel logs for each budget
    const enrichedBudgets = await Promise.all(budgets.map(async (budget) => {
      const monthStart = new Date(budget.year, budget.month - 1, 1)
      const monthEnd = new Date(budget.year, budget.month, 0, 23, 59, 59, 999)

      const fuelWhere: Record<string, unknown> = {
        date: { gte: monthStart, lte: monthEnd },
      }
      if (budget.truckId) {
        fuelWhere.truckId = budget.truckId
      }

      const agg = await db.fuelLog.aggregate({
        _sum: { totalCost: true, litersFilled: true },
        where: fuelWhere,
      })

      return {
        ...budget,
        actualSpend: agg._sum.totalCost || 0,
        actualLiters: agg._sum.litersFilled || 0,
      }
    }))

    return NextResponse.json(enrichedBudgets)
  } catch (error) {
    console.error('Fuel budgets list error:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel budgets' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { truckId, month, year, budgetLimit, litersLimit, notes } = body

    if (!month || !year || !budgetLimit) {
      return NextResponse.json(
        { error: 'month, year, and budgetLimit are required' },
        { status: 400 }
      )
    }

    if (month < 1 || month > 12) {
      return NextResponse.json({ error: 'month must be between 1 and 12' }, { status: 400 })
    }

    // Verify truck exists if truckId provided
    if (truckId) {
      const truck = await db.truck.findUnique({ where: { id: truckId } })
      if (!truck) {
        return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
      }
    }

    // Check for existing budget
    const existing = await db.fuelBudget.findUnique({
      where: { truckId_month_year: { truckId: truckId || null, month, year } },
    })

    if (existing) {
      return NextResponse.json(
        { error: 'Budget already exists for this truck and period. Use PUT to update.' },
        { status: 409 }
      )
    }

    // Compute initial actuals from fuel logs
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

    const fuelWhere: Record<string, unknown> = {
      date: { gte: monthStart, lte: monthEnd },
    }
    if (truckId) fuelWhere.truckId = truckId

    const agg = await db.fuelLog.aggregate({
      _sum: { totalCost: true, litersFilled: true },
      where: fuelWhere,
    })

    const budget = await db.fuelBudget.create({
      data: {
        truckId: truckId || null,
        month,
        year,
        budgetLimit: parseFloat(budgetLimit),
        litersLimit: litersLimit ? parseFloat(litersLimit) : null,
        actualSpend: agg._sum.totalCost || 0,
        actualLiters: agg._sum.litersFilled || 0,
        notes: notes || null,
        createdBy: auth.userId,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(budget, { status: 201 })
  } catch (error) {
    console.error('Fuel budget create error:', error)
    return NextResponse.json({ error: 'Failed to create fuel budget' }, { status: 500 })
  }
}
