import type { Prisma } from "@/generated/client"
import {
  mapFuelAnomalyPrismaAssessment,
  type FuelAnomalyAssessmentStatus,
  type FuelAnomalyOutcomeCode,
  type FuelAnomalyStoredAssessment,
} from "./fuel-anomaly-assessment-service"
import type { FuelAnomalySeverity } from "@/lib/domain/fuel-intelligence/types"

export type FuelAnomalyListQuery = {
  startDate?: Date
  endDate?: Date
  status?: string
  severity?: string
  truckId?: string
  page?: number
  pageSize?: number
}

export type FuelAnomalySummaryQuery = {
  startDate?: Date
  endDate?: Date
  truckId?: string
}

export type NormalizedFuelAnomalyListQuery = {
  startDate: Date
  endDate: Date
  status?: FuelAnomalyAssessmentStatus
  severity?: FuelAnomalySeverity
  truckId?: string
  page: number
  pageSize: number
}

export type NormalizedFuelAnomalySummaryQuery = {
  startDate: Date
  endDate: Date
  truckId?: string
}

export type FuelAnomalyListItem = {
  id: string
  subjectType: FuelAnomalyStoredAssessment["subjectType"]
  subjectKey: string
  fuelLogId: string | null
  tripId: string | null
  truckId: string | null
  requestedAt: Date
  rulesetVersion: string
  baselineVersion: string
  overallRiskScore: number
  overallSeverity: FuelAnomalySeverity
  confidence: number
  dataQuality: number
  status: FuelAnomalyAssessmentStatus
  outcomeCode: FuelAnomalyOutcomeCode | null
  reviewedAt: Date | null
  explanationSource: string | null
  explanationProvider: string | null
  explanationModel: string | null
  explanationAt: Date | null
  findingCount: number
}

export type FuelAnomalyDetailFinding = Omit<FuelAnomalyStoredAssessment["findings"][number], "evidence"> & {
  evidence: Record<string, unknown>
}

export type FuelAnomalyAssessmentDetailView = FuelAnomalyListItem & {
  explanationOutput: string | null
  reviewNotes: string | null
  reviewedBy: string | null
  findings: FuelAnomalyDetailFinding[]
  reviewEvents: FuelAnomalyStoredAssessment["reviewEvents"]
}

export type FuelAnomalyListResult = {
  items: FuelAnomalyListItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type FuelAnomalyDashboardSummary = {
  observerMode: true
  assessmentCount: number
  openBySeverity: Record<FuelAnomalySeverity, number>
  findingsByCode: Record<string, number>
  averageConfidence: number
  averageDataQuality: number
  riskTrend: Array<{ date: string; averageRisk: number; count: number }>
  dataQualityTrend: Array<{ date: string; averageDataQuality: number; count: number }>
  topTrucks: Array<{ key: string; count: number }>
  topRoutes: Array<{ key: string; count: number }>
  topStations: Array<{ key: string; count: number }>
  aiExplanations: { success: number; fallback: number; none: number }
  review: {
    terminalCount: number
    falsePositiveRate: number
    outcomes: Record<string, number>
    outcomeRates: Record<string, number>
    averageResolutionMs: number | null
  }
  baselines: {
    sampleSizeDistribution: { below6: number; advisory6To11: number; preferred12Plus: number }
  }
  versionDistribution: Record<string, number>
  rulesetVersions: string[]
  baselineVersions: string[]
}

export type FuelAnomalyQueryStore = {
  list(query: NormalizedFuelAnomalyListQuery): Promise<{ rows: FuelAnomalyStoredAssessment[]; total: number }>
  summaryRows(query: NormalizedFuelAnomalySummaryQuery): Promise<FuelAnomalyStoredAssessment[]>
  getById(id: string): Promise<FuelAnomalyStoredAssessment | null>
}

export type FuelAnomalyQueryDependencies = { store?: FuelAnomalyQueryStore; now?: () => Date }

const LIST_MAX_WINDOW_MS = 90 * 86_400_000
const SUMMARY_MAX_WINDOW_MS = 90 * 86_400_000
const DEFAULT_WINDOW_MS = 30 * 86_400_000
const MAX_PAGE_SIZE = 100
const DEFAULT_PAGE_SIZE = 25
const MAX_SUMMARY_ROWS = 5000
const VALID_STATUSES = new Set<FuelAnomalyAssessmentStatus>(["open", "acknowledged", "investigating", "resolved", "false_positive"])
const VALID_SEVERITIES = new Set<FuelAnomalySeverity>(["info", "low", "medium", "high", "critical"])

function validDate(value: Date | undefined): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime())
}

