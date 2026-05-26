import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireWriteAccess } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'

// GET /api/clients/[id] — Full client detail with trips and zones
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const client = await db.client.findUnique({
      where: { id },
      include: {
        zones: {
          include: {
            destinationZone: {
              include: {
                destinationCity: { select: { id: true, name: true, region: true } },
              },
            },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Get all trips for this client
    const clientTrips = await db.trip.findMany({
      where: { clientId: id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { departureTime: 'desc' },
    })

    const recentTrips = clientTrips.slice(0, 10).map((trip) => ({
      id: trip.id,
      tripNumber: trip.tripNumber,
      status: trip.status,
      loadingLocation: trip.loadingLocation,
      destination: trip.destination,
      itemName: trip.itemName,
      quantity: trip.quantity,
      unit: trip.unit,
      totalRevenue: trip.totalRevenue,
      departureTime: trip.departureTime.toISOString(),
      arrivalTime: trip.arrivalTime?.toISOString() || null,
      truck: trip.truck,
      driver: trip.driver,
    }))

    // Aggregate stats
    const totalRevenue = clientTrips.reduce((sum, t) => sum + (t.totalRevenue || 0), 0)
    const completedTrips = clientTrips.filter((t) => t.status === 'completed')
    const avgTripValue = completedTrips.length > 0
      ? completedTrips.reduce((sum, t) => sum + (t.totalRevenue || 0), 0) / completedTrips.length
      : 0

    return NextResponse.json({
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
      stats: {
        totalTrips: clientTrips.length,
        completedTrips: completedTrips.length,
        totalRevenue,
        avgTripValue: Math.round(avgTripValue * 100) / 100,
        firstTripDate: clientTrips.length > 0
          ? clientTrips[clientTrips.length - 1].departureTime.toISOString()
          : null,
        lastTripDate: clientTrips.length > 0
          ? clientTrips[0].departureTime.toISOString()
          : null,
      },
      recentTrips,
      zones: client.zones.map((cz) => ({
        id: cz.id,
        destinationZoneId: cz.destinationZoneId,
        zoneName: cz.destinationZone.name,
        cityId: cz.destinationZone.destinationCity.id,
        cityName: cz.destinationZone.destinationCity.name,
        cityRegion: cz.destinationZone.destinationCity.region,
        branchName: cz.branchName,
        address: cz.address,
        contactPerson: cz.contactPerson,
        phone: cz.phone,
        isPrimary: cz.isPrimary,
        createdAt: cz.createdAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('GET /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 })
  }
}

// PUT /api/clients/[id] — Update client
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
    const { companyName, contactPerson, phone, email, address, city, region, notes, isActive, linkExistingTrips, zones } = body

    const existing = await db.client.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // Check for duplicate company name if changed
    if (companyName && companyName.trim() !== existing.companyName) {
      const duplicate = await db.client.findFirst({
        where: { companyName: companyName.trim() },
      })
      if (duplicate) {
        return NextResponse.json({ error: 'A client with this company name already exists' }, { status: 409 })
      }
    }

    const client = await db.client.update({
      where: { id },
      data: {
        ...(companyName !== undefined ? { companyName: companyName.trim() } : {}),
        ...(contactPerson !== undefined ? { contactPerson: contactPerson.trim() } : {}),
        ...(phone !== undefined ? { phone: phone.trim() } : {}),
        ...(email !== undefined ? { email: email?.trim() || null } : {}),
        ...(address !== undefined ? { address: address?.trim() || null } : {}),
        ...(city !== undefined ? { city: city?.trim() || null } : {}),
        ...(region !== undefined ? { region: region?.trim() || null } : {}),
        ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    // Update zone associations if provided
    if (Array.isArray(zones)) {
      // Delete all existing zone associations
      await db.clientZone.deleteMany({ where: { clientId: id } })
      // Create new ones
      if (zones.length > 0) {
        await db.clientZone.createMany({
          data: zones.map((z: { destinationZoneId: string; branchName?: string; address?: string; contactPerson?: string; phone?: string; isPrimary?: boolean }, i: number) => ({
            clientId: id,
            destinationZoneId: z.destinationZoneId,
            branchName: z.branchName?.trim() || null,
            address: z.address?.trim() || null,
            contactPerson: z.contactPerson?.trim() || null,
            phone: z.phone?.trim() || null,
            isPrimary: i === 0 ? true : !!z.isPrimary,
          })),
        })
      }
    }

    // Auto-link existing trips
    let linkedCount = 0
    if (linkExistingTrips && companyName?.trim()) {
      const tripsToLink = await db.trip.findMany({
        where: {
          OR: [
            { customerName: { contains: companyName.trim(), mode: 'insensitive' } },
            { customerName: { contains: contactPerson?.trim() || '', mode: 'insensitive' } },
          ],
          clientId: null,
        },
      })
      if (tripsToLink.length > 0) {
        await db.trip.updateMany({
          where: { id: { in: tripsToLink.map((t) => t.id) } },
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
    })
  } catch (error) {
    console.error('PUT /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 })
  }
}

// DELETE /api/clients/[id] — Soft delete client
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
    const client = await db.client.findUnique({
      where: { id },
      include: { _count: { select: { Invoice: true, LoadBoard: true, Trip: true, TripDeliveryDestination: true, ClientZone: true } } },
    })

    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    const deps = client._count
    const parts: string[] = []
    if (deps.Invoice) parts.push(`${deps.Invoice} invoice(s)`)
    if (deps.LoadBoard) parts.push(`${deps.LoadBoard} load board entry(s)`)
    if (deps.Trip) parts.push(`${deps.Trip} trip(s)`)
    if (deps.TripDeliveryDestination) parts.push(`${deps.TripDeliveryDestination} delivery destination(s)`)
    if (deps.ClientZone) parts.push(`${deps.ClientZone} zone assignment(s)`)

    if (parts.length > 0) {
      return NextResponse.json({
        error: `Cannot delete: this client has ${parts.join(', ')}. Remove or reassign them first.`,
      }, { status: 400 })
    }

    await db.client.delete({ where: { id } })

    createAuditLog({
      userId: auth.userId,
      action: 'delete',
      entity: 'Client',
      entityId: id,
      details: { companyName: client.companyName },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      id,
      message: 'Client deleted permanently',
    })
  } catch (error) {
    console.error('DELETE /api/clients/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 })
  }
}
