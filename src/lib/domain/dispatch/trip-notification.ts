import type { TripStatusValue } from '@/lib/domain/dispatch/trip-state-machine'

export interface TripNotificationSpec {
  type: string
  title: string
  smsTitle: string
}

const specs: Partial<Record<TripStatusValue, TripNotificationSpec>> = {
  assigned: { type: 'trip_assigned', title: 'Trip Assigned', smsTitle: 'Trip assigned' },
  loading: { type: 'trip_loading', title: 'Loading Started', smsTitle: 'Loading started' },
  loaded: { type: 'trip_loaded', title: 'Loading Completed', smsTitle: 'Loading completed' },
  departed_loading_point: { type: 'trip_departed', title: 'Trip Departed', smsTitle: 'Trip departed loading point' },
  in_transit: { type: 'trip_in_transit', title: 'In Transit', smsTitle: 'In transit' },
  arrived_destination: { type: 'trip_arrived', title: 'Arrived at Destination', smsTitle: 'Arrived at destination' },
  offloading: { type: 'trip_offloading', title: 'Offloading Started', smsTitle: 'Offloading started' },
  delivered: { type: 'trip_offloaded', title: 'Delivery Completed', smsTitle: 'Delivery completed' },
  return_journey: { type: 'trip_return', title: 'Return Journey Started', smsTitle: 'Return journey started' },
  arrived_base: { type: 'trip_return', title: 'Arrived at Base', smsTitle: 'Arrived at base' },
  completed: { type: 'trip_completed', title: 'Trip Completed', smsTitle: 'Trip completed' },
}

export function getTripNotificationSpec(status: TripStatusValue): TripNotificationSpec | null {
  return specs[status] ?? null
}
