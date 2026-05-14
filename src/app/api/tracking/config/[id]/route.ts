import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'

// GET /api/tracking/config/[id] - Get tracking config for a specific truck
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const config = await db.trackingConfig.findUnique({
      where: { truckId: id },
      include: {
        truck: {
          select: {
            id: true,
            plateNumber: true,
            make: true,
            model: true,
            status: true,
          },
        },
      },
    })

    if (!config) {
      return NextResponse.json({ error: 'Tracking config not found' }, { status: 404 })
    }

    return NextResponse.json({ data: config })
  } catch (error: unknown) {
    console.error('Error fetching tracking config:', error)
    return NextResponse.json({ error: 'Failed to fetch tracking config' }, { status: 500 })
  }
}
