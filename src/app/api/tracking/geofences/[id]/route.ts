import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { polygonCentroid, validatePolygonPoints } from '@/lib/domain/routing/geofence'

// GET /api/tracking/geofences/[id] - Get geofence zone
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const { id } = await params
    const geofence = await db.geofenceZone.findUnique({ where: { id } })
    if (!geofence) return NextResponse.json({ error: 'Geofence not found' }, { status: 404 })

    return NextResponse.json({
      data: {
        ...geofence,
        points: geofence.geometryType === 'polygon' && geofence.geometryJson
          ? JSON.parse(geofence.geometryJson)
          : undefined,
      },
    })
  } catch (error: unknown) {
    console.error('Error fetching geofence:', error)
    return NextResponse.json({ error: 'Failed to fetch geofence' }, { status: 500 })
  }
}

// PUT /api/tracking/geofences/[id] - Update geofence zone
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const existing = await db.geofenceZone.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'Geofence not found' }, { status: 404 })

    const body = await request.json() as Record<string, unknown>
    const geometryType = body.geometryType === 'polygon'
      ? 'polygon'
      : body.geometryType === 'circle'
        ? 'circle'
        : existing.geometryType

    let geometryJson: string | null | undefined
    let latitude = typeof body.latitude === 'number' ? body.latitude : undefined
    let longitude = typeof body.longitude === 'number' ? body.longitude : undefined

    if (geometryType === 'polygon' && body.points !== undefined) {
      const points = validatePolygonPoints(body.points)
      if (!points) return NextResponse.json({ error: 'A polygon geofence requires at least three valid points.' }, { status: 400 })
      const centroid = polygonCentroid(points)
      geometryJson = JSON.stringify(points)
      latitude = centroid.latitude
      longitude = centroid.longitude
    } else if (geometryType === 'circle' && body.geometryType === 'circle') {
      geometryJson = null
    }

    if (latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      return NextResponse.json({ error: 'Invalid latitude.' }, { status: 400 })
    }
    if (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      return NextResponse.json({ error: 'Invalid longitude.' }, { status: 400 })
    }

    const radius = body.radius === undefined
      ? undefined
      : typeof body.radius === 'number' && Number.isFinite(body.radius)
        ? Math.max(1, Math.round(body.radius))
        : Number.NaN
    if (radius !== undefined && !Number.isFinite(radius)) return NextResponse.json({ error: 'Invalid radius.' }, { status: 400 })

    const dwellThresholdMinutes = body.dwellThresholdMinutes === undefined
      ? undefined
      : typeof body.dwellThresholdMinutes === 'number' && Number.isFinite(body.dwellThresholdMinutes)
        ? Math.max(0, Math.round(body.dwellThresholdMinutes))
        : Number.NaN
    if (dwellThresholdMinutes !== undefined && !Number.isFinite(dwellThresholdMinutes)) {
      return NextResponse.json({ error: 'Invalid dwell threshold.' }, { status: 400 })
    }

    const geofence = await db.geofenceZone.update({
      where: { id },
      data: {
        ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
        ...(latitude !== undefined ? { latitude } : {}),
        ...(longitude !== undefined ? { longitude } : {}),
        ...(radius !== undefined ? { radius } : {}),
        geometryType,
        ...(geometryJson !== undefined ? { geometryJson } : {}),
        ...(dwellThresholdMinutes !== undefined ? { dwellThresholdMinutes } : {}),
        ...(typeof body.type === 'string' && body.type.trim() ? { type: body.type.trim() } : {}),
        ...(body.address !== undefined ? { address: typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null } : {}),
      },
    })

    return NextResponse.json({ data: geofence })
  } catch (error: unknown) {
    console.error('Error updating geofence:', error)
    return NextResponse.json({ error: 'Failed to update geofence' }, { status: 500 })
  }
}

// DELETE /api/tracking/geofences/[id] - Delete geofence zone and current derived state
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard
    const { id } = await params

    await db.$transaction(async (tx) => {
      await tx.geofenceAssetState.deleteMany({ where: { geofenceZoneId: id } })
      await tx.geofenceZone.delete({ where: { id } })
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting geofence:', error)
    return NextResponse.json({ error: 'Failed to delete geofence' }, { status: 500 })
  }
}
