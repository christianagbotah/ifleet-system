import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const record = await db.loadBoard.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, companyName: true } },
        assignedTruck: { select: { id: true, plateNumber: true, make: true, model: true } },
        assignedDriver: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, name: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Load board entry not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Load board detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch load board entry' }, { status: 500 })
  }
}

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

    const existing = await db.loadBoard.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Load board entry not found' }, { status: 404 })
    }

    const {
      status,
      assignedTruckId,
      assignedDriverId,
      title,
      pickupLocation,
      dropoffLocation,
      pickupRegion,
      dropoffRegion,
      commodityType,
      weight,
      truckType,
      truckCount,
      offeredRate,
      budgetMin,
      budgetMax,
      pickupDate,
      deliveryDate,
      requirements,
      contactName,
      contactPhone,
      clientId,
    } = body

    const updateData: Record<string, unknown> = {}

    if (status) {
      const validStatuses = ['open', 'assigned', 'in_transit', 'delivered', 'cancelled', 'expired']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: 'status must be one of: open, assigned, in_transit, delivered, cancelled, expired' },
          { status: 400 }
        )
      }
      updateData.status = status
    }

    if (assignedTruckId !== undefined) updateData.assignedTruckId = assignedTruckId || null
    if (assignedDriverId !== undefined) updateData.assignedDriverId = assignedDriverId || null
    if (title) updateData.title = title
    if (pickupLocation) updateData.pickupLocation = pickupLocation
    if (dropoffLocation) updateData.dropoffLocation = dropoffLocation
    if (pickupRegion) updateData.pickupRegion = pickupRegion
    if (dropoffRegion) updateData.dropoffRegion = dropoffRegion
    if (commodityType) updateData.commodityType = commodityType
    if (weight !== undefined) updateData.weight = weight ? parseFloat(weight) : null
    if (truckType !== undefined) updateData.truckType = truckType || null
    if (truckCount !== undefined) updateData.truckCount = truckCount || 1
    if (offeredRate !== undefined) updateData.offeredRate = offeredRate ? parseFloat(offeredRate) : null
    if (budgetMin !== undefined) updateData.budgetMin = budgetMin ? parseFloat(budgetMin) : null
    if (budgetMax !== undefined) updateData.budgetMax = budgetMax ? parseFloat(budgetMax) : null
    if (pickupDate !== undefined) updateData.pickupDate = pickupDate ? new Date(pickupDate) : null
    if (deliveryDate !== undefined) updateData.deliveryDate = deliveryDate ? new Date(deliveryDate) : null
    if (requirements !== undefined) updateData.requirements = requirements || null
    if (contactName !== undefined) updateData.contactName = contactName || null
    if (contactPhone !== undefined) updateData.contactPhone = contactPhone || null
    if (clientId !== undefined) updateData.clientId = clientId || null

    const record = await db.loadBoard.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, companyName: true } },
        assignedTruck: { select: { id: true, plateNumber: true, make: true, model: true } },
        assignedDriver: { select: { id: true, firstName: true, lastName: true } },
        creator: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(record)
  } catch (error) {
    console.error('Load board update error:', error)
    return NextResponse.json({ error: 'Failed to update load board entry' }, { status: 500 })
  }
}

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

    const existing = await db.loadBoard.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Load board entry not found' }, { status: 404 })
    }

    await db.loadBoard.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Load board delete error:', error)
    return NextResponse.json({ error: 'Failed to delete load board entry' }, { status: 500 })
  }
}
