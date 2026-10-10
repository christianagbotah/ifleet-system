import { db } from '@/lib/db'

const ACTIVE_STATUSES = [
  'scheduled',
  'loading',
  'loaded',
  'waiting_at_depot',
  'departed_depot',
  'in_transit',
  'arrived_destination',
  'waiting_to_offload',
  'offloading',
  'offloaded',
  'return_journey',
  'arrived_depot',
] as const

const STATUS_ORDER: Record<string, number> = {
  scheduled: 0,
  loading: 1,
  loaded: 2,
  waiting_at_depot: 3,
  departed_depot: 4,
  in_transit: 5,
  arrived_destination: 6,
  waiting_to_offload: 7,
  offloading: 8,
  offloaded: 9,
  return_journey: 10,
  arrived_depot: 11,
  completed: 12,
}

export type PortalLocationFreshness = 'fresh' | 'stale' | 'unknown'

function progress(status: string): number {
  return Math.min(100, Math.round(((STATUS_ORDER[status] ?? 0) / 12) * 100))
}

function money(value: unknown): number {
  const numberValue = Number(value ?? 0)
  return Number.isFinite(numberValue) ? Math.round(numberValue * 100) / 100 : 0
}

function locationFreshness(timestamp: Date | null, now: Date): PortalLocationFreshness {
  if (!timestamp) return 'unknown'
  return now.getTime() - timestamp.getTime() <= 15 * 60 * 1000 ? 'fresh' : 'stale'
}

function shipmentSteps(status: string) {
  const steps = [
    ['Scheduled', 'scheduled'],
    ['Loading', 'loading'],
    ['Loaded & Ready', 'loaded'],
    ['Departed', 'departed_depot'],
    ['In Transit', 'in_transit'],
    ['Arrived at Destination', 'arrived_destination'],
    ['Offloading', 'offloading'],
    ['Offloading Complete', 'offloaded'],
    ['Return Journey', 'return_journey'],
    ['Arrived at Depot', 'arrived_depot'],
    ['Completed', 'completed'],
  ] as const
  const currentOrder = STATUS_ORDER[status] ?? 0

  return steps.map(([label, statusKey]) => {
    const stepOrder = STATUS_ORDER[statusKey] ?? 0
    return {
      label,
      status: stepOrder < currentOrder ? 'completed' as const : stepOrder === currentOrder ? 'current' as const : 'pending' as const,
    }
  })
}

