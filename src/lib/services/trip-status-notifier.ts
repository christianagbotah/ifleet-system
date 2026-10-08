import { APP_NAME } from '@/lib/constants'
import { db } from '@/lib/db'
import { getTripNotificationSpec } from '@/lib/domain/dispatch/trip-notification'
import type { TripStatusValue } from '@/lib/domain/dispatch/trip-state-machine'
import { dispatchNotification } from '@/lib/services/notification-dispatcher'

export async function dispatchTripStatusNotification(tripId: string, status: TripStatusValue): Promise<void> {
  const spec = getTripNotificationSpec(status)
  if (!spec) return

  const trip = await db.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      tripNumber: true,
      loadingLocation: true,
      destination: true,
      driverId: true,
      driver: { select: { firstName: true, lastName: true, phone: true, userId: true } },
      truck: { select: { plateNumber: true } },
    },
  })
  if (!trip) return

  const driverName = `${trip.driver.firstName} ${trip.driver.lastName}`.trim()
  const message = `${spec.title}: Trip ${trip.tripNumber} (${driverName}, ${trip.truck.plateNumber}) — ${trip.loadingLocation} → ${trip.destination}`
  const smsMessage = `${APP_NAME}: ${spec.smsTitle} — ${trip.tripNumber}, ${trip.truck.plateNumber}. ${trip.loadingLocation} to ${trip.destination}.`
  const adminUsers = await db.user.findMany({
    where: { role: { name: { in: ['Admin', 'Manager'] } } },
    select: { id: true },
  })
  const adminIds = new Set(adminUsers.map((user) => user.id))

  await Promise.allSettled(adminUsers.map((user) => dispatchNotification({
    userId: user.id,
    type: spec.type,
    title: spec.title,
    message,
    channels: ['in_app', 'push'],
    link: `trips/${trip.id}`,
    tripId: trip.id,
    metadata: { tripNumber: trip.tripNumber, status, driverName, truckPlate: trip.truck.plateNumber },
  })))

  if (!trip.driver.userId || !adminIds.has(trip.driver.userId)) {
    await dispatchNotification({
      userId: trip.driver.userId || trip.driverId,
      driverId: trip.driverId,
      type: spec.type,
      title: spec.title,
      message,
      channels: trip.driver.phone ? ['in_app', 'sms', 'push'] : ['in_app', 'push'],
      smsMessage,
      link: `trips/${trip.id}`,
      tripId: trip.id,
      metadata: { tripNumber: trip.tripNumber, status, truckPlate: trip.truck.plateNumber },
    })
  }
}
