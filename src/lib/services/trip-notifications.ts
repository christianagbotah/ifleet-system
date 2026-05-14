// ════════════════════════════════════════════════════════════════════
// ${APP_NAME} — Trip Notification Helpers
// ════════════════════════════════════════════════════════════════════

import { APP_NAME } from '@/lib/constants'
//
// Pre-built notification templates for trip lifecycle events.
// Each function:
//   1. Fetches the trip with driver + truck + user relations
//   2. Builds appropriate message content for each channel
//   3. Calls dispatchNotification with the right params
//
// Lifecycle events:
//   scheduled → loading → loaded → waiting_at_depot → departed_depot
//     → in_transit → arrived_destination → waiting_to_offload
//     → offloading → offloaded → return_journey → arrived_depot → completed
// ────────────────────────────────────────────────────────────────────

import { db } from '@/lib/db'
import { dispatchNotification } from './notification-dispatcher'
import type { NotificationChannel } from './notification-dispatcher'

// ── Types for trip data from database ──

interface TripWithRelations {
  id: string
  tripNumber: string
  status: string
  loadingLocation: string
  destination: string
  itemName: string
  quantity: number
  unit: string
  departureTime: Date
  customerName: string | null
  driver: {
    id: string
    firstName: string
    lastName: string
    phone: string
    email: string | null
    user: { id: string } | null
  }
  truck: {
    plateNumber: string
    make: string
    model: string
  }
}

/**
 * Fetch a trip with all needed relations for notification building.
 */
async function fetchTripForNotification(tripId: string): Promise<TripWithRelations | null> {
  return db.trip.findUnique({
    where: { id: tripId },
    include: {
      driver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          user: { select: { id: true } },
        },
      },
      truck: {
        select: {
          plateNumber: true,
          make: true,
          model: true,
        },
      },
    },
  })
}

/**
 * Get the userId to notify. Prefers the driver's linked user account,
 * otherwise falls back to looking up admin/manager users.
 */
function resolveUserId(trip: TripWithRelations): string | null {
  // Primary: driver's linked user account
  if (trip.driver.user?.id) return trip.driver.user.id
  return null
}

/**
 * Default notification channels for trip events.
 * Admins/managers get in_app + email, drivers get in_app + sms.
 */
function getTripChannels(trip: TripWithRelations): NotificationChannel[] {
  const channels: NotificationChannel[] = ['in_app', 'email']

  // Add SMS if driver has a phone
  if (trip.driver.phone) {
    channels.push('sms')
  }

  return channels
}

/**
 * Format driver name for display.
 */
function driverName(trip: TripWithRelations): string {
  return `${trip.driver.firstName} ${trip.driver.lastName}`
}

/**
 * Format route string.
 */
function routeString(trip: TripWithRelations): string {
  return `${trip.loadingLocation} → ${trip.destination}`
}

// ════════════════════════════════════════════════════════════════════
// TRIP LIFECYCLE NOTIFICATIONS
// ════════════════════════════════════════════════════════════════════

/**
 * Notify that a new trip has been assigned to a driver.
 */
export async function notifyTripAssigned(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) {
    console.warn(`[TripNotification] Trip ${tripId} not found for notifyTripAssigned`)
    return
  }

  const userId = resolveUserId(trip)
  if (!userId) {
    console.warn(`[TripNotification] No linked user for driver ${trip.driver.id} on trip ${trip.tripNumber}`)
    return
  }

  const title = 'New Trip Assigned'
  const message = `You have been assigned a new trip: <strong>${trip.tripNumber}</strong>. ` +
    `Route: ${routeString(trip)}. Cargo: ${trip.itemName} (${trip.quantity.toLocaleString()} ${trip.unit}). ` +
    `Truck: ${trip.truck.plateNumber}. Please prepare for departure.`

  const smsMsg = `New trip ${trip.tripNumber} assigned. Route: ${routeString(trip)}. Truck: ${trip.truck.plateNumber}. Prepare for departure.`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_started',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `New Trip Assigned: ${trip.tripNumber}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      truckPlate: trip.truck.plateNumber,
      route: routeString(trip),
    },
  })
}

/**
 * Notify that loading has begun at the depot.
 */
export async function notifyTripLoading(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const title = 'Loading Started'
  const message = `Loading has begun for trip <strong>${trip.tripNumber}</strong>. ` +
    `Loading ${trip.itemName} (${trip.quantity.toLocaleString()} ${trip.unit}) at ${trip.loadingLocation}. ` +
    `Truck: ${trip.truck.plateNumber}.`

  const smsMsg = `Loading started for ${trip.tripNumber}. ${trip.itemName} at ${trip.loadingLocation}. Truck: ${trip.truck.plateNumber}.`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_loading',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Loading Started: ${trip.tripNumber}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      loadingLocation: trip.loadingLocation,
    },
  })
}

/**
 * Notify that the truck is fully loaded and ready to depart.
 */
export async function notifyTripLoaded(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const title = 'Truck Loaded & Ready'
  const message = `Trip <strong>${trip.tripNumber}</strong> is fully loaded. ` +
    `${trip.itemName} (${trip.quantity.toLocaleString()} ${trip.unit}) has been loaded onto ${trip.truck.plateNumber}. ` +
    `Ready for departure to ${trip.destination}.`

  const smsMsg = `${trip.tripNumber} loaded & ready. ${trip.quantity.toLocaleString()} ${trip.unit} of ${trip.itemName} on ${trip.truck.plateNumber}. Destination: ${trip.destination}.`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_loaded',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Loaded & Ready: ${trip.tripNumber}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      truckPlate: trip.truck.plateNumber,
      destination: trip.destination,
    },
  })
}

