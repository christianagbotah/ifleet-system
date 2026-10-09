import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { polygonCentroid, validatePolygonPoints } from '@/lib/domain/routing/geofence'

// GET /api/tracking/geofences - List all geofence zones
export async function GET() {
  try {
    const geofences = await db.geofenceZone.findMany({
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(geofences.map((zone) => ({
      ...zone,
      points: zone.geometryType === 'polygon' && zone.geometryJson
        ? JSON.parse(zone.geometryJson)
        : undefined,
    })))
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

    const body = await request.json() as Record<string, unknown>
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const geometryType = body.geometryType === 'polygon' ? 'polygon' : 'circle'
    const dwellThresholdMinutes = typeof body.dwellThresholdMinutes === 'number' && Number.isFinite(body.dwellThresholdMinutes)
      ? Math.max(0, Math.round(body.dwellThresholdMinutes))
      : 15

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    let latitude: number
    let longitude: number
    let radius: number
    let geometryJson: string | null = null

    if (geometryType === 'polygon') {
      const points = validatePolygonPoints(body.points)
      if (!points) return NextResponse.json({ error: 'A polygon geofence requires at least three valid points.' }, { status: 400 })
      const centroid = polygonCentroid(points)
      latitude = centroid.latitude
      longitude = centroid.longitude
      radius = typeof body.radius === 'number' && Number.isFinite(body.radius) ? Math.max(1, Math.round(body.radius)) : 500
      geometryJson = JSON.stringify(points)
    } else {
      latitude = typeof body.latitude === 'number' ? body.latitude : Number.NaN
      longitude = typeof body.longitude === 'number' ? body.longitude : Number.NaN
      radius = typeof body.radius === 'number' && Number.isFinite(body.radius) ? Math.max(1, Math.round(body.radius)) : 500
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
        return NextResponse.json({ error: 'Circle geofences require valid latitude and longitude.' }, { status: 400 })
      }
    }

    const geofence = await db.geofenceZone.create({
      data: {
        name,
        latitude,
        longitude,
        radius,
        geometryType,
        geometryJson,
        dwellThresholdMinutes,
        type: typeof body.type === 'string' && body.type.trim() ? body.type.trim() : 'depot',
        address: typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null,
      },
    })

    return NextResponse.json(geofence, { status: 201 })
  } catch (error: unknown) {
    console.error('Error creating geofence:', error)
    return NextResponse.json({ error: 'Failed to create geofence' }, { status: 500 })
  }
}
