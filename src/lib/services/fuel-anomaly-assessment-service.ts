import { createHash } from "node:crypto"
import { DEFAULT_FUEL_ANOMALY_POLICY } from "@/lib/domain/fuel-intelligence/policy"
import { evaluateFuelBaselineFindings } from "@/lib/domain/fuel-intelligence/baselines"
import { aggregateFuelAnomalyAssessment } from "@/lib/domain/fuel-intelligence/risk"
import { evaluateFuelIntegrityRules } from "@/lib/domain/fuel-intelligence/rules"
import type {
  FuelAnomalyFindingDraft,
  FuelAnomalyPolicy,
  FuelAnomalySeverity,
  FuelAnomalySubject,
  FuelAssessmentEvidence,
  FuelAssessmentSummary,
} from "@/lib/domain/fuel-intelligence/types"
import { loadFuelAnomalyEvidence } from "./fuel-anomaly-evidence-service"

export type FuelAnomalyAssessmentStatus = "open" | "acknowledged" | "investigating" | "resolved" | "false_positive"
export type FuelAnomalyOutcomeCode =
  | "verified_legitimate"
  | "data_entry_error"
  | "duplicate_record"
  | "mechanical_issue"
  | "route_or_operational_factor"
  | "supplier_or_price_issue"
  | "fuel_loss_confirmed"
  | "policy_violation_confirmed"
  | "insufficient_evidence"
  | "other"

export type FuelAnomalyActor = { userId: string; roleName?: string }

export type FuelAnomalyStoredFinding = {
  id: string
  assessmentId: string
  code: FuelAnomalyFindingDraft["code"]
  severity: FuelAnomalySeverity
  riskContribution: number
  confidence: number
  dataQuality: number
  evidence: string
  reason: string
  recommendedAction: string
  fuelLogId: string | null
  tripId: string | null
  truckId: string | null
  driverId: string | null
  createdAt: Date
}

export type FuelAnomalyStoredReviewEvent = {
  id: string
  assessmentId: string
  fromStatus: FuelAnomalyAssessmentStatus
  toStatus: FuelAnomalyAssessmentStatus
  outcomeCode: FuelAnomalyOutcomeCode | null
  notes: string | null
  actorId: string
  createdAt: Date
}

export type FuelAnomalyStoredAssessment = {
  id: string
  subjectType: FuelAssessmentEvidence["subjectType"]
  subjectKey: string
  fuelLogId: string | null
  tripId: string | null
  truckId: string | null
  requestedBy: string | null
  requestedAt: Date
  rulesetVersion: string
  baselineVersion: string
  inputHash: string
  inputSnapshot: string
  overallRiskScore: number
  overallSeverity: FuelAnomalySeverity
  confidence: number
  dataQuality: number
  status: FuelAnomalyAssessmentStatus
  explanationSource: string | null
  explanationProvider: string | null
  explanationModel: string | null
  explanationOutput: string | null
  explanationAt: Date | null
  reviewedBy: string | null
  reviewedAt: Date | null
  reviewNotes: string | null
  outcomeCode: FuelAnomalyOutcomeCode | null
  createdAt: Date
  updatedAt: Date
  findings: FuelAnomalyStoredFinding[]
  reviewEvents: FuelAnomalyStoredReviewEvent[]
}

export type FuelAnomalyAssessmentIdentity = Pick<
  FuelAnomalyStoredAssessment,
  "subjectType" | "subjectKey" | "rulesetVersion" | "baselineVersion" | "inputHash"
>

export type FuelAnomalyAssessmentCreateInput = {
  assessment: Omit<
    FuelAnomalyStoredAssessment,
    | "id" | "requestedAt" | "status" | "explanationSource" | "explanationProvider"
    | "explanationModel" | "explanationOutput" | "explanationAt" | "reviewedBy" | "reviewedAt"
    | "reviewNotes" | "outcomeCode" | "createdAt" | "updatedAt" | "findings" | "reviewEvents"
  >
  findings: Array<Omit<FuelAnomalyStoredFinding, "id" | "assessmentId" | "createdAt">>
}

