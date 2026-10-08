import { canTransition, canonicalTripStatus, getDefaultNextStatus, type TripStatusValue } from '@/lib/domain/dispatch/trip-state-machine'

// ════════════════════════════════════════════════════════════════════
// COMPREHENSIVE TRIP LIFECYCLE — Ghana Logistics Real-World Stages
// ════════════════════════════════════════════════════════════════════
//
// Flow:
//   scheduled → loading → loaded → waiting_at_depot → departed_depot
//     → in_transit → arrived_destination → waiting_to_offload
//     → offloading → offloaded → [in_transit for next drop] / return_journey
//     → arrived_depot → completed
//
// Multi-destination: offloaded → in_transit (loops to next stop)
// Single destination: offloaded → return_journey → arrived_depot → completed
// ────────────────────────────────────────────────────────────────────

// Ordered canonical non-terminal statuses representing the guarded haulage lifecycle
export const ALL_TRIP_STATUSES = [
  'draft', 'scheduled', 'assigned', 'eligibility_check', 'authorized_for_loading',
  'en_route_to_loading_point', 'gate_in', 'queued', 'preload_weighing', 'loading',
  'loaded', 'postload_weighing', 'awaiting_dispatch_clearance', 'departed_loading_point',
  'in_transit', 'arrived_destination', 'offloading', 'delivered', 'return_journey',
  'arrived_base', 'awaiting_reconciliation', 'reconciled',
] as const

export type TripStatus = TripStatusValue

const transitionCandidates: TripStatusValue[] = [
  ...ALL_TRIP_STATUSES, 'completed', 'cancelled', 'delayed', 'exception_hold',
  'departed_depot', 'offloaded', 'arrived_depot',
]

export const TRANSITIONS: Record<string, TripStatus[]> = Object.fromEntries(
  transitionCandidates.map((from) => [
    from,
    transitionCandidates.filter((to) => canTransition(from, to).allowed),
  ])
)

