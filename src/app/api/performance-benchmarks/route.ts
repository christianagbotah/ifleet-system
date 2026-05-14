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
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}

    if (destinationZoneId) where.destinationZoneId = destinationZoneId
    if (isActive === 'true') where.isActive = true
    else if (isActive === 'false') where.isActive = false

    const [records, total] = await Promise.all([
      db.performanceBenchmark.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          destinationZone: { select: { id: true, name: true } },
        },
      }),
      db.performanceBenchmark.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Performance benchmarks list error:', error)
    return NextResponse.json({ error: 'Failed to fetch performance benchmarks' }, { status: 500 })
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
      destinationZoneId,
      expectedMinMileage,
      expectedMaxMileage,
      warningMinMileage,
      warningMaxMileage,
      expectedMinFuel,
      expectedMaxFuel,
      warningMinFuel,
      warningMaxFuel,
    } = body

    if (!destinationZoneId || expectedMinMileage === undefined || expectedMaxMileage === undefined) {
      return NextResponse.json(
        { error: 'destinationZoneId, expectedMinMileage, and expectedMaxMileage are required' },
        { status: 400 }
      )
    }

    const zone = await db.destinationZone.findUnique({ where: { id: destinationZoneId } })
    if (!zone) {
      return NextResponse.json({ error: 'Destination zone not found' }, { status: 400 })
    }

    const record = await db.performanceBenchmark.create({
      data: {
        destinationZoneId,
        expectedMinMileage: parseFloat(expectedMinMileage),
        expectedMaxMileage: parseFloat(expectedMaxMileage),
        warningMinMileage: warningMinMileage !== undefined && warningMinMileage !== null ? parseFloat(warningMinMileage) : null,
        warningMaxMileage: warningMaxMileage !== undefined && warningMaxMileage !== null ? parseFloat(warningMaxMileage) : null,
        expectedMinFuel: expectedMinFuel !== undefined && expectedMinFuel !== null ? parseFloat(expectedMinFuel) : null,
        expectedMaxFuel: expectedMaxFuel !== undefined && expectedMaxFuel !== null ? parseFloat(expectedMaxFuel) : null,
        warningMinFuel: warningMinFuel !== undefined && warningMinFuel !== null ? parseFloat(warningMinFuel) : null,
        warningMaxFuel: warningMaxFuel !== undefined && warningMaxFuel !== null ? parseFloat(warningMaxFuel) : null,
      },
      include: {
        destinationZone: { select: { id: true, name: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'PerformanceBenchmark',
      entityId: record.id,
      details: { destinationZoneId, zoneName: zone.name, expectedMinMileage: record.expectedMinMileage, expectedMaxMileage: record.expectedMaxMileage },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Performance benchmark create error:', error)
    return NextResponse.json({ error: 'Failed to create performance benchmark' }, { status: 500 })
  }
}