export type FuelAnomalyReviewTransitionInput = {
  assessmentId: string
  fromStatus: FuelAnomalyAssessmentStatus
  toStatus: FuelAnomalyAssessmentStatus
  outcomeCode: FuelAnomalyOutcomeCode | null
  notes: string | null
  actorId: string
  reviewedAt: Date
}

export type FuelAnomalyAssessmentStore = {
  findByIdentity(identity: FuelAnomalyAssessmentIdentity): Promise<FuelAnomalyStoredAssessment | null>
  create(input: FuelAnomalyAssessmentCreateInput): Promise<FuelAnomalyStoredAssessment>
  getById(id: string): Promise<FuelAnomalyStoredAssessment | null>
  transitionReview(input: FuelAnomalyReviewTransitionInput): Promise<FuelAnomalyStoredAssessment>
}

export type FuelAnomalyAssessmentDependencies = {
  loadEvidence(subject: FuelAnomalySubject): Promise<FuelAssessmentEvidence>
  evaluateRules(evidence: FuelAssessmentEvidence): FuelAnomalyFindingDraft[]
  evaluateBaselines(evidence: FuelAssessmentEvidence): FuelAnomalyFindingDraft[]
  aggregate(findings: FuelAnomalyFindingDraft[], evidence: FuelAssessmentEvidence): FuelAssessmentSummary
  store: FuelAnomalyAssessmentStore
  now(): Date
  logger: { info(event: string, metadata: Record<string, unknown>): void }
  policy?: FuelAnomalyPolicy
}

export type FuelAnomalyAssessmentResult = FuelAnomalyStoredAssessment
export type FuelAnomalyAssessmentDetail = FuelAnomalyStoredAssessment
export type FuelAnomalyReviewInput = {
  toStatus: FuelAnomalyAssessmentStatus
  outcomeCode?: FuelAnomalyOutcomeCode
  notes?: string
}
export type FuelAnomalyReviewResult = FuelAnomalyStoredAssessment

const VALID_OUTCOMES = new Set<FuelAnomalyOutcomeCode>([
  "verified_legitimate", "data_entry_error", "duplicate_record", "mechanical_issue",
  "route_or_operational_factor", "supplier_or_price_issue", "fuel_loss_confirmed",
  "policy_violation_confirmed", "insufficient_evidence", "other",
])

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null
  return value
}

export function canonicalFuelEvidence(value: unknown): string {
  return JSON.stringify(canonicalValue(value))
}

export const canonicalFuelEvidenceJson = canonicalFuelEvidence

export function hashFuelEvidence(value: unknown): string {
  return createHash("sha256").update(canonicalFuelEvidence(value)).digest("hex")
}

function findingCreateInput(finding: FuelAnomalyFindingDraft): FuelAnomalyAssessmentCreateInput["findings"][number] {
  return {
    code: finding.code,
    severity: finding.severity,
    riskContribution: Math.round(finding.riskContribution),
    confidence: finding.confidence,
    dataQuality: finding.dataQuality,
    evidence: canonicalFuelEvidence({
      ...finding.evidence,
      strongEvidence: finding.strongEvidence,
      correlationKey: finding.correlationKey,
    }),
    reason: finding.reason,
    recommendedAction: finding.recommendedAction,
    fuelLogId: finding.fuelLogId,
    tripId: finding.tripId,
    truckId: finding.truckId,
    driverId: finding.driverId,
  }
}

function sortedFindings(findings: FuelAnomalyFindingDraft[]): FuelAnomalyFindingDraft[] {
  return findings.slice().sort((left, right) => {
    const code = left.code.localeCompare(right.code)
    if (code !== 0) return code
    const trip = (left.tripId ?? "").localeCompare(right.tripId ?? "")
    if (trip !== 0) return trip
    return (left.fuelLogId ?? "").localeCompare(right.fuelLogId ?? "")
  })
}

function isAllowedTransition(from: FuelAnomalyAssessmentStatus, to: FuelAnomalyAssessmentStatus): boolean {
  if (from === "open") return to === "acknowledged"
  if (from === "acknowledged") return to === "investigating"
  if (from === "investigating") return to === "resolved" || to === "false_positive"
  return (from === "resolved" || from === "false_positive") && to === "investigating"
}

