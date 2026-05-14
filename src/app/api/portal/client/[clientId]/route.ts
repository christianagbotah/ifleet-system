import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public client portal endpoint — no auth required (accessible via shareable link)

const ACTIVE_STATUSES = [
  'scheduled', 'loading', 'loaded', 'waiting_at_depot',
  'departed_depot', 'in_transit', 'arrived_destination',
  'waiting_to_offload', 'offloading', 'offloaded',
  'return_journey', 'arrived_depot',
]

const STATUS_ORDER: Record<string, number> = {
  scheduled: 0, loading: 1, loaded: 2, waiting_at_depot: 3,
  departed_depot: 4, in_transit: 5, arrived_destination: 6,
  waiting_to_offload: 7, offloading: 8, offloaded: 9,
  return_journey: 10, arrived_depot: 11, completed: 12,
}

function getProgress(status: string): number {
  const order = STATUS_ORDER[status] ?? 0
  return Math.min(100, Math.round((order / 12) * 100))
}

function formatGHS(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params

    // Validate clientId exists
    const client = await db.client.findUnique({
      where: { id: clientId },
    })

    if (!client) {
      return NextResponse.json(
        { error: 'Client not found' },
        { status: 404 }
      )
    }

    if (!client.isActive) {
      return NextResponse.json(
        { error: 'Client portal is currently unavailable' },
        { status: 403 }
      )
    }

    // Fetch all trips for this client
    const trips = await db.trip.findMany({
      where: { clientId: client.id },
      include: {
        truck: { select: { plateNumber: true, make: true, model: true } },
        driver: { select: { firstName: true, lastName: true, phone: true } },
        deliveryStops: {
          orderBy: { stopOrder: 'asc' },
        },
      },
      orderBy: { departureTime: 'desc' },
    })

    // Classify trips
    const activeTrips = trips.filter(t => ACTIVE_STATUSES.includes(t.status))
    const completedTrips = trips.filter(t => t.status === 'completed')
    const pendingTrips = trips.filter(t => ['scheduled', 'loading', 'loaded'].includes(t.status))

    // Calculate stats
    const totalTrips = trips.length
    const completedCount = completedTrips.length
    const activeCount = activeTrips.length
    const pendingCount = pendingTrips.length
    const totalRevenue = trips.reduce((sum, t) => sum + (t.totalRevenue ?? 0), 0)
    const avgTripValue = totalTrips > 0 ? totalRevenue / totalTrips : 0

    // Get latest truck location for each active trip
    const activeTripsWithLocation = await Promise.all(
      activeTrips.map(async (trip) => {
        const latestLoc = await db.truckLocation.findFirst({
          where: { tripId: trip.id },
          orderBy: { timestamp: 'desc' },
        })

        return {
          id: trip.id,
          tripNumber: trip.tripNumber,
          status: trip.status,
          loadingLocation: trip.loadingLocation,
          destination: trip.destination,
          itemName: trip.itemName,
          quantity: trip.quantity,
          unit: trip.unit,
          totalRevenue: formatGHS(trip.totalRevenue ?? 0),
          departureTime: trip.departureTime.toISOString(),
          estimatedArrival: trip.arrivalTime?.toISOString() ?? null,
          truck: {
            plateNumber: trip.truck.plateNumber,
            make: trip.truck.make,
          },
          driver: {
            firstName: trip.driver.firstName,
            lastName: trip.driver.lastName,
            phone: trip.driver.phone,
          },
          progress: getProgress(trip.status),
          deliveryStops: trip.deliveryStops.map(s => ({
            id: s.id,
            stopOrder: s.stopOrder,
            destination: s.destination,
            expectedQty: s.expectedQty,
            actualQty: s.actualQty,
            unit: s.unit,
            status: s.status,
            arrivalTime: s.arrivalTime?.toISOString() ?? null,
            offloadCompleted: s.offloadCompleted?.toISOString() ?? null,
          })),
          latestLocation: latestLoc ? {
            latitude: latestLoc.latitude,
            longitude: latestLoc.longitude,
            timestamp: latestLoc.timestamp.toISOString(),
            speed: latestLoc.speed,
          } : null,
        }
      })
    )

    // Recent deliveries (last 10 completed)
    const recentDeliveries = completedTrips.slice(0, 10).map(trip => ({
      id: trip.id,
      tripNumber: trip.tripNumber,
      status: trip.status,
      loadingLocation: trip.loadingLocation,
      destination: trip.destination,
      itemName: trip.itemName,
      quantity: trip.quantity,
      unit: trip.unit,
      totalRevenue: formatGHS(trip.totalRevenue ?? 0),
      departureTime: trip.departureTime.toISOString(),
      arrivalTime: trip.arrivalTime?.toISOString() ?? null,
      completedAt: trip.updatedAt.toISOString(),
    }))

    // Invoices
    const invoices = await db.invoice.findMany({
      where: { clientId: client.id },
      orderBy: { issueDate: 'desc' },
      take: 20,
    })

    const invoiceData = invoices.map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      totalAmount: formatGHS(inv.totalAmount),
      paidAmount: formatGHS(inv.paidAmount),
      status: inv.status,
      tripNumber: inv.trip?.tripNumber ?? null,
    }))

    return NextResponse.json({
      client: {
        id: client.id,
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        email: client.email,
        phone: client.phone,
      },
      stats: {
        totalTrips,
        completedTrips: completedCount,
        activeTrips: activeCount,
        pendingTrips: pendingCount,
        totalRevenue: formatGHS(totalRevenue),
        avgTripValue: formatGHS(avgTripValue),
      },
      activeShipments: activeTripsWithLocation,
      recentDeliveries,
      invoices: invoiceData,
    })
  } catch (error) {
    console.error('Client portal API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
