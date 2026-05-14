import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const warehouse = await db.warehouse.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            fromTrips: true,
            toTrips: true,
          },
        },
      },
    })

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    return NextResponse.json(warehouse)
  } catch (error) {
    console.error('Error fetching warehouse:', error)
    return NextResponse.json(
      { error: 'Failed to fetch warehouse' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.warehouse.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    const warehouse = await db.warehouse.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.code !== undefined && { code: body.code }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.city !== undefined && { city: body.city }),
        ...(body.region !== undefined && { region: body.region }),
        ...(body.contactPerson !== undefined && { contactPerson: body.contactPerson || null }),
        ...(body.contactPhone !== undefined && { contactPhone: body.contactPhone || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.notes !== undefined && { notes: body.notes }),
      },
    })

    return NextResponse.json(warehouse)
  } catch (error) {
    console.error('Error updating warehouse:', error)
    return NextResponse.json(
      { error: 'Failed to update warehouse', details: String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.warehouse.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 })
    }

    const fromTrips = await db.trip.count({ where: { fromWarehouseId: id } })
    const toTrips = await db.trip.count({ where: { toWarehouseId: id } })

    if (fromTrips > 0 || toTrips > 0) {
      return NextResponse.json(
        { error: 'Cannot delete warehouse with associated trips' },
        { status: 400 }
      )
    }

    await db.warehouse.delete({ where: { id } })

    return NextResponse.json({ message: 'Warehouse deleted successfully' })
  } catch (error) {
    console.error('Error deleting warehouse:', error)
    return NextResponse.json(
      { error: 'Failed to delete warehouse', details: String(error) },
      { status: 500 }
    )
  }
}
