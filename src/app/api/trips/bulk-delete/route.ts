import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { ids } = body as { ids?: string[] }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids must be a non-empty array' }, { status: 400 })
    }

    if (ids.length > 100) {
      return NextResponse.json({ error: 'Cannot delete more than 100 items at once' }, { status: 400 })
    }

    const trips = await db.trip.findMany({
      where: { id: { in: ids } },
      select: { id: true, tripNumber: true, status: true },
    })

    // Filter out completed trips — cannot cancel completed trips
    const cancellableIds = trips.filter(t => t.status !== 'completed').map(t => t.id)
    const skippedCompleted = trips.length - cancellableIds.length

    if (cancellableIds.length === 0) {
      return NextResponse.json(
        { error: 'All selected trips are already completed and cannot be cancelled' },
        { status: 400 }
      )
    }

    const result = await db.trip.updateMany({
      where: { id: { in: cancellableIds } },
      data: { status: 'cancelled' },
    })

    // Audit log: bulk cancel trips (fire-and-forget)
    trips
      .filter(t => t.status !== 'completed')
      .forEach(trip => {
        createAuditLog({
          userId: auth.userId,
          action: 'delete',
          entity: 'Trip',
          entityId: trip.id,
          details: { tripNumber: trip.tripNumber, previousStatus: trip.status, newStatus: 'cancelled', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})
      })

    return NextResponse.json({
      success: true,
      deleted: result.count,
      skipped: skippedCompleted,
    })
  } catch (error) {
    console.error('Bulk trip delete error:', error)
    return NextResponse.json({ error: 'Failed to cancel trips' }, { status: 500 })
  }
}
