import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/maintenances/[id] — update a maintenance record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const existing = await db.maintenance.findUnique({ where: { id } })
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

    const maintenance = await db.maintenance.update({
      where: { id },
      data: {
        ...(maintenanceType && { maintenanceType }),
        ...(description && { description }),
        ...(scheduledDate && { scheduledDate: new Date(scheduledDate) }),
        ...(completedDate !== undefined && {
          completedDate: completedDate ? new Date(completedDate) : null,
        }),
        ...(status && { status }),
        ...(cost !== undefined && {
          cost: cost != null ? Number(cost) : null,
        }),
        ...(mileageAtService !== undefined && {
          mileageAtService: mileageAtService != null ? Number(mileageAtService) : null,
        }),
        ...(performedBy !== undefined && {
          performedBy: performedBy || null,
        }),
        ...(notes !== undefined && {
          notes: notes || null,
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
    const { id } = await params

    const existing = await db.maintenance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'Maintenance record not found' },
        { status: 404 }
      )
    }

    await db.maintenance.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting maintenance:', error)
    return NextResponse.json(
      { error: 'Failed to delete maintenance' },
      { status: 500 }
    )
  }
}
