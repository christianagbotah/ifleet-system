import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const pickupRegion = searchParams.get('pickupRegion')
    const dropoffRegion = searchParams.get('dropoffRegion')
    const commodityType = searchParams.get('commodityType')
    const truckType = searchParams.get('truckType')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (pickupRegion) where.pickupRegion = pickupRegion
    if (dropoffRegion) where.dropoffRegion = dropoffRegion
    if (commodityType) where.commodityType = commodityType
    if (truckType) where.truckType = truckType

    const [records, total] = await Promise.all([
      db.loadBoard.findMany({
        where,
        include: {
          client: { select: { id: true, companyName: true } },
          assignedTruck: { select: { id: true, plateNumber: true, make: true, model: true } },
          assignedDriver: { select: { id: true, firstName: true, lastName: true } },
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.loadBoard.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Load board list error:', error)
    return NextResponse.json({ error: 'Failed to fetch load board' }, { status: 500 })
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
      clientId,
      title,
      pickupLocation,
      dropoffLocation,
      pickupRegion,
      dropoffRegion,
      commodityType,
      weight,
      truckType,
      truckCount,
      offeredRate,
      budgetMin,
      budgetMax,
      pickupDate,
      deliveryDate,
      requirements,
      contactName,
      contactPhone,
    } = body

    if (!title || !pickupLocation || !dropoffLocation || !pickupRegion || !dropoffRegion || !commodityType) {
      return NextResponse.json(
        { error: 'title, pickupLocation, dropoffLocation, pickupRegion, dropoffRegion, and commodityType are required' },
        { status: 400 }
      )
    }

    const record = await db.loadBoard.create({
      data: {
        clientId: clientId || null,
        title,
        pickupLocation,
        dropoffLocation,
        pickupRegion,
        dropoffRegion,
        commodityType,
        weight: weight ? parseFloat(weight) : null,
        truckType: truckType || null,
        truckCount: truckCount || 1,
        offeredRate: offeredRate ? parseFloat(offeredRate) : null,
        budgetMin: budgetMin ? parseFloat(budgetMin) : null,
        budgetMax: budgetMax ? parseFloat(budgetMax) : null,
        pickupDate: pickupDate ? new Date(pickupDate) : null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        requirements: requirements || null,
        contactName: contactName || null,
        contactPhone: contactPhone || null,
        createdBy: auth.userId,
      },
      include: {
        client: { select: { id: true, companyName: true } },
        assignedTruck: { select: { id: true, plateNumber: true, make: true, model: true } },
        assignedDriver: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Load board create error:', error)
    return NextResponse.json({ error: 'Failed to create load board entry' }, { status: 500 })
  }
}