export async function loadClientPortalDashboard(clientId: string, now = new Date()) {
  const client = await db.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      companyName: true,
      contactPerson: true,
      email: true,
      phone: true,
      isActive: true,
    },
  })

  if (!client) return { kind: 'not_found' as const }
  if (!client.isActive) return { kind: 'inactive' as const }

  const [activeTrips, recentDeliveries, invoices, totalTrips, completedTrips, pendingTrips, revenue] = await Promise.all([
    db.trip.findMany({
      where: { clientId, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { departureTime: 'desc' },
      take: 100,
      include: {
        truck: { select: { plateNumber: true, make: true, model: true } },
        driver: { select: { firstName: true, lastName: true } },
        deliveryStops: {
          orderBy: { stopOrder: 'asc' },
          select: {
            id: true,
            stopOrder: true,
            destination: true,
            expectedQty: true,
            actualQty: true,
            unit: true,
            status: true,
            arrivalTime: true,
            offloadCompleted: true,
          },
        },
      },
    }),
    db.trip.findMany({
      where: { clientId, status: 'completed' },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        tripNumber: true,
        status: true,
        loadingLocation: true,
        destination: true,
        itemName: true,
        quantity: true,
        unit: true,
        totalRevenue: true,
        departureTime: true,
        arrivalTime: true,
        updatedAt: true,
      },
    }),
    db.invoice.findMany({
      where: { clientId },
      orderBy: { issueDate: 'desc' },
      take: 20,
      include: { trip: { select: { tripNumber: true } } },
    }),
    db.trip.count({ where: { clientId } }),
    db.trip.count({ where: { clientId, status: 'completed' } }),
    db.trip.count({ where: { clientId, status: { in: [...ACTIVE_STATUSES] } } }),
    db.trip.aggregate({ where: { clientId }, _sum: { totalRevenue: true } }),
  ])

  const activeTripIds = activeTrips.map((trip) => trip.id)
  const locationRows = activeTripIds.length > 0
    ? await db.truckLocation.findMany({
        where: { tripId: { in: activeTripIds } },
        orderBy: { timestamp: 'desc' },
        select: {
          tripId: true,
          latitude: true,
          longitude: true,
          speed: true,
          timestamp: true,
        },
      })
    : []

  const latestLocationByTrip = new Map<string, (typeof locationRows)[number]>()
  for (const row of locationRows) {
    if (!latestLocationByTrip.has(row.tripId)) latestLocationByTrip.set(row.tripId, row)
  }

  const totalRevenue = money(revenue._sum.totalRevenue)

  return {
    kind: 'ok' as const,
    data: {
      client: {
        id: client.id,
        companyName: client.companyName,
        contactPerson: client.contactPerson,
        email: client.email,
        phone: client.phone,
      },
      stats: {
        totalTrips,
        completedTrips,
        activeTrips: activeTrips.length,
        pendingTrips,
        totalRevenue,
        avgTripValue: totalTrips > 0 ? money(totalRevenue / totalTrips) : 0,
      },
      activeShipments: activeTrips.map((trip) => {
        const latest = latestLocationByTrip.get(trip.id) ?? null
        return {
          id: trip.id,
          tripNumber: trip.tripNumber,
          status: trip.status,
          loadingLocation: trip.loadingLocation,
          destination: trip.destination,
          itemName: trip.itemName,
          quantity: trip.quantity,
          unit: trip.unit,
          totalRevenue: money(trip.totalRevenue),
          departureTime: trip.departureTime.toISOString(),
          estimatedArrival: trip.arrivalTime?.toISOString() ?? null,
          truck: {
            plateNumber: trip.truck.plateNumber,
            make: trip.truck.make,
            model: trip.truck.model,
          },
          driver: {
            firstName: trip.driver.firstName,
            lastName: trip.driver.lastName,
          },
          progress: progress(trip.status),
          deliveryStops: trip.deliveryStops.map((stop) => ({
            ...stop,
            arrivalTime: stop.arrivalTime?.toISOString() ?? null,
            offloadCompleted: stop.offloadCompleted?.toISOString() ?? null,
          })),
          latestLocation: latest ? {
            latitude: latest.latitude,
            longitude: latest.longitude,
            timestamp: latest.timestamp.toISOString(),
            receivedAt: latest.timestamp.toISOString(),
            speed: latest.speed,
            source: 'trip_location_history',
            freshness: locationFreshness(latest.timestamp, now),
          } : null,
        }
      }),
      recentDeliveries: recentDeliveries.map((trip) => ({
        id: trip.id,
        tripNumber: trip.tripNumber,
        status: trip.status,
        loadingLocation: trip.loadingLocation,
        destination: trip.destination,
        itemName: trip.itemName,
        quantity: trip.quantity,
        unit: trip.unit,
        totalRevenue: money(trip.totalRevenue),
        departureTime: trip.departureTime.toISOString(),
        arrivalTime: trip.arrivalTime?.toISOString() ?? null,
        completedAt: trip.updatedAt.toISOString(),
      })),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        issueDate: invoice.issueDate.toISOString(),
        dueDate: invoice.dueDate.toISOString(),
        totalAmount: money(invoice.totalAmount),
        paidAmount: money(invoice.paidAmount),
        status: invoice.status,
        tripNumber: invoice.trip?.tripNumber ?? null,
      })),
    },
  }
}

