import { createHash } from 'node:crypto'

import { distanceMeters } from '@/lib/domain/routing/geofence'

import { assessDataQuality } from './data-quality'
import { scoreComplianceRisk, type ComplianceDocumentFact, type ComplianceRisk } from './compliance-risk'
import { assessDwell, type DwellAssessment } from './dwell'
import { estimateEta, type EtaEstimate } from './eta'
import type { AiInputFacts, DataQualityAssessment } from './types'

export const TRIP_ADVISORY_MODEL = {
  key: 'deterministic-trip-advisory',
  version: '1.0.0',
} as const

export interface TripAdvisoryFacts {
  tripId: string
  driverId: string
  status: string
  estimatedDurationMinutes?: number | null
  destination?: { latitude: number; longitude: number } | null
  loading?: { latitude: number; longitude: number } | null
  liveState?: {
    source: string
    observedAt: Date
    latitude?: number | null
    longitude?: number | null
    speedKph?: number | null
    fuelLiters?: number | null
    odometerKm?: number | null
  } | null
  routeHistory?: { averageTripMinutes: number; sampleCount: number } | null
  queue?: {
    joinedAt: Date
    estimatedWaitMinutes?: number | null
    historicalP90Minutes?: number | null
    detentionFreeMinutes?: number | null
  } | null
  weight?: { grossKg?: number | null; tareKg?: number | null; observedAt?: Date | null } | null
  fuel?: { measuredLiters?: number | null; observedAt?: Date | null; source: 'sensor' | 'manual' | 'receipt' } | null
  manualOdometerKm?: number | null
  documents: ComplianceDocumentFact[]
  activeComplianceHold: boolean
  blockingComplianceRules: number
  warningComplianceRules: number
}

export interface TripAdvisoryRepository {
  loadFacts(tripId: string): Promise<TripAdvisoryFacts | null>
}

