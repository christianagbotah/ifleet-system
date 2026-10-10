import { NextRequest, NextResponse } from 'next/server'

import { requireAuth, ROLES } from '@/lib/auth-server'
import { db } from '@/lib/db'
import { summarizeOperations } from '@/lib/domain/operations/summary'

const ACTIVE_TRIP_STATUSES = [
  'draft','scheduled','assigned','eligibility_check','authorized_for_loading','en_route_to_loading_point','gate_in','queued',
  'preload_weighing','loading','loaded','postload_weighing','awaiting_dispatch_clearance','departed_loading_point','in_transit',
  'arrived_destination','offloading','delivered','return_journey','arrived_base','awaiting_reconciliation','reconciled','delayed','exception_hold',
  'departed_depot','offloaded','arrived_depot','waiting_at_depot','waiting_to_offload',
] as const

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const now = new Date()
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const driverScope = auth.roleName === ROLES.DRIVER ? auth.driverId : null
    if (auth.roleName === ROLES.DRIVER && !driverScope) {
      return NextResponse.json({ error: 'Driver profile is not linked.' }, { status: 403 })
    }

    const activeTrips = await db.trip.findMany({
      where: {
        status: { in: [...ACTIVE_TRIP_STATUSES] as never[] },
        ...(driverScope ? { driverId: driverScope } : {}),
      },
      select: {
        id: true,
        tripNumber: true,
        status: true,
        loadingLocation: true,
        destination: true,
        departureTime: true,
        quantity: true,
        unit: true,
        loadOrderId: true,
        truck: { select: { id: true, plateNumber: true } },
        driver: { select: { id: true, firstName: true, lastName: true } },
        loadOrder: { select: { orderNumber: true, priority: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 250,
    })
    const tripIds = activeTrips.map((trip) => trip.id)

    const [
      trucks,
      todaysTrips,
      deliveredTrips,
      loadOrders,
      queues,
      trackingAlerts,
      deliveryExceptions,
      reconciliationExceptions,
    ] = await Promise.all([
      db.truck.findMany({
        where: driverScope ? { driverId: driverScope } : undefined,
        select: { id: true, status: true },
      }),
      db.trip.findMany({
        where: {
          departureTime: { gte: dayStart, lt: dayEnd },
          ...(driverScope ? { driverId: driverScope } : {}),
        },
        select: { id: true, status: true, departureTime: true, quantity: true, unit: true },
      }),
      db.trip.findMany({
        where: {
          status: 'delivered',
          ...(driverScope ? { driverId: driverScope } : {}),
        },
        select: { id: true, status: true, departureTime: true, quantity: true, unit: true },
      }),
      driverScope
        ? Promise.resolve([])
        : db.loadOrder.findMany({
            where: { status: { in: ['open', 'partially_allocated'] }, pickupWindowEnd: { lt: now } },
            select: {
              id: true,
              orderNumber: true,
              status: true,
              priority: true,
              pickupWindowEnd: true,
              externalReference: true,
              shipperProfile: { select: { name: true } },
              loadingPoint: { select: { name: true } },
            },
            orderBy: { pickupWindowEnd: 'asc' },
            take: 50,
          }),
      db.factoryQueueEntry.findMany({
        where: {
          status: { in: ['waiting', 'in_progress', 'loading', 'unloading'] },
          ...(driverScope ? { tripId: { in: tripIds.length ? tripIds : ['__none__'] } } : {}),
        },
        orderBy: [{ joinedAt: 'asc' }],
        take: 100,
      }),
      db.trackingAlert.findMany({
        where: { isRead: false, ...(driverScope ? { tripId: { in: tripIds.length ? tripIds : ['__none__'] } } : {}) },
        select: {
          id: true,
          tripId: true,
          truckId: true,
          type: true,
          title: true,
          message: true,
          createdAt: true,
          isRead: true,
          truck: { select: { plateNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      db.deliveryException.findMany({
        where: { status: { notIn: ['resolved', 'closed', 'cancelled'] }, ...(driverScope ? { tripId: { in: tripIds.length ? tripIds : ['__none__'] } } : {}) },
        select: { id: true, tripId: true, type: true, status: true, quantity: true, notes: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      driverScope
        ? Promise.resolve([])
        : db.reconciliationException.findMany({
            where: { status: { notIn: ['resolved', 'closed', 'cancelled'] } },
            select: { id: true, tripId: true, type: true, status: true, notes: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 50,
          }),
    ])

    const proofOfDeliveries = deliveredTrips.length
      ? await db.proofOfDelivery.findMany({
          where: { tripId: { in: deliveredTrips.map((trip) => trip.id) } },
          select: { id: true, tripId: true },
        })
      : []

    const summaryTripMap = new Map<string, {
      id: string
      status: string
      departureTime: Date
      quantity: number
      unit: string
    }>()
    for (const trip of [...activeTrips, ...todaysTrips, ...deliveredTrips]) {
      summaryTripMap.set(trip.id, {
        id: trip.id,
        status: trip.status,
        departureTime: trip.departureTime,
        quantity: trip.quantity,
        unit: trip.unit,
      })
    }

    const summary = summarizeOperations({
      now,
      trucks,
      trips: [...summaryTripMap.values()],
      proofOfDeliveries,
      loadOrders,
      queues,
      trackingAlerts,
      deliveryExceptions,
      reconciliationExceptions,
    })

    return NextResponse.json({
      summary,
      activeTrips,
      overdueLoadOrders: loadOrders,
      queues: queues.map((queue) => {
        const end = queue.completedAt ?? now
        const elapsed = Math.max(0, Math.floor((end.getTime() - queue.joinedAt.getTime()) / 60000))
        const liveDetention = Math.max(queue.detentionMinutes ?? 0, elapsed - Math.max(0, queue.detentionFreeMinutes ?? 0))
        return { ...queue, liveDetention }
      }),
      trackingAlerts,
      deliveryExceptions,
      reconciliationExceptions,
      generatedAt: now.toISOString(),
    })
  } catch (error) {
    console.error('Operations summary error:', error)
    return NextResponse.json({ error: 'Failed to load operations summary.' }, { status: 500 })
  }
}
