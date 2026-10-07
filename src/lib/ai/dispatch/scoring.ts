export const DISPATCH_RULESET_VERSION = "dispatch-v1" as const

export const DISPATCH_SCORE_WEIGHTS = {
  availability: 15,
  compliance: 20,
  routeExperience: 15,
  historicalPerformance: 15,
  fuelEfficiency: 10,
  maintenanceReadiness: 10,
  workloadBalance: 5,
  locationFit: 5,
  capacityFit: 5,
} as const

export type DispatchScoreComponentName = keyof typeof DISPATCH_SCORE_WEIGHTS

export type DispatchScoreEvidenceValue = number | null | {
  value: number
  known: boolean
}

export type DispatchScoreEvidence = {
  driverId: string
  truckId: string
  eligible: boolean
  currentWorkload: number
  components: Record<DispatchScoreComponentName, DispatchScoreEvidenceValue>
}

export type DispatchScoreComponent = {
  value: number
  weight: number
  known: boolean
}

export type DispatchPairScore = {
  driverId: string
  truckId: string
  score: number
  confidence: number
  dataQuality: number
  currentWorkload: number
  rulesetVersion: typeof DISPATCH_RULESET_VERSION
  components: Record<DispatchScoreComponentName, DispatchScoreComponent>
  reasons: string[]
}

const NEUTRAL_UNKNOWN_SCORE = 50

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function normalizeEvidenceValue(raw: DispatchScoreEvidenceValue): { value: number; known: boolean } {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { value: clampScore(raw), known: true }
  }

  if (raw && typeof raw === "object" && Number.isFinite(raw.value)) {
    return { value: clampScore(raw.value), known: raw.known === true }
  }

  return { value: NEUTRAL_UNKNOWN_SCORE, known: false }
}

function componentReason(name: DispatchScoreComponentName, value: number, known: boolean): string | null {
  if (!known) return `${name}: evidence incomplete or unavailable`
  if (value >= 85) return `${name}: strong evidence`
  if (value <= 35) return `${name}: weak evidence`
  return null
}

export function scoreDispatchPair(evidence: DispatchScoreEvidence): DispatchPairScore {
  if (!evidence.eligible) {
    throw new Error("Cannot score an ineligible dispatch pair")
  }

  let weightedTotal = 0
  let knownWeight = 0
  const reasons: string[] = []
  const components = {} as Record<DispatchScoreComponentName, DispatchScoreComponent>

  for (const name of Object.keys(DISPATCH_SCORE_WEIGHTS) as DispatchScoreComponentName[]) {
    const weight = DISPATCH_SCORE_WEIGHTS[name]
    const { value, known } = normalizeEvidenceValue(evidence.components[name])

    components[name] = { value, weight, known }
    weightedTotal += value * weight / 100
    if (known) knownWeight += weight

    const summary = componentReason(name, value, known)
    if (summary) reasons.push(summary)
  }

  const dataQuality = round(knownWeight / 100, 4)

  return {
    driverId: evidence.driverId,
    truckId: evidence.truckId,
    score: round(clampScore(weightedTotal)),
    confidence: dataQuality,
    dataQuality,
    currentWorkload: Number.isFinite(evidence.currentWorkload)
      ? Math.max(0, evidence.currentWorkload)
      : Number.MAX_SAFE_INTEGER,
    rulesetVersion: DISPATCH_RULESET_VERSION,
    components,
    reasons,
  }
}

export function rankDispatchPairs(scores: DispatchPairScore[]): DispatchPairScore[] {
  return [...scores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.dataQuality !== a.dataQuality) return b.dataQuality - a.dataQuality
    if (a.currentWorkload !== b.currentWorkload) return a.currentWorkload - b.currentWorkload

    const driverOrder = a.driverId.localeCompare(b.driverId)
    if (driverOrder !== 0) return driverOrder
    return a.truckId.localeCompare(b.truckId)
  })
}