function normalizeWindow(startDate: Date | undefined, endDate: Date | undefined, now: Date, maxWindowMs: number): { startDate: Date; endDate: Date } {
  const end = validDate(endDate) ? new Date(endDate) : new Date(now)
  const start = validDate(startDate) ? new Date(startDate) : new Date(end.getTime() - DEFAULT_WINDOW_MS)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) throw new Error("FUEL_ANOMALY_QUERY_INVALID_WINDOW")
  if (end.getTime() - start.getTime() > maxWindowMs) throw new Error("FUEL_ANOMALY_QUERY_WINDOW_TOO_LARGE")
  return { startDate: start, endDate: end }
}

export function normalizeFuelAnomalyListQuery(query: FuelAnomalyListQuery, now = new Date()): NormalizedFuelAnomalyListQuery {
  const window = normalizeWindow(query.startDate, query.endDate, now, LIST_MAX_WINDOW_MS)
  const status = query.status?.trim()
  if (status && !VALID_STATUSES.has(status as FuelAnomalyAssessmentStatus)) throw new Error("FUEL_ANOMALY_QUERY_INVALID_STATUS")
  const severity = query.severity?.trim()
  if (severity && !VALID_SEVERITIES.has(severity as FuelAnomalySeverity)) throw new Error("FUEL_ANOMALY_QUERY_INVALID_SEVERITY")
  const page = Number.isFinite(query.page) ? Math.max(1, Math.floor(query.page as number)) : 1
  const pageSize = Number.isFinite(query.pageSize) ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(query.pageSize as number))) : DEFAULT_PAGE_SIZE
  return {
    ...window,
    status: status as FuelAnomalyAssessmentStatus | undefined,
    severity: severity as FuelAnomalySeverity | undefined,
    truckId: query.truckId?.trim() || undefined,
    page,
    pageSize,
  }
}

export function normalizeFuelAnomalySummaryQuery(query: FuelAnomalySummaryQuery, now = new Date()): NormalizedFuelAnomalySummaryQuery {
  return {
    ...normalizeWindow(query.startDate, query.endDate, now, SUMMARY_MAX_WINDOW_MS),
    truckId: query.truckId?.trim() || undefined,
  }
}

function listItem(row: FuelAnomalyStoredAssessment): FuelAnomalyListItem {
  return {
    id: row.id,
    subjectType: row.subjectType,
    subjectKey: row.subjectKey,
    fuelLogId: row.fuelLogId,
    tripId: row.tripId,
    truckId: row.truckId,
    requestedAt: row.requestedAt,
    rulesetVersion: row.rulesetVersion,
    baselineVersion: row.baselineVersion,
    overallRiskScore: row.overallRiskScore,
    overallSeverity: row.overallSeverity,
    confidence: row.confidence,
    dataQuality: row.dataQuality,
    status: row.status,
    outcomeCode: row.outcomeCode,
    reviewedAt: row.reviewedAt,
    explanationSource: row.explanationSource,
    explanationProvider: row.explanationProvider,
    explanationModel: row.explanationModel,
    explanationAt: row.explanationAt,
    findingCount: row.findings.length,
  }
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw)
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

function safeEvidence(raw: string): Record<string, unknown> {
  return parseObject(raw) ?? {}
}

function countKey(map: Map<string, number>, key: unknown): void {
  if (typeof key !== "string") return
  const normalized = key.trim()
  if (!normalized) return
  map.set(normalized, (map.get(normalized) ?? 0) + 1)
}

