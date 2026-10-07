import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import { rankEligibleDispatchCandidates, type DispatchDriverEvidence, type DispatchTruckEvidence } from "@/lib/ai/dispatch/candidate-ranking"
import { DISPATCH_RULESET_VERSION, type DispatchPairScore } from "@/lib/ai/dispatch/scoring"
import { loadDispatchCandidateEvidence, type DispatchEvidenceRequest } from "@/lib/services/dispatch-evidence-service"

export const DISPATCH_DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  verificationStatus: true,
  licenseExpiry: true,
  rating: true,
} as const

export const DISPATCH_TRUCK_SELECT = {
  id: true,
  plateNumber: true,
  status: true,
  currentMileage: true,
  nextServiceDate: true,
} as const

export type DispatchActor = { userId: string; role: string }

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
  explanationSource?: string | null
  explanationOutput?: string | null
  explanationAt?: Date | null
}

export type DispatchExplanationAuditInput = {
  provider: string | null
  model: string | null
  explanationSource: "ai" | "deterministic"
  summary: string | null
  explanations: Array<{ driverId: string; truckId: string; explanation: string }>
}

export type DispatchExplanationRecord = {
  provider: string | null
  model: string | null
  explanationSource: "ai" | "deterministic"
  explanationOutput: string
  explanationAt: Date
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

type CandidateQuery = DispatchEvidenceRequest

export type DispatchCopilotDependencies = {
  candidateSource: {
    loadDrivers(input: CandidateQuery): Promise<DispatchDriverEvidence[]>
    loadTrucks(input: CandidateQuery): Promise<DispatchTruckEvidence[]>
  }
  recommendationStore: {
    create(data: DispatchRecommendationCreate): Promise<DispatchRecommendationRecord>
    findById(id: string): Promise<DispatchRecommendationRecord | null>
    recordDecision(id: string, data: DispatchDecisionRecord): Promise<DispatchRecommendationRecord>
    recordExplanation?(id: string, data: DispatchExplanationRecord): Promise<DispatchRecommendationRecord>
  }
  availability: {
    isPairAvailable(
      driverId: string,
      truckId: string,
      departureTime: Date,
      excludeTripId?: string | null,
      tripDraft?: DispatchTripDraft,
    ): Promise<boolean>
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

function stableCandidates<T extends { id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id))
}

function createDefaultCandidateSource(): DispatchCopilotDependencies["candidateSource"] {
  let cacheKey = ""
  let pending: Promise<{ drivers: DispatchDriverEvidence[]; trucks: DispatchTruckEvidence[] }> | null = null

  function load(input: CandidateQuery) {
    const key = JSON.stringify({
      departureTime: input.departureTime.toISOString(),
      destinationZoneId: input.destinationZoneId ?? null,
      cargoUnit: input.cargoUnit ?? null,
      quantity: input.quantity ?? null,
      excludeTripId: input.excludeTripId ?? null,
    })
    if (!pending || cacheKey !== key) {
      cacheKey = key
      pending = loadDispatchCandidateEvidence(input)
    }
    return pending
  }

  return {
    async loadDrivers(input) {
      return (await load(input)).drivers
    },
    async loadTrucks(input) {
      return (await load(input)).trucks
    },
  }
}

type RuntimeDispatchDatabase = {
  dispatchRecommendation: {
    create(args: { data: DispatchRecommendationCreate }): Promise<DispatchRecommendationRecord>
    findUnique(args: { where: { id: string } }): Promise<DispatchRecommendationRecord | null>
    update(args: { where: { id: string }; data: DispatchDecisionRecord | DispatchExplanationRecord }): Promise<DispatchRecommendationRecord>
  }
}

const dispatchDb = db as unknown as RuntimeDispatchDatabase

function createDefaultDependencies(): DispatchCopilotDependencies {
  return {
    candidateSource: createDefaultCandidateSource(),
    recommendationStore: {
      create: (data) => dispatchDb.dispatchRecommendation.create({ data }),
      findById: (id) => dispatchDb.dispatchRecommendation.findUnique({ where: { id } }),
      recordDecision: (id, data) => dispatchDb.dispatchRecommendation.update({ where: { id }, data }),
      recordExplanation: (id, data) => dispatchDb.dispatchRecommendation.update({ where: { id }, data }),
    },
    availability: {
      async isPairAvailable(driverId, truckId, departureTime, excludeTripId, tripDraft) {
        const evidence = await loadDispatchCandidateEvidence({
          departureTime,
          destinationZoneId: tripDraft?.destinationZoneId,
          quantity: tripDraft?.quantity,
          cargoUnit: tripDraft?.cargoUnit,
          excludeTripId,
        })
        const driver = evidence.drivers.find((row) => row.id === driverId)
        const truck = evidence.trucks.find((row) => row.id === truckId)
        if (!driver || !truck) return false

        const freshRanking = rankEligibleDispatchCandidates([driver], [truck], { departureTime })
        return freshRanking.ranked.some((row) => row.driverId === driverId && row.truckId === truckId)
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
}

async function resolveDraft(
  input: DispatchRequest,
  deps: DispatchCopilotDependencies,
): Promise<{ tripId: string | null; draft: DispatchTripDraft }> {
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
  deps: DispatchCopilotDependencies = createDefaultDependencies(),
): Promise<DispatchRecommendationResult> {
  const { tripId, draft } = await resolveDraft(input, deps)
  const departureTime = asDate(draft.departureTime)
  const query: CandidateQuery = {
    departureTime,
    destinationZoneId: draft.destinationZoneId,
    quantity: draft.quantity,
    cargoUnit: draft.cargoUnit,
    excludeTripId: tripId,
  }

  const [drivers, trucks] = await Promise.all([
    deps.candidateSource.loadDrivers(query),
    deps.candidateSource.loadTrucks(query),
  ])
  const ranking = rankEligibleDispatchCandidates(drivers, trucks, { departureTime })

  const safeDrivers = stableCandidates(drivers).map(({
    id, name, status, verificationStatus, licenseExpiry, hasConflictingTrip,
    currentWorkload, routeExperienceScore, historicalPerformanceScore, locationFitScore,
  }) => ({
    id, name, status, verificationStatus, licenseExpiry, hasConflictingTrip,
    currentWorkload, routeExperienceScore, historicalPerformanceScore, locationFitScore,
  }))
  const safeTrucks = stableCandidates(trucks).map(({
    id, plateNumber, status, hasConflictingTrip, maintenanceBlocking, capacitySufficient,
    compliance, fuelEfficiencyScore, maintenanceReadinessScore, locationFitScore, capacityFitScore,
  }) => ({
    id, plateNumber, status, hasConflictingTrip, maintenanceBlocking, capacitySufficient,
    compliance, fuelEfficiencyScore, maintenanceReadinessScore, locationFitScore, capacityFitScore,
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


export async function recordDispatchExplanation(
  recommendationId: string,
  explanation: DispatchExplanationAuditInput,
  _actor: DispatchActor,
  deps: DispatchCopilotDependencies = createDefaultDependencies(),
): Promise<DispatchRecommendationRecord> {
  if (!deps.recommendationStore.recordExplanation) {
    throw new Error("Dispatch explanation audit store is unavailable")
  }

  const provider = explanation.explanationSource === "ai"
    ? explanation.provider?.trim() || null
    : null
  const model = explanation.explanationSource === "ai"
    ? explanation.model?.trim() || null
    : null

  return deps.recommendationStore.recordExplanation(recommendationId, {
    provider,
    model,
    explanationSource: explanation.explanationSource,
    explanationOutput: JSON.stringify({
      summary: explanation.summary,
      explanations: explanation.explanations.map(({ driverId, truckId, explanation: text }) => ({
        driverId,
        truckId,
        explanation: text,
      })),
    }),
    explanationAt: deps.now(),
  })
}

export async function recordDispatchDecision(
  recommendationId: string,
  decision: DispatchDecision,
  actor: DispatchActor,
  deps: DispatchCopilotDependencies = createDefaultDependencies(),
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
    const inputSnapshot = JSON.parse(recommendation.inputSnapshot) as {
      tripId?: string | null
      tripDraft?: {
        departureTime?: string
        destinationZoneId?: string | null
        quantity?: number | null
        cargoUnit?: string | null
      }
    }
    const departureTime = asDate(inputSnapshot.tripDraft?.departureTime ?? recommendation.requestedAt)
    const storedDraft: DispatchTripDraft = {
      departureTime,
      destinationZoneId: inputSnapshot.tripDraft?.destinationZoneId,
      quantity: inputSnapshot.tripDraft?.quantity,
      cargoUnit: inputSnapshot.tripDraft?.cargoUnit,
    }
    stale = !(await deps.availability.isPairAvailable(
      selectedDriverId,
      selectedTruckId,
      departureTime,
      inputSnapshot.tripId ?? recommendation.tripId,
      storedDraft,
    ))
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
