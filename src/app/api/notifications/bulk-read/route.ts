import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const { ids } = await request.json()
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 })
    }

    const userId = request.headers.get('x-auth-user-id')
    const userRole = request.headers.get('x-auth-user-role')

    // Drivers can only mark their own notifications as read
    const where: Record<string, unknown> = { id: { in: ids } }
    if (userRole === 'Driver' && userId) {
      where.userId = userId
    }

    const result = await db.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    })

    return NextResponse.json({ updated: result.count })
  } catch (error) {
    console.error('Bulk mark read error:', error)
    return NextResponse.json({ error: 'Failed to mark as read' }, { status: 500 })
  }
}
