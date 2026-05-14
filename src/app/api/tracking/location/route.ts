import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

// POST /api/tracking/location - Receive location update (HTTP fallback for hardware)
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { truckId, latitude, longitude, speed, heading, accuracy, source } = body

    if (!truckId || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: truckId, latitude, longitude' },
        { status: 400 }
      )
    }

    const location = await db.truckLocation.create({
      data: {
        truckId,
        latitude,
        longitude,
        speed: speed ?? null,
        heading: heading ?? null,
        accuracy: accuracy ?? null,
        source: source ?? 'hardware',
        timestamp: new Date(),
      },
    })

    return NextResponse.json({ data: location }, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating location:', error)
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
          orderBy: { timestamp: 'desc' },
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
