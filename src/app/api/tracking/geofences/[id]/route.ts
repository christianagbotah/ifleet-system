import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/tracking/geofences/[id] - Get geofence zone
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const geofence = await db.geofenceZone.findUnique({
      where: { id },
    })

    if (!geofence) {
      return NextResponse.json({ error: 'Geofence not found' }, { status: 404 })
    }

    return NextResponse.json({ data: geofence })
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
    const body = await request.json()
    const { name, latitude, longitude, radius, type, address } = body

    const geofence = await db.geofenceZone.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(latitude !== undefined && { latitude }),
        ...(longitude !== undefined && { longitude }),
        ...(radius !== undefined && { radius }),
        ...(type !== undefined && { type }),
        ...(address !== undefined && { address }),
      },
    })

    return NextResponse.json({ data: geofence })
  } catch (error: unknown) {
    console.error('Error updating geofence:', error)
    return NextResponse.json({ error: 'Failed to update geofence' }, { status: 500 })
  }
}

// DELETE /api/tracking/geofences/[id] - Delete geofence zone
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

    await db.geofenceZone.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting geofence:', error)
    return NextResponse.json({ error: 'Failed to delete geofence' }, { status: 500 })
  }
}
