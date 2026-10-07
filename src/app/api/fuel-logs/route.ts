import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { fuelLogCreateSchema, validateBody } from '@/lib/validations'
import { createFuelEvent, FuelDomainError } from '@/lib/services/fuel-service'
import { OdometerDomainError } from '@/lib/services/odometer-service'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const tripId = searchParams.get('tripId')
    const fuelType = searchParams.get('fuelType')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const stats = searchParams.get('stats') === 'true'

    const where: Record<string, unknown> = {}

    if (truckId) where.truckId = truckId
    if (tripId) where.tripId = tripId
    if (fuelType) where.fuelType = fuelType
    if (search) {
      where.OR = [
        { stationName: { contains: search } },
        { receiptNumber: { contains: search } },
      ]
    }

    if (dateFrom || dateTo) {
      where.date = {}
      if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
    }

    if (stats) {
      const [fuelLogs, total, statsData] = await Promise.all([
        db.fuelLog.findMany({
          where,
          include: {
            truck: { select: { id: true, plateNumber: true, make: true, model: true } },
            trip: { select: { id: true, tripNumber: true } },
          },
          orderBy: { date: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.fuelLog.count({ where }),
        db.fuelLog.aggregate({
          where,
          _sum: { litersFilled: true, totalCost: true },
          _avg: { costPerLiter: true },
          _count: true,
        }),
      ])

      return NextResponse.json({
        data: fuelLogs,
        total,
        page,
        limit,
        stats: {
          totalLiters: statsData._sum.litersFilled ?? 0,
          totalCost: statsData._sum.totalCost ?? 0,
          avgCostPerLiter: statsData._avg.costPerLiter ?? 0,
          count: statsData._count,
        },
      })
    }

    const [fuelLogs, total] = await Promise.all([
      db.fuelLog.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
          trip: { select: { id: true, tripNumber: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.fuelLog.count({ where }),
    ])

    return NextResponse.json({ data: fuelLogs, total, page, limit })
  } catch (error) {
    console.error('Fuel logs list error:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel logs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const validation = validateBody(fuelLogCreateSchema, await request.json())
    if (!validation.success) return validation.response

    const fuelLog = await createFuelEvent(validation.data, auth)
    return NextResponse.json(fuelLog, { status: 201 })
  } catch (error) {
    if (error instanceof FuelDomainError) {
      const status =
        error.code === 'TRIP_NOT_FOUND' || error.code === 'REVERSAL_TARGET_NOT_FOUND'
          ? 404
          : error.code === 'DUPLICATE_FUEL_EVENT' ||
              error.code === 'TRIP_TRUCK_MISMATCH' ||
              error.code === 'REVERSAL_TARGET_MISMATCH'
            ? 409
            : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }

    if (error instanceof OdometerDomainError) {
      const status = error.code === 'TRIP_NOT_FOUND' ? 404 : error.code === 'TRIP_TRUCK_MISMATCH' ? 409 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }

    console.error('Fuel log create error:', error)
    return NextResponse.json({ error: 'Failed to create fuel log' }, { status: 500 })
  }
}
