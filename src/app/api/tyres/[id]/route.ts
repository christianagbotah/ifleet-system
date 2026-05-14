import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const tyre = await db.tyre.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    if (!tyre) {
      return NextResponse.json({ error: 'Tyre not found' }, { status: 404 })
    }

    return NextResponse.json(tyre)
  } catch (error) {
    console.error('Tyre detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch tyre' }, { status: 500 })
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

    const tyre = await db.tyre.findUnique({ where: { id } })
    if (!tyre) {
      return NextResponse.json({ error: 'Tyre not found' }, { status: 404 })
    }

    const {
      truckId,
      serialNumber,
      brand,
      purchaseDate,
      purchasePrice,
      condition,
      lastInspection,
      retiredDate,
      retiredReason,
      notes,
    } = body

    // Check serial uniqueness if changing
    if (serialNumber && serialNumber !== tyre.serialNumber) {
      const existing = await db.tyre.findUnique({ where: { serialNumber } })
      if (existing) {
        return NextResponse.json({ error: 'Tyre with this serial number already exists' }, { status: 400 })
      }
    }

    const updatedTyre = await db.tyre.update({
      where: { id },
      data: {
        ...(truckId !== undefined && { truckId }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(brand !== undefined && { brand }),
        ...(purchaseDate !== undefined && { purchaseDate: new Date(purchaseDate) }),
        ...(purchasePrice !== undefined && { purchasePrice: parseFloat(purchasePrice) }),
        ...(condition !== undefined && { condition }),
        ...(lastInspection !== undefined && { lastInspection: lastInspection ? new Date(lastInspection) : null }),
        ...(retiredDate !== undefined && { retiredDate: retiredDate ? new Date(retiredDate) : null }),
        ...(retiredReason !== undefined && { retiredReason }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updatedTyre)
  } catch (error) {
    console.error('Tyre update error:', error)
    return NextResponse.json({ error: 'Failed to update tyre' }, { status: 500 })
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

    const tyre = await db.tyre.findUnique({ where: { id } })
    if (!tyre) {
      return NextResponse.json({ error: 'Tyre not found' }, { status: 404 })
    }

    await db.tyre.delete({ where: { id } })

    return NextResponse.json({ message: 'Tyre record deleted successfully' })
  } catch (error) {
    console.error('Tyre delete error:', error)
    return NextResponse.json({ error: 'Failed to delete tyre' }, { status: 500 })
  }
}
