import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { dispatchNotification } from '@/lib/services/notification-dispatcher'
import { requireAuth } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_NAME } from '@/lib/constants'

// Status → notification config
const STATUS_NOTIF_MAP: Record<string, { type: string; title: string; smsTitle: string }> = {
  loading:              { type: 'trip_started',    title: 'Loading Started',       smsTitle: 'Loading started' },
  loaded:               { type: 'trip_started',    title: 'Loading Completed',     smsTitle: 'Loading completed' },
  waiting_at_depot:     { type: 'trip_waiting',    title: 'Waiting at Depot',      smsTitle: 'Waiting at depot' },
  departed_depot:       { type: 'trip_departed',   title: 'Trip Departed',         smsTitle: 'Trip departed depot' },
  in_transit:           { type: 'trip_in_transit',  title: 'In Transit',            smsTitle: 'In transit' },
  arrived_destination:  { type: 'trip_arrived',    title: 'Arrived at Destination', smsTitle: 'Arrived at destination' },
  waiting_to_offload:   { type: 'trip_waiting',    title: 'Waiting to Offload',    smsTitle: 'Waiting to offload' },
  offloading:           { type: 'trip_offloading',  title: 'Offloading Started',    smsTitle: 'Offloading started' },
  offloaded:            { type: 'trip_offloading',  title: 'Offloading Completed',  smsTitle: 'Offloading completed' },
  return_journey:       { type: 'trip_return',     title: 'Return Journey Started', smsTitle: 'Return journey started' },
  arrived_depot:        { type: 'trip_return',     title: 'Arrived Back at Depot',  smsTitle: 'Arrived back at depot' },
  completed:            { type: 'trip_completed',   title: 'Trip Completed',        smsTitle: 'Trip completed' },
  cancelled:            { type: 'alert',           title: 'Trip Cancelled',         smsTitle: 'Trip cancelled' },
}

