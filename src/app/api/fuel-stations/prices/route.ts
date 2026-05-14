import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/fuel-stations/prices — latest prices for all stations
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const fuelType = searchParams.get('fuelType')
  const stationId = searchParams.get('stationId')
  const brand = searchParams.get('brand')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  const where: Record<string, unknown> = {}

  if (fuelType) where.fuelType = fuelType
  if (stationId) where.stationId = stationId
  if (dateFrom || dateTo) {
    where.effectiveDate = {}
    if (dateFrom) (where.effectiveDate as Record<string, unknown>).gte = new Date(dateFrom)
    if (dateTo) (where.effectiveDate as Record<string, unknown>).lte = new Date(dateTo)
  }

  const stationWhere: Record<string, unknown> = {}
  if (brand) stationWhere.brand = brand

  const prices = await db.fuelPrice.findMany({
    where: {
      ...where,
      ...(Object.keys(stationWhere).length > 0 ? { station: stationWhere } : {}),
    },
    include: {
      station: {
        select: {
          id: true,
          name: true,
          brand: true,
          city: true,
          route: true,
          latitude: true,
          longitude: true,
        },
      },
    },
    orderBy: { effectiveDate: 'desc' },
    take: 500,
  })

  // Also get the latest price per station per fuel type
  const latestPrices = await db.fuelPrice.groupBy({
    by: ['stationId', 'fuelType'],
    _max: { effectiveDate: true, pricePerLiter: true },
  })

  return NextResponse.json({ data: prices, latest: latestPrices })
}

// POST /api/fuel-stations/prices — add price entry
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  try {
    const body = await request.json()
    const { stationId, fuelType, pricePerLiter, effectiveDate, source, verified, notes } = body

    if (!stationId || !fuelType || pricePerLiter == null) {
      return NextResponse.json(
        { error: 'Station ID, fuel type, and price per liter are required.' },
        { status: 400 }
      )
    }

    // Verify station exists
    const station = await db.fuelStation.findUnique({ where: { id: stationId } })
    if (!station) {
      return NextResponse.json({ error: 'Station not found.' }, { status: 404 })
    }

    const price = await db.fuelPrice.create({
      data: {
        stationId,
        fuelType,
        pricePerLiter,
        effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
        source: source || 'manual',
        verified: verified ?? false,
        notes,
      },
      include: { station: true },
    })

    return NextResponse.json(price, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to add price'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
