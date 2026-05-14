import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Public shipment tracking endpoint — no auth required

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

// Build a timeline of all status changes for a trip
function buildTimeline(tripId: string): Promise<TimelineStep[]> {
  return db.tripEvent.findMany({
    where: { tripId },
    orderBy: { createdAt: 'asc' },
  }).then(events =>
    events.map(e => ({
      status: e.toStatus,
      fromStatus: e.fromStatus ?? undefined,
      timestamp: e.createdAt.toISOString(),
      notes: e.notes ?? undefined,
      location: e.location ?? undefined,
    }))
  )
}

// Build a visual step-by-step timeline based on trip status
function getTripSteps(status: string): TripStep[] {
  const allSteps: TripStep[] = [
    { label: 'Scheduled', statusKey: 'scheduled' },
    { label: 'Loading', statusKey: 'loading' },
    { label: 'Loaded & Ready', statusKey: 'loaded' },
    { label: 'Departed', statusKey: 'departed_depot' },
    { label: 'In Transit', statusKey: 'in_transit' },
    { label: 'Arrived at Destination', statusKey: 'arrived_destination' },
    { label: 'Offloading', statusKey: 'offloading' },
    { label: 'Offloading Complete', statusKey: 'offloaded' },
    { label: 'Return Journey', statusKey: 'return_journey' },
    { label: 'Arrived at Depot', statusKey: 'arrived_depot' },
    { label: 'Completed', statusKey: 'completed' },
  ]

  const currentIdx = STATUS_ORDER[status] ?? 0

  return allSteps.map((step, idx) => ({
    label: step.label,
    status: idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'pending',
  }))
}

interface TimelineStep {
  status: string
  fromStatus?: string
  timestamp: string
  notes?: string
  location?: string
}

interface TripStep {
  label: string
  statusKey: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const { tripId } = await params

    // Fetch trip with relations
    const trip = await db.trip.findUnique({
      where: { id: tripId },
      include: {
        truck: { select: { plateNumber: true, make: true, model: true } },
        driver: { select: { firstName: true, lastName: true, phone: true, employeeId: true } },
        deliveryStops: { orderBy: { stopOrder: 'asc' } },
        tripEvents: { orderBy: { createdAt: 'asc' } },
        client: { select: { id: true, companyName: true } },
      },
    })

    if (!trip) {
      return NextResponse.json(
        { error: 'Shipment not found' },
        { status: 404 }
      )
    }

    // Validate trip belongs to a client (only client trips are trackable via portal)
    if (!trip.clientId) {
      return NextResponse.json(
        { error: 'This shipment is not linked to a client' },
        { status: 400 }
      )
    }

    // Fetch truck location history for route map
    const locationHistory = await db.truckLocation.findMany({
      where: { tripId: trip.id },
      orderBy: { timestamp: 'asc' },
      select: {
        latitude: true,
        longitude: true,
        speed: true,
        timestamp: true,
      },
    })

    // Get latest location
    const latestLocation = locationHistory.length > 0
      ? locationHistory[locationHistory.length - 1]
      : null

    // Build route coordinates (sample every 10th point to keep response small)
    const routeCoordinates = locationHistory
      .filter((_, i) => i % 10 === 0 || i === locationHistory.length - 1)
      .map(loc => ({
        lat: loc.latitude,
        lng: loc.longitude,
        speed: loc.speed,
        timestamp: loc.timestamp.toISOString(),
      }))

    // Build timeline
    const timeline = trip.tripEvents.map(e => ({
      status: e.toStatus,
      fromStatus: e.fromStatus ?? undefined,
      timestamp: e.createdAt.toISOString(),
      notes: e.notes ?? undefined,
      location: e.location ?? undefined,
    }))

    // Build step-by-step visual timeline
    const steps = getTripSteps(trip.status)

    return NextResponse.json({
      shipment: {
        id: trip.id,
        tripNumber: trip.tripNumber,
        status: trip.status,
        progress: getProgress(trip.status),
        loadingLocation: trip.loadingLocation,
        loadingAddress: trip.loadingAddress,
        destination: trip.destination,
        destinationAddress: trip.destinationAddress,
        itemName: trip.itemName,
        quantity: trip.quantity,
        unit: trip.unit,
        totalRevenue: formatGHS(trip.totalRevenue ?? 0),
        departureTime: trip.departureTime.toISOString(),
        estimatedArrival: trip.arrivalTime?.toISOString() ?? null,
        estimatedDuration: trip.estimatedDuration,
        actualDuration: trip.actualDuration,
        waitingReason: trip.waitingReason,
        totalOffloaded: trip.totalOffloaded,
        notes: trip.notes,
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
        phone: trip.driver.phone,
        employeeId: trip.driver.employeeId,
      },
      client: {
        id: trip.client?.id,
        companyName: trip.client?.companyName,
      },
      deliveryStops: trip.deliveryStops.map(s => ({
        id: s.id,
        stopOrder: s.stopOrder,
        destination: s.destination,
        address: s.address,
        customerName: s.customerName,
        expectedQty: s.expectedQty,
        actualQty: s.actualQty,
        unit: s.unit,
        status: s.status,
        arrivalTime: s.arrivalTime?.toISOString() ?? null,
        offloadStarted: s.offloadStarted?.toISOString() ?? null,
        offloadCompleted: s.offloadCompleted?.toISOString() ?? null,
        notes: s.notes,
      })),
      timeline,
      steps,
      latestLocation: latestLocation ? {
        latitude: latestLocation.latitude,
        longitude: latestLocation.longitude,
        speed: latestLocation.speed,
        timestamp: latestLocation.timestamp.toISOString(),
      } : null,
      routeCoordinates,
    })
  } catch (error) {
    console.error('Shipment tracking API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
