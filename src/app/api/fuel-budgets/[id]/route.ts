import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const budget = await db.fuelBudget.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    if (!budget) {
      return NextResponse.json({ error: 'Fuel budget not found' }, { status: 404 })
    }

    // Recompute actuals
    const monthStart = new Date(budget.year, budget.month - 1, 1)
    const monthEnd = new Date(budget.year, budget.month, 0, 23, 59, 59, 999)

    const fuelWhere: Record<string, unknown> = {
      date: { gte: monthStart, lte: monthEnd },
    }
    if (budget.truckId) fuelWhere.truckId = budget.truckId

    const agg = await db.fuelLog.aggregate({
      _sum: { totalCost: true, litersFilled: true },
      where: fuelWhere,
    })

    return NextResponse.json({
      ...budget,
      actualSpend: agg._sum.totalCost || 0,
      actualLiters: agg._sum.litersFilled || 0,
    })
  } catch (error) {
    console.error('Fuel budget detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel budget' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()

    const existing = await db.fuelBudget.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Fuel budget not found' }, { status: 404 })
    }

    const { budgetLimit, litersLimit, notes } = body

    const updated = await db.fuelBudget.update({
      where: { id },
      data: {
        ...(budgetLimit !== undefined && { budgetLimit: parseFloat(budgetLimit) }),
        ...(litersLimit !== undefined && {
          litersLimit: litersLimit !== null ? parseFloat(litersLimit) : null,
        }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Fuel budget update error:', error)
    return NextResponse.json({ error: 'Failed to update fuel budget' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const budget = await db.fuelBudget.findUnique({ where: { id } })
    if (!budget) {
      return NextResponse.json({ error: 'Fuel budget not found' }, { status: 404 })
    }

    await db.fuelBudget.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Fuel budget delete error:', error)
    return NextResponse.json({ error: 'Failed to delete fuel budget' }, { status: 500 })
  }
}
