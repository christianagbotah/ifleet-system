import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

// GET /api/tracking/history - Get location history for a truck/trip
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { searchParams } = new URL(request.url)
    const truckId = searchParams.get('truckId')
    const tripId = searchParams.get('tripId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const limit = parseInt(searchParams.get('limit') || '1000', 10)

    if (!truckId && !tripId) {
      return NextResponse.json(
        { error: 'Either truckId or tripId is required' },
        { status: 400 }
      )
    }

    const where: Record<string, unknown> = {}
    if (truckId) where.truckId = truckId
    if (tripId) where.tripId = tripId
    if (dateFrom || dateTo) {
      where.timestamp = {}
      if (dateFrom) (where.timestamp as Record<string, unknown>).gte = new Date(dateFrom)
      if (dateTo) (where.timestamp as Record<string, unknown>).lte = new Date(dateTo)
    }

    const locations = await db.truckLocation.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return NextResponse.json(locations)
  } catch (error: unknown) {
    console.error('Error fetching location history:', error)
    return NextResponse.json({ error: 'Failed to fetch location history' }, { status: 500 })
  }
}
