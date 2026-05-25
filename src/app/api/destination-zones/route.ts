import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const destinationCityId = searchParams.get('destinationCityId')
    const search = searchParams.get('search')
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '50')

    const where: Record<string, unknown> = {}

    if (destinationCityId) where.destinationCityId = destinationCityId
    if (search) where.name = { contains: search }
    if (isActive === 'true') where.isActive = true
    else if (isActive === 'false') where.isActive = false

    const [records, total] = await Promise.all([
      db.destinationZone.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          destinationCity: { select: { id: true, name: true, region: true } },
          ZoneRate: {
            where: { isActive: true },
            orderBy: { effectiveDate: 'desc' },
            take: 1,
          },
          PerformanceBenchmark: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      db.destinationZone.count({ where }),
    ])

    return NextResponse.json({ data: records, total, page, limit })
  } catch (error) {
    console.error('Destination zones list error:', error)
    return NextResponse.json({ error: 'Failed to fetch destination zones' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { name, destinationCityId } = body

    if (!name?.trim() || !destinationCityId) {
      return NextResponse.json({ error: 'name and destinationCityId are required' }, { status: 400 })
    }

    const city = await db.destinationCity.findUnique({ where: { id: destinationCityId } })
    if (!city) {
      return NextResponse.json({ error: 'Destination city not found' }, { status: 400 })
    }

    const existing = await db.destinationZone.findUnique({
      where: { name_destinationCityId: { name: name.trim(), destinationCityId } },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'Destination zone with this name already exists in this city' },
        { status: 400 }
      )
    }

    const record = await db.destinationZone.create({
      data: {
        name: name.trim(),
        destinationCityId,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
        updatedAt: new Date(),
      },
      include: {
        destinationCity: { select: { id: true, name: true, region: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'DestinationZone',
      entityId: record.id,
      details: { name: record.name, destinationCityId, cityName: city.name },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Destination zone create error:', error)
    const message = error instanceof Error ? error.message : 'Failed to create destination zone'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