export interface TripAdvisory {
  tripId: string
  generatedAt: Date
  model: { key: string; version: string }
  inputSnapshotRef: string
  dataQuality: DataQualityAssessment
  eta: EtaEstimate
  dwell: DwellAssessment | null
  complianceRisk: ComplianceRisk
  explanation: string[]
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function point(value: { latitude?: number | null; longitude?: number | null } | null | undefined) {
  if (!value || !finite(value.latitude) || !finite(value.longitude)) return null
  return { latitude: value.latitude, longitude: value.longitude }
}

function telemetrySource(source: string): 'hardware' | 'phone' {
  return source.trim().toLowerCase() === 'phone' ? 'phone' : 'hardware'
}

function inputFacts(facts: TripAdvisoryFacts, now: Date): AiInputFacts {
  return {
    asOf: now,
    telemetry: facts.liveState ? {
      source: telemetrySource(facts.liveState.source),
      observedAt: facts.liveState.observedAt,
      odometerKm: facts.liveState.odometerKm ?? undefined,
      fuelLiters: facts.liveState.fuelLiters ?? undefined,
      speedKph: facts.liveState.speedKph ?? undefined,
    } : undefined,
    weight: facts.weight ? {
      grossKg: facts.weight.grossKg ?? undefined,
      tareKg: facts.weight.tareKg ?? undefined,
      observedAt: facts.weight.observedAt ?? undefined,
    } : undefined,
    fuel: facts.fuel ? {
      measuredLiters: facts.fuel.measuredLiters ?? undefined,
      observedAt: facts.fuel.observedAt ?? undefined,
      source: facts.fuel.source,
    } : undefined,
    manual: facts.manualOdometerKm == null ? undefined : {
      odometerKm: facts.manualOdometerKm,
    },
  }
}

function routeHistoryRemaining(facts: TripAdvisoryFacts): { averageRemainingMinutes: number; sampleCount: number } | undefined {
  const history = facts.routeHistory
  if (!history || !finite(history.averageTripMinutes) || history.averageTripMinutes < 0) return undefined

  const start = point(facts.loading)
  const end = point(facts.destination)
  const current = point(facts.liveState)
  if (!start || !end || !current) {
    return { averageRemainingMinutes: history.averageTripMinutes, sampleCount: history.sampleCount }
  }

  const totalDistanceKm = distanceMeters(start, end) / 1000
  const remainingDistanceKm = distanceMeters(current, end) / 1000
  if (totalDistanceKm <= 0) {
    return { averageRemainingMinutes: history.averageTripMinutes, sampleCount: history.sampleCount }
  }

  const progressAdjusted = history.averageTripMinutes * Math.min(1, remainingDistanceKm / totalDistanceKm)
  return { averageRemainingMinutes: progressAdjusted, sampleCount: history.sampleCount }
}

function remainingDistanceKm(facts: TripAdvisoryFacts): number | null {
  const current = point(facts.liveState)
  const destination = point(facts.destination)
  return current && destination ? distanceMeters(current, destination) / 1000 : null
}

function snapshotRef(facts: TripAdvisoryFacts, now: Date): string {
  const snapshot = JSON.stringify({
    tripId: facts.tripId,
    status: facts.status,
    asOf: now.toISOString(),
    liveState: facts.liveState ? { ...facts.liveState, observedAt: facts.liveState.observedAt.toISOString() } : null,
    routeHistory: facts.routeHistory ?? null,
    queue: facts.queue ? { ...facts.queue, joinedAt: facts.queue.joinedAt.toISOString() } : null,
    weight: facts.weight ? { ...facts.weight, observedAt: facts.weight.observedAt?.toISOString() ?? null } : null,
    fuel: facts.fuel ? { ...facts.fuel, observedAt: facts.fuel.observedAt?.toISOString() ?? null } : null,
    documents: facts.documents.map((document) => ({ type: document.type, expiresAt: document.expiresAt.toISOString() })),
    activeComplianceHold: facts.activeComplianceHold,
    blockingComplianceRules: facts.blockingComplianceRules,
    warningComplianceRules: facts.warningComplianceRules,
  })
  return `sha256:${createHash('sha256').update(snapshot).digest('hex')}`
}

export async function buildTripAdvisory(
  tripId: string,
  options: { repository: TripAdvisoryRepository; now?: Date },
): Promise<TripAdvisory | null> {
  const facts = await options.repository.loadFacts(tripId)
  if (!facts) return null

  const now = options.now ?? new Date()
  const dataQuality = assessDataQuality(inputFacts(facts, now))
  const remaining = remainingDistanceKm(facts)
  const routeHistory = routeHistoryRemaining(facts)
  const stoppedMinutes = facts.liveState && (facts.liveState.speedKph ?? 0) < 5
    ? Math.max(0, Math.round((now.getTime() - facts.liveState.observedAt.getTime()) / 60_000))
    : 0

  const eta = estimateEta({
    asOf: now,
    remainingDistanceKm: remaining,
    speedKph: facts.liveState?.speedKph ?? null,
    stoppedMinutes,
    routeHistory,
    globalPriorMinutes: facts.estimatedDurationMinutes ?? undefined,
    dataQuality,
  })

  const dwell = facts.queue ? assessDwell({
    asOf: now,
    joinedAt: facts.queue.joinedAt,
    estimatedWaitMinutes: facts.queue.estimatedWaitMinutes,
    historicalP90Minutes: facts.queue.historicalP90Minutes,
    detentionFreeMinutes: facts.queue.detentionFreeMinutes,
    dataQuality,
  }) : null

  const complianceRisk = scoreComplianceRisk({
    asOf: now,
    documents: facts.documents,
    activeHold: facts.activeComplianceHold,
    blockingRuleCount: facts.blockingComplianceRules,
    warningRuleCount: facts.warningComplianceRules,
    dataQuality,
  })

  const explanation = [
    `ETA basis: ${eta.basis}`,
    ...eta.reasons.map((reason) => `ETA: ${reason}`),
    ...(dwell ? dwell.reasons.map((reason) => `Dwell: ${reason}`) : []),
    ...complianceRisk.reasons.map((reason) => `Compliance: ${reason}`),
    ...dataQuality.issues.map((issue) => `Data quality: ${issue.code}`),
  ]

  return {
    tripId: facts.tripId,
    generatedAt: now,
    model: { ...TRIP_ADVISORY_MODEL },
    inputSnapshotRef: snapshotRef(facts, now),
    dataQuality,
    eta,
    dwell,
    complianceRisk,
    explanation,
  }
}
