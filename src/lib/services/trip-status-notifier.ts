import { APP_NAME } from '@/lib/constants'
import { db } from '@/lib/db'
import { getTripNotificationSpec } from '@/lib/domain/dispatch/trip-notification'
import { planDriverNotification } from '@/lib/domain/dispatch/notification-target'
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

  const driverPlan = planDriverNotification({
    userId: trip.driver.userId,
    driverId: trip.driverId,
    hasPhone: Boolean(trip.driver.phone),
    userAlreadyNotified: Boolean(trip.driver.userId && adminIds.has(trip.driver.userId)),
  })
  if (driverPlan) {
    await dispatchNotification({
      userId: driverPlan.userId ?? undefined,
      driverId: driverPlan.driverId,
      type: spec.type,
      title: spec.title,
      message,
      channels: driverPlan.channels,
      smsMessage,
      link: `trips/${trip.id}`,
      tripId: trip.id,
      metadata: { tripNumber: trip.tripNumber, status, truckPlate: trip.truck.plateNumber },
    })
  }
}
