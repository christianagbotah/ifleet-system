import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import {
  rankEligibleDispatchCandidates,
  type DispatchDriverEvidence,
  type DispatchTruckEvidence,
} from "@/lib/ai/dispatch/candidate-ranking"
import { DISPATCH_RULESET_VERSION, type DispatchPairScore } from "@/lib/ai/dispatch/scoring"
import type { ComplianceEvidenceState } from "@/lib/ai/dispatch/types"

export const DISPATCH_DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  verificationStatus: true,
  licenseExpiry: true,
  rating: true,
  totalTrips: true,
} as const

export const DISPATCH_TRUCK_SELECT = {
  id: true,
  plateNumber: true,
  status: true,
  insuranceStatus: true,
  currentMileage: true,
} as const

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

export type DispatchActor = {
  userId: string
  role: string
}

export type DispatchTripDraft = {
  departureTime: Date | string
  destinationZoneId?: string | null
  quantity?: number | null
  cargoUnit?: string | null
}

export type DispatchRequest =
  | { tripId: string; tripDraft?: never }
  | { tripDraft: DispatchTripDraft; tripId?: never }

export type DispatchRecommendationCreate = {
  tripId: string | null
  requestedBy: string
  requestedAt: Date
  rulesetVersion: string
  provider?: string | null
  model?: string | null
  inputHash: string
  inputSnapshot: string
  rankedOutput: string
  confidence: number
  dataQuality: number
  status: string
}

export type DispatchRecommendationRecord = DispatchRecommendationCreate & {
  id: string
  decision?: string | null
  decisionBy?: string | null
  decisionAt?: Date | null
  decisionReason?: string | null
  selectedDriverId?: string | null
  selectedTruckId?: string | null
}

export type DispatchDecision = {
  decision: "accepted" | "rejected"
  selectedDriverId?: string
  selectedTruckId?: string
  reason?: string
}

export type DispatchDecisionRecord = {
  decision: "accepted" | "rejected"
  decisionBy: string
  decisionAt: Date
  decisionReason: string | null
  selectedDriverId: string | null
  selectedTruckId: string | null
  status: string
}

export type DispatchCopilotDependencies = {
  candidateSource: {
    loadDrivers(input: { departureTime: Date; destinationZoneId?: string | null }): Promise<DispatchDriverEvidence[]>
    loadTrucks(input: { departureTime: Date; destinationZoneId?: string | null; quantity?: number | null; cargoUnit?: string | null }): Promise<DispatchTruckEvidence[]>
  }
  recommendationStore: {
    create(data: DispatchRecommendationCreate): Promise<DispatchRecommendationRecord>
    findById(id: string): Promise<DispatchRecommendationRecord | null>
    recordDecision(id: string, data: DispatchDecisionRecord): Promise<DispatchRecommendationRecord>
  }
  availability: {
    isPairAvailable(driverId: string, truckId: string, departureTime: Date): Promise<boolean>
  }
  tripSource?: {
    resolveTrip(id: string): Promise<DispatchTripDraft | null>
  }
  now(): Date
}

export type DispatchRecommendationResult = {
  recommendationId: string
  ranked: DispatchPairScore[]
  blockedDrivers: ReturnType<typeof rankEligibleDispatchCandidates>["blockedDrivers"]
  blockedTrucks: ReturnType<typeof rankEligibleDispatchCandidates>["blockedTrucks"]
  confidence: number
  dataQuality: number
}

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid dispatch departure time")
  return date
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function complianceFromStatus(status: string | null | undefined, expiresAt: Date | null | undefined, departure: Date): ComplianceEvidenceState {
  if (!status) return "missing"
  if (expiresAt && expiresAt.getTime() <= departure.getTime()) return "expired"
  if (["expired", "cancelled", "suspended", "failed"].includes(status)) return "expired"
  if (["active", "completed", "pass", "conditional_pass"].includes(status)) return "valid"
  return "unknown"
}

