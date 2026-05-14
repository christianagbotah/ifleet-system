import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getNextStatus, isTerminalStatus, TRANSITIONS } from '@/lib/trip-lifecycle'
import { dispatchNotification } from '@/lib/services/notification-dispatcher'
import { requireAuth, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_NAME } from '@/lib/constants'

// Status → notification type and message mapping
const STATUS_NOTIFICATION_MAP: Record<string, { type: string; title: string; smsTitle: string }> = {
  loading:              { type: 'trip_loading',      title: 'Loading Started',       smsTitle: 'Loading started' },
  loaded:               { type: 'trip_loaded',       title: 'Loading Completed',     smsTitle: 'Loading completed' },
  waiting_at_depot:     { type: 'trip_waiting',      title: 'Waiting at Depot',      smsTitle: 'Waiting at depot' },
  departed_depot:       { type: 'trip_departed',     title: 'Trip Departed',         smsTitle: 'Trip departed depot' },
  in_transit:           { type: 'trip_in_transit',    title: 'In Transit',            smsTitle: 'In transit' },
  arrived_destination:  { type: 'trip_arrived',      title: 'Arrived at Destination', smsTitle: 'Arrived at destination' },
  waiting_to_offload:   { type: 'trip_waiting',      title: 'Waiting to Offload',    smsTitle: 'Waiting to offload' },
  offloading:           { type: 'trip_offloading',    title: 'Offloading Started',    smsTitle: 'Offloading started' },
  offloaded:            { type: 'trip_offloaded',     title: 'Offloading Completed',  smsTitle: 'Offloading completed' },
  return_journey:       { type: 'trip_return',       title: 'Return Journey Started', smsTitle: 'Return journey started' },
  arrived_depot:        { type: 'trip_return',       title: 'Arrived Back at Depot',  smsTitle: 'Arrived back at depot' },
  completed:            { type: 'trip_completed',     title: 'Trip Completed',        smsTitle: 'Trip completed' },
}

