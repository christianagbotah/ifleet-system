import type {
  ComplianceEvidenceState,
  DriverOperationalStatus,
  DriverVerificationState,
  TruckOperationalStatus,
} from "@/lib/ai/dispatch/types"
import type {
  DispatchDriverEvidence,
  DispatchTruckEvidence,
} from "@/lib/ai/dispatch/candidate-ranking"

export type DispatchEvidenceRequest = {
  departureTime: Date
  destinationZoneId?: string | null
  cargoUnit?: string | null
  quantity?: number | null
  excludeTripId?: string | null
}

type RawDriver = {
  id: string
  firstName: string
  lastName: string
  status: DriverOperationalStatus
  verificationStatus: DriverVerificationState
  licenseExpiry: Date
  rating: number
}

type RawTruck = {
  id: string
  plateNumber: string
  status: TruckOperationalStatus
  currentMileage: number
  nextServiceDate: Date | null
}

type RawTrip = {
  driverId: string | null
  truckId: string
  destinationZoneId: string | null
}

type RawMaintenance = {
  truckId: string
  status: string
  nextDueDate: Date | null
  nextDueMileage: number | null
}

type RawInsurance = {
  truckId: string
  status: string
  endDate: Date
}

type RawRoadworthy = {
  truckId: string
  result: string | null
  certificateIssued: boolean
  certificateExpiry: Date | null
}

type RawDvla = {
  truckId: string
  status: string
  expiryDate: Date | null
  grossVehicleWeight: number | null
  unladenWeight: number | null
}

type FindMany<T> = {
  findMany(args?: unknown): Promise<T[]>
}

export type DispatchEvidenceDatabase = {
  driver: FindMany<RawDriver>
  truck: FindMany<RawTruck>
  trip: FindMany<RawTrip>
  maintenanceRecord: FindMany<RawMaintenance>
  insurance: FindMany<RawInsurance>
  roadworthyInspection: FindMany<RawRoadworthy>
  dvlaRegistration: FindMany<RawDvla>
}

export type DispatchCandidateEvidenceResult = {
  drivers: DispatchDriverEvidence[]
  trucks: DispatchTruckEvidence[]
}

const ACTIVE_TRIP_STATUSES = [
  "scheduled",
  "loading",
  "loaded",
  "departed_depot",
  "in_transit",
  "arrived_destination",
  "offloading",
  "offloaded",
  "return_journey",
  "arrived_depot",
  "delayed",
] as const

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function countById(rows: RawTrip[], key: "driverId" | "truckId"): Map<string, number> {
  const result = new Map<string, number>()
  for (const row of rows) {
    const id = row[key]
    if (!id) continue
    result.set(id, (result.get(id) ?? 0) + 1)
  }
  return result
}

function firstByTruck<T extends { truckId: string }>(rows: T[]): Map<string, T> {
  const result = new Map<string, T>()
  for (const row of rows) {
    if (!result.has(row.truckId)) result.set(row.truckId, row)
  }
  return result
}

function insuranceState(row: RawInsurance | undefined, departure: Date): ComplianceEvidenceState {
  if (!row) return "missing"
  if (row.status === "active" && row.endDate.getTime() > departure.getTime()) return "valid"
  if (row.status === "expired" || row.status === "cancelled" || row.endDate.getTime() <= departure.getTime()) return "expired"
  return "unknown"
}

function roadworthyState(row: RawRoadworthy | undefined, departure: Date): ComplianceEvidenceState {
  if (!row) return "missing"
  const result = row.result?.trim().toLowerCase() ?? ""
  if (result === "fail" || result === "failed") return "failed"
  if (row.certificateExpiry && row.certificateExpiry.getTime() <= departure.getTime()) return "expired"
  if (
    row.certificateIssued
    && row.certificateExpiry
    && row.certificateExpiry.getTime() > departure.getTime()
    && (result === "pass" || result === "conditional_pass" || result === "conditional pass")
  ) return "valid"
  return "unknown"
}

function dvlaState(row: RawDvla | undefined, departure: Date): ComplianceEvidenceState {
  if (!row) return "missing"
  if (row.status === "active" && row.expiryDate && row.expiryDate.getTime() > departure.getTime()) return "valid"
  if (
    row.status === "expired"
    || row.status === "cancelled"
    || row.status === "suspended"
    || (row.expiryDate != null && row.expiryDate.getTime() <= departure.getTime())
  ) return "expired"
  return "unknown"
}

function capacityEvidence(
  row: RawDvla | undefined,
  cargoUnit: string | null | undefined,
  quantity: number | null | undefined,
): { sufficient: boolean | null; score: number | null } {
  const normalizedUnit = cargoUnit?.trim().toLowerCase()
  const tonneUnits = new Set(["t", "ton", "tons", "tonne", "tonnes"])
  if (!normalizedUnit || !tonneUnits.has(normalizedUnit)) return { sufficient: null, score: null }
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) return { sufficient: null, score: null }
  if (
    !row
    || typeof row.grossVehicleWeight !== "number"
    || typeof row.unladenWeight !== "number"
    || row.grossVehicleWeight <= row.unladenWeight
  ) return { sufficient: null, score: null }

  const payloadTonnes = (row.grossVehicleWeight - row.unladenWeight) / 1000
  if (!Number.isFinite(payloadTonnes) || payloadTonnes <= 0) return { sufficient: null, score: null }

  return {
    sufficient: payloadTonnes >= quantity,
    score: round(clamp((payloadTonnes / quantity) * 100)),
  }
}

