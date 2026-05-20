import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const driverId = searchParams.get('driverId')
    const tripId = searchParams.get('tripId')
    const tollType = searchParams.get('tollType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const route = searchParams.get('route')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (driverId) where.driverId = driverId
    if (tripId) where.tripId = tripId
    if (tollType) where.tollType = tollType
    if (status) where.status = status
    if (route) where.route = { contains: route }

    if (dateFrom || dateTo) {
      where.tollDate = {}
      if (dateFrom) (where.tollDate as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.tollDate as Record<string, unknown>).lte = new Date(dateTo)
    }

    if (search) {
      where.OR = [
        { tollPoint: { contains: search } },
        { referenceNumber: { contains: search } },
        { route: { contains: search } },
      ]
    }

    const [records, total] = await Promise.all([
      db.tollRecord.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { tollDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.tollRecord.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Toll records list error:', error)
    return NextResponse.json({ error: 'Failed to fetch toll records' }, { status: 500 })
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
      driverId,
      tripId,
      tollPoint,
      tollType,
      location,
      route,
      latitude,
      longitude,
      amount,
      paymentMethod,
      referenceNumber,
      tollDate,
      direction,
      status,
      disputeReason,
      vehicleWeight,
      overloaded,
      overloadFine,
      notes,
    } = body

    if (!truckId || !tollPoint || !amount || !tollDate) {
      return NextResponse.json(
        { error: 'truckId, tollPoint, amount, and tollDate are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    const record = await db.tollRecord.create({
      data: {
        truckId,
        driverId: driverId || null,
        tripId: tripId || null,
        tollPoint,
        tollType: tollType || 'toll',
        location: location || null,
        route: route || null,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        amount: parseFloat(amount),
        paymentMethod: paymentMethod || 'cash',
        referenceNumber: referenceNumber || null,
        tollDate: new Date(tollDate),
        direction: direction || null,
        status: status || 'verified',
        disputeReason: disputeReason || null,
        vehicleWeight: vehicleWeight ? parseFloat(vehicleWeight) : null,
        overloaded: overloaded || false,
        overloadFine: overloadFine ? parseFloat(overloadFine) : null,
        notes: notes || null,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
    })

    // Audit log
    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'TollRecord',
      entityId: record.id,
      details: { tollPoint, tollType: record.tollType, amount: record.amount, route },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Toll record create error:', error)
    return NextResponse.json({ error: 'Failed to create toll record' }, { status: 500 })
  }
}