// POST /api/trips/[id]/advance-status
// Auto-advance: computes the next status sequentially.
// For specific transitions (e.g. skip waiting, cancel, multi-destination),
// use POST /api/trips/advance-status with explicit target status.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { notes } = body as { notes?: string }

    const trip = await db.trip.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true, currentMileage: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, totalTrips: true, totalMileage: true } },
        deliveryStops: { orderBy: { stopOrder: 'asc' } },
      },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Drivers can only advance their own trip status
    if (auth.roleName === ROLES.DRIVER && trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'Access denied. You can only advance your own trips.' }, { status: 403 })
    }

    if (isTerminalStatus(trip.status)) {
      return NextResponse.json(
        { error: `Trip is already ${trip.status}` },
        { status: 400 }
      )
    }

    // Get the next status in the sequential lifecycle
    const nextStatus = getNextStatus(trip.status) || 'completed'
    const now = new Date()

    // Validate transition is allowed
    const allowed = TRANSITIONS[trip.status]
    if (!allowed || !allowed.includes(nextStatus as typeof allowed[number])) {
      return NextResponse.json(
        { error: `Cannot transition from "${trip.status}" to "${nextStatus}". Use /api/trips/advance-status for explicit transitions.` },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      status: nextStatus,
    }

    // Clear waiting fields when leaving a waiting state
    if (trip.status === 'waiting_at_depot' || trip.status === 'waiting_to_offload') {
      updateData.waitingReason = null
      updateData.waitingSince = null
    }

    // Set waiting fields when entering a waiting state
    if (nextStatus === 'waiting_at_depot' || nextStatus === 'waiting_to_offload') {
      updateData.waitingSince = now
    }

    // Loading timestamps
    if (nextStatus === 'loading' && !trip.loadingStartedAt) {
      updateData.loadingStartedAt = now
    }
    if (nextStatus === 'loaded' && !trip.loadingCompletedAt) {
      updateData.loadingCompletedAt = now
    }

    // Offloading tracking
    if (nextStatus === 'offloading' && !trip.offloadingStartedAt) {
      updateData.offloadingStartedAt = now
    }

    // Completion — set arrival time and update driver stats
    if (nextStatus === 'completed') {
      updateData.arrivalTime = trip.arrivalTime || now
      updateData.offloadingCompletedAt = trip.offloadingCompletedAt || now
      await db.driver.update({
        where: { id: trip.driverId },
        data: {
          totalTrips: { increment: 1 },
          totalMileage: { increment: trip.totalMileage || 0 },
        },
      })
    }

    // Notes
    if (notes) {
      updateData.notes = trip.notes
        ? `${trip.notes}\n[${nextStatus} ${now.toLocaleDateString()}] ${notes}`
        : `[${nextStatus} ${now.toLocaleDateString()}] ${notes}`
    }

    const updatedTrip = await db.trip.update({
      where: { id },
      data: updateData,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
        deliveryStops: { orderBy: { stopOrder: 'asc' } },
      },
    })

    // Audit trail event
    await db.tripEvent.create({
      data: {
        tripId: id,
        fromStatus: trip.status,
        toStatus: nextStatus,
        notes: notes || null,
      },
    })

    // Audit log: trip status change (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'status_change',
      entity: 'Trip',
      entityId: id,
      details: { fromStatus: trip.status, toStatus: nextStatus, tripNumber: trip.tripNumber },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    // ── Fire-and-forget notifications ──
    const notifMapping = STATUS_NOTIFICATION_MAP[nextStatus]
    if (notifMapping) {
      const driverName = `${trip.driver.firstName} ${trip.driver.lastName}`
      const inAppMessage = `${notifMapping.title}: Trip ${updatedTrip.tripNumber} (${driverName}, ${updatedTrip.truck.plateNumber}) — ${trip.loadingLocation} → ${trip.destination}`
      const smsBody = `${APP_NAME}: ${notifMapping.smsTitle} — ${updatedTrip.tripNumber}, ${updatedTrip.truck.plateNumber}. Route: ${trip.loadingLocation} to ${trip.destination}.`

      ;(async () => {
        try {
          // Collect all admin/manager user IDs
          const adminUsers = await db.user.findMany({
            where: { role: { name: { in: ['Admin', 'Manager'] } } },
            select: { id: true },
          })
          const adminIds = new Set(adminUsers.map((u) => u.id))

          // Resolve driver's linked user ID (if any)
          const driverWithUser = trip.driver?.phone
            ? await db.driver.findUnique({
                where: { id: trip.driverId },
                select: { userId: true },
              })
            : null
          const driverUserId = driverWithUser?.userId || null

          // Deduplicate: skip driver if their user is already in admin set
          const driverAlreadyNotified = driverUserId ? adminIds.has(driverUserId) : false

          // Dispatch to all admin/manager users (in_app + push)
          await Promise.allSettled(
            adminUsers.map((u) =>
              dispatchNotification({
                userId: u.id,
                type: notifMapping.type,
                title: notifMapping.title,
                message: inAppMessage,
                channels: ['in_app', 'push'],
                link: `trips/${id}`,
                tripId: id,
                metadata: {
                  tripNumber: updatedTrip.tripNumber,
                  driverName,
                  truckPlate: updatedTrip.truck.plateNumber,
                  origin: trip.loadingLocation,
                  destination: trip.destination,
                  cargo: trip.itemName,
                  status: nextStatus,
                },
              })
            )
          )

          // Dispatch to driver only if NOT already notified as admin
          if (!driverAlreadyNotified && trip.driver?.phone) {
            await dispatchNotification({
              userId: driverUserId || trip.driverId,
              driverId: trip.driverId,
              type: notifMapping.type,
              title: notifMapping.title,
              message: inAppMessage,
              channels: ['in_app', 'sms', 'push'],
              smsMessage: smsBody,
              link: `trips/${id}`,
              tripId: id,
              metadata: {
                tripNumber: updatedTrip.tripNumber,
                driverName,
                truckPlate: updatedTrip.truck.plateNumber,
                origin: trip.loadingLocation,
                destination: trip.destination,
                cargo: trip.itemName,
                status: nextStatus,
              },
            })
          }
        } catch (err) {
          console.error('[Notification] Failed to dispatch trip notifications:', err)
        }
      })().catch(() => { /* fire-and-forget */ })
    }

    return NextResponse.json(updatedTrip)
  } catch (error) {
    console.error('Advance status error:', error)
    return NextResponse.json({ error: 'Failed to advance trip status' }, { status: 500 })
  }
}
