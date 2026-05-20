import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// PUT /api/maintenances/[id] — update a maintenance record
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

    const existing = await db.maintenanceRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Maintenance record not found' },
        { status: 404 }
      )
    }

    const {
      maintenanceType,
      description,
      scheduledDate,
      completedDate,
      status,
      cost,
      mileageAtService,
      performedBy,
      notes,
    } = body

    const maintenance = await db.maintenanceRecord.update({
      where: { id },
      data: {
        ...(maintenanceType && { type: maintenanceType }),
        ...(description && { description }),
        ...(scheduledDate && { performedAt: new Date(scheduledDate) }),
        ...(status && { status }),
        ...(cost !== undefined && {
          cost: cost != null ? Number(cost) : null,
        }),
        ...(mileageAtService !== undefined && {
          odometer: mileageAtService != null ? Number(mileageAtService) : null,
        }),
        ...(performedBy !== undefined && {
          performedBy: performedBy || null,
        }),
        ...(notes !== undefined && {
          partsUsed: notes || null,
        }),
      },
    })

    return NextResponse.json(maintenance)
  } catch (error) {
    console.error('Error updating maintenance:', error)
    return NextResponse.json(
      { error: 'Failed to update maintenance' },
      { status: 500 }
    )
  }
}

// DELETE /api/maintenances/[id] — delete a maintenance record
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

    const existing = await db.maintenanceRecord.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Maintenance record not found' },
        { status: 404 }
      )
    }

    await db.maintenanceRecord.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting maintenance:', error)
    return NextResponse.json(
      { error: 'Failed to delete maintenance' },
      { status: 500 }
    )
  }
}
