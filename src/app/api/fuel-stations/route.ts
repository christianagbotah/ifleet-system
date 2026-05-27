import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/fuel-stations — list with filters
export async function GET(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(request.url)
  const brand = searchParams.get('brand')
  const city = searchParams.get('city')
  const route = searchParams.get('route')
  const hasHGV = searchParams.get('hasHGV')
  const search = searchParams.get('search')
  const isActive = searchParams.get('isActive')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')

  const where: Record<string, unknown> = {}

  if (brand) where.brand = brand
  if (city) where.city = { contains: city }
  if (route) where.route = { contains: route }
  if (hasHGV === 'true') where.hasHGV = true
  if (isActive !== null && isActive !== undefined && isActive !== '') {
    where.isActive = isActive === 'true'
  }
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { brand: { contains: search } },
      { city: { contains: search } },
      { address: { contains: search } },
      { stationCode: { contains: search } },
    ]
  }

  const [stations, total] = await Promise.all([
    db.fuelStation.findMany({
      where,
      include: {
        FuelPrice: {
          orderBy: { effectiveDate: 'desc' },
          take: 4,
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.fuelStation.count({ where }),
  ])

  const mappedStations = stations.map((station: Record<string, unknown>) => {
    const { FuelPrice, ...rest } = station
    return { ...rest, fuelPrices: FuelPrice ?? [] }
  })
  return NextResponse.json({ data: mappedStations, total, page, limit })
}

// POST /api/fuel-stations — create station
export async function POST(request: NextRequest) {
  const auth = requireAuth(request)
  if (auth instanceof NextResponse) return auth
  const writeGuard = requireWriteAccess(auth)
  if (writeGuard instanceof NextResponse) return writeGuard

  try {
    const body = await request.json()
    const {
      name, brand, stationCode, address, city, region,
      latitude, longitude, route, phone, email, operatingHours,
      hasCardPayment, hasLoyaltyProgram, hasHGV, hasAdBlue, hasWorkshop,
      corporateRatePerLiter, rating, notes,
    } = body

    if (!name || !brand) {
      return NextResponse.json({ error: 'Name and brand are required.' }, { status: 400 })
    }

    const station = await db.fuelStation.create({
      data: {
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
      },
      include: { FuelPrice: true },
    })

    const { FuelPrice, ...rest } = station as Record<string, unknown>
    const response = { ...rest, fuelPrices: FuelPrice ?? [] }
    return NextResponse.json(response, { status: 201 })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create station'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
