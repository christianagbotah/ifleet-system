import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

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

    const body = await request.json()

    const {
      truckId,
      tripId,
      date,
      litersFilled,
      totalCost,
      odometer,
      fuelLevelBefore,
      fuelLevelAfter,
      costPerLiter,
      stationName,
      fuelType,
      receiptNumber,
      endMileage,
      endMileageImage,
      distanceCovered: bodyDistanceCovered,
      notes,
    } = body

    if (!truckId || !tripId || !litersFilled || !totalCost || !date) {
      return NextResponse.json(
        { error: 'truckId, tripId, litersFilled, totalCost, and date are required' },
        { status: 400 }
      )
    }

    // Verify truck exists
    const truck = await db.truck.findUnique({ where: { id: truckId } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    // Post-trip workflow: look up trip for auto-calculation
    let resolvedEndMileage: number | null = null
    let resolvedDistanceCovered: number | null = null
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { id: true, startMileage: true, truckId: true },
    })
    if (trip) {
      // Parse endMileage if provided
      if (endMileage !== undefined && endMileage !== null) {
        resolvedEndMileage = parseFloat(endMileage)
        // Auto-calculate distance if trip has startMileage
        if (trip.startMileage && resolvedEndMileage !== null) {
          resolvedDistanceCovered = resolvedEndMileage - trip.startMileage
        }
      }
      // Use body-provided distance if no auto-calculation
      if (resolvedDistanceCovered === null && bodyDistanceCovered !== undefined && bodyDistanceCovered !== null) {
        resolvedDistanceCovered = parseFloat(bodyDistanceCovered)
      }
    }

    // Auto-calculate costPerLiter if not provided
    const parsedLiters = parseFloat(litersFilled)
    const parsedCost = parseFloat(totalCost)
    const calculatedCostPerLiter =
      costPerLiter !== undefined
        ? parseFloat(costPerLiter)
        : parsedLiters > 0
          ? parsedCost / parsedLiters
          : 0

    const fuelLog = await db.fuelLog.create({
      data: {
        truckId,
        tripId,
        date: new Date(date),
        litersFilled: parsedLiters,
        totalCost: parsedCost,
        costPerLiter: calculatedCostPerLiter,
        odometer: odometer !== undefined ? parseFloat(odometer) : null,
        fuelLevelBefore: fuelLevelBefore !== undefined ? parseFloat(fuelLevelBefore) : null,
        fuelLevelAfter: fuelLevelAfter !== undefined ? parseFloat(fuelLevelAfter) : null,
        stationName,
        fuelType: fuelType || 'Diesel',
        receiptNumber,
        ...(resolvedEndMileage !== null && { endMileage: resolvedEndMileage }),
        ...(endMileageImage && { endMileageImage }),
        ...(resolvedDistanceCovered !== null && { distanceCovered: resolvedDistanceCovered }),
        ...(notes && { notes }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    // Post-trip: update the trip with endMileage, totalMileage, fuelUsed, fuelCost
    if (trip) {
      const tripUpdateData: Record<string, unknown> = {}
      if (resolvedEndMileage !== null) {
        tripUpdateData.endMileage = resolvedEndMileage
      }
      if (resolvedDistanceCovered !== null) {
        tripUpdateData.totalMileage = resolvedDistanceCovered
      }
      if (parsedLiters > 0) {
        tripUpdateData.fuelUsed = parsedLiters
      }
      tripUpdateData.fuelCost = parsedCost

      if (Object.keys(tripUpdateData).length > 0) {
        await db.trip.update({
          where: { id: tripId },
          data: tripUpdateData,
        }).catch(() => { /* best-effort trip update */ })
      }
    }

    return NextResponse.json(fuelLog, { status: 201 })
  } catch (error) {
    console.error('Fuel log create error:', error)
    return NextResponse.json({ error: 'Failed to create fuel log' }, { status: 500 })
  }
}
