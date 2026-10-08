import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { transitionTrip, TripTransitionError } from '@/lib/domain/dispatch/transition-trip'

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

    let cancelled = 0
    let skipped = 0

    for (const trip of trips) {
      try {
        await transitionTrip({
          tripId: trip.id,
          to: 'cancelled',
          actorId: auth.userId,
          notes: 'Trip cancelled by bulk action',
          metadata: { source: 'trip-bulk-delete' },
        })
        cancelled += 1
        createAuditLog({
          userId: auth.userId,
          action: 'delete',
          entity: 'Trip',
          entityId: trip.id,
          details: { tripNumber: trip.tripNumber, previousStatus: trip.status, newStatus: 'cancelled', bulk: true },
          ipAddress: getClientIp(request),
        }).catch(() => {})
      } catch (error) {
        if (error instanceof TripTransitionError) {
          skipped += 1
          continue
        }
        throw error
      }
    }

    if (cancelled === 0) {
      return NextResponse.json({ error: 'None of the selected trips can be cancelled from their current lifecycle state' }, { status: 409 })
    }

    return NextResponse.json({
      success: true,
      deleted: cancelled,
      skipped,
    })
  } catch (error) {
    console.error('Bulk trip delete error:', error)
    return NextResponse.json({ error: 'Failed to cancel trips' }, { status: 500 })
  }
}
