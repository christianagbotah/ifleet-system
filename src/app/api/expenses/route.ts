import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const truckId = searchParams.get('truckId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (category) where.category = category
    if (truckId) where.truckId = truckId
    if (status) where.status = status
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { reference: { contains: search } },
      ]
    }

    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [expenses, total] = await Promise.all([
      db.expense.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.expense.count({ where }),
    ])

    return NextResponse.json({ data: expenses, total, page, limit })
  } catch (error) {
    console.error('Expenses list error:', error)
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()

    const {
      truckId,
      category,
      description,
      amount,
      date,
      paymentMethod,
      reference,
      tripId,
    } = body

    if (!truckId || !category || !description || !amount || !date) {
      return NextResponse.json(
        { error: 'truckId, category, description, amount, and date are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    const expense = await db.expense.create({
      data: {
        truckId,
        category,
        description,
        amount: parseFloat(amount),
        date: new Date(date),
        paymentMethod: paymentMethod || 'cash',
        reference,
        tripId: tripId || null,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    // Audit log: expense created (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'Expense',
      entityId: expense.id,
      details: { category, description, amount: expense.amount },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(expense, { status: 201 })
  } catch (error) {
    console.error('Expense create error:', error)
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 })
  }
}
