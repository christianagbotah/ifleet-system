import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const condition = searchParams.get('condition')
    const brand = searchParams.get('brand')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (condition) where.condition = condition
    if (brand) where.brand = { contains: brand }
    if (search) {
      where.OR = [
        { serialNumber: { contains: search } },
        { brand: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const [tyres, total] = await Promise.all([
      db.tyre.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.tyre.count({ where }),
    ])

    // Condition summary for dashboard stats
    const conditionStats = await db.tyre.groupBy({
      by: ['condition'],
      _count: { id: true },
    })

    const summary = {
      total,
      byCondition: Object.fromEntries(
        conditionStats.map((s) => [s.condition, s._count.id])
      ),
      totalValue: tyres.reduce((sum, t) => sum + t.purchasePrice, 0),
    }

    return NextResponse.json({ data: tyres, total, page, limit, summary })
  } catch (error) {
    console.error('Tyres list error:', error)
    return NextResponse.json({ error: 'Failed to fetch tyres' }, { status: 500 })
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
      serialNumber,
      brand,
      purchaseDate,
      purchasePrice,
      condition,
      notes,
    } = body

    if (!truckId || !serialNumber || !brand || !purchaseDate || !purchasePrice) {
      return NextResponse.json(
        { error: 'truckId, serialNumber, brand, purchaseDate, and purchasePrice are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Check for duplicate serial number
    const existing = await db.tyre.findUnique({ where: { serialNumber } })
    if (existing) {
      return NextResponse.json({ error: 'Tyre with this serial number already exists' }, { status: 400 })
    }

    const tyre = await db.tyre.create({
      data: {
        truckId,
        serialNumber,
        brand,
        purchaseDate: new Date(purchaseDate),
        purchasePrice: parseFloat(purchasePrice),
        ...(condition && { condition }),
        ...(notes && { notes }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(tyre, { status: 201 })
  } catch (error) {
    console.error('Tyre create error:', error)
    return NextResponse.json({ error: 'Failed to create tyre' }, { status: 500 })
  }
}
