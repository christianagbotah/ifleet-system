import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// POST /api/delivery-stops
// Create a delivery stop for a trip (for multi-destination trips)
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { tripId, destination, address, customerName, customerPhone, expectedQty, unit } = body

    if (!tripId || !destination || expectedQty == null) {
      return NextResponse.json({ error: 'tripId, destination, and expectedQty are required' }, { status: 400 })
    }

    // Verify trip exists
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Get next stop order
    const lastStop = await db.deliveryStop.findFirst({
      where: { tripId },
      orderBy: { stopOrder: 'desc' },
      select: { stopOrder: true },
    })

    const stopOrder = (lastStop?.stopOrder || 0) + 1

    const stop = await db.deliveryStop.create({
      data: {
        tripId,
        stopOrder,
        destination,
        address: address || null,
        customerName: customerName || null,
        customerPhone: customerPhone || null,
        expectedQty: parseFloat(expectedQty),
        unit: unit || 'bags',
      },
    })

    return NextResponse.json(stop, { status: 201 })
  } catch (error) {
    console.error('Create delivery stop error:', error)
    return NextResponse.json({ error: 'Failed to create delivery stop' }, { status: 500 })
  }
}

// PATCH /api/delivery-stops
// Update a delivery stop (e.g., update actual offloaded quantity)
export async function PATCH(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { id, actualQty, status, notes } = body

    if (!id) {
      return NextResponse.json({ error: 'Stop ID is required' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (actualQty !== undefined) updateData.actualQty = parseFloat(actualQty)
    if (status) updateData.status = status
    if (notes !== undefined) updateData.notes = notes

    // Set timestamps based on status
    const now = new Date()
    if (status === 'arrived') updateData.arrivalTime = now
    if (status === 'offloading') updateData.offloadStarted = now
    if (status === 'completed') updateData.offloadCompleted = now

    const updated = await db.deliveryStop.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Update delivery stop error:', error)
    return NextResponse.json({ error: 'Failed to update delivery stop' }, { status: 500 })
  }
}
