import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isTerminalStatus, ALL_TRIP_STATUSES } from '@/lib/trip-lifecycle'
import { dispatchNotification } from '@/lib/services/notification-dispatcher'
import { requireAuth, requireWriteAccess, ROLES } from '@/lib/auth-server'
import { createAuditLog, getClientIp } from '@/lib/audit'
import { APP_NAME } from '@/lib/constants'

// POST /api/trips/[id]/complete
// Marks a trip as completed from ANY non-terminal status.
// Sets all lifecycle timestamps to now, creates TripEvent entries for all stages,
// and updates driver stats (totalTrips, totalMileage).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = requireAuth(request)
    if (auth instanceof NextResponse) return auth
    const writeGuard = requireWriteAccess(auth)
    if (writeGuard instanceof NextResponse) return writeGuard

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const { notes } = body as { notes?: string }

    const trip = await db.trip.findUnique({
      where: { id },
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true, currentMileage: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true, totalTrips: true, totalMileage: true } },
      },
    })

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // Drivers can only complete their own trips
    if (auth.roleName === ROLES.DRIVER && trip.driverId !== auth.driverId) {
      return NextResponse.json({ error: 'Access denied. You can only complete your own trips.' }, { status: 403 })
    }

    if (isTerminalStatus(trip.status)) {
      return NextResponse.json(
        { error: `Trip is already ${trip.status}` },
        { status: 400 }
      )
    }

    const now = new Date()
    const departureTime = trip.departureTime || now

    // Build all timestamps — fill any missing ones with now
    const updateData: Record<string, unknown> = {
      status: 'completed',
      loadingStartedAt: trip.loadingStartedAt || departureTime,
      loadingCompletedAt: trip.loadingCompletedAt || departureTime,
      offloadingStartedAt: trip.offloadingStartedAt || now,
      offloadingCompletedAt: trip.offloadingCompletedAt || now,
      arrivalTime: trip.arrivalTime || now,
      waitingReason: null,
      waitingSince: null,
    }

    // Append notes if provided
    if (notes) {
      updateData.notes = trip.notes
        ? `${trip.notes}\n[completed ${now.toLocaleDateString()}] ${notes}`
        : `[completed ${now.toLocaleDateString()}] ${notes}`
    }

    const updatedTrip = await db.trip.update({
      where: { id },
      data: updateData,
      include: {
        truck: { select: { id: true, plateNumber: true, make: true, model: true } },
        driver: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    })

    // Increment driver stats
    await db.driver.update({
      where: { id: trip.driverId },
      data: {
        totalTrips: { increment: 1 },
        totalMileage: { increment: trip.totalMileage || 0 },
      },
    })

    // Create TripEvent entries for all stages from current to completed
    const currentIdx = ALL_TRIP_STATUSES.indexOf(trip.status as (typeof ALL_TRIP_STATUSES)[number])
    const stagesToCreate: { from: string; to: string }[] = []

    if (currentIdx >= 0) {
      for (let i = currentIdx; i < ALL_TRIP_STATUSES.length; i++) {
        const from = i === currentIdx ? trip.status : ALL_TRIP_STATUSES[i - 1]
        const to = ALL_TRIP_STATUSES[i]
        if (from !== to) {
          stagesToCreate.push({ from, to })
        }
      }
      // Final: arrived_depot → completed
      stagesToCreate.push({ from: 'arrived_depot', to: 'completed' })
    } else {
      stagesToCreate.push({ from: trip.status, to: 'completed' })
    }

    if (stagesToCreate.length > 0) {
      await db.tripEvent.createMany({
        data: stagesToCreate.map((stage) => ({
          tripId: id,
          fromStatus: stage.from,
          toStatus: stage.to,
          notes: notes || null,
        })),
      })
    }

    // Audit log
    createAuditLog({
      userId: auth.userId,
      action: 'status_change',
      entity: 'Trip',
      entityId: id,
      details: { fromStatus: trip.status, toStatus: 'completed', tripNumber: trip.tripNumber, method: 'mark_completed' },
      ipAddress: getClientIp(request),
    }).catch(() => {})

    // ── Fire-and-forget: completion notification ──
    const driverName = `${trip.driver.firstName} ${trip.driver.lastName}`
    const inAppMessage = `Trip Completed: ${updatedTrip.tripNumber} (${driverName}, ${updatedTrip.truck.plateNumber}) — ${trip.loadingLocation} → ${trip.destination}`
    const smsBody = `${APP_NAME}: Trip completed — ${updatedTrip.tripNumber}, ${updatedTrip.truck.plateNumber}. Route: ${trip.loadingLocation} to ${trip.destination}.`

    ;(async () => {
      try {
        const adminUsers = await db.user.findMany({
          where: { role: { name: { in: ['Admin', 'Manager'] } } },
          select: { id: true },
        })
        const adminIds = new Set(adminUsers.map((u) => u.id))

        const driverWithUser = trip.driver?.phone
          ? await db.driver.findUnique({
              where: { id: trip.driverId },
              select: { userId: true },
            })
          : null
        const driverUserId = driverWithUser?.userId || null
        const driverAlreadyNotified = driverUserId ? adminIds.has(driverUserId) : false

        await Promise.allSettled(
          adminUsers.map((u) =>
            dispatchNotification({
              userId: u.id,
              type: 'trip_completed',
              title: 'Trip Completed',
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
                status: 'completed',
              },
            })
          )
        )

        if (!driverAlreadyNotified && trip.driver?.phone) {
          await dispatchNotification({
            userId: driverUserId || trip.driverId,
            driverId: trip.driverId,
            type: 'trip_completed',
            title: 'Trip Completed',
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
              status: 'completed',
            },
          })
        }
      } catch (err) {
        console.error('[Notification] Failed to dispatch trip completion notifications:', err)
      }
    })().catch(() => { /* fire-and-forget */ })

    return NextResponse.json(updatedTrip)
  } catch (error) {
    console.error('Mark trip completed error:', error)
    return NextResponse.json({ error: 'Failed to mark trip as completed' }, { status: 500 })
  }
}
