import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/auth-server'

/**
 * POST /api/notifications/cleanup
 *
 * Deletes notifications older than the specified number of days.
 * Defaults to 90 days.
 *
 * Auth: Requires Admin role.
 *
 * Body:
 *   olderThanDays: number (default 90)
 */
export async function POST(request: NextRequest) {
  try {
    // Auth: require admin role
    const auth = requireRole(request, 'Admin')
    if (auth instanceof NextResponse) return auth

    const body = await request.json().catch(() => ({}))
    const olderThanDays = body.olderThanDays || 90
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    // Get count before deletion for reporting
    const countBefore = await db.notification.count({
      where: { createdAt: { lt: cutoffDate } },
    })

    // Delete old notifications
    const result = await db.notification.deleteMany({
      where: { createdAt: { lt: cutoffDate } },
    })

    return NextResponse.json({
      deleted: result.count,
      cutoffDate: cutoffDate.toISOString(),
      olderThanDays,
    })
  } catch (error) {
    console.error('[Notification Cleanup] Error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
