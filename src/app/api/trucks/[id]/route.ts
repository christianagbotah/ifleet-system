import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const truck = await db.truck.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
        tyres: { orderBy: { createdAt: 'desc' } },
        insurance: { orderBy: { createdAt: 'desc' } },
        maintenance: { orderBy: { createdAt: 'desc' }, take: 20 },
        expenses: { orderBy: { date: 'desc' }, take: 20 },
        trips: { orderBy: { departureTime: 'desc' }, take: 10 },
      },
    })

    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    return NextResponse.json(truck)
  } catch (error) {
    console.error('Truck detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch truck' }, { status: 500 })
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

    const truck = await db.truck.findUnique({ where: { id } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    const {
      plateNumber,
      make,
      model,
      year,
      vinNumber,
      engineNumber,
      chassisNumber,
      color,
      fuelType,
      tankCapacity,
      status,
      driverId,
      currentMileage,
      insuranceStatus,
      nextServiceDate,
      notes,
    } = body

    // Check plate number uniqueness if changing
    if (plateNumber && plateNumber !== truck.plateNumber) {
      const existing = await db.truck.findUnique({ where: { plateNumber } })
      if (existing) {
        return NextResponse.json({ error: 'Truck with this plate number already exists' }, { status: 400 })
      }
    }

    if (vinNumber && vinNumber !== truck.vinNumber) {
      const existingVin = await db.truck.findUnique({ where: { vinNumber } })
      if (existingVin) {
        return NextResponse.json({ error: 'Truck with this VIN number already exists' }, { status: 400 })
      }
    }

    // Collect changed fields for audit log
    const changes: Record<string, unknown> = {}
    if (plateNumber !== undefined && plateNumber !== truck.plateNumber) changes.plateNumber = plateNumber
    if (make !== undefined && make !== truck.make) changes.make = make
    if (model !== undefined && model !== truck.model) changes.model = model
    if (year !== undefined && year !== truck.year) changes.year = year
    if (vinNumber !== undefined && vinNumber !== truck.vinNumber) changes.vinNumber = vinNumber
    if (status !== undefined && status !== truck.status) changes.status = status
    if (driverId !== undefined) changes.driverId = driverId || null
    if (color !== undefined && color !== truck.color) changes.color = color
    if (fuelType !== undefined && fuelType !== truck.fuelType) changes.fuelType = fuelType

    const updatedTruck = await db.truck.update({
      where: { id },
      data: {
        ...(plateNumber !== undefined && { plateNumber }),
        ...(make !== undefined && { make }),
        ...(model !== undefined && { model }),
        ...(year !== undefined && { year }),
        ...(vinNumber !== undefined && { vinNumber }),
        ...(engineNumber !== undefined && { engineNumber }),
        ...(chassisNumber !== undefined && { chassisNumber }),
        ...(color !== undefined && { color }),
        ...(fuelType !== undefined && { fuelType }),
        ...(tankCapacity !== undefined && { tankCapacity: tankCapacity ? parseFloat(tankCapacity) : null }),
        ...(status !== undefined && { status }),
        ...(driverId !== undefined && { driverId: driverId || null }),
        ...(currentMileage !== undefined && { currentMileage: parseFloat(currentMileage) }),
        ...(insuranceStatus !== undefined && { insuranceStatus }),
        ...(nextServiceDate !== undefined && { nextServiceDate: nextServiceDate ? new Date(nextServiceDate) : null }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, status: true } },
      },
    })

    // Audit log: truck updated (fire-and-forget)
    if (Object.keys(changes).length > 0) {
      createAuditLog({
        userId: auth.userId,
        action: 'update',
        entity: 'Truck',
        entityId: id,
        details: changes,
        ipAddress: getClientIp(request),
      }).catch(() => {})
    }

    return NextResponse.json(updatedTruck)
  } catch (error) {
    console.error('Truck update error:', error)
    return NextResponse.json({ error: 'Failed to update truck' }, { status: 500 })
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

    const truck = await db.truck.findUnique({ where: { id } })
    if (!truck) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 })
    }

    const updatedTruck = await db.truck.update({
      where: { id },
      data: { status: 'decommissioned' },
    })

    // Audit log: truck decommissioned (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'Truck',
      entityId: id,
      details: { plateNumber: truck.plateNumber, previousStatus: truck.status },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json(updatedTruck)
  } catch (error) {
    console.error('Truck delete error:', error)
    return NextResponse.json({ error: 'Failed to decommission truck' }, { status: 500 })
  }
}