function stableCandidates<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id))
}

async function loadDefaultDrivers(input: { departureTime: Date }): Promise<DispatchDriverEvidence[]> {
  const [rows, activeTrips] = await Promise.all([
    db.driver.findMany({ where: { status: "active" }, select: DISPATCH_DRIVER_SELECT }),
    db.trip.findMany({
      where: { status: { in: [...ACTIVE_TRIP_STATUSES] } },
      select: { driverId: true },
    }),
  ])

  const workload = new Map<string, number>()
  for (const trip of activeTrips) workload.set(trip.driverId, (workload.get(trip.driverId) ?? 0) + 1)

  return stableCandidates(rows.map((row) => ({
    id: row.id,
    name: `${row.firstName} ${row.lastName}`.trim(),
    status: row.status,
    verificationStatus: row.verificationStatus,
    licenseExpiry: row.licenseExpiry,
    hasConflictingTrip: (workload.get(row.id) ?? 0) > 0,
    currentWorkload: workload.get(row.id) ?? 0,
    routeExperienceScore: null,
    historicalPerformanceScore: Number.isFinite(row.rating) ? Math.max(0, Math.min(100, row.rating * 20)) : null,
    locationFitScore: null,
  })))
}

async function loadDefaultTrucks(input: { departureTime: Date }): Promise<DispatchTruckEvidence[]> {
  const rows = await db.truck.findMany({ where: { status: "active" }, select: DISPATCH_TRUCK_SELECT })
  const ids = rows.map((row) => row.id)
  if (ids.length === 0) return []

  const [activeTrips, insuranceRows, roadworthyRows, dvlaRows, maintenanceRows] = await Promise.all([
    db.trip.findMany({
      where: { status: { in: [...ACTIVE_TRIP_STATUSES] }, truckId: { in: ids } },
      select: { truckId: true },
    }),
    db.insurance.findMany({
      where: { truckId: { in: ids } },
      orderBy: { startDate: "desc" },
      select: { truckId: true, status: true, endDate: true },
    }),
    db.roadworthyInspection.findMany({
      where: { truckId: { in: ids } },
      orderBy: { inspectionDate: "desc" },
      select: { truckId: true, status: true, result: true, certificateExpiry: true },
    }),
    db.dvlaRegistration.findMany({
      where: { truckId: { in: ids } },
      orderBy: { registrationDate: "desc" },
      select: { truckId: true, status: true, expiryDate: true },
    }),
    db.maintenanceRecord.findMany({
      where: { truckId: { in: ids }, status: { in: ["scheduled", "in_progress"] } },
      select: { truckId: true },
    }),
  ])

  const conflictIds = new Set(activeTrips.map((row) => row.truckId))
  const maintenanceIds = new Set(maintenanceRows.map((row) => row.truckId))
  const firstByTruck = <T extends { truckId: string }>(records: T[]) => {
    const map = new Map<string, T>()
    for (const row of records) if (!map.has(row.truckId)) map.set(row.truckId, row)
    return map
  }
  const insurance = firstByTruck(insuranceRows)
  const roadworthy = firstByTruck(roadworthyRows)
  const dvla = firstByTruck(dvlaRows)

  return stableCandidates(rows.map((row) => {
    const insuranceRow = insurance.get(row.id)
    const roadworthyRow = roadworthy.get(row.id)
    const dvlaRow = dvla.get(row.id)

    return {
      id: row.id,
      plateNumber: row.plateNumber,
      status: row.status,
      hasConflictingTrip: conflictIds.has(row.id),
      maintenanceBlocking: maintenanceIds.has(row.id),
      compliance: {
        insurance: complianceFromStatus(insuranceRow?.status ?? row.insuranceStatus, insuranceRow?.endDate, input.departureTime),
        roadworthy: complianceFromStatus(roadworthyRow?.result ?? roadworthyRow?.status, roadworthyRow?.certificateExpiry, input.departureTime),
        dvla: complianceFromStatus(dvlaRow?.status, dvlaRow?.expiryDate, input.departureTime),
      },
      fuelEfficiencyScore: null,
      maintenanceReadinessScore: maintenanceIds.has(row.id) ? 0 : 100,
      locationFitScore: null,
      capacityFitScore: null,
    }
  }))
}

