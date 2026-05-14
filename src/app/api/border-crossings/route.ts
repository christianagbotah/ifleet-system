import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const borderName = searchParams.get('borderName')
    const country = searchParams.get('country')
    const direction = searchParams.get('direction')
    const truckId = searchParams.get('truckId')
    const driverId = searchParams.get('driverId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    const where: Record<string, unknown> = {}

    if (status) where.status = status
    if (borderName) where.borderName = { contains: borderName }
    if (country) where.country = country
    if (direction) where.direction = direction
    if (truckId) where.truckId = truckId
    if (driverId) where.driverId = driverId

    if (dateFrom || dateTo) {
      where.queuedAt = {}
      if (dateFrom) (where.queuedAt as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.queuedAt as Record<string, unknown>).lte = new Date(dateTo)
    }

    const [records, total] = await Promise.all([
      db.borderCrossing.findMany({
        where,
        include: {
          truck: { select: { id: true, plateNumber: true, make: true, model: true } },
          driver: { select: { id: true, firstName: true, lastName: true } },
          trip: { select: { id: true, tripNumber: true, destination: true, status: true } },
        },
        orderBy: { queuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.borderCrossing.count({ where }),
    ])

    // Summary stats
    const [activeCount, avgWait, clearedToday, pendingCount] = await Promise.all([
      db.borderCrossing.count({ where: { status: { in: ['queued', 'processing'] } } }),
      db.borderCrossing.aggregate({ _avg: { actualWait: true }, where: { actualWait: { not: null } } }),
      db.borderCrossing.count({
        where: {
          status: 'cleared',
          clearedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      db.borderCrossing.count({ where: { status: 'queued' } }),
    ])

    return NextResponse.json({
      data: records,
      total,
      page,
      limit,
      summary: {
        activeCrossings: activeCount,
        avgWaitTime: Math.round(avgWait._avg.actualWait || 0),
        clearedToday,
        pendingClearance: pendingCount,
      },
    })
  } catch (error) {
    console.error('Border crossings list error:', error)
    return NextResponse.json({ error: 'Failed to fetch border crossings' }, { status: 500 })
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
      tripId, truckId, driverId, borderName, country, direction,
      estimatedWait, clearanceFee, documentStatus, notes,
    } = body

    if (!tripId || !truckId || !driverId || !borderName || !country || !direction) {
      return NextResponse.json(
        { error: 'tripId, truckId, driverId, borderName, country, and direction are required' },
        { status: 400 }
      )
    }

    const record = await db.borderCrossing.create({
      data: {
        tripId, truckId, driverId, borderName, country, direction,
        estimatedWait: estimatedWait ? parseInt(estimatedWait) : null,
        clearanceFee: clearanceFee ? parseFloat(clearanceFee) : null,
        documentStatus: documentStatus || 'incomplete',
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
      entity: 'BorderCrossing',
      entityId: record.id,
      details: { borderName, country, direction, tripId },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    console.error('Border crossing create error:', error)
    return NextResponse.json({ error: 'Failed to create border crossing' }, { status: 500 })
  }
}