// Metadata for each status — used in UI rendering
export const TRIP_STATUS_META: Record<string, { label: string; description: string; color: string; icon: string }> = {
  draft: { label: 'Draft', description: 'Trip is being prepared and is not yet scheduled', color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300', icon: '📝' },
  assigned: { label: 'Assigned', description: 'Driver, tractor and optional trailer have been assigned', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: '👤' },
  eligibility_check: { label: 'Eligibility Check', description: 'Driver and vehicle compliance is being verified', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: '🔎' },
  authorized_for_loading: { label: 'Authorized for Loading', description: 'Dispatch checks passed and the vehicle may proceed to the loading site', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300', icon: '✅' },
  en_route_to_loading_point: { label: 'En Route to Loading', description: 'Vehicle is heading to the configured loading point', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300', icon: '🚛' },
  gate_in: { label: 'Gate In', description: 'Vehicle has entered the factory, depot or loading facility', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300', icon: '🏭' },
  queued: { label: 'Queued', description: 'Vehicle is waiting in the loading-site queue', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: '⏳' },
  preload_weighing: { label: 'Pre-load Weighing', description: 'Tare or pre-load weight verification is in progress', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', icon: '⚖️' },
  postload_weighing: { label: 'Post-load Weighing', description: 'Gross and axle load verification is in progress', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300', icon: '⚖️' },
  awaiting_dispatch_clearance: { label: 'Awaiting Dispatch Clearance', description: 'Waybill, seal and dispatch clearance are pending', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: '📄' },
  departed_loading_point: { label: 'Departed Loading Point', description: 'Vehicle has cleared the loading site and started the delivery journey', color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-300', icon: '🚛' },
  delivered: { label: 'Delivered', description: 'Cargo has been offloaded and delivery evidence captured', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', icon: '📦' },
  arrived_base: { label: 'Arrived at Base', description: 'Vehicle has returned to its base or next operational point', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300', icon: '🏠' },
  awaiting_reconciliation: { label: 'Awaiting Reconciliation', description: 'Trip costs, advances and delivery quantities require reconciliation', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', icon: '🧾' },
  reconciled: { label: 'Reconciled', description: 'Operational and financial trip reconciliation is complete', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', icon: '✓' },
  delayed: { label: 'Delayed', description: 'Trip is temporarily delayed and requires an explicit resume state', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: '⏱️' },
  exception_hold: { label: 'Exception Hold', description: 'A blocking operational or compliance exception must be resolved', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: '⚠️' },
  scheduled: {
    label: 'Scheduled',
    description: 'Trip planned and assigned to driver & truck',
    color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',
    icon: '📅',
  },
  loading: {
    label: 'Loading',
    description: 'Cargo is being loaded onto the truck at the loading bay',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    icon: '📦',
  },
  loaded: {
    label: 'Loaded & Ready',
    description: 'Loading complete — truck is ready to depart',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: '✅',
  },
  waiting_at_depot: {
    label: 'Waiting at Depot',
    description: 'Loaded but waiting — customer not ready or too late to travel. Driver rests overnight if needed.',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    icon: '⏳',
  },
  departed_depot: {
    label: 'Departed Depot',
    description: 'Truck has left the loading bay/factory and is beginning the journey',
    color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
    icon: '🚛',
  },
  in_transit: {
    label: 'In Transit',
    description: 'Truck is on the road heading to the delivery destination',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    icon: '🛣️',
  },
  arrived_destination: {
    label: 'Arrived at Destination',
    description: 'Truck has arrived at the delivery point',
    color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    icon: '📍',
  },
  waiting_to_offload: {
    label: 'Waiting to Offload',
    description: 'Arrived but offloading bay is occupied or customer not ready to receive',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    icon: '⏳',
  },
  offloading: {
    label: 'Offloading',
    description: 'Cargo is being unloaded from the truck',
    color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
    icon: '📤',
  },
  offloaded: {
    label: 'Offloading Complete',
    description: 'Cargo has been fully unloaded at this destination. Quantity verified.',
    color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    icon: '📋',
  },
  return_journey: {
    label: 'Return Journey',
    description: 'All deliveries complete — truck is heading back to the factory/base',
    color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
    icon: '🔙',
  },
  arrived_depot: {
    label: 'Arrived at Depot',
    description: 'Truck has returned to the factory/base',
    color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    icon: '🏭',
  },
  completed: {
    label: 'Completed',
    description: 'Trip is fully complete and closed',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    icon: '✅',
  },
  cancelled: {
    label: 'Cancelled',
    description: 'Trip has been cancelled',
    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    icon: '❌',
  },
}

// ── Expense categories for driver trip expenses ──
export const TRIP_EXPENSE_CATEGORIES = [
  { value: 'fuel', label: 'Fuel', icon: '⛽' },
  { value: 'toll', label: 'Toll / Toll Booth', icon: '🛣️' },
  { value: 'fine', label: 'Fine / Penalty', icon: '📋' },
  { value: 'parking', label: 'Parking', icon: '🅿️' },
  { value: 'food', label: 'Food & Drinks', icon: '🍔' },
  { value: 'loading', label: 'Loading Charges', icon: '🏗️' },
  { value: 'offloading', label: 'Offloading Charges', icon: '📤' },
  { value: 'accommodation', label: 'Lodging / Accommodation', icon: '🏨' },
  { value: 'miscellaneous', label: 'Other', icon: '📦' },
] as const

// ════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════

/** Check if a transition from `from` to `to` is valid */
export function isValidTransition(from: string, to: string): boolean {
  return canTransition(from as TripStatusValue, to as TripStatusValue).allowed
}

/** Get the default "next" status for simple sequential advancement */
export function getNextStatus(current: string): string | null {
  return getDefaultNextStatus(current as TripStatusValue)
}

/** Get all allowed next statuses for the current status */
export function getAllowedTransitions(current: string): TripStatus[] {
  return TRANSITIONS[current] || []
}

/** Progress percentage 0-100 based on lifecycle position */
export function getTripProgress(status: string): number {
  const canonical = canonicalTripStatus(status as TripStatusValue)
  const idx = ALL_TRIP_STATUSES.indexOf(canonical as (typeof ALL_TRIP_STATUSES)[number])
  if (status === 'completed') return 100
  if (status === 'cancelled') return 0
  if (idx === -1) return 0
  return Math.round(((idx + 1) / ALL_TRIP_STATUSES.length) * 100)
}

/** Canonical lifecycle position; legacy aliases map to their modern equivalent. */
export function getTripStatusIndex(status: string): number {
  const canonical = canonicalTripStatus(status as TripStatusValue)
  if (canonical === 'completed') return ALL_TRIP_STATUSES.length
  return ALL_TRIP_STATUSES.indexOf(canonical as (typeof ALL_TRIP_STATUSES)[number])
}

/** Check if the status is terminal (no further transitions) */
export function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'cancelled'
}

/** Check if trip is in a waiting/standby state */
export function isWaitingStatus(status: string): boolean {
  return ['queued', 'delayed', 'exception_hold', 'waiting_at_depot', 'waiting_to_offload'].includes(status)
}

/** Check if truck is actively on the road */
export function isActiveRoadStatus(status: string): boolean {
  return ['en_route_to_loading_point', 'departed_loading_point', 'departed_depot', 'in_transit', 'return_journey'].includes(status)
}

/** Check if trip is at a delivery point (arrived, waiting to offload, offloading, or offloaded) */
export function isAtDeliveryStatus(status: string): boolean {
  return ['arrived_destination', 'waiting_to_offload', 'offloading', 'delivered', 'offloaded'].includes(status)
}

/** Can the driver log expenses at this stage? */
export function canLogExpenses(status: string): boolean {
  return !isTerminalStatus(status)
}

/** Get expense category metadata */
export function getExpenseCategoryMeta(category: string): { label: string; icon: string } {
  const cat = TRIP_EXPENSE_CATEGORIES.find((c) => c.value === category)
  return cat ? { label: cat.label, icon: cat.icon } : { label: category, icon: '📦' }
}

/** Get a display-friendly status color for the pipeline bar */
export function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    scheduled: '#38bdf8',
    loading: '#f59e0b',
    loaded: '#eab308',
    waiting_at_depot: '#f97316',
    departed_depot: '#84cc16',
    in_transit: '#10b981',
    arrived_destination: '#14b8a6',
    waiting_to_offload: '#f97316',
    offloading: '#8b5cf6',
    offloaded: '#6366f1',
    return_journey: '#f43f5e',
    arrived_depot: '#06b6d4',
    completed: '#6b7280',
    cancelled: '#ef4444',
  }
  return colorMap[status] || '#6b7280'
}

// ════════════════════════════════════════════════════════════════════
// PHASE GROUPING — for UI stepper and pipeline visualisation
// ════════════════════════════════════════════════════════════════════

export const TRIP_PHASES = {
  pre_departure: {
    label: 'Pre-Departure', description: 'Assignment, compliance, gate, weighing, loading & dispatch', color: '#38bdf8',
    bgClass: 'bg-sky-50 dark:bg-sky-900/20', textClass: 'text-sky-700 dark:text-sky-400', borderClass: 'border-sky-200 dark:border-sky-800',
    statuses: ['draft', 'scheduled', 'assigned', 'eligibility_check', 'authorized_for_loading', 'en_route_to_loading_point', 'gate_in', 'queued', 'preload_weighing', 'loading', 'loaded', 'postload_weighing', 'awaiting_dispatch_clearance', 'departed_loading_point'] as const,
  },
  transit: {
    label: 'On the Road', description: 'Vehicle is moving to destination', color: '#10b981',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/20', textClass: 'text-emerald-700 dark:text-emerald-400', borderClass: 'border-emerald-200 dark:border-emerald-800',
    statuses: ['in_transit'] as const,
  },
  delivery: {
    label: 'Delivery', description: 'Arrival, offloading & delivery confirmation', color: '#8b5cf6',
    bgClass: 'bg-violet-50 dark:bg-violet-900/20', textClass: 'text-violet-700 dark:text-violet-400', borderClass: 'border-violet-200 dark:border-violet-800',
    statuses: ['arrived_destination', 'offloading', 'delivered'] as const,
  },
  return: {
    label: 'Return & Closeout', description: 'Return, reconciliation and final closure', color: '#f43f5e',
    bgClass: 'bg-rose-50 dark:bg-rose-900/20', textClass: 'text-rose-700 dark:text-rose-400', borderClass: 'border-rose-200 dark:border-rose-800',
    statuses: ['return_journey', 'arrived_base', 'awaiting_reconciliation', 'reconciled'] as const,
  },
} as const

export type TripPhaseKey = keyof typeof TRIP_PHASES

/** Get which phase a status belongs to */
export function getTripPhase(status: string): TripPhaseKey {
  status = canonicalTripStatus(status as TripStatusValue)
  for (const [key, phase] of Object.entries(TRIP_PHASES)) {
    if (phase.statuses.includes(status as (typeof phase.statuses)[number])) {
      return key as TripPhaseKey
    }
  }
  return 'pre_departure'
}

/** Check if the truck is currently at a delivery destination */
export function isAtDestination(status: string): boolean {
  return ['arrived_destination', 'waiting_to_offload', 'offloading', 'delivered', 'offloaded'].includes(status)
}

/** Get human-readable action label for the advance button */
export function getAdvanceAction(
  current: string,
  options?: { hasMoreStops?: boolean },
): string | null {
  if (isTerminalStatus(current)) return null
  const next = getNextStatus(current)
  if (!next) return null

  const actionMap: Record<string, string> = {
    draft:                       'Schedule Trip',
    scheduled:                   'Confirm Assignment',
    assigned:                    'Start Eligibility Check',
    eligibility_check:           'Authorize for Loading',
    authorized_for_loading:      'Proceed to Loading Point',
    en_route_to_loading_point:   'Confirm Gate In',
    gate_in:                     'Join Loading Queue',
    queued:                      'Start Pre-load Weighing',
    preload_weighing:            'Begin Loading',
    loading:                     'Confirm Loaded',
    loaded:                      'Start Post-load Weighing',
    postload_weighing:           'Request Dispatch Clearance',
    awaiting_dispatch_clearance: 'Confirm Departure',
    departed_loading_point:      'Start In-Transit Stage',
    departed_depot:              'Start In-Transit Stage',
    in_transit:                  'Confirm Destination Arrival',
    arrived_destination:         'Begin Offloading',
    offloading:                  'Confirm Delivery',
    delivered:                   'Begin Return Journey',
    offloaded:                   'Begin Return Journey',
    return_journey:              'Confirm Arrived at Base',
    arrived_base:                'Begin Reconciliation',
    arrived_depot:               'Begin Reconciliation',
    awaiting_reconciliation:     'Confirm Reconciled',
    reconciled:                  'Complete Trip',
    waiting_at_depot:            'Resume Dispatch Workflow',
    waiting_to_offload:          'Begin Offloading',
  }

  // Special handling for offloaded: depends on multi-destination
  if (current === 'offloaded') {
    return options?.hasMoreStops ? 'Proceed to Next Stop' : 'Begin Return Journey'
  }

  if (current === 'return_journey') {
    return 'Confirm Arrived at Depot'
  }

  return actionMap[current] || `Advance to ${TRIP_STATUS_META[next]?.label || next}`
}

/** Get waiting reason description for waiting states */
export function getWaitingReason(current: string): string | null {
  if (current === 'waiting_at_depot') {
    return 'Loaded but waiting at depot — customer not ready or too late to travel'
  }
  if (current === 'waiting_to_offload') {
    return 'Arrived but waiting — offloading bay occupied or customer not ready'
  }
  return null
}

/** Build a structured timeline array for the UI stepper, grouped by phase */
export function getStatusTimeline(currentStatus: string) {
  const isCompleted = isTerminalStatus(currentStatus) && currentStatus === 'completed'
  const canonicalCurrent = canonicalTripStatus(currentStatus as TripStatusValue)
  const currentIdx = ALL_TRIP_STATUSES.indexOf(
    canonicalCurrent as (typeof ALL_TRIP_STATUSES)[number],
  )

  return Object.entries(TRIP_PHASES).map(([phaseKey, phase]) => ({
    phase: phaseKey,
    phaseLabel: phase.label,
    phaseDescription: phase.description,
    phaseColor: phase.color,
    statuses: phase.statuses.map((s) => {
      const idx = ALL_TRIP_STATUSES.indexOf(s)
      const meta = TRIP_STATUS_META[s]
      return {
        status: s,
        label: meta?.label || s,
        description: meta?.description || '',
        icon: meta?.icon || '',
        color: meta?.color || '',
        isCompleted: isCompleted || (currentIdx >= 0 && idx < currentIdx),
        isActive: s === canonicalCurrent,
        isPending: idx > currentIdx,
      }
    }),
  }))
}
