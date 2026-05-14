import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/trucks/[id]/maintenances — list all maintenances for a truck
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const maintenances = await db.maintenance.findMany({
      where: { truckId: id },
      orderBy: { scheduledDate: 'desc' },
    })

    return NextResponse.json(maintenances)
  } catch (error) {
    console.error('Error fetching maintenances:', error)
    return NextResponse.json(
      { error: 'Failed to fetch maintenances' },
      { status: 500 }
    )
  }
}

// POST /api/trucks/[id]/maintenances — create a new maintenance record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const {
      maintenanceType,
      description,
      scheduledDate,
      cost,
      mileageAtService,
      performedBy,
      notes,
    } = body

    if (!maintenanceType || !description || !scheduledDate) {
      return NextResponse.json(
        { error: 'maintenanceType, description, and scheduledDate are required' },
        { status: 400 }
      )
    }

    // Verify the truck exists
    const truck = await db.truck.findUnique({ where: { id } })
    if (!truck) {
      return NextResponse.json(
        { error: 'Truck not found' },
        { status: 404 }
      )
    }

    const maintenance = await db.maintenance.create({
      data: {
        truckId: id,
        maintenanceType,
        description,
        scheduledDate: new Date(scheduledDate),
        cost: cost != null ? Number(cost) : null,
        mileageAtService: mileageAtService != null ? Number(mileageAtService) : null,
        performedBy: performedBy || null,
        notes: notes || null,
      },
    })

    return NextResponse.json(maintenance, { status: 201 })
  } catch (error) {
    console.error('Error creating maintenance:', error)
    return NextResponse.json(
      { error: 'Failed to create maintenance' },
      { status: 500 }
    )
  }
}
