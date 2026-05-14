import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = request.headers.get('x-auth-user-id')
    const userRole = request.headers.get('x-auth-user-role')

    const notification = await db.notification.findUnique({ where: { id } })
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    // Drivers can only mark their own notifications as read
    if (userRole === 'Driver' && userId && notification.userId !== userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const updatedNotification = await db.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    })

    return NextResponse.json(updatedNotification)
  } catch (error) {
    console.error('Notification update error:', error)
    return NextResponse.json({ error: 'Failed to mark notification as read' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const userId = request.headers.get('x-auth-user-id')
    const userRole = request.headers.get('x-auth-user-role')

    const notification = await db.notification.findUnique({ where: { id } })
    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    // Drivers can only delete their own notifications
    if (userRole === 'Driver' && userId && notification.userId !== userId) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await db.notification.delete({ where: { id } })

    return NextResponse.json({ message: 'Notification deleted successfully' })
  } catch (error) {
    console.error('Notification delete error:', error)
    return NextResponse.json({ error: 'Failed to delete notification' }, { status: 500 })
  }
}
