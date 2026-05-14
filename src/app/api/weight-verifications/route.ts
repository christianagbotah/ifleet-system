import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/auth-server'

// GET /api/weight-verifications — list all with filters
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const tripId = searchParams.get('tripId')
    const status = searchParams.get('status')
    const checkpointType = searchParams.get('checkpointType')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}
    if (tripId) where.tripId = tripId
    if (status) where.status = status
    if (checkpointType) where.checkpointType = checkpointType
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.createdAt = dateFilter
    }

    const [records, total] = await Promise.all([
      db.weightVerification.findMany({
        where,
        include: {
          trip: {
            select: {
              id: true,
              tripNumber: true,
              itemName: true,
              truck: { select: { id: true, plateNumber: true } },
              driver: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.weightVerification.count({ where }),
    ])

    // Calculate summary stats
    const [overweightCount, underweightCount, avgVariance] = await Promise.all([
      db.weightVerification.count({ where: { ...where, status: 'overweight' } }),
      db.weightVerification.count({ where: { ...where, status: 'underweight' } }),
      db.weightVerification.aggregate({
        where: { ...where, declaredWeight: { not: null } },
        _avg: { variancePercent: true },
      }),
    ])

    return NextResponse.json({
      records,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: {
        total,
        overweightCount,
        underweightCount,
        avgVariancePercent: avgVariance._avg.variancePercent?.toFixed(1) || '0.0',
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch weight verifications'
    if (message === 'Unauthorized') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    console.error('Weight verifications GET error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/weight-verifications — create new verification
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { tripId, checkpointType, verifiedWeight, declaredWeight, notes, location } = body

    if (!tripId || !checkpointType || verifiedWeight == null) {
      return NextResponse.json({ error: 'tripId, checkpointType, and verifiedWeight are required' }, { status: 400 })
    }

    // Auto-calculate variance and status
    let variance: number | null = null
    let variancePercent: number | null = null
    let status = 'verified'

    if (declaredWeight != null && declaredWeight > 0) {
      variance = verifiedWeight - declaredWeight
      variancePercent = (variance / declaredWeight) * 100
      // Overweight threshold: >5% over declared
      if (variancePercent > 5) {
        status = 'overweight'
      } else if (variancePercent < -5) {
        status = 'underweight'
      }
    }

    const record = await db.weightVerification.create({
      data: {
        tripId,
        checkpointType,
        verifiedWeight: parseFloat(verifiedWeight),
        declaredWeight: declaredWeight ? parseFloat(declaredWeight) : null,
        variance: Math.round((variance || 0) * 100) / 100,
        variancePercent: Math.round((variancePercent || 0) * 10) / 10,
        status,
        verifiedBy: auth.userId,
        verifiedByName: auth.email,
        notes: notes || null,
        location: location || null,
      },
      include: {
        trip: {
          select: {
            id: true, tripNumber: true, itemName: true,
            truck: { select: { id: true, plateNumber: true } },
            driver: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create weight verification'
    console.error('Weight verification POST error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
