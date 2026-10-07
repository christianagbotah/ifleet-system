import type { Prisma } from "@/generated/client"
import type {
  EvidenceAvailability,
  FuelAssessmentEvidence,
  FuelAnomalySubject,
  FuelBaselineObservation,
  FuelComparableCohorts,
  FuelEvidenceEvent,
} from "@/lib/domain/fuel-intelligence/types"

export const FUEL_EVENT_SELECT = {
  id: true,
  tripId: true,
  truckId: true,
  date: true,
  litersFilled: true,
  totalCost: true,
  costPerLiter: true,
  stationName: true,
  fuelType: true,
  receiptNumber: true,
  fuelLevelBefore: true,
  fuelLevelAfter: true,
  eventType: true,
  source: true,
  verificationStatus: true,
  latitude: true,
  longitude: true,
  paymentSource: true,
  reversalOfId: true,
  reversalOf: { select: { verificationStatus: true } },
} as const satisfies Prisma.FuelLogSelect

export const TRIP_CONTEXT_SELECT = {
  id: true,
  truckId: true,
  driverId: true,
  departureTime: true,
  arrivalTime: true,
  loadingLocation: true,
  destination: true,
  loadingCityId: true,
  loadingPointId: true,
  destinationCityId: true,
  destinationZoneId: true,
  loadingLat: true,
  loadingLng: true,
  destLat: true,
  destLng: true,
  totalMileage: true,
  TripReconciliation: {
    select: {
      distanceKm: true,
      fuelAddedLiters: true,
      consumedLiters: true,
      fuelCost: true,
      kmPerLiter: true,
      litersPer100Km: true,
      exceptionCount: true,
    },
  },
} as const satisfies Prisma.TripSelect

export const TRUCK_CONTEXT_SELECT = {
  id: true,
  make: true,
  model: true,
  year: true,
  fuelType: true,
  tankCapacity: true,
} as const satisfies Prisma.TruckSelect

export const ODOMETER_EVIDENCE_SELECT = {
  id: true,
  truckId: true,
  tripId: true,
  reading: true,
  recordedAt: true,
  readingType: true,
  source: true,
  verificationStatus: true,
} as const satisfies Prisma.OdometerReadingSelect

export const COMPARABLE_TRIP_SELECT = {
  id: true,
  truckId: true,
  driverId: true,
  destinationZoneId: true,
  destinationCityId: true,
  loadingPointId: true,
  departureTime: true,
  FuelLog: {
    where: { verificationStatus: "verified" },
    select: {
      litersFilled: true,
      totalCost: true,
      costPerLiter: true,
      stationName: true,
      fuelType: true,
      date: true,
      eventType: true,
    },
  },
  TripReconciliation: {
    select: {
      distanceKm: true,
      consumedLiters: true,
      fuelAddedLiters: true,
      fuelCost: true,
      kmPerLiter: true,
      litersPer100Km: true,
    },
  },
} as const satisfies Prisma.TripSelect

export function comparableHistoryBounds(subjectStart: Date, lookbackDays = 180): { gte: Date; lt: Date } {
  return {
    gte: new Date(subjectStart.getTime() - lookbackDays * 86_400_000),
    lt: subjectStart,
  }
}

type FuelEventRow = {
  id: string
  tripId: string
  truckId: string
  date: Date
  litersFilled: number
  totalCost: unknown
  costPerLiter: unknown | null
  stationName: string | null
  fuelType: string
  receiptNumber: string | null
  fuelLevelBefore: number | null
  fuelLevelAfter: number | null
  eventType: string
  source: string
  verificationStatus: string
  latitude: number | null
  longitude: number | null
  paymentSource: string | null
  reversalOfId: string | null
  reversalOf: { verificationStatus: string } | null
}

type TripContextRow = {
  id: string
  truckId: string
  driverId: string
  departureTime: Date
  arrivalTime: Date | null
  loadingLocation: string
  destination: string
  loadingCityId: string | null
  loadingPointId: string | null
  destinationCityId: string | null
  destinationZoneId: string | null
  loadingLat: number | null
  loadingLng: number | null
  destLat: number | null
  destLng: number | null
  totalMileage: number | null
  TripReconciliation: {
    distanceKm: number | null
    fuelAddedLiters: number
    consumedLiters: number | null
    fuelCost: unknown
    kmPerLiter: number | null
    litersPer100Km: number | null
    exceptionCount: number
  } | null
}

type TruckContextRow = {
  id: string
  make: string
  model: string
  year: number
  fuelType: string
  tankCapacity: number | null
}

type OdometerEvidenceRow = {
  id: string
  truckId: string
  tripId: string | null
  reading: number
  recordedAt: Date
  readingType: string
  source: string
  verificationStatus: string
}

