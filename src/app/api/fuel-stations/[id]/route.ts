import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/fuel-stations/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  const station = await db.fuelStation.findUnique({
    where: { id },
    include: {
      FuelPrice: {
        orderBy: { effectiveDate: 'desc' },
      },
    },
  })

  if (!station) {
    return NextResponse.json({ error: 'Station not found.' }, { status: 404 })
  }

  const { FuelPrice, ...rest } = station as Record<string, unknown>
  return NextResponse.json({ ...rest, fuelPrices: FuelPrice ?? [] })
}

// PUT /api/fuel-stations/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params

  try {
    const body = await request.json()
    const {
      name, brand, stationCode, address, city, region,
      latitude, longitude, route, phone, email, operatingHours,
      hasCardPayment, hasLoyaltyProgram, hasHGV, hasAdBlue, hasWorkshop,
      corporateRatePerLiter, rating, notes,
    } = body

    const updateData = {
      name, brand, stationCode, address, city, region,
      latitude, longitude, route, phone, email, operatingHours,
      hasCardPayment: hasCardPayment ?? false,
      hasLoyaltyProgram: hasLoyaltyProgram ?? false,
      hasHGV: hasHGV ?? true,
      hasAdBlue: hasAdBlue ?? false,
      hasWorkshop: hasWorkshop ?? false,
      corporateRatePerLiter,
      rating,
      notes,
    }

    const station = await db.fuelStation.update({
      where: { id },
      data: updateData,
      include: { FuelPrice: true },
    })

    const { FuelPrice, ...rest } = station as Record<string, unknown>
    return NextResponse.json({ ...rest, fuelPrices: FuelPrice ?? [] })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update station'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}

// DELETE /api/fuel-stations/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  const { id } = await params

  try {
    await db.fuelPrice.deleteMany({ where: { stationId: id } })
    await db.fuelStation.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete station'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