function validateReview(current: FuelAnomalyStoredAssessment, input: FuelAnomalyReviewInput): void {
  if (!isAllowedTransition(current.status, input.toStatus)) throw new Error("INVALID_REVIEW_TRANSITION")
  if (input.outcomeCode && !VALID_OUTCOMES.has(input.outcomeCode)) throw new Error("INVALID_OUTCOME")
  if ((input.toStatus === "resolved" || input.toStatus === "false_positive") && !input.outcomeCode) {
    throw new Error("OUTCOME_REQUIRED")
  }
}

function mapPrismaAssessment(row: any): FuelAnomalyStoredAssessment {
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectKey: row.subjectKey,
    fuelLogId: row.fuelLogId,
    tripId: row.tripId,
    truckId: row.truckId,
    requestedBy: row.requestedBy,
    requestedAt: row.requestedAt,
    rulesetVersion: row.rulesetVersion,
    baselineVersion: row.baselineVersion,
    inputHash: row.inputHash,
    inputSnapshot: row.inputSnapshot,
    overallRiskScore: row.overallRiskScore,
    overallSeverity: row.overallSeverity,
    confidence: row.confidence,
    dataQuality: row.dataQuality,
    status: row.status,
    explanationSource: row.explanationSource,
    explanationProvider: row.explanationProvider,
    explanationModel: row.explanationModel,
    explanationOutput: row.explanationOutput,
    explanationAt: row.explanationAt,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    reviewNotes: row.reviewNotes,
    outcomeCode: row.outcomeCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    findings: (row.findings ?? []).map((item: any) => ({
      id: item.id,
      assessmentId: item.assessmentId,
      code: item.code,
      severity: item.severity,
      riskContribution: item.riskContribution,
      confidence: item.confidence,
      dataQuality: item.dataQuality,
      evidence: item.evidence,
      reason: item.reason,
      recommendedAction: item.recommendedAction,
      fuelLogId: item.fuelLogId,
      tripId: item.tripId,
      truckId: item.truckId,
      driverId: item.driverId,
      createdAt: item.createdAt,
    })),
    reviewEvents: (row.reviewEvents ?? []).map((item: any) => ({
      id: item.id,
      assessmentId: item.assessmentId,
      fromStatus: item.fromStatus,
      toStatus: item.toStatus,
      outcomeCode: item.outcomeCode,
      notes: item.notes,
      actorId: item.actorId,
      createdAt: item.createdAt,
    })),
  }
}

async function createDefaultStore(): Promise<FuelAnomalyAssessmentStore> {
  const { db } = await import("@/lib/db")
  const include = {
    findings: { orderBy: [{ code: "asc" as const }, { createdAt: "asc" as const }] },
    reviewEvents: { orderBy: { createdAt: "asc" as const } },
  }
  return {
    async findByIdentity(identity) {
      const row = await db.fuelAnomalyAssessment.findFirst({ where: identity, include })
      return row ? mapPrismaAssessment(row) : null
    },
    async create(input) {
      const row = await db.fuelAnomalyAssessment.create({
        data: {
          ...input.assessment,
          findings: { create: input.findings },
        },
        include,
      })
      return mapPrismaAssessment(row)
    },
    async getById(id) {
      const row = await db.fuelAnomalyAssessment.findUnique({ where: { id }, include })
      return row ? mapPrismaAssessment(row) : null
    },
    async transitionReview(input) {
      return db.$transaction(async (tx) => {
        const current = await tx.fuelAnomalyAssessment.findUnique({ where: { id: input.assessmentId } })
        if (!current) throw new Error("ASSESSMENT_NOT_FOUND")
        await tx.fuelAnomalyReviewEvent.create({
          data: {
            assessmentId: input.assessmentId,
            fromStatus: input.fromStatus,
            toStatus: input.toStatus,
            outcomeCode: input.outcomeCode,
            notes: input.notes,
            actorId: input.actorId,
            createdAt: input.reviewedAt,
          },
        })
        const row = await tx.fuelAnomalyAssessment.update({
          where: { id: input.assessmentId },
          data: {
            status: input.toStatus,
            outcomeCode: input.outcomeCode,
            reviewNotes: input.notes,
            reviewedBy: input.actorId,
            reviewedAt: input.reviewedAt,
          },
          include,
        })
        return mapPrismaAssessment(row)
      })
    },
  }
}