function sortedCounts(map: Map<string, number>, limit = 10): Array<{ key: string; count: number }> {
  return [...map.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, limit)
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function trend<T>(rows: FuelAnomalyStoredAssessment[], value: (row: FuelAnomalyStoredAssessment) => number, label: "averageRisk" | "averageDataQuality"): T[] {
  const groups = new Map<string, number[]>()
  for (const row of rows) groups.set(dateKey(row.requestedAt), [...(groups.get(dateKey(row.requestedAt)) ?? []), value(row)])
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({ date, [label]: average(values), count: values.length })) as T[]
}

function extractSnapshotMetadata(row: FuelAnomalyStoredAssessment): { routeKey: string | null; stations: string[]; baselineSampleSize: number | null } {
  const snapshot = parseObject(row.inputSnapshot)
  if (!snapshot) return { routeKey: null, stations: [], baselineSampleSize: null }
  const routeKey = typeof snapshot.routeKey === "string" && snapshot.routeKey.trim() ? snapshot.routeKey.trim() : null
  const stations: string[] = []
  if (Array.isArray(snapshot.fuelEvents)) {
    for (const item of snapshot.fuelEvents) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const station = (item as Record<string, unknown>).stationName
      if (typeof station === "string" && station.trim()) stations.push(station.trim())
    }
  }
  let baselineSampleSize: number | null = null
  const cohorts = snapshot.comparableCohorts
  if (cohorts && typeof cohorts === "object" && !Array.isArray(cohorts)) {
    const lengths = Object.values(cohorts as Record<string, unknown>)
      .filter(Array.isArray)
      .map((items) => items.length)
    if (lengths.length > 0) baselineSampleSize = Math.max(...lengths)
  }
  return { routeKey, stations, baselineSampleSize }
}