/**
 * Notify that the trip has departed from the depot.
 */
export async function notifyTripDeparted(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const title = 'Trip Departed'
  const message = `Trip <strong>${trip.tripNumber}</strong> has departed from ${trip.loadingLocation}. ` +
    `Driver ${driverName(trip)} is now on the way to ${trip.destination} with ${trip.itemName} ` +
    `(${trip.quantity.toLocaleString()} ${trip.unit}) on ${trip.truck.plateNumber}.`

  const smsMsg = `${trip.tripNumber} departed ${trip.loadingLocation}. Driver ${driverName(trip)} heading to ${trip.destination}. Drive safely!`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_departed',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Trip Departed: ${trip.tripNumber} → ${trip.destination}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      truckPlate: trip.truck.plateNumber,
      from: trip.loadingLocation,
      to: trip.destination,
    },
  })
}

/**
 * Notify that the truck has arrived at the destination.
 */
export async function notifyTripArrived(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const title = 'Arrived at Destination'
  const message = `Trip <strong>${trip.tripNumber}</strong> has arrived at <strong>${trip.destination}</strong>. ` +
    `Driver ${driverName(trip)} is ready for offloading ${trip.itemName} ` +
    `(${trip.quantity.toLocaleString()} ${trip.unit}).`

  const smsMsg = `${trip.tripNumber} arrived at ${trip.destination}. Ready to offload ${trip.itemName}.`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_arrived',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Arrived at Destination: ${trip.tripNumber}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      destination: trip.destination,
    },
  })
}

/**
 * Notify that offloading has started at the destination.
 */
export async function notifyTripOffloading(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const title = 'Offloading Started'
  const message = `Offloading has started for trip <strong>${trip.tripNumber}</strong> at ${trip.destination}. ` +
    `Unloading ${trip.itemName} (${trip.quantity.toLocaleString()} ${trip.unit}) from ${trip.truck.plateNumber}.`

  const smsMsg = `Offloading started for ${trip.tripNumber} at ${trip.destination}. ${trip.itemName} from ${trip.truck.plateNumber}.`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_offloading',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Offloading Started: ${trip.tripNumber}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      destination: trip.destination,
    },
  })
}

/**
 * Notify that offloading has been completed.
 */
export async function notifyTripOffloaded(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const title = 'Offloading Complete'
  const message = `Offloading completed for trip <strong>${trip.tripNumber}</strong> at ${trip.destination}. ` +
    `${trip.itemName} (${trip.quantity.toLocaleString()} ${trip.unit}) has been successfully delivered. ` +
    `Driver ${driverName(trip)} can begin the return journey.`

  const smsMsg = `${trip.tripNumber} offloading complete at ${trip.destination}. ${trip.itemName} delivered successfully. Begin return journey.`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_offloaded',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Offloading Complete: ${trip.tripNumber}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      destination: trip.destination,
    },
  })
}

/**
 * Notify that the trip has been fully completed.
 */
export async function notifyTripCompleted(tripId: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const title = 'Trip Completed'
  const message = `Trip <strong>${trip.tripNumber}</strong> has been completed successfully! ` +
    `Driver ${driverName(trip)} delivered ${trip.itemName} (${trip.quantity.toLocaleString()} ${trip.unit}) ` +
    `from ${trip.loadingLocation} to ${trip.destination} using ${trip.truck.plateNumber}.`

  const smsMsg = `${trip.tripNumber} completed! ${trip.itemName} delivered ${routeString(trip)}. Well done ${trip.driver.firstName}!`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_completed',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Trip Completed: ${trip.tripNumber}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      truckPlate: trip.truck.plateNumber,
      route: routeString(trip),
    },
  })
}

/**
 * Notify that the trip is in a waiting state (at depot or waiting to offload).
 */
export async function notifyTripWaiting(tripId: string, reason: string): Promise<void> {
  const trip = await fetchTripForNotification(tripId)
  if (!trip) return

  const userId = resolveUserId(trip)
  if (!userId) return

  const isAtDepot = trip.status === 'waiting_at_depot'
  const location = isAtDepot ? trip.loadingLocation : trip.destination

  const title = isAtDepot ? 'Waiting at Depot' : 'Waiting to Offload'
  const message = `Trip <strong>${trip.tripNumber}</strong> is on hold at <strong>${location}</strong>. ` +
    `Reason: ${reason}. ` +
    `Driver ${driverName(trip)} will proceed when ready.`

  const smsMsg = `${trip.tripNumber} on hold at ${location}. Reason: ${reason}. Will proceed when ready.`

  await dispatchNotification({
    userId,
    driverId: trip.driver.id,
    type: 'trip_waiting',
    title,
    message,
    channels: getTripChannels(trip),
    link: `/trips/${trip.id}`,
    tripId: trip.id,
    smsMessage: smsMsg,
    emailSubject: `Trip on Hold: ${trip.tripNumber} — ${reason}`,
    metadata: {
      tripNumber: trip.tripNumber,
      driverName: driverName(trip),
      waitingReason: reason,
      waitingLocation: location,
      status: trip.status,
    },
  })
}
