import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/tracking/geofences - List all geofence zones
export async function GET() {
  try {
    const geofences = await db.geofenceZone.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(geofences)
  } catch (error: unknown) {
    console.error('Error fetching geofences:', error)
    return NextResponse.json({ error: 'Failed to fetch geofences' }, { status: 500 })
  }
}

// POST /api/tracking/geofences - Create geofence zone
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { name, latitude, longitude, radius, type, address } = body

    if (!name || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: name, latitude, longitude' },
        { status: 400 }
      )
    }

    const geofence = await db.geofenceZone.create({
      data: {
        name,
        latitude,
        longitude,
        radius: radius ?? 500,
        type: type ?? 'depot',
        address: address ?? null,
      },
    })

    return NextResponse.json(geofence, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating geofence:', error)
    return NextResponse.json({ error: 'Failed to create geofence' }, { status: 500 })
  }
}