async function defaultStore(): Promise<FuelAnomalyQueryStore> {
  const { db } = await import("@/lib/db")
  const include = {
    findings: { orderBy: [{ code: "asc" as const }, { createdAt: "asc" as const }] },
    reviewEvents: { orderBy: { createdAt: "asc" as const } },
  }
  function whereFor(query: NormalizedFuelAnomalySummaryQuery & Partial<Pick<NormalizedFuelAnomalyListQuery, "status" | "severity">>): Prisma.FuelAnomalyAssessmentWhereInput {
    return {
      requestedAt: { gte: query.startDate, lte: query.endDate },
      truckId: query.truckId,
      status: query.status,
      overallSeverity: query.severity,
    }
  }
  return {
    async list(query) {
      const where = whereFor(query)
      const [rows, total] = await Promise.all([
        db.fuelAnomalyAssessment.findMany({
          where,
          include,
          orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.fuelAnomalyAssessment.count({ where }),
      ])
      return { rows: rows.map(mapFuelAnomalyPrismaAssessment), total }
    },
    async summaryRows(query) {
      const rows = await db.fuelAnomalyAssessment.findMany({
        where: whereFor(query),
        include,
        orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
        take: MAX_SUMMARY_ROWS,
      })
      return rows.map(mapFuelAnomalyPrismaAssessment)
    },
    async getById(id) {
      const row = await db.fuelAnomalyAssessment.findUnique({ where: { id }, include })
      return row ? mapFuelAnomalyPrismaAssessment(row) : null
    },
  }
}

async function resolveStore(deps: FuelAnomalyQueryDependencies): Promise<FuelAnomalyQueryStore> {
  return deps.store ?? defaultStore()
}

export async function listFuelAnomalyAssessments(query: FuelAnomalyListQuery, deps: FuelAnomalyQueryDependencies = {}): Promise<FuelAnomalyListResult> {
  const normalized = normalizeFuelAnomalyListQuery(query, deps.now?.() ?? new Date())
  const store = await resolveStore(deps)
  const result = await store.list(normalized)
  return {
    items: result.rows.map(listItem),
    total: result.total,
    page: normalized.page,
    pageSize: normalized.pageSize,
    totalPages: Math.ceil(result.total / normalized.pageSize),
  }
}

export async function getFuelAnomalyAssessmentDetailView(id: string, deps: FuelAnomalyQueryDependencies = {}): Promise<FuelAnomalyAssessmentDetailView | null> {
  const store = await resolveStore(deps)
  const row = await store.getById(id)
  if (!row) return null
  return {
    ...listItem(row),
    explanationOutput: row.explanationOutput,
    reviewNotes: row.reviewNotes,
    reviewedBy: row.reviewedBy,
    findings: row.findings.map((finding) => ({ ...finding, evidence: safeEvidence(finding.evidence) })),
    reviewEvents: row.reviewEvents,
  }
}

export async function getFuelAnomalyDashboardSummary(query: FuelAnomalySummaryQuery, deps: FuelAnomalyQueryDependencies = {}): Promise<FuelAnomalyDashboardSummary> {
  const normalized = normalizeFuelAnomalySummaryQuery(query, deps.now?.() ?? new Date())
  const store = await resolveStore(deps)
  const rows = await store.summaryRows(normalized)
  const openBySeverity: Record<FuelAnomalySeverity, number> = { info: 0, low: 0, medium: 0, high: 0, critical: 0 }
  const findingsByCode: Record<string, number> = {}
  const trucks = new Map<string, number>()
  const routes = new Map<string, number>()
  const stations = new Map<string, number>()
  const outcomes: Record<string, number> = {}
  const versions: Record<string, number> = {}
  const baselineDistribution = { below6: 0, advisory6To11: 0, preferred12Plus: 0 }
  const aiExplanations = { success: 0, fallback: 0, none: 0 }
  const terminal = rows.filter((row) => row.status === "resolved" || row.status === "false_positive")
  const durations: number[] = []

  for (const row of rows) {
    if (row.status === "open" || row.status === "acknowledged" || row.status === "investigating") openBySeverity[row.overallSeverity] += 1
    if (row.truckId) countKey(trucks, row.truckId)
    for (const finding of row.findings) findingsByCode[finding.code] = (findingsByCode[finding.code] ?? 0) + 1
    if (row.explanationSource === "ai") aiExplanations.success += 1
    else if (row.explanationSource === "deterministic_fallback") aiExplanations.fallback += 1
    else aiExplanations.none += 1
    if (row.outcomeCode) outcomes[row.outcomeCode] = (outcomes[row.outcomeCode] ?? 0) + 1
    if (row.reviewedAt && (row.status === "resolved" || row.status === "false_positive")) {
      const duration = row.reviewedAt.getTime() - row.requestedAt.getTime()
      if (duration >= 0) durations.push(duration)
    }
    const versionKey = `${row.rulesetVersion}|${row.baselineVersion}`
    versions[versionKey] = (versions[versionKey] ?? 0) + 1
    const metadata = extractSnapshotMetadata(row)
    countKey(routes, metadata.routeKey)
    for (const station of metadata.stations) countKey(stations, station)
    if (metadata.baselineSampleSize != null) {
      if (metadata.baselineSampleSize < 6) baselineDistribution.below6 += 1
      else if (metadata.baselineSampleSize < 12) baselineDistribution.advisory6To11 += 1
      else baselineDistribution.preferred12Plus += 1
    }
  }

  const outcomeRates: Record<string, number> = {}
  for (const [key, count] of Object.entries(outcomes)) outcomeRates[key] = terminal.length > 0 ? count / terminal.length : 0
  return {
    observerMode: true,
    assessmentCount: rows.length,
    openBySeverity,
    findingsByCode,
    averageConfidence: average(rows.map((row) => row.confidence)),
    averageDataQuality: average(rows.map((row) => row.dataQuality)),
    riskTrend: trend(rows, (row) => row.overallRiskScore, "averageRisk"),
    dataQualityTrend: trend(rows, (row) => row.dataQuality, "averageDataQuality"),
    topTrucks: sortedCounts(trucks),
    topRoutes: sortedCounts(routes),
    topStations: sortedCounts(stations),
    aiExplanations,
    review: {
      terminalCount: terminal.length,
      falsePositiveRate: terminal.length > 0 ? terminal.filter((row) => row.status === "false_positive").length / terminal.length : 0,
      outcomes,
      outcomeRates,
      averageResolutionMs: durations.length > 0 ? average(durations) : null,
    },
    baselines: { sampleSizeDistribution: baselineDistribution },
    versionDistribution: versions,
    rulesetVersions: [...new Set(rows.map((row) => row.rulesetVersion))].sort(),
    baselineVersions: [...new Set(rows.map((row) => row.baselineVersion))].sort(),
  }
}
