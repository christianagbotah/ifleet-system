function minutesBetween(start: Date, end: Date): number {
  return Math.max(0, (end.getTime() - start.getTime()) / 60_000)
}

export interface MaintenanceFeatureEvent {
  occurredAt: Date
  kind: string
  severity: number
}

export function buildMaintenanceFeatures(input: {
  asOf: Date
  events: MaintenanceFeatureEvent[]
}) {
  const events = input.events.filter((event) => event.occurredAt.getTime() <= input.asOf.getTime())
  return {
    eventCount: events.length,
    breakdownCount: events.filter((event) => event.kind === 'breakdown').length,
    maxSeverity: events.length === 0 ? 0 : Math.max(...events.map((event) => event.severity)),
  }
}

export interface QueueVisitFeatureInput {
  arrivedAt: Date
  completedAt: Date | null
}

export function buildQueueFeatures(input: {
  asOf: Date
  visits: QueueVisitFeatureInput[]
  currentArrivalAt?: Date | null
}) {
  const completed = input.visits.filter((visit) => (
    visit.arrivedAt.getTime() <= input.asOf.getTime()
    && visit.completedAt != null
    && visit.completedAt.getTime() <= input.asOf.getTime()
  ))
  const waits = completed.map((visit) => minutesBetween(visit.arrivedAt, visit.completedAt!))
  return {
    completedVisitCount: completed.length,
    averageWaitMinutes: waits.length === 0 ? null : waits.reduce((sum, value) => sum + value, 0) / waits.length,
    currentElapsedWaitMinutes: input.currentArrivalAt && input.currentArrivalAt.getTime() <= input.asOf.getTime()
      ? minutesBetween(input.currentArrivalAt, input.asOf)
      : null,
  }
}

export interface LateDeliveryTripFeatureInput {
  promisedAt: Date
  arrivedAt: Date | null
  routeClass: string
}

export function buildLateDeliveryFeatures(input: {
  asOf: Date
  trips: LateDeliveryTripFeatureInput[]
  routeClass: string
  globalPriorLateRate?: number
}) {
  const routeTrips = input.trips.filter((trip) => (
    trip.routeClass === input.routeClass
    && trip.arrivedAt != null
    && trip.arrivedAt.getTime() <= input.asOf.getTime()
  ))

  if (routeTrips.length === 0) {
    const prior = input.globalPriorLateRate ?? 0
    return {
      completedTripCount: 0,
      lateTripRate: prior,
      source: 'global_prior' as const,
    }
  }

  const lateCount = routeTrips.filter((trip) => trip.arrivedAt!.getTime() > trip.promisedAt.getTime()).length
  return {
    completedTripCount: routeTrips.length,
    lateTripRate: lateCount / routeTrips.length,
    source: 'route_history' as const,
  }
}