type RuntimeDispatchDatabase = {
  dispatchRecommendation: {
    create(args: { data: DispatchRecommendationCreate }): Promise<DispatchRecommendationRecord>
    findUnique(args: { where: { id: string } }): Promise<DispatchRecommendationRecord | null>
    update(args: { where: { id: string }; data: DispatchDecisionRecord }): Promise<DispatchRecommendationRecord>
  }
}

const dispatchDb = db as unknown as RuntimeDispatchDatabase

const defaultDependencies: DispatchCopilotDependencies = {
  candidateSource: {
    loadDrivers: loadDefaultDrivers,
    loadTrucks: loadDefaultTrucks,
  },
  recommendationStore: {
    create: (data) => dispatchDb.dispatchRecommendation.create({ data }),
    findById: (id) => dispatchDb.dispatchRecommendation.findUnique({ where: { id } }),
    recordDecision: (id, data) => dispatchDb.dispatchRecommendation.update({ where: { id }, data }),
  },
  availability: {
    async isPairAvailable(driverId, truckId, departureTime) {
      const [driver, truck, conflictCount] = await Promise.all([
        db.driver.findUnique({
          where: { id: driverId },
          select: { status: true, verificationStatus: true, licenseExpiry: true },
        }),
        db.truck.findUnique({ where: { id: truckId }, select: { status: true } }),
        db.trip.count({
          where: {
            status: { in: [...ACTIVE_TRIP_STATUSES] },
            OR: [{ driverId }, { truckId }],
          },
        }),
      ])

      return Boolean(
        driver
        && truck
        && driver.status === "active"
        && driver.verificationStatus === "verified"
        && driver.licenseExpiry.getTime() > departureTime.getTime()
        && truck.status === "active"
        && conflictCount === 0
      )
    },
  },
  tripSource: {
    async resolveTrip(id) {
      const trip = await db.trip.findUnique({
        where: { id },
        select: { departureTime: true, destinationZoneId: true, quantity: true, unit: true },
      })
      if (!trip) return null
      return {
        departureTime: trip.departureTime,
        destinationZoneId: trip.destinationZoneId,
        quantity: trip.quantity,
        cargoUnit: trip.unit,
      }
    },
  },
  now: () => new Date(),
}

async function resolveDraft(input: DispatchRequest, deps: DispatchCopilotDependencies): Promise<{ tripId: string | null; draft: DispatchTripDraft }> {
  if ("tripDraft" in input && input.tripDraft) return { tripId: null, draft: input.tripDraft }
  if (!("tripId" in input) || !input.tripId) throw new Error("tripId or tripDraft is required")
  if (!deps.tripSource) throw new Error("Trip source is unavailable")
  const draft = await deps.tripSource.resolveTrip(input.tripId)
  if (!draft) throw new Error("Trip not found")
  return { tripId: input.tripId, draft }
}

