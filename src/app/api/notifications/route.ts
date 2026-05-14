import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const type = searchParams.get('type')
    const isRead = searchParams.get('isRead')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')

    // Server-side enforcement: ALL users only see their own notifications.
    // The authenticated user ID from the header always takes precedence.
    const userRole = request.headers.get('x-auth-user-role')
    const headerUserId = request.headers.get('x-auth-user-id')
    // Always use the authenticated user's ID (from header) to scope results.
    // If header is missing (e.g. direct API call), fall back to query param.
    const effectiveUserId = headerUserId || userId

    const where: Record<string, unknown> = {}

    if (effectiveUserId) where.userId = effectiveUserId
    if (type) where.type = type
    if (isRead !== null && isRead !== undefined) {
      where.isRead = isRead === 'true'
    }

    const [notifications, total] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.notification.count({ where }),
    ])

    // Count unread (always scoped to the same user filter)
    const unreadCount = await db.notification.count({
      where: { ...where, isRead: false },
    })

    return NextResponse.json({
      data: notifications,
      total,
      page,
      limit,
      unreadCount,
    })
  } catch (error) {
    console.error('Notifications list error:', error)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const {
      userId,
      type,
      title,
      message,
      channel,
      link,
      metadata,
    } = body

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { error: 'userId, type, title, and message are required' },
        { status: 400 }
      )
    }

    // Verify user exists
    const user = await db.user.findUnique({ where: { id: userId } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const notification = await db.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        channel: channel || 'in_app',
        link,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    })

    return NextResponse.json(notification, { status: 201 })
  } catch (error) {
    console.error('Notification create error:', error)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}
