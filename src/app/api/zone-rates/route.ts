import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const destinationZoneId = searchParams.get('destinationZoneId')
    const destinationCityId = searchParams.get('destinationCityId')
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}

    if (destinationZoneId) where.destinationZoneId = destinationZoneId
    if (destinationCityId) {
      // Filter rates whose zone belongs to the specified city
      where.destinationZone = { destinationCityId }
    }
    if (isActive === 'true') where.isActive = true
    else if (isActive === 'false') where.isActive = false

    const [records, total] = await Promise.all([
      db.zoneRate.findMany({
        where,
        orderBy: { effectiveDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          destinationZone: {
            select: {
              id: true,
              name: true,
              destinationCity: { select: { id: true, name: true, region: true } },
            },
          },
        },
      }),
      db.zoneRate.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Zone rates list error:', error)
    return NextResponse.json({ error: 'Failed to fetch zone rates' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { destinationZoneId, rateAmount, minMileage, maxMileage, expectedFuelConsumption, effectiveDate } = body

    if (!destinationZoneId || rateAmount === undefined || rateAmount === null) {
      return NextResponse.json({ error: 'destinationZoneId and rateAmount are required' }, { status: 400 })
    }

    const zone = await db.destinationZone.findUnique({ where: { id: destinationZoneId } })
    if (!zone) {
      return NextResponse.json({ error: 'Destination zone not found' }, { status: 400 })
    }

    const parsedRate = parseFloat(rateAmount)
    if (isNaN(parsedRate) || parsedRate < 0) {
      return NextResponse.json({ error: 'rateAmount must be a valid non-negative number' }, { status: 400 })
    }

    const record = await db.zoneRate.create({
      data: {
        destinationZoneId,
        rateAmount: parsedRate,
        minMileage: minMileage !== undefined && minMileage !== null ? parseFloat(minMileage) : null,
        maxMileage: maxMileage !== undefined && maxMileage !== null ? parseFloat(maxMileage) : null,
        expectedFuelConsumption: expectedFuelConsumption !== undefined && expectedFuelConsumption !== null ? parseFloat(expectedFuelConsumption) : null,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        updatedAt: new Date(),
      },
      include: {
        destinationZone: { select: { id: true, name: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'ZoneRate',
      entityId: record.id,
      details: { rateAmount: parsedRate, destinationZoneId, zoneName: zone.name },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Zone rate create error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create zone rate'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
