import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { rateLimit, RATE_LIMITS, getClientIp } from '@/lib/rate-limit'

const ENDPOINT_KEY = 'notifications/bulk-delete'

/**
 * POST /api/notifications/bulk-delete
 *
 * Supports multiple deletion modes:
 *   - { ids: string[] }              — Delete specific notification IDs
 *   - { deleteAll: true }            — Delete ALL notifications for the authenticated user
 *   - { deleteReadOnly: true }       — Delete only read notifications for the authenticated user
 *
 * Security:
 *   - For deleteAll and deleteReadOnly modes, ALWAYS uses the authenticated user's ID
 *     from headers. Body-supplied userId is ignored to prevent IDOR.
 *   - For ids mode, drivers can only delete their own notifications; admins can delete any.
 *   - Rate limited: 30 requests per minute per IP.
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limiting by client IP (notification config: 30/min)
    const clientIp = getClientIp(request)
    const rateResult = rateLimit(`${clientIp}:${ENDPOINT_KEY}`, RATE_LIMITS.notification)

    if (!rateResult.success) {
      const retryAfterSecs = rateResult.retryAfter ?? 60
      return NextResponse.json(
        {
          error: `Too many requests. Please try again in ${retryAfterSecs} seconds.`,
          retryAfter: retryAfterSecs,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(retryAfterSecs) },
        }
      )
    }

    const body = await request.json()
    const { ids, deleteAll, deleteReadOnly, userId: bodyUserId } = body

    const headerUserId = request.headers.get('x-auth-user-id')
    const userRole = request.headers.get('x-auth-user-role')

    // Mode 1: Delete specific IDs (scoped to user)
    if (ids && Array.isArray(ids) && ids.length > 0) {
      const where: Record<string, unknown> = {
        id: { in: ids },
      }
      // Drivers can only delete their own notifications
      if (userRole === 'Driver' && headerUserId) {
        where.userId = headerUserId
      }

      const result = await db.notification.deleteMany({ where })
      return NextResponse.json({ deleted: result.count })
    }

    // Mode 2: Delete all notifications — ALWAYS use authenticated user's ID (never body-supplied)
    if (deleteAll) {
      const targetUserId = headerUserId
      if (!targetUserId) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const result = await db.notification.deleteMany({
        where: { userId: targetUserId },
      })
      return NextResponse.json({ deleted: result.count })
    }

    // Mode 3: Delete only read notifications — ALWAYS use authenticated user's ID (never body-supplied)
    const targetUserId = headerUserId
    if (!targetUserId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const where: Record<string, unknown> = { userId: targetUserId }
    if (deleteReadOnly) {
      where.isRead = true
    }

    const result = await db.notification.deleteMany({ where })
    return NextResponse.json({ deleted: result.count })
  } catch (error) {
    console.error('Bulk delete error:', error)
    return NextResponse.json({ error: 'Failed to delete notifications' }, { status: 500 })
  }
}
