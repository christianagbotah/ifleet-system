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
      fuelPrices: {
        orderBy: { effectiveDate: 'desc' },
      },
    },
  })

  if (!station) {
    return NextResponse.json({ error: 'Station not found.' }, { status: 404 })
  }

  return NextResponse.json(station)
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
    const station = await db.fuelStation.update({
      where: { id },
      data: body,
      include: { fuelPrices: true },
    })

    return NextResponse.json(station)
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
