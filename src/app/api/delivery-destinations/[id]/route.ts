import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// PUT /api/delivery-destinations/[id] — update a delivery destination
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json()

    const existing = await db.tripDeliveryDestination.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Delivery destination not found' }, { status: 404 })
    }

    // If destinationZoneId changed, re-fetch zone rate
    let zoneRate = existing.zoneRate
    if (body.destinationZoneId && body.destinationZoneId !== existing.destinationZoneId) {
      const rate = await db.zoneRate.findFirst({
        where: { destinationZoneId: body.destinationZoneId, isActive: true },
        orderBy: { effectiveDate: 'desc' },
      })
      zoneRate = rate ? rate.rateAmount : null
    }
    if (body.zoneRate !== undefined) {
      zoneRate = body.zoneRate ? parseFloat(String(body.zoneRate)) : null
    }

    const destination = await db.tripDeliveryDestination.update({
      where: { id },
      data: {
        ...(body.clientId !== undefined && { clientId: body.clientId || null }),
        ...(body.customerName !== undefined && { customerName: body.customerName }),
        ...(body.customerPhone !== undefined && { customerPhone: body.customerPhone || null }),
        ...(body.destinationZoneId !== undefined && { destinationZoneId: body.destinationZoneId || null }),
        ...(body.zoneRate !== undefined ? { zoneRate } : { zoneRate }),
        ...(body.address !== undefined && { address: body.address || null }),
        ...(body.notes !== undefined && { notes: body.notes || null }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.actualQty !== undefined && { actualQty: body.actualQty ? parseFloat(String(body.actualQty)) : null }),
        ...(body.stopOrder !== undefined && { stopOrder: parseInt(String(body.stopOrder)) }),
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
        TripItem: {
          include: {
            item: { select: { id: true, name: true, unit: true } },
            supplier: { select: { id: true, name: true } },
          },
        },
      },
    })

    return NextResponse.json(destination)
  } catch (error) {
    console.error('Delivery destination update error:', error)
    return NextResponse.json({ error: 'Failed to update delivery destination' }, { status: 500 })
  }
}

// DELETE /api/delivery-destinations/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params

    const existing = await db.tripDeliveryDestination.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Delivery destination not found' }, { status: 404 })
    }

    // Unlink any tripItems that reference this destination
    await db.tripItem.updateMany({
      where: { deliveryDestinationId: id },
      data: { deliveryDestinationId: null },
    })

    await db.tripDeliveryDestination.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delivery destination delete error:', error)
    return NextResponse.json({ error: 'Failed to delete delivery destination' }, { status: 500 })
  }
}