export async function loadClientShipmentDetail(clientId: string, tripId: string, now = new Date()) {
  const trip = await db.trip.findFirst({
    where: { id: tripId, clientId },
    include: {
      truck: { select: { plateNumber: true, make: true, model: true } },
      driver: { select: { firstName: true, lastName: true } },
      deliveryStops: {
        orderBy: { stopOrder: 'asc' },
        select: {
          id: true,
          stopOrder: true,
          destination: true,
          address: true,
          customerName: true,
          expectedQty: true,
          actualQty: true,
          unit: true,
          status: true,
          arrivalTime: true,
          offloadStarted: true,
          offloadCompleted: true,
        },
      },
      TripEvent: {
        orderBy: { createdAt: 'asc' },
        select: { fromStatus: true, toStatus: true, createdAt: true, location: true },
      },
      client: { select: { id: true, companyName: true, isActive: true } },
    },
  })

  if (!trip || !trip.client?.isActive) return null

  const locationHistory = await db.truckLocation.findMany({
    where: { tripId: trip.id },
    orderBy: { timestamp: 'asc' },
    take: 2000,
    select: {
      latitude: true,
      longitude: true,
      speed: true,
      timestamp: true,
    },
  })
  const latest = locationHistory.at(-1) ?? null
  const sampleEvery = Math.max(1, Math.ceil(locationHistory.length / 200))
  const routeCoordinates = locationHistory
    .filter((_, index) => index % sampleEvery === 0 || index === locationHistory.length - 1)
    .map((location) => ({
      lat: location.latitude,
      lng: location.longitude,
      speed: location.speed,
      timestamp: location.timestamp.toISOString(),
    }))

  return {
    shipment: {
      id: trip.id,
      tripNumber: trip.tripNumber,
      status: trip.status,
      progress: progress(trip.status),
      loadingLocation: trip.loadingLocation,
      loadingAddress: trip.loadingAddress,
      destination: trip.destination,
      destinationAddress: trip.destinationAddress,
      itemName: trip.itemName,
      quantity: trip.quantity,
      unit: trip.unit,
      totalRevenue: money(trip.totalRevenue),
      departureTime: trip.departureTime.toISOString(),
      estimatedArrival: trip.arrivalTime?.toISOString() ?? null,
      estimatedDuration: trip.estimatedDuration,
      actualDuration: trip.actualDuration,
      waitingReason: trip.waitingReason,
      totalOffloaded: trip.totalOffloaded,
      waybillNumber: trip.waybillNumber,
      customerRef: trip.customerRef,
    },
    truck: {
      plateNumber: trip.truck.plateNumber,
      make: trip.truck.make,
      model: trip.truck.model,
    },
    driver: {
      firstName: trip.driver.firstName,
      lastName: trip.driver.lastName,
    },
    client: {
      id: trip.client.id,
      companyName: trip.client.companyName,
    },
    deliveryStops: trip.deliveryStops.map((stop) => ({
      ...stop,
      arrivalTime: stop.arrivalTime?.toISOString() ?? null,
      offloadStarted: stop.offloadStarted?.toISOString() ?? null,
      offloadCompleted: stop.offloadCompleted?.toISOString() ?? null,
    })),
    timeline: trip.TripEvent.map((event) => ({
      status: event.toStatus,
      fromStatus: event.fromStatus ?? undefined,
      timestamp: event.createdAt.toISOString(),
      location: event.location ?? undefined,
    })),
    steps: shipmentSteps(trip.status),
    latestLocation: latest ? {
      latitude: latest.latitude,
      longitude: latest.longitude,
      speed: latest.speed,
      timestamp: latest.timestamp.toISOString(),
      receivedAt: latest.timestamp.toISOString(),
      source: 'trip_location_history',
      freshness: locationFreshness(latest.timestamp, now),
    } : null,
    routeCoordinates,
  }
}