function maintenanceEvidence(
  truck: RawTruck,
  rows: RawMaintenance[],
  departure: Date,
): { blocking: boolean; readiness: number | null } {
  const relevant = rows.filter((row) => row.truckId === truck.id)
  const blocking = relevant.some((row) =>
    row.status === "in_progress"
    || (row.nextDueDate != null && row.nextDueDate.getTime() <= departure.getTime())
    || (row.nextDueMileage != null && row.nextDueMileage <= truck.currentMileage)
  ) || (truck.nextServiceDate != null && truck.nextServiceDate.getTime() <= departure.getTime())

  if (blocking) return { blocking: true, readiness: 0 }
  if (relevant.length > 0 || truck.nextServiceDate != null) return { blocking: false, readiness: 100 }
  return { blocking: false, readiness: null }
}

export async function loadDispatchCandidateEvidence(
  request: DispatchEvidenceRequest,
  database?: DispatchEvidenceDatabase,
): Promise<DispatchCandidateEvidenceResult> {
  let source = database
  if (!source) {
    const { db } = await import("@/lib/db")
    source = db as unknown as DispatchEvidenceDatabase
  }

  const activeTripWhere: Record<string, unknown> = {
    status: { in: [...ACTIVE_TRIP_STATUSES] },
  }
  if (request.excludeTripId) activeTripWhere.id = { not: request.excludeTripId }

  const [
    drivers,
    trucks,
    activeTrips,
    completedRouteTrips,
    maintenanceRows,
    insuranceRows,
    roadworthyRows,
    dvlaRows,
  ] = await Promise.all([
    source.driver.findMany({
      where: { status: "active" },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        verificationStatus: true,
        licenseExpiry: true,
        rating: true,
      },
    }),
    source.truck.findMany({
      where: { status: { in: ["active", "maintenance", "out_of_service"] } },
      select: {
        id: true,
        plateNumber: true,
        status: true,
        currentMileage: true,
        nextServiceDate: true,
      },
    }),
    source.trip.findMany({
      where: activeTripWhere,
      select: { driverId: true, truckId: true, destinationZoneId: true },
    }),
    request.destinationZoneId
      ? source.trip.findMany({
        where: { status: "completed", destinationZoneId: request.destinationZoneId },
        select: { driverId: true, truckId: true, destinationZoneId: true },
      })
      : Promise.resolve([]),
    source.maintenanceRecord.findMany({
      where: { status: { in: ["pending", "scheduled", "in_progress"] } },
      select: { truckId: true, status: true, nextDueDate: true, nextDueMileage: true },
    }),
    source.insurance.findMany({
      orderBy: { createdAt: "desc" },
      select: { truckId: true, status: true, endDate: true },
    }),
    source.roadworthyInspection.findMany({
      orderBy: { inspectionDate: "desc" },
      select: { truckId: true, result: true, certificateIssued: true, certificateExpiry: true },
    }),
    source.dvlaRegistration.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        truckId: true,
        status: true,
        expiryDate: true,
        grossVehicleWeight: true,
        unladenWeight: true,
      },
    }),
  ])

  const activeDriverTrips = countById(activeTrips, "driverId")
  const activeTruckTrips = countById(activeTrips, "truckId")
  const completedDriverRouteTrips = countById(completedRouteTrips, "driverId")
  const insuranceByTruck = firstByTruck(insuranceRows)
  const roadworthyByTruck = firstByTruck(roadworthyRows)
  const dvlaByTruck = firstByTruck(dvlaRows)

  const normalizedDrivers: DispatchDriverEvidence[] = drivers.map((driver) => ({
    id: driver.id,
    name: `${driver.firstName} ${driver.lastName}`.trim(),
    status: driver.status,
    verificationStatus: driver.verificationStatus,
    licenseExpiry: driver.licenseExpiry,
    hasConflictingTrip: (activeDriverTrips.get(driver.id) ?? 0) > 0,
    currentWorkload: activeDriverTrips.get(driver.id) ?? 0,
    routeExperienceScore: request.destinationZoneId
      ? clamp((completedDriverRouteTrips.get(driver.id) ?? 0) * 10)
      : null,
    historicalPerformanceScore: Number.isFinite(driver.rating)
      ? round(clamp((driver.rating / 5) * 100))
      : null,
    locationFitScore: null,
  }))

  const normalizedTrucks: DispatchTruckEvidence[] = trucks.map((truck) => {
    const dvla = dvlaByTruck.get(truck.id)
    const capacity = capacityEvidence(dvla, request.cargoUnit, request.quantity)
    const maintenance = maintenanceEvidence(truck, maintenanceRows, request.departureTime)

    return {
      id: truck.id,
      plateNumber: truck.plateNumber,
      status: truck.status,
      hasConflictingTrip: (activeTruckTrips.get(truck.id) ?? 0) > 0,
      maintenanceBlocking: maintenance.blocking,
      capacitySufficient: capacity.sufficient,
      compliance: {
        insurance: insuranceState(insuranceByTruck.get(truck.id), request.departureTime),
        roadworthy: roadworthyState(roadworthyByTruck.get(truck.id), request.departureTime),
        dvla: dvlaState(dvla, request.departureTime),
      },
      fuelEfficiencyScore: null,
      maintenanceReadinessScore: maintenance.readiness,
      locationFitScore: null,
      capacityFitScore: capacity.score,
    }
  })

  return { drivers: normalizedDrivers, trucks: normalizedTrucks }
}