type FuelEventQuery =
  | { tripId: string }
  | { truckId: string; startDate: Date; endDate: Date }

type OdometerQuery = FuelEventQuery

type ComparableQuery = {
  truckId: string
  routeKey: string | null
  startDate: Date
  endDate: Date
  excludeTripId: string | null
}

export type FuelAnomalyEvidenceDependencies = {
  loadFuelEvent(id: string): Promise<FuelEventRow | null>
  loadTripContext(id: string): Promise<TripContextRow | null>
  loadTruckContext(id: string): Promise<TruckContextRow | null>
  loadFuelEvents(query: FuelEventQuery): Promise<FuelEventRow[]>
  loadOdometerReadings(query: OdometerQuery): Promise<OdometerEvidenceRow[]>
  loadComparableObservations(query: ComparableQuery): Promise<FuelComparableCohorts>
  isInsideExpectedFuelingArea(input: {
    trip: TripContextRow | null
    latitude: number
    longitude: number
  }): Promise<boolean | null>
  loadPhysicalEfficiencyBounds?(truck: TruckContextRow): Promise<{ truckClass: string; minKmPerLiter: number; maxKmPerLiter: number } | null>
}

function numeric(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function availability(values: Array<unknown | null | undefined>): EvidenceAvailability {
  if (values.length === 0 || values.every((value) => value == null)) return "unavailable"
  if (values.every((value) => value != null)) return "known"
  return "partial"
}

function routeKey(trip: TripContextRow | null): string | null {
  if (!trip) return null
  if (trip.destinationZoneId) return `zone:${trip.destinationZoneId}`
  if (trip.destinationCityId) return `city:${trip.destinationCityId}`
  if (trip.loadingPointId) return `loading-point:${trip.loadingPointId}`
  return null
}

function eventWindow(events: FuelEventRow[], fallbackStart: Date, fallbackEnd: Date): { startDate: Date; endDate: Date } {
  if (events.length === 0) return { startDate: fallbackStart, endDate: fallbackEnd }
  const timestamps = events.map((event) => event.date.getTime()).filter(Number.isFinite)
  return {
    startDate: new Date(Math.min(fallbackStart.getTime(), ...timestamps)),
    endDate: new Date(Math.max(fallbackEnd.getTime(), ...timestamps)),
  }
}

async function mapFuelEvents(
  rows: FuelEventRow[],
  trip: TripContextRow | null,
  deps: FuelAnomalyEvidenceDependencies,
): Promise<FuelEvidenceEvent[]> {
  return Promise.all(rows.map(async (row) => {
    const hasGps = row.latitude != null && row.longitude != null
    const gpsRequiredByCapturePolicy = row.source === "driver_app" || row.source === "gps"
    const insideExpectedFuelingArea = hasGps
      ? await deps.isInsideExpectedFuelingArea({ trip, latitude: row.latitude!, longitude: row.longitude! })
      : null
    return {
      id: row.id,
      tripId: row.tripId,
      truckId: row.truckId,
      driverId: trip?.driverId ?? null,
      occurredAt: row.date,
      eventType: row.eventType as FuelEvidenceEvent["eventType"],
      verificationStatus: row.verificationStatus as FuelEvidenceEvent["verificationStatus"],
      source: row.source as FuelEvidenceEvent["source"],
      liters: row.litersFilled,
      totalCost: numeric(row.totalCost) ?? 0,
      costPerLiter: numeric(row.costPerLiter),
      stationName: row.stationName,
      fuelType: row.fuelType,
      receiptNumber: row.receiptNumber,
      fuelLevelBeforeLiters: row.fuelLevelBefore,
      fuelLevelAfterLiters: row.fuelLevelAfter,
      latitude: row.latitude,
      longitude: row.longitude,
      gpsRequiredByCapturePolicy,
      insideExpectedFuelingArea,
      paymentSource: row.paymentSource,
      reversalOfId: row.reversalOfId,
      reversalTargetWasVerified: row.reversalOf?.verificationStatus === "verified",
    }
  }))
}

function verifiedNetFuel(events: FuelEvidenceEvent[]): number | null {
  const verified = events.filter((event) => event.verificationStatus === "verified")
  if (verified.length === 0) return null
  return verified.reduce((sum, event) => {
    const sign = event.eventType === "reversal" ? -1 : 1
    return sum + sign * event.liters
  }, 0)
}

function tankEndpoints(events: FuelEvidenceEvent[]): { opening: number | null; closing: number | null } {
  const verified = events.filter((event) => event.verificationStatus === "verified")
  const opening = verified.find((event) => event.fuelLevelBeforeLiters != null)?.fuelLevelBeforeLiters ?? null
  const closing = [...verified].reverse().find((event) => event.fuelLevelAfterLiters != null)?.fuelLevelAfterLiters ?? null
  return { opening, closing }
}

async function defaultDependencies(): Promise<FuelAnomalyEvidenceDependencies> {
  const { db } = await import("@/lib/db")
  return {
    loadFuelEvent: (id) => db.fuelLog.findUnique({ where: { id }, select: FUEL_EVENT_SELECT }) as Promise<FuelEventRow | null>,
    loadTripContext: (id) => db.trip.findUnique({ where: { id }, select: TRIP_CONTEXT_SELECT }) as Promise<TripContextRow | null>,
    loadTruckContext: (id) => db.truck.findUnique({ where: { id }, select: TRUCK_CONTEXT_SELECT }) as Promise<TruckContextRow | null>,
    loadFuelEvents: (query) => db.fuelLog.findMany({
      where: "tripId" in query
        ? { tripId: query.tripId }
        : { truckId: query.truckId, date: { gte: query.startDate, lte: query.endDate } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: FUEL_EVENT_SELECT,
    }) as Promise<FuelEventRow[]>,
    loadOdometerReadings: (query) => db.odometerReading.findMany({
      where: "tripId" in query
        ? { tripId: query.tripId, verificationStatus: "verified" }
        : { truckId: query.truckId, recordedAt: { gte: query.startDate, lte: query.endDate }, verificationStatus: "verified" },
      orderBy: { recordedAt: "asc" },
      select: ODOMETER_EVIDENCE_SELECT,
    }) as Promise<OdometerEvidenceRow[]>,
    loadComparableObservations: async ({ truckId, routeKey: targetRoute, startDate, excludeTripId }) => {
      const rows = await db.trip.findMany({
        where: {
          departureTime: comparableHistoryBounds(startDate),
          id: excludeTripId ? { not: excludeTripId } : undefined,
          TripReconciliation: { isNot: null },
        },
        orderBy: { departureTime: "desc" },
        take: 250,
        select: COMPARABLE_TRIP_SELECT,
      })
      const observations: FuelBaselineObservation[] = rows.flatMap((row) => {
        const reconciliation = row.TripReconciliation
        if (!reconciliation) return []
        const rk = row.destinationZoneId ? `zone:${row.destinationZoneId}` : row.destinationCityId ? `city:${row.destinationCityId}` : row.loadingPointId ? `loading-point:${row.loadingPointId}` : null
        const verifiedAdds = row.FuelLog.filter((event) => event.eventType !== "reversal" && event.eventType !== "tank_observation" && event.litersFilled > 0)
        const costs = verifiedAdds.map((event) => numeric(event.costPerLiter)).filter((value): value is number => value != null)
        const station = verifiedAdds.find((event) => event.stationName)?.stationName ?? null
        const fuelType = verifiedAdds.find((event) => event.fuelType)?.fuelType ?? null
        const fillFrequencyPer100Km = reconciliation.distanceKm != null && reconciliation.distanceKm > 0
          ? verifiedAdds.length / (reconciliation.distanceKm / 100)
          : null
        return [{
          id: row.id,
          truckId: row.truckId,
          routeKey: rk,
          driverId: row.driverId,
          stationName: station,
          fuelType,
          occurredAt: row.departureTime,
          distanceKm: reconciliation.distanceKm,
          consumedLiters: reconciliation.consumedLiters,
          fuelAddedLiters: reconciliation.fuelAddedLiters,
          fuelCost: numeric(reconciliation.fuelCost),
          costPerLiter: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
          kmPerLiter: reconciliation.kmPerLiter,
          litersPer100Km: reconciliation.litersPer100Km,
          fillFrequencyPer100Km,
        }]
      })
      return {
        truckRoute: observations.filter((row) => row.truckId === truckId && targetRoute != null && row.routeKey === targetRoute),
        truck: observations.filter((row) => row.truckId === truckId),
        route: targetRoute == null ? [] : observations.filter((row) => row.routeKey === targetRoute),
        fleet: observations,
      }
    },
    isInsideExpectedFuelingArea: async () => null,
  }
}

export async function loadFuelAnomalyEvidence(
  subject: FuelAnomalySubject,
  provided?: FuelAnomalyEvidenceDependencies,
): Promise<FuelAssessmentEvidence> {
  const deps = provided ?? await defaultDependencies()
  let seedFuel: FuelEventRow | null = null
  let trip: TripContextRow | null = null
  let truckId: string
  let fuelLogId: string | null = null
  let tripId: string | null = null
  let subjectType: FuelAssessmentEvidence["subjectType"]
  let subjectKey: string
  let eventQuery: FuelEventQuery
  let fallbackStart: Date
  let fallbackEnd: Date

  if (subject.fuelLogId !== undefined) {
    seedFuel = await deps.loadFuelEvent(subject.fuelLogId)
    if (!seedFuel) throw new Error("FUEL_ANOMALY_FUEL_EVENT_NOT_FOUND")
    fuelLogId = seedFuel.id
    tripId = seedFuel.tripId
    trip = await deps.loadTripContext(seedFuel.tripId)
    if (!trip) throw new Error("FUEL_ANOMALY_TRIP_NOT_FOUND")
    truckId = seedFuel.truckId
    subjectType = "fuel_event"
    subjectKey = seedFuel.id
    eventQuery = { tripId: seedFuel.tripId }
    fallbackStart = trip.departureTime
    fallbackEnd = trip.arrivalTime ?? seedFuel.date
  } else if (subject.tripId !== undefined) {
    trip = await deps.loadTripContext(subject.tripId)
    if (!trip) throw new Error("FUEL_ANOMALY_TRIP_NOT_FOUND")
    tripId = trip.id
    truckId = trip.truckId
    subjectType = "trip"
    subjectKey = trip.id
    eventQuery = { tripId: trip.id }
    fallbackStart = trip.departureTime
    fallbackEnd = trip.arrivalTime ?? new Date()
  } else {
    if (subject.endDate < subject.startDate) throw new Error("FUEL_ANOMALY_INVALID_WINDOW")
    truckId = subject.truckId
    subjectType = "truck_window"
    subjectKey = `${subject.truckId}:${subject.startDate.toISOString()}:${subject.endDate.toISOString()}`
    eventQuery = { truckId: subject.truckId, startDate: subject.startDate, endDate: subject.endDate }
    fallbackStart = subject.startDate
    fallbackEnd = subject.endDate
  }

  const truck = await deps.loadTruckContext(truckId)
  if (!truck) throw new Error("FUEL_ANOMALY_TRUCK_NOT_FOUND")
  const [eventRows, odometerRows] = await Promise.all([
    deps.loadFuelEvents(eventQuery),
    deps.loadOdometerReadings(eventQuery),
  ])
  const events = await mapFuelEvents(eventRows, trip, deps)
  const rk = routeKey(trip)
  const window = eventWindow(eventRows, fallbackStart, fallbackEnd)
  const comparableCohorts = await deps.loadComparableObservations({
    truckId,
    routeKey: rk,
    startDate: window.startDate,
    endDate: window.endDate,
    excludeTripId: trip?.id ?? null,
  })
  const physicalEvidence = deps.loadPhysicalEfficiencyBounds ? await deps.loadPhysicalEfficiencyBounds(truck) : null
  const physicalEfficiencyBounds = physicalEvidence ? { minKmPerLiter: physicalEvidence.minKmPerLiter, maxKmPerLiter: physicalEvidence.maxKmPerLiter } : null
  const reconciliation = trip?.TripReconciliation ?? null
  const verifiedOdometer = odometerRows.filter((row) => row.verificationStatus === "verified")
  const derivedDistance = verifiedOdometer.length >= 2
    ? Math.max(0, verifiedOdometer.at(-1)!.reading - verifiedOdometer[0]!.reading)
    : null
  const distanceKm = reconciliation?.distanceKm ?? derivedDistance
  const { opening, closing } = tankEndpoints(events)
  const gpsValues = events.map((event) => event.latitude != null && event.longitude != null ? true : null)
  const geofenceValues = events.map((event) => event.insideExpectedFuelingArea)
  const cohortCount = Math.max(comparableCohorts.truckRoute.length, comparableCohorts.truck.length, comparableCohorts.route.length, comparableCohorts.fleet.length)

  return {
    subject,
    subjectType,
    subjectKey,
    fuelLogId,
    tripId,
    truckId,
    driverId: trip?.driverId ?? null,
    routeKey: rk,
    truckClass: physicalEvidence?.truckClass ?? null,
    truckTankCapacityLiters: truck.tankCapacity,
    physicalEfficiencyBounds,
    distanceKm,
    reconciledConsumedLiters: reconciliation?.consumedLiters ?? null,
    reconciliationExceptionCount: reconciliation?.exceptionCount ?? 0,
    openingTankLiters: opening,
    closingTankLiters: closing,
    netFuelAddedLiters: verifiedNetFuel(events),
    fuelEvents: events,
    comparableCohorts,
    evidenceAvailability: {
      tankCapacity: truck.tankCapacity == null ? "unavailable" : "known",
      tankLevels: availability([opening, closing]),
      distance: distanceKm == null ? "unavailable" : "known",
      reconciliation: reconciliation == null ? "unavailable" : "known",
      gps: availability(gpsValues),
      routeGeofence: rk == null ? "unavailable" : availability(geofenceValues),
      physicalEfficiencyBounds: physicalEfficiencyBounds == null ? "unavailable" : "known",
      comparableHistory: cohortCount === 0 ? "unavailable" : cohortCount >= 12 ? "known" : "partial",
    },
  }
}