async function createDefaultDependencies(): Promise<FuelAnomalyAssessmentDependencies> {
  return {
    loadEvidence: loadFuelAnomalyEvidence,
    evaluateRules: evaluateFuelIntegrityRules,
    evaluateBaselines: (evidence) => evaluateFuelBaselineFindings({ evidence }),
    aggregate: aggregateFuelAnomalyAssessment,
    store: await createDefaultStore(),
    now: () => new Date(),
    logger: { info: (event, metadata) => console.info(`[FuelAnomaly] ${event}`, metadata) },
    policy: DEFAULT_FUEL_ANOMALY_POLICY,
  }
}

export async function assessFuelAnomaly(
  subject: FuelAnomalySubject,
  actor: FuelAnomalyActor,
  provided?: FuelAnomalyAssessmentDependencies,
): Promise<FuelAnomalyAssessmentResult> {
  const deps = provided ?? await createDefaultDependencies()
  const policy = deps.policy ?? DEFAULT_FUEL_ANOMALY_POLICY
  const evidence = await deps.loadEvidence(subject)
  const inputSnapshot = canonicalFuelEvidence(evidence)
  const identity: FuelAnomalyAssessmentIdentity = {
    subjectType: evidence.subjectType,
    subjectKey: evidence.subjectKey,
    rulesetVersion: policy.rulesetVersion,
    baselineVersion: policy.baselineVersion,
    inputHash: hashFuelEvidence(evidence),
  }
  const existing = await deps.store.findByIdentity(identity)
  if (existing) {
    deps.logger.info("assessment_reused", {
      assessmentId: existing.id,
      rulesetVersion: existing.rulesetVersion,
      baselineVersion: existing.baselineVersion,
    })
    return existing
  }

  const findings = sortedFindings([
    ...deps.evaluateRules(evidence),
    ...deps.evaluateBaselines(evidence),
  ])
  const summary = deps.aggregate(findings, evidence)
  const input: FuelAnomalyAssessmentCreateInput = {
    assessment: {
      ...identity,
      fuelLogId: evidence.fuelLogId,
      tripId: evidence.tripId,
      truckId: evidence.truckId,
      requestedBy: actor.userId,
      inputSnapshot,
      overallRiskScore: summary.overallRiskScore,
      overallSeverity: summary.overallSeverity,
      confidence: summary.confidence,
      dataQuality: summary.dataQuality,
    },
    findings: findings.map(findingCreateInput),
  }
  let created: FuelAnomalyStoredAssessment
  try {
    created = await deps.store.create(input)
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error
    const raced = await deps.store.findByIdentity(identity)
    if (!raced) throw error
    created = raced
  }
  deps.logger.info("assessment_created", {
    assessmentId: created.id,
    rulesetVersion: created.rulesetVersion,
    baselineVersion: created.baselineVersion,
    findingCount: created.findings.length,
  })
  return created
}

export async function getFuelAnomalyAssessment(
  id: string,
  provided?: FuelAnomalyAssessmentDependencies,
): Promise<FuelAnomalyAssessmentDetail | null> {
  const deps = provided ?? await createDefaultDependencies()
  return deps.store.getById(id)
}

export async function recordFuelAnomalyReview(
  assessmentId: string,
  input: FuelAnomalyReviewInput,
  actor: FuelAnomalyActor,
  provided?: FuelAnomalyAssessmentDependencies,
): Promise<FuelAnomalyReviewResult> {
  const deps = provided ?? await createDefaultDependencies()
  const current = await deps.store.getById(assessmentId)
  if (!current) throw new Error("ASSESSMENT_NOT_FOUND")
  validateReview(current, input)
  const terminal = input.toStatus === "resolved" || input.toStatus === "false_positive"
  const outcomeCode = terminal ? input.outcomeCode ?? null : null
  const reviewedAt = deps.now()
  const updated = await deps.store.transitionReview({
    assessmentId,
    fromStatus: current.status,
    toStatus: input.toStatus,
    outcomeCode,
    notes: input.notes ?? null,
    actorId: actor.userId,
    reviewedAt,
  })
  deps.logger.info("review_recorded", {
    assessmentId,
    fromStatus: current.status,
    toStatus: input.toStatus,
    actorId: actor.userId,
  })
  return updated
}