// POST /api/trips/advance-status
// Explicit status transition — caller specifies the target status.
// Used for specific transitions that require additional data (e.g., skip waiting, cancel, etc.)
export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth

    const body = await request.json()
    const { tripId, status, notes, waitingReason, offloadedQty, deliveryStopId } = body

    if (!tripId || !status) {
      return NextResponse.json({ error: 'tripId and status are required' }, { status: 400 })
    }

    const allValidStatuses = [
      'scheduled', 'loading', 'loaded', 'waiting_at_depot', 'departed_depot',
      'in_transit', 'arrived_destination', 'waiting_to_offload',
      'offloading', 'offloaded', 'return_journey', 'arrived_depot',
      'completed', 'cancelled',
    ]

    if (!allValidStatuses.includes(status)) {
      return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 })
    }

    const trip = await db.trip.findUnique({
      where: { id: tripId },
      include: {
        truck: { select: { id: true, plateNumber: true, currentMileage: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, totalTrips: true, totalMileage: true } },
        deliveryStops: { orderBy: { stopOrder: 'asc' } },
      },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    if (trip.status === 'completed' || trip.status === 'cancelled') {
      return NextResponse.json(
        { error: `Cannot advance a ${trip.status} trip` },
        { status: 400 }
      )
    }

    // Define valid transitions (explicit map)
    const transitions: Record<string, string[]> = {
      scheduled:         ['loading', 'cancelled'],
      loading:           ['loaded', 'cancelled'],
      loaded:            ['waiting_at_depot', 'departed_depot', 'cancelled'],
      waiting_at_depot:  ['departed_depot', 'cancelled'],
      departed_depot:    ['in_transit', 'cancelled'],
      in_transit:        ['arrived_destination', 'cancelled'],
      arrived_destination: ['waiting_to_offload', 'offloading', 'offloaded', 'cancelled'],
      waiting_to_offload: ['offloading', 'cancelled'],
      offloading:        ['offloaded', 'cancelled'],
      offloaded:         ['in_transit', 'return_journey', 'cancelled'],
      return_journey:    ['arrived_depot', 'cancelled'],
      arrived_depot:     ['completed'],
    }

    const allowed = transitions[trip.status]
    if (!allowed || !allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from "${trip.status}" to "${status}". Allowed: ${allowed?.join(', ') || 'none'}` },
        { status: 400 }
      )
    }

    const now = new Date()
    const updateData: Record<string, unknown> = { status }

    // Waiting fields
    if (['waiting_at_depot', 'waiting_to_offload'].includes(status)) {
      updateData.waitingReason = waitingReason || null
      updateData.waitingSince = now
    } else {
      updateData.waitingReason = null
      updateData.waitingSince = null
    }

    // Loading timestamps
    if (status === 'loading' && !trip.loadingStartedAt) {
      updateData.loadingStartedAt = now
    }
    if (status === 'loaded' && !trip.loadingCompletedAt) {
      updateData.loadingCompletedAt = now
    }

    // Offloading tracking
    if (status === 'offloading' && !trip.offloadingStartedAt) {
      updateData.offloadingStartedAt = now
    }
    if (status === 'offloaded') {
      updateData.offloadingCompletedAt = now
      const qty = offloadedQty || 0
      updateData.totalOffloaded = (trip.totalOffloaded || 0) + qty
    }

    // Completion
    if (status === 'completed') {
      updateData.arrivalTime = trip.arrivalTime || now
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
        ? `${trip.notes}\n[${status} ${now.toLocaleDateString()}] ${notes}`
        : `[${status} ${now.toLocaleDateString()}] ${notes}`
    }

    // Fuel & mileage extras
    if (body.endMileage) {
      const endMileage = parseFloat(body.endMileage)
      updateData.endMileage = endMileage
      updateData.totalMileage = endMileage - (trip.startMileage || 0)
      await db.truck.update({
        where: { id: trip.truckId },
        data: { currentMileage: endMileage },
      })
    }
    if (body.fuelUsed !== undefined) updateData.fuelUsed = parseFloat(body.fuelUsed)
    if (body.fuelCost !== undefined) updateData.fuelCost = parseFloat(body.fuelCost)
    if (body.fuelLevelAfter !== undefined) updateData.fuelLevelAfter = parseFloat(body.fuelLevelAfter)

    // Update delivery stop if specified
    if (deliveryStopId) {
      const stopUpdate: Record<string, unknown> = {}
      if (status === 'arrived_destination') stopUpdate.status = 'arrived'
      if (status === 'arrived_destination') stopUpdate.arrivalTime = now
      if (status === 'offloading') { stopUpdate.status = 'offloading'; stopUpdate.offloadStarted = now }
      if (status === 'offloaded') { stopUpdate.status = 'completed'; stopUpdate.actualQty = offloadedQty; stopUpdate.offloadCompleted = now }
      if (Object.keys(stopUpdate).length > 0) {
        await db.deliveryStop.update({ where: { id: deliveryStopId }, data: stopUpdate })
      }
    }

    const updatedTrip = await db.trip.update({
      where: { id: tripId },
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
        tripId,
        fromStatus: trip.status,
        toStatus: status,
        notes: notes || waitingReason || null,
        metadata: offloadedQty ? JSON.stringify({ offloadedQty, deliveryStopId }) : null,
      },
    })

    // Audit log: trip status change (fire-and-forget)
    createAuditLog({
      userId: auth.userId,
      action: 'status_change',
      entity: 'Trip',
      entityId: tripId,
      details: { from: trip.status, to: status, tripNumber: trip.tripNumber },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    // ── Fire-and-forget notifications ──
    const notifMapping = STATUS_NOTIF_MAP[status]
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
                link: `trips/${tripId}`,
                tripId,
                metadata: {
                  tripNumber: updatedTrip.tripNumber,
                  driverName,
                  truckPlate: updatedTrip.truck.plateNumber,
                  origin: trip.loadingLocation,
                  destination: trip.destination,
                  cargo: trip.itemName,
                  status,
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
              link: `trips/${tripId}`,
              tripId,
              metadata: {
                tripNumber: updatedTrip.tripNumber,
                driverName,
                truckPlate: updatedTrip.truck.plateNumber,
                origin: trip.loadingLocation,
                destination: trip.destination,
                cargo: trip.itemName,
                status,
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
    console.error('Trip advance-status error:', error)
    return NextResponse.json({ error: 'Failed to advance trip status' }, { status: 500 })
  }
}
