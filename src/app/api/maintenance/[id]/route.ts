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

    const record = await db.maintenanceRecord.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    console.error('Maintenance detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch maintenance record' }, { status: 500 })
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

    const record = await db.maintenanceRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 })
    }

    const {
      type,
      title,
      description,
      odometer,
      cost,
      performedBy,
      performedAt,
      nextDueDate,
      nextDueMileage,
      status,
      partsUsed,
    } = body

    const updatedRecord = await db.maintenanceRecord.update({
      where: { id },
      data: {
        ...(type !== undefined && { type }),
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(odometer !== undefined && { odometer: odometer ? parseFloat(odometer) : null }),
        ...(cost !== undefined && { cost: cost ? parseFloat(cost) : null }),
        ...(performedBy !== undefined && { performedBy }),
        ...(performedAt !== undefined && { performedAt: new Date(performedAt) }),
        ...(nextDueDate !== undefined && { nextDueDate: nextDueDate ? new Date(nextDueDate) : null }),
        ...(nextDueMileage !== undefined && { nextDueMileage: nextDueMileage ? parseFloat(nextDueMileage) : null }),
        ...(status !== undefined && { status }),
        ...(partsUsed !== undefined && { partsUsed }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
      },
    })

    return NextResponse.json(updatedRecord)
  } catch (error) {
    console.error('Maintenance update error:', error)
    return NextResponse.json({ error: 'Failed to update maintenance record' }, { status: 500 })
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

    const record = await db.maintenanceRecord.findUnique({ where: { id } })
    if (!record) {
      return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 })
    }

    await db.maintenanceRecord.delete({ where: { id } })

    return NextResponse.json({ message: 'Maintenance record deleted successfully' })
  } catch (error) {
    console.error('Maintenance delete error:', error)
    return NextResponse.json({ error: 'Failed to delete maintenance record' }, { status: 500 })
  }
}
