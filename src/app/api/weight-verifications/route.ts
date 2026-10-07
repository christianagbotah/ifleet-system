import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { validateBody, weightVerificationCreateSchema } from '@/lib/validations'
import { calculateWeightVariance, WeightVarianceError } from '@/lib/domain/weight/variance'

const statuses = new Set(['pending', 'verified', 'failed', 'variance_detected'])
const varianceClasses = new Set(['within_tolerance', 'over', 'under'])

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const tripId = searchParams.get('tripId')
    const status = searchParams.get('status')
    const varianceClass = searchParams.get('varianceClass')
    const checkpointType = searchParams.get('checkpointType')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    if (status && !statuses.has(status)) return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    if (varianceClass && !varianceClasses.has(varianceClass)) return NextResponse.json({ error: 'Invalid varianceClass filter' }, { status: 400 })

    const where: Record<string, unknown> = {}
    if (tripId) where.tripId = tripId
    if (status) where.status = status
    if (varianceClass) where.varianceClass = varianceClass
    if (checkpointType) where.checkpointType = checkpointType
    if (startDate || endDate) {
      const dateFilter: Record<string, unknown> = {}
      if (startDate) dateFilter.gte = new Date(startDate)
      if (endDate) dateFilter.lte = new Date(endDate)
      where.createdAt = dateFilter
    }

    const [records, total, overCount, underCount, avgVariance] = await Promise.all([
      db.weightVerification.findMany({
        where,
        include: { trip: { select: { id: true, tripNumber: true, itemName: true, truck: { select: { id: true, plateNumber: true } }, driver: { select: { id: true, firstName: true, lastName: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.weightVerification.count({ where }),
      db.weightVerification.count({ where: { ...where, varianceClass: 'over' } }),
      db.weightVerification.count({ where: { ...where, varianceClass: 'under' } }),
      db.weightVerification.aggregate({ where: { ...where, declaredWeight: { not: null } }, _avg: { variancePercent: true } }),
    ])

    return NextResponse.json({
      records,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary: { total, overweightCount: overCount, underweightCount: underCount, avgVariancePercent: avgVariance._avg.variancePercent?.toFixed(1) || '0.0' },
    })
  } catch (error: unknown) {
    console.error('Weight verifications GET error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch weight verifications' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const validation = validateBody(weightVerificationCreateSchema, await request.json())
    if (!validation.success) return validation.response
    const input = validation.data
    const result = calculateWeightVariance(input.verifiedWeight, input.declaredWeight ?? null)

    const record = await db.weightVerification.create({
      data: {
        tripId: input.tripId,
        checkpointType: input.checkpointType,
        verifiedWeight: input.verifiedWeight,
        declaredWeight: input.declaredWeight ?? null,
        variance: result.variance == null ? null : Math.round(result.variance * 100) / 100,
        variancePercent: result.variancePercent == null ? null : Math.round(result.variancePercent * 10) / 10,
        status: result.status,
        varianceClass: result.varianceClass,
        verifiedBy: auth.userId,
        verifiedByName: auth.email,
        notes: input.notes || null,
        location: input.location || null,
      },
      include: { trip: { select: { id: true, tripNumber: true, itemName: true, truck: { select: { id: true, plateNumber: true } }, driver: { select: { id: true, firstName: true, lastName: true } } } } },
    })

    return NextResponse.json(record, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof WeightVarianceError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 })
    console.error('Weight verification POST error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create weight verification' }, { status: 500 })
  }
}
