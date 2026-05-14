import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const depotName = searchParams.get('depotName')
    const queueType = searchParams.get('queueType')
    const truckId = searchParams.get('truckId')
    const driverId = searchParams.get('driverId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (depotName) where.depotName = { contains: depotName }
    if (queueType) where.queueType = queueType
    if (truckId) where.truckId = truckId
    if (driverId) where.driverId = driverId

    if (dateFrom || dateTo) {
      where.joinedAt = {}
      if (dateFrom) (where.joinedAt as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.joinedAt as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [records, total] = await Promise.all([
      db.depotQueue.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
          trip: { select: { id: true, tripNumber: true, destination: true, status: true } },
        },
        orderBy: [{ position: 'asc' }, { joinedAt: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.depotQueue.count({ where }),
    ])

    // Summary stats
    const [inQueueCount, inProgressCount, avgWait, completedToday] = await Promise.all([
      db.depotQueue.count({ where: { status: 'waiting' } }),
      db.depotQueue.count({ where: { status: 'in_progress' } }),
      db.depotQueue.aggregate({ _avg: { actualWait: true }, where: { actualWait: { not: null } } }),
      db.depotQueue.count({
        where: {
          status: 'completed',
          completedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ])

    return NextResponse.json({
      data: records,
      total,
      page,
      limit,
      summary: {
        inQueue: inQueueCount,
        inProgress: inProgressCount,
        avgWait: Math.round(avgWait._avg.actualWait || 0),
        completedToday,
      },
    })
  } catch (error) {
    console.error('Depot queue list error:', error)
    return NextResponse.json({ error: 'Failed to fetch depot queue' }, { status: 500 })
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
      truckId, driverId, tripId, depotName, queueType,
      estimatedWait, notes,
    } = body

    if (!truckId || !depotName || !queueType) {
      return NextResponse.json(
        { error: 'truckId, depotName, and queueType are required' },
        { status: 400 }
      )
    }

    // Auto-assign queue position
    const maxPosition = await db.depotQueue.aggregate({
      where: { depotName, status: 'waiting' },
      _max: { position: true },
    })
    const nextPosition = (maxPosition._max.position || 0) + 1

    const record = await db.depotQueue.create({
      data: {
        truckId,
        driverId: driverId || null,
        tripId: tripId || null,
        depotName,
        queueType,
        position: nextPosition,
        estimatedWait: estimatedWait ? parseInt(estimatedWait) : null,
        notes: notes || null,
        createdBy: auth.userId,
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        trip: { select: { id: true, tripNumber: true, destination: true, status: true } },
      },
    })

    createAuditLog({
      userId: auth.userId,
      action: 'create',
      entity: 'DepotQueue',
      entityId: record.id,
      details: { depotName, queueType, position: nextPosition, truckId },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Depot queue create error:', error)
    return NextResponse.json({ error: 'Failed to create depot queue entry' }, { status: 500 })
  }
}