export async function getDispatchRecommendations(
  input: DispatchRequest,
  actor: DispatchActor,
  deps: DispatchCopilotDependencies = defaultDependencies,
): Promise<DispatchRecommendationResult> {
  const { tripId, draft } = await resolveDraft(input, deps)
  const departureTime = asDate(draft.departureTime)
  const query = {
    departureTime,
    destinationZoneId: draft.destinationZoneId,
    quantity: draft.quantity,
    cargoUnit: draft.cargoUnit,
  }

  const [drivers, trucks] = await Promise.all([
    deps.candidateSource.loadDrivers(query),
    deps.candidateSource.loadTrucks(query),
  ])
  const ranking = rankEligibleDispatchCandidates(drivers, trucks, { departureTime })

  const safeDrivers = stableCandidates(drivers).map(({ id, name, status, verificationStatus, licenseExpiry, hasConflictingTrip, currentWorkload, routeExperienceScore, historicalPerformanceScore, locationFitScore }) => ({
    id, name, status, verificationStatus, licenseExpiry, hasConflictingTrip, currentWorkload, routeExperienceScore, historicalPerformanceScore, locationFitScore,
  }))
  const safeTrucks = stableCandidates(trucks).map(({ id, plateNumber, status, hasConflictingTrip, maintenanceBlocking, compliance, fuelEfficiencyScore, maintenanceReadinessScore, locationFitScore, capacityFitScore }) => ({
    id, plateNumber, status, hasConflictingTrip, maintenanceBlocking, compliance, fuelEfficiencyScore, maintenanceReadinessScore, locationFitScore, capacityFitScore,
  }))
  const snapshot = JSON.stringify({
    tripId,
    tripDraft: { ...draft, departureTime: departureTime.toISOString() },
    drivers: safeDrivers,
    trucks: safeTrucks,
  })
  const rankedOutput = JSON.stringify(ranking)
  const top = ranking.ranked[0]

  const saved = await deps.recommendationStore.create({
    tripId,
    requestedBy: actor.userId,
    requestedAt: deps.now(),
    rulesetVersion: DISPATCH_RULESET_VERSION,
    provider: null,
    model: null,
    inputHash: sha256(snapshot),
    inputSnapshot: snapshot,
    rankedOutput,
    confidence: top?.confidence ?? 0,
    dataQuality: top?.dataQuality ?? 0,
    status: "pending",
  })

  return {
    recommendationId: saved.id,
    ranked: ranking.ranked,
    blockedDrivers: ranking.blockedDrivers,
    blockedTrucks: ranking.blockedTrucks,
    confidence: top?.confidence ?? 0,
    dataQuality: top?.dataQuality ?? 0,
  }
}

export async function recordDispatchDecision(
  recommendationId: string,
  decision: DispatchDecision,
  actor: DispatchActor,
  deps: DispatchCopilotDependencies = defaultDependencies,
): Promise<DispatchRecommendationRecord & { stale: boolean }> {
  const recommendation = await deps.recommendationStore.findById(recommendationId)
  if (!recommendation) throw new Error("Dispatch recommendation not found")

  let stale = false
  let selectedDriverId: string | null = null
  let selectedTruckId: string | null = null

  if (decision.decision === "accepted") {
    if (!decision.selectedDriverId || !decision.selectedTruckId) {
      throw new Error("Accepted dispatch decision requires driver and truck")
    }

    const ranked = JSON.parse(recommendation.rankedOutput) as { ranked?: DispatchPairScore[] }
    const allowed = ranked.ranked?.some((row) => (
      row.driverId === decision.selectedDriverId && row.truckId === decision.selectedTruckId
    )) ?? false
    if (!allowed) throw new Error("Selected dispatch pair was not recommended")

    selectedDriverId = decision.selectedDriverId
    selectedTruckId = decision.selectedTruckId
    const inputSnapshot = JSON.parse(recommendation.inputSnapshot) as { tripDraft?: { departureTime?: string } }
    const departureTime = asDate(inputSnapshot.tripDraft?.departureTime ?? recommendation.requestedAt)
    stale = !(await deps.availability.isPairAvailable(selectedDriverId, selectedTruckId, departureTime))
  }

  const saved = await deps.recommendationStore.recordDecision(recommendationId, {
    decision: decision.decision,
    decisionBy: actor.userId,
    decisionAt: deps.now(),
    decisionReason: decision.reason?.trim() || null,
    selectedDriverId,
    selectedTruckId,
    status: stale ? "stale" : decision.decision,
  })

  return { ...saved, stale }
}
