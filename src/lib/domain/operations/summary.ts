type DateLike = Date | string | null | undefined

type TruckInput = { id: string; status: string }
type TripInput = { id: string; status: string; departureTime?: DateLike; quantity?: number | null; unit?: string | null }
type ProofOfDeliveryInput = { id: string; tripId: string }
type LoadOrderInput = { id: string; status: string; pickupWindowEnd?: DateLike }
type QueueInput = { id: string; status: string; joinedAt: DateLike; completedAt?: DateLike; detentionFreeMinutes?: number | null; detentionMinutes?: number | null }
type AlertInput = { id: string; isRead?: boolean | null }
type ExceptionInput = { id: string; status: string }

export interface OperationsSummaryInput {
  now?: Date
  trucks?: TruckInput[]
  trips?: TripInput[]
  proofOfDeliveries?: ProofOfDeliveryInput[]
  loadOrders?: LoadOrderInput[]
  queues?: QueueInput[]
  trackingAlerts?: AlertInput[]
  deliveryExceptions?: ExceptionInput[]
  reconciliationExceptions?: ExceptionInput[]
}

export interface OperationsSummary {
  activeTrucks: number
  inactiveTrucks: number
  maintenanceTrucks: number
  outOfServiceTrucks: number
  activeTrips: number
  tripsByStage: Record<string, number>
  overdueLoads: number
  todaysTrips: number
  todaysTonnage: number
  outstandingPod: number
  awaitingReconciliation: number
  activeQueue: number
  detentionCases: number
  maxDetentionMinutes: number
  unreadTrackingAlerts: number
  deliveryExceptions: number
  reconciliationBlockers: number
}

const TERMINAL_TRIPS = new Set(['completed', 'cancelled'])
const OPEN_LOAD_STATUSES = new Set(['open', 'partially_allocated'])
const ACTIVE_QUEUE_STATUSES = new Set(['waiting', 'in_progress', 'loading', 'unloading'])
const CLOSED_EXCEPTION_STATUSES = new Set(['resolved', 'closed', 'cancelled'])

function time(value: DateLike): number | null {
  if (!value) return null
  const parsed = value instanceof Date ? value : new Date(value)
  const milliseconds = parsed.getTime()
  return Number.isFinite(milliseconds) ? milliseconds : null
}

function queueDetentionMinutes(queue: QueueInput, nowMs: number): number {
  if (queue.detentionMinutes != null && Number.isFinite(queue.detentionMinutes)) return Math.max(0, Math.round(queue.detentionMinutes))
  const start = time(queue.joinedAt)
  if (start == null) return 0
  const end = time(queue.completedAt) ?? nowMs
  const elapsed = Math.max(0, Math.floor((end - start) / 60000))
  return Math.max(0, elapsed - Math.max(0, queue.detentionFreeMinutes ?? 0))
}

export function summarizeOperations(input: OperationsSummaryInput): OperationsSummary {
  const nowMs = (input.now ?? new Date()).getTime()
  const activeTrips = (input.trips ?? []).filter((trip) => !TERMINAL_TRIPS.has(trip.status))
  const tripsByStage = activeTrips.reduce<Record<string, number>>((result, trip) => {
    result[trip.status] = (result[trip.status] ?? 0) + 1
    return result
  }, {})

  const overdueLoads = (input.loadOrders ?? []).filter((order) => {
    if (!OPEN_LOAD_STATUSES.has(order.status)) return false
    const deadline = time(order.pickupWindowEnd)
    return deadline != null && deadline < nowMs
  }).length

  const trucks = input.trucks ?? []
  const trips = input.trips ?? []
  const startOfDay = Date.UTC(
    (input.now ?? new Date()).getUTCFullYear(),
    (input.now ?? new Date()).getUTCMonth(),
    (input.now ?? new Date()).getUTCDate(),
  )
  const endOfDay = startOfDay + 24 * 60 * 60 * 1000
  const todaysTrips = trips.filter((trip) => {
    const departedAt = time(trip.departureTime)
    return departedAt != null && departedAt >= startOfDay && departedAt < endOfDay
  })
  const tonneUnits = new Set(['t', 'tonne', 'tonnes', 'metric tonne', 'metric tonnes'])
  const todaysTonnage = todaysTrips.reduce((total, trip) => {
    const unit = trip.unit?.trim().toLowerCase() ?? ''
    if (!tonneUnits.has(unit)) return total
    return total + (Number.isFinite(trip.quantity) ? Number(trip.quantity) : 0)
  }, 0)
  const tripsWithPod = new Set((input.proofOfDeliveries ?? []).map((pod) => pod.tripId))

  const queues = input.queues ?? []
  const activeQueue = queues.filter((queue) => ACTIVE_QUEUE_STATUSES.has(queue.status)).length
  const detentionValues = queues.map((queue) => queueDetentionMinutes(queue, nowMs))

  return {
    activeTrucks: trucks.filter((truck) => truck.status === 'active').length,
    inactiveTrucks: trucks.filter((truck) => truck.status === 'inactive').length,
    maintenanceTrucks: trucks.filter((truck) => truck.status === 'maintenance').length,
    outOfServiceTrucks: trucks.filter((truck) => truck.status === 'out_of_service').length,
    activeTrips: activeTrips.length,
    tripsByStage,
    overdueLoads,
    todaysTrips: todaysTrips.length,
    todaysTonnage: Math.round(todaysTonnage * 1000) / 1000,
    outstandingPod: trips.filter((trip) => trip.status === 'delivered' && !tripsWithPod.has(trip.id)).length,
    awaitingReconciliation: trips.filter((trip) => trip.status === 'awaiting_reconciliation').length,
    activeQueue,
    detentionCases: detentionValues.filter((minutes) => minutes > 0).length,
    maxDetentionMinutes: detentionValues.length ? Math.max(...detentionValues) : 0,
    unreadTrackingAlerts: (input.trackingAlerts ?? []).filter((alert) => alert.isRead !== true).length,
    deliveryExceptions: (input.deliveryExceptions ?? []).filter((exception) => !CLOSED_EXCEPTION_STATUSES.has(exception.status)).length,
    reconciliationBlockers: (input.reconciliationExceptions ?? []).filter((exception) => !CLOSED_EXCEPTION_STATUSES.has(exception.status)).length,
  }
}
