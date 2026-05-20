import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/trucks/[id]/maintenances — list all maintenances for a truck
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params

    const maintenances = await db.maintenanceRecord.findMany({
      where: { truckId: id },
      orderBy: { createdAt: 'desc' },
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
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

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

    if (!maintenanceType || !description) {
      return NextResponse.json(
        { error: 'maintenanceType and description are required' },
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

    const maintenance = await db.maintenanceRecord.create({
      data: {
        truckId: id,
        type: maintenanceType,
        title: maintenanceType,
        description,
        performedAt: scheduledDate ? new Date(scheduledDate) : new Date(),
        cost: cost != null ? Number(cost) : null,
        odometer: mileageAtService != null ? Number(mileageAtService) : null,
        performedBy: performedBy || null,
        partsUsed: notes || null,
        status: 'completed',
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
