import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'

// GET /api/clients — List clients with search, filters, pagination, stats
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get('search') || ''
    const isActive = searchParams.get('isActive')
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    const where: Record<string, unknown> = {}
    if (isActive !== null && isActive !== '') {
      where.isActive = isActive === 'true'
    }
    if (search) {
      where.OR = [
        { companyName: { contains: search } },
        { contactPerson: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
        { city: { contains: search } },
        { region: { contains: search } },
      ]
    }

    // Get clients with trip count and zone info
    const clients = await db.client.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        zones: {
          include: {
            destinationZone: {
              include: {
                destinationCity: { select: { name: true } },
              },
            },
          },
        },
      },
    })

    // Aggregate stats from trips per client
    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        const tripStats = await db.trip.aggregate({
          where: { clientId: client.id },
          _count: true,
          _sum: { totalRevenue: true },
          _max: { departureTime: true },
          _min: { departureTime: true },
        })

        return {
          id: client.id,
          companyName: client.companyName,
          contactPerson: client.contactPerson,
          email: client.email,
          phone: client.phone,
          address: client.address,
          city: client.city,
          region: client.region,
          notes: client.notes,
          isActive: client.isActive,
          createdAt: client.createdAt.toISOString(),
          updatedAt: client.updatedAt.toISOString(),
          tripCount: tripStats._count,
          totalRevenue: tripStats._sum.totalRevenue || 0,
          lastTripDate: tripStats._max.departureTime?.toISOString() || null,
          firstTripDate: tripStats._min.departureTime?.toISOString() || null,
          zones: client.zones.map((cz) => ({
            id: cz.id,
            destinationZoneId: cz.destinationZoneId,
            zoneName: cz.destinationZone.name,
            cityName: cz.destinationZone.destinationCity.name,
            branchName: cz.branchName,
            isPrimary: cz.isPrimary,
          })),
        }
      })
    )

    // Sort by most recent trip date
    clientsWithStats.sort((a, b) => {
      if (!a.lastTripDate && !b.lastTripDate) return 0
      if (!a.lastTripDate) return 1
      if (!b.lastTripDate) return -1
      return new Date(b.lastTripDate).getTime() - new Date(a.lastTripDate).getTime()
    })

    const total = await db.client.count({ where })

    return NextResponse.json({
      data: clientsWithStats,
      total,
      page,
      limit,
    })
  } catch (error) {
    console.error('GET /api/clients error:', error)
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 })
  }
}

// POST /api/clients — Create a new client
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const body = await request.json()
    const { companyName, contactPerson, phone, email, address, city, region, notes, linkExistingTrips, zones } = body

    // Validation
    if (!companyName || !companyName.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 })
    }
    if (!contactPerson || !contactPerson.trim()) {
      return NextResponse.json({ error: 'Contact person is required' }, { status: 400 })
    }
    if (!phone || !phone.trim()) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Check for duplicate company name
    const existing = await db.client.findFirst({
      where: { companyName: companyName.trim() },
    })
    if (existing) {
      return NextResponse.json({ error: 'A client with this company name already exists' }, { status: 409 })
    }

    const client = await db.client.create({
      data: {
        companyName: companyName.trim(),
        contactPerson: contactPerson.trim(),
        phone: phone.trim(),
        email: email?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        region: region?.trim() || null,
        notes: notes?.trim() || null,
        ...(Array.isArray(zones) && zones.length > 0 ? {
          zones: {
            create: zones.map((z: { destinationZoneId: string; branchName?: string; address?: string; contactPerson?: string; phone?: string; isPrimary?: boolean }, i: number) => ({
              destinationZoneId: z.destinationZoneId,
              branchName: z.branchName?.trim() || null,
              address: z.address?.trim() || null,
              contactPerson: z.contactPerson?.trim() || null,
              phone: z.phone?.trim() || null,
              isPrimary: i === 0 ? true : !!z.isPrimary,
            })),
          },
        } : {}),
      },
    })

    // Auto-link existing trips that match customerName
    let linkedCount = 0
    if (linkExistingTrips && companyName.trim()) {
      const tripsToLink = await db.trip.findMany({
        where: {
          OR: [
            { customerName: { contains: companyName.trim() } },
            { customerName: { contains: contactPerson.trim() } },
          ],
          clientId: null,
        },
      })

      if (tripsToLink.length > 0) {
        await db.trip.updateMany({
          where: {
            id: { in: tripsToLink.map((t) => t.id) },
          },
          data: { clientId: client.id },
        })
        linkedCount = tripsToLink.length
      }
    }

    return NextResponse.json({
      ...client,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
      linkedTrips: linkedCount,
    }, { status: 201 })
  } catch (error) {
    console.error('POST /api/clients error:', error)
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 })
  }
}
