import type { FuelAnomalySubject } from "@/lib/domain/fuel-intelligence/types"
import {
  assessFuelAnomaly,
  type FuelAnomalyActor,
  type FuelAnomalyStoredAssessment,
} from "./fuel-anomaly-assessment-service"

export type FuelAnomalyShadowScanInput = {
  startDate: Date
  endDate: Date
  truckId?: string
  limit?: number
}

export type NormalizedFuelAnomalyShadowScanInput = {
  startDate: Date
  endDate: Date
  truckId: string | undefined
  limit: number
}

export type FuelAnomalyShadowScanResult = {
  discovered: number
  processed: number
  failed: number
  assessmentIds: string[]
  errors: Array<{ subjectKey: string; error: string }>
}

export type FuelAnomalyShadowScanDependencies = {
  discoverSubjects(input: NormalizedFuelAnomalyShadowScanInput): Promise<FuelAnomalySubject[]>
  assessSubject(subject: FuelAnomalySubject, actor: FuelAnomalyActor): Promise<FuelAnomalyStoredAssessment>
}

const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 250

export function normalizeFuelAnomalyShadowScanInput(input: FuelAnomalyShadowScanInput): NormalizedFuelAnomalyShadowScanInput {
  const startDate = new Date(input.startDate)
  const endDate = new Date(input.endDate)
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate < startDate) {
    throw new Error("FUEL_ANOMALY_SCAN_INVALID_WINDOW")
  }
  if (endDate.getTime() - startDate.getTime() > MAX_WINDOW_MS) {
    throw new Error("FUEL_ANOMALY_SCAN_WINDOW_TOO_LARGE")
  }
  const requestedLimit = input.limit == null || !Number.isFinite(input.limit) ? DEFAULT_LIMIT : Math.floor(input.limit)
  const limit = Math.min(MAX_LIMIT, Math.max(1, requestedLimit))
  const truckId = input.truckId?.trim() || undefined
  return { startDate, endDate, truckId, limit }
}

function subjectKey(subject: FuelAnomalySubject): string {
  if (subject.fuelLogId !== undefined) return `fuel:${subject.fuelLogId}`
  if (subject.tripId !== undefined) return `trip:${subject.tripId}`
  return `truck:${subject.truckId}:${subject.startDate.toISOString()}:${subject.endDate.toISOString()}`
}

async function defaultDependencies(): Promise<FuelAnomalyShadowScanDependencies> {
  const { db } = await import("@/lib/db")
  return {
    async discoverSubjects(input) {
      const rows = await db.trip.findMany({
        where: {
          departureTime: { gte: input.startDate, lte: input.endDate },
          truckId: input.truckId,
          TripReconciliation: { isNot: null },
          FuelLog: { some: { verificationStatus: "verified" } },
        },
        orderBy: [{ departureTime: "asc" }, { id: "asc" }],
        take: input.limit,
        select: { id: true },
      })
      return rows.map((row) => ({ tripId: row.id }))
    },
    assessSubject: (subject, actor) => assessFuelAnomaly(subject, actor),
  }
}

export async function scanFuelAnomalySubjects(
  input: FuelAnomalyShadowScanInput,
  actor: FuelAnomalyActor,
  provided?: FuelAnomalyShadowScanDependencies,
): Promise<FuelAnomalyShadowScanResult> {
  const normalized = normalizeFuelAnomalyShadowScanInput(input)
  const deps = provided ?? await defaultDependencies()
  const subjects = (await deps.discoverSubjects(normalized)).slice(0, normalized.limit)
  const result: FuelAnomalyShadowScanResult = {
    discovered: subjects.length,
    processed: 0,
    failed: 0,
    assessmentIds: [],
    errors: [],
  }
  for (const subject of subjects) {
    try {
      const assessment = await deps.assessSubject(subject, actor)
      result.processed += 1
      result.assessmentIds.push(assessment.id)
    } catch (error) {
      result.failed += 1
      result.errors.push({
        subjectKey: subjectKey(subject),
        error: error instanceof Error ? error.message : "unknown",
      })
    }
  }
  return result
}
