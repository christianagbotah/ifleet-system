import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

// GET /api/tracking/alerts - List tracking alerts
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const isRead = searchParams.get('isRead')
    const type = searchParams.get('type')
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: Record<string, unknown> = {}
    if (truckId) where.truckId = truckId
    if (isRead !== null && isRead !== undefined) {
      where.isRead = isRead === 'true'
    }
    if (type) where.type = type

    const alerts = await db.trackingAlert.findMany({
      where,
      include: {
        truck: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json(alerts)
  } catch (error: unknown) {
    console.error('Error fetching alerts:', error)
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 })
  }
}
