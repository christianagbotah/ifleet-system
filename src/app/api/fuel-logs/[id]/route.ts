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

    const fuelLog = await db.fuelLog.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    if (!fuelLog) {
      return NextResponse.json({ error: 'Fuel log not found' }, { status: 404 })
    }

    return NextResponse.json(fuelLog)
  } catch (error) {
    console.error('Fuel log detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch fuel log' }, { status: 500 })
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

    const existing = await db.fuelLog.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Fuel log not found' }, { status: 404 })
    }

    const {
      truckId,
      tripId,
      date,
      litersFilled,
      totalCost,
      odometer,
      fuelLevelBefore,
      fuelLevelAfter,
      costPerLiter,
      stationName,
      fuelType,
      receiptNumber,
      notes,
      images,
    } = body

    // Recalculate costPerLiter if litersFilled or totalCost changed
    const newLiters = litersFilled !== undefined ? parseFloat(litersFilled) : existing.litersFilled
    const newTotalCost = totalCost !== undefined ? parseFloat(totalCost) : existing.totalCost
    const recalculatedCostPerLiter =
      costPerLiter !== undefined
        ? parseFloat(costPerLiter)
        : newLiters > 0
          ? newTotalCost / newLiters
          : existing.costPerLiter

    const updatedFuelLog = await db.fuelLog.update({
      where: { id },
      data: {
        ...(truckId !== undefined && { truckId }),
        ...(tripId !== undefined && { tripId }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(litersFilled !== undefined && { litersFilled: parseFloat(litersFilled) }),
        ...(totalCost !== undefined && { totalCost: parseFloat(totalCost) }),
        ...(odometer !== undefined && { odometer: odometer !== null ? parseFloat(odometer) : null }),
        ...(fuelLevelBefore !== undefined && {
          fuelLevelBefore: fuelLevelBefore !== null ? parseFloat(fuelLevelBefore) : null,
        }),
        ...(fuelLevelAfter !== undefined && {
          fuelLevelAfter: fuelLevelAfter !== null ? parseFloat(fuelLevelAfter) : null,
        }),
        ...(costPerLiter !== undefined && { costPerLiter: parseFloat(costPerLiter) }),
        ...(stationName !== undefined && { stationName }),
        ...(fuelType !== undefined && { fuelType }),
        ...(receiptNumber !== undefined && { receiptNumber }),
        ...(notes !== undefined && { notes }),
        ...(images !== undefined && { images }),
        // Always update costPerLiter when litersFilled or totalCost changes
        ...((litersFilled !== undefined || totalCost !== undefined) && {
          costPerLiter: recalculatedCostPerLiter,
        }),
      },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        trip: { select: { id: true, tripNumber: true } },
      },
    })

    return NextResponse.json(updatedFuelLog)
  } catch (error) {
    console.error('Fuel log update error:', error)
    return NextResponse.json({ error: 'Failed to update fuel log' }, { status: 500 })
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

    const fuelLog = await db.fuelLog.findUnique({ where: { id } })
    if (!fuelLog) {
      return NextResponse.json({ error: 'Fuel log not found' }, { status: 404 })
    }

    await db.fuelLog.delete({ where: { id } })

    return NextResponse.json({ message: 'Fuel log deleted successfully' })
  } catch (error) {
    console.error('Fuel log delete error:', error)
    return NextResponse.json({ error: 'Failed to delete fuel log' }, { status: 500 })
  }
}
