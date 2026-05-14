import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (type) where.type = type
    if (status) where.status = status

    if (dateFrom || dateTo) {
      where.performedAt = {}
      if (dateFrom) (where.performedAt as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.performedAt as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [records, total] = await Promise.all([
      db.maintenanceRecord.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        },
        orderBy: { performedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.maintenanceRecord.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Maintenance list error:', error)
    return NextResponse.json({ error: 'Failed to fetch maintenance records' }, { status: 500 })
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
      type,
      title,
      description,
      odometer,
      cost,
      performedBy,
      nextDueDate,
      nextDueMileage,
    } = body

    if (!truckId || !type || !title) {
      return NextResponse.json(
        { error: 'truckId, type, and title are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    const record = await db.maintenanceRecord.create({
      data: {
        truckId,
        type,
        title,
        description,
        odometer: odometer ? parseFloat(odometer) : null,
        cost: cost ? parseFloat(cost) : null,
        performedBy,
        nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
        nextDueMileage: nextDueMileage ? parseFloat(nextDueMileage) : null,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Maintenance create error:', error)
    return NextResponse.json({ error: 'Failed to create maintenance record' }, { status: 500 })
  }
}
