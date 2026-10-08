export type TripStatusValue =
  | 'draft' | 'scheduled' | 'assigned' | 'eligibility_check' | 'authorized_for_loading'
  | 'en_route_to_loading_point' | 'gate_in' | 'queued' | 'preload_weighing' | 'loading'
  | 'loaded' | 'postload_weighing' | 'awaiting_dispatch_clearance' | 'departed_loading_point'
  | 'in_transit' | 'arrived_destination' | 'offloading' | 'delivered' | 'return_journey'
  | 'arrived_base' | 'awaiting_reconciliation' | 'reconciled' | 'completed' | 'delayed'
  | 'cancelled' | 'exception_hold'
  | 'departed_depot' | 'offloaded' | 'arrived_depot'

export interface TransitionDecision {
  allowed: boolean
  reason?: string
  canonicalFrom: TripStatusValue
  canonicalTo: TripStatusValue
}

const legacyMap: Partial<Record<TripStatusValue, TripStatusValue>> = {
  departed_depot: 'departed_loading_point',
  offloaded: 'delivered',
  arrived_depot: 'arrived_base',
}

const next: Partial<Record<TripStatusValue, TripStatusValue[]>> = {
  draft: ['scheduled'],
  scheduled: ['assigned'],
  assigned: ['eligibility_check'],
  eligibility_check: ['authorized_for_loading'],
  authorized_for_loading: ['en_route_to_loading_point'],
  en_route_to_loading_point: ['gate_in'],
  gate_in: ['queued'],
  queued: ['preload_weighing'],
  preload_weighing: ['loading'],
  loading: ['loaded'],
  loaded: ['postload_weighing'],
  postload_weighing: ['awaiting_dispatch_clearance'],
  awaiting_dispatch_clearance: ['departed_loading_point'],
  departed_loading_point: ['in_transit'],
  in_transit: ['arrived_destination'],
  arrived_destination: ['offloading'],
  offloading: ['delivered'],
  delivered: ['return_journey', 'awaiting_reconciliation'],
  return_journey: ['arrived_base'],
  arrived_base: ['awaiting_reconciliation'],
  awaiting_reconciliation: ['reconciled'],
  reconciled: ['completed'],
}

const cancellable = new Set<TripStatusValue>([
  'draft', 'scheduled', 'assigned', 'eligibility_check', 'authorized_for_loading',
  'en_route_to_loading_point', 'gate_in', 'queued', 'preload_weighing', 'loading',
  'loaded', 'postload_weighing', 'awaiting_dispatch_clearance', 'departed_loading_point',
  'in_transit', 'arrived_destination', 'offloading',
])

const resumable = new Set<TripStatusValue>([
  'scheduled', 'assigned', 'eligibility_check', 'authorized_for_loading',
  'en_route_to_loading_point', 'gate_in', 'queued', 'preload_weighing', 'loading',
  'loaded', 'postload_weighing', 'awaiting_dispatch_clearance', 'departed_loading_point',
  'in_transit', 'arrived_destination', 'offloading', 'return_journey', 'arrived_base',
  'awaiting_reconciliation',
])

export function canonicalTripStatus(status: TripStatusValue): TripStatusValue {
  return legacyMap[status] ?? status
}

export function canTransition(from: TripStatusValue, to: TripStatusValue): TransitionDecision {
  const canonicalFrom = canonicalTripStatus(from)
  const canonicalTo = canonicalTripStatus(to)

  if (canonicalFrom === 'completed' || canonicalFrom === 'cancelled') {
    return { allowed: false, reason: `${canonicalFrom} is a terminal state`, canonicalFrom, canonicalTo }
  }

  if (canonicalTo === 'cancelled') {
    const allowed = cancellable.has(canonicalFrom)
    return {
      allowed,
      reason: allowed ? undefined : `Cancellation is not allowed from ${canonicalFrom}`,
      canonicalFrom,
      canonicalTo,
    }
  }

  if (canonicalTo === 'delayed' || canonicalTo === 'exception_hold') {
    const allowed = resumable.has(canonicalFrom)
    return {
      allowed,
      reason: allowed ? undefined : `Hold is not allowed from ${canonicalFrom}`,
      canonicalFrom,
      canonicalTo,
    }
  }

  if (canonicalFrom === 'delayed' || canonicalFrom === 'exception_hold') {
    const allowed = resumable.has(canonicalTo)
    return {
      allowed,
      reason: allowed ? undefined : `Resume to ${canonicalTo} is not allowed`,
      canonicalFrom,
      canonicalTo,
    }
  }

  const allowed = next[canonicalFrom]?.includes(canonicalTo) ?? false
  return {
    allowed,
    reason: allowed ? undefined : `Transition from ${canonicalFrom} to ${canonicalTo} is not allowed`,
    canonicalFrom,
    canonicalTo,
  }
}

export function getDefaultNextStatus(status: TripStatusValue): TripStatusValue | null {
  const canonical = canonicalTripStatus(status)
  if (canonical === 'delayed' || canonical === 'exception_hold' || canonical === 'completed' || canonical === 'cancelled') {
    return null
  }
  return next[canonical]?.[0] ?? null
}
