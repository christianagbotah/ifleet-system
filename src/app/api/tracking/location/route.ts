import { createHash } from 'node:crypto'

import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, ROLES } from '@/lib/auth-server'
import { createTelematicsIdempotencyKey, ingestTelematicsEvent } from '@/lib/domain/telematics/ingest'
import { PrismaTelematicsIngestRepository } from '@/lib/domain/telematics/prisma-ingest-repository'
import { MobileAppTelematicsProvider } from '@/lib/domain/telematics/providers/mobile-app'
import { TelematicsNormalizationError } from '@/lib/domain/telematics/provider'

// POST /api/tracking/location - authenticated phone GPS fallback through durable telematics ingest
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const payloadText = await request.text()
    const body = JSON.parse(payloadText) as Record<string, unknown>
    const truckId = typeof body.truckId === 'string' ? body.truckId.trim() : ''
    if (!truckId) {
      return NextResponse.json({ error: 'Missing required field: truckId' }, { status: 400 })
    }

    const truck = await db.truck.findUnique({
      where: { id: truckId },
      select: { id: true, driverId: true },
    })
    if (!truck) return NextResponse.json({ error: 'Truck not found' }, { status: 404 })

    const isAdminOrManager = auth.roleName === ROLES.ADMIN || auth.roleName === ROLES.MANAGER
    const isAssignedDriver = auth.roleName === ROLES.DRIVER && !!auth.driverId && auth.driverId === truck.driverId
    if (!isAdminOrManager && !isAssignedDriver) {
      return NextResponse.json({ error: 'You cannot publish location for this truck.' }, { status: 403 })
    }

    const receivedAt = new Date()
    const payloadHash = createHash('sha256').update(payloadText).digest('hex')
    const providerEventId = typeof body.eventId === 'string' && body.eventId.trim() ? body.eventId.trim() : null
    const idempotencyKey = createTelematicsIdempotencyKey('mobile-app', null, providerEventId, payloadHash)
    const rawEventRef = `raw_${idempotencyKey}`
    const adapter = new MobileAppTelematicsProvider()
    const event = adapter.normalizeLocation(body, {
      receivedAt,
      rawEventRef,
      deviceId: null,
      providerEventId,
    })

    const repository = new PrismaTelematicsIngestRepository()
    const result = await ingestTelematicsEvent(
      event,
      {
        rawEventRef,
        provider: 'mobile-app',
        deviceId: null,
        providerEventId,
        payloadHash,
        payload: payloadText,
        receivedAt,
      },
      repository,
      { authoritativeAsset: { assetType: 'tractor', assetId: truck.id } },
    )

    return NextResponse.json({
      data: {
        id: result.legacyLocationId ?? result.eventId,
        truckId: truck.id,
        tripId: result.tripId,
        latitude: event.latitude,
        longitude: event.longitude,
        speed: event.speedKph,
        heading: event.headingDeg,
        accuracy: event.accuracyMeters,
        source: event.source,
        timestamp: event.deviceTimestamp.toISOString(),
        receivedAt: event.receivedAt.toISOString(),
      },
      telematics: {
        eventId: result.eventId,
        duplicate: result.duplicate,
        liveStateUpdated: result.liveStateUpdated,
        source: event.source,
        trust: event.trust,
      },
    }, { status: result.duplicate ? 200 : 201 })
  } catch (error: unknown) {
    if (error instanceof SyntaxError || error instanceof TelematicsNormalizationError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error creating normalized phone location:', error)
    return NextResponse.json({ error: 'Failed to create location' }, { status: 500 })
  }
}

// GET /api/tracking/location - Get latest locations for all trucks
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')

    // Get all trucks first
    const trucks = await db.truck.findMany({
      where: truckId ? { id: truckId } : undefined,
      include: {
        driver: { select: { firstName: true, lastName: true } },
      },
    })

    // For each truck, get the latest location
    const results = await Promise.all(
      trucks.map(async (truck) => {
        const latestLocation = await db.truckLocation.findFirst({
          where: { truckId: truck.id },
          orderBy: [{ createdAt: 'desc' }, { timestamp: 'desc' }],
        })

        if (!latestLocation) return null

        return {
          truckId: truck.id,
          plateNumber: truck.plateNumber,
          driverName: truck.driver
            ? `${truck.driver.firstName} ${truck.driver.lastName}`
            : 'Unassigned',
          latitude: latestLocation.latitude,
          longitude: latestLocation.longitude,
          speed: latestLocation.speed,
          heading: latestLocation.heading,
          accuracy: latestLocation.accuracy,
          source: latestLocation.source,
          timestamp: latestLocation.timestamp.toISOString(),
          receivedAt: latestLocation.createdAt.toISOString(),
        }
      })
    )

    const data = results.filter(Boolean)

    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error('Error fetching locations:', error)
    return NextResponse.json({ error: 'Failed to fetch locations' }, { status: 500 })
  }
}
