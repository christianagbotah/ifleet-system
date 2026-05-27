import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/delivery-destinations?tripId=xxx
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const tripId = request.nextUrl.searchParams.get('tripId')
    if (!tripId) {
      return NextResponse.json({ error: 'tripId query parameter is required' }, { status: 400 })
    }

    const destinations = await db.tripDeliveryDestination.findMany({
      where: { tripId },
      include: {
        client: { select: { id: true, companyName: true, phone: true } },
        destinationZone: {
          select: {
            id: true,
            name: true,
            destinationCity: { select: { id: true, name: true } },
          },
        },
        TripItem: {
          include: {
            item: { select: { id: true, name: true, unit: true } },
            supplier: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { stopOrder: 'asc' },
    })

    return NextResponse.json({ data: destinations })
  } catch (error) {
    console.error('Delivery destinations list error:', error)
    return NextResponse.json({ error: 'Failed to fetch delivery destinations' }, { status: 500 })
  }
}

// POST /api/delivery-destinations — add a destination to an existing trip
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { tripId, clientId, customerName, customerPhone, destinationZoneId, address, notes, stopOrder } = body

    if (!tripId || !customerName) {
      return NextResponse.json({ error: 'tripId and customerName are required' }, { status: 400 })
    }

    // Verify trip exists
    const trip = await db.trip.findUnique({ where: { id: tripId } })
    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Auto-fetch zone rate
    let zoneRate: number | null = null
    if (destinationZoneId) {
      const rate = await db.zoneRate.findFirst({
        where: { destinationZoneId, isActive: true },
        orderBy: { effectiveDate: 'desc' },
      })
      if (rate) zoneRate = rate.rateAmount
    }

    // Determine stopOrder: max existing + 1, or explicit
    const maxStop = await db.tripDeliveryDestination.findFirst({
      where: { tripId },
      select: { stopOrder: true },
      orderBy: { stopOrder: 'desc' },
    })
    const nextStop = stopOrder !== undefined ? parseInt(String(stopOrder)) : (maxStop ? maxStop.stopOrder + 1 : 1)

    const destination = await db.tripDeliveryDestination.create({
      data: {
        tripId,
        stopOrder: nextStop,
        clientId: clientId || null,
        customerName,
        customerPhone: customerPhone || null,
        destinationZoneId: destinationZoneId || null,
        zoneRate,
        address: address || null,
        notes: notes || null,
      },
      include: {
        client: { select: { id: true, companyName: true, phone: true } },
        destinationZone: {
          select: {
            id: true,
            name: true,
            destinationCity: { select: { id: true, name: true } },
          },
        },
      },
    })

    return NextResponse.json(destination, { status: 201 })
  } catch (error) {
    console.error('Delivery destination create error:', error)
    return NextResponse.json({ error: 'Failed to create delivery destination' }, { status: 500 })
  }
}
