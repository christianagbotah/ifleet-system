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

// Ordered non-terminal statuses representing the trip lifecycle
export const ALL_TRIP_STATUSES = [
  'scheduled',
  'loading',
  'loaded',
  'waiting_at_depot',
  'departed_depot',
  'in_transit',
  'arrived_destination',
  'waiting_to_offload',
  'offloading',
  'offloaded',
  'return_journey',
  'arrived_depot',
] as const

export type TripStatus = (typeof ALL_TRIP_STATUSES)[number] | 'completed' | 'cancelled'

// ── Valid state transitions (explicit state machine) ──
export const TRANSITIONS: Record<string, TripStatus[]> = {
  scheduled:          ['loading', 'cancelled'],
  loading:            ['loaded', 'cancelled'],
  loaded:             ['waiting_at_depot', 'departed_depot', 'cancelled'],
  waiting_at_depot:   ['departed_depot', 'cancelled'],
  departed_depot:     ['in_transit', 'cancelled'],
  in_transit:         ['arrived_destination', 'cancelled'],
  arrived_destination:['waiting_to_offload', 'offloading', 'offloaded', 'cancelled'],
  waiting_to_offload: ['offloading', 'cancelled'],
  offloading:         ['offloaded'],
  offloaded:          ['in_transit', 'return_journey', 'cancelled'],
  return_journey:     ['arrived_depot', 'cancelled'],
  arrived_depot:      ['completed'],
  completed:          [],
  cancelled:          [],
}

// Metadata for each status — used in UI rendering
export const TRIP_STATUS_META: Record<string, { label: string; description: string; color: string; icon: string }> = {
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
  const allowed = TRANSITIONS[from]
  return allowed ? allowed.includes(to as TripStatus) : false
}

/** Get the default "next" status for simple sequential advancement */
export function getNextStatus(current: string): string | null {
  const idx = ALL_TRIP_STATUSES.indexOf(current as (typeof ALL_TRIP_STATUSES)[number])
  if (idx === -1 || idx >= ALL_TRIP_STATUSES.length - 1) return null
  return ALL_TRIP_STATUSES[idx + 1]
}

/** Get all allowed next statuses for the current status */
export function getAllowedTransitions(current: string): TripStatus[] {
  return TRANSITIONS[current] || []
}

/** Progress percentage 0-100 based on lifecycle position */
export function getTripProgress(status: string): number {
  const idx = ALL_TRIP_STATUSES.indexOf(status as (typeof ALL_TRIP_STATUSES)[number])
  if (idx === -1) {
    if (status === 'completed') return 100
    if (status === 'cancelled') return 0
    return 0
  }
  return Math.round(((idx + 1) / ALL_TRIP_STATUSES.length) * 100)
}

/** Check if the status is terminal (no further transitions) */
export function isTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'cancelled'
}

/** Check if trip is in a waiting/standby state */
export function isWaitingStatus(status: string): boolean {
  return status === 'waiting_at_depot' || status === 'waiting_to_offload'
}

/** Check if truck is actively on the road */
export function isActiveRoadStatus(status: string): boolean {
  return ['in_transit', 'departed_depot', 'return_journey'].includes(status)
}

/** Check if trip is at a delivery point (arrived, waiting to offload, offloading, or offloaded) */
export function isAtDeliveryStatus(status: string): boolean {
  return ['arrived_destination', 'waiting_to_offload', 'offloading', 'offloaded'].includes(status)
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
    label: 'Pre-Departure',
    description: 'Planning, loading & dispatch',
    color: '#38bdf8',
    bgClass: 'bg-sky-50 dark:bg-sky-900/20',
    textClass: 'text-sky-700 dark:text-sky-400',
    borderClass: 'border-sky-200 dark:border-sky-800',
    statuses: ['scheduled', 'loading', 'loaded', 'waiting_at_depot', 'departed_depot'] as const,
  },
  transit: {
    label: 'On the Road',
    description: 'Truck is in transit',
    color: '#10b981',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    statuses: ['in_transit'] as const,
  },
  delivery: {
    label: 'Delivery',
    description: 'Arrived, offloading & verification',
    color: '#8b5cf6',
    bgClass: 'bg-violet-50 dark:bg-violet-900/20',
    textClass: 'text-violet-700 dark:text-violet-400',
    borderClass: 'border-violet-200 dark:border-violet-800',
    statuses: ['arrived_destination', 'waiting_to_offload', 'offloading', 'offloaded'] as const,
  },
  return: {
    label: 'Return',
    description: 'Heading back & closing out',
    color: '#f43f5e',
    bgClass: 'bg-rose-50 dark:bg-rose-900/20',
    textClass: 'text-rose-700 dark:text-rose-400',
    borderClass: 'border-rose-200 dark:border-rose-800',
    statuses: ['return_journey', 'arrived_depot'] as const,
  },
} as const

export type TripPhaseKey = keyof typeof TRIP_PHASES

/** Get which phase a status belongs to */
export function getTripPhase(status: string): TripPhaseKey {
  for (const [key, phase] of Object.entries(TRIP_PHASES)) {
    if (phase.statuses.includes(status as (typeof phase.statuses)[number])) {
      return key as TripPhaseKey
    }
  }
  return 'pre_departure'
}

/** Check if the truck is currently at a delivery destination */
export function isAtDestination(status: string): boolean {
  return ['arrived_destination', 'waiting_to_offload', 'offloading', 'offloaded'].includes(status)
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
    scheduled:          'Begin Loading',
    loading:            'Confirm Loaded',
    loaded:             'Depart for Delivery',
    waiting_at_depot:   'Depart Depot Now',
    departed_depot:     'Start Journey',
    in_transit:         'Arrived at Destination',
    arrived_destination:'Begin Offloading',
    waiting_to_offload: 'Begin Offloading',
    offloading:         'Confirm Offload Complete',
    arrived_depot:      'Complete Trip',
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
  const currentIdx = ALL_TRIP_STATUSES.indexOf(
    currentStatus as (typeof ALL_TRIP_STATUSES)[number],
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
        isActive: s === currentStatus,
        isPending: idx > currentIdx,
      }
    }),
  }))
}
