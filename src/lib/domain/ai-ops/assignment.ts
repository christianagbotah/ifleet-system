export interface AssignmentWeights {
  deadhead: number
  suitability: number
  maintenanceHealth: number
  driverHours: number
  routeExperience: number
  fuelEfficiency: number
  onTime: number
  projectedMargin: number
}

export interface AssignmentCandidate {
  candidateId: string
  driverId: string
  tractorId: string
  trailerId: string | null
  eligible: boolean
  blocking: string[]
  warnings: string[]
  deadheadKm: number | null
  suitability: number | null
  maintenanceHealth: number | null
  driverHoursAvailable: number | null
  routeExperienceTrips: number | null
  fuelEfficiencyRatio: number | null
  onTimeRate: number | null
  projectedMargin: number | null
  marginReference: number | null
  evidenceCount: number
  dataQualityScore: number
}

export interface AssignmentRecommendationInput {
  modelKey: string
  modelVersion: string
  configVersion: string
  weights: AssignmentWeights
  candidates: AssignmentCandidate[]
}

export interface AssignmentRecommendation {
  candidateId: string
  driverId: string
  tractorId: string
  trailerId: string | null
  score: number
  confidence: number
  scoreComponents: Record<keyof AssignmentWeights, number>
  reasons: string[]
  warnings: string[]
  fallbackAssumptions: string[]
  modelKey: string
  modelVersion: string
  configVersion: string
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function normalizeWeights(weights: AssignmentWeights): AssignmentWeights {
  const entries = Object.entries(weights) as Array<[keyof AssignmentWeights, number]>
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0)
  if (total <= 0) throw new Error('assignment recommendation weights must have a positive total')
  return Object.fromEntries(entries.map(([key, value]) => [key, Math.max(0, value) / total])) as unknown as AssignmentWeights
}

function normalizedScores(candidate: AssignmentCandidate): Record<keyof AssignmentWeights, number> {
  const marginRatio = candidate.projectedMargin != null && candidate.marginReference != null && candidate.marginReference > 0
    ? candidate.projectedMargin / candidate.marginReference
    : 0.5

  return {
    deadhead: candidate.deadheadKm == null ? 0.5 : clamp(1 - candidate.deadheadKm / 250),
    suitability: candidate.suitability == null ? 0.5 : clamp(candidate.suitability),
    maintenanceHealth: candidate.maintenanceHealth == null ? 0.5 : clamp(candidate.maintenanceHealth),
    driverHours: candidate.driverHoursAvailable == null ? 0.5 : clamp(candidate.driverHoursAvailable / 10),
    routeExperience: candidate.routeExperienceTrips == null ? 0.5 : clamp(candidate.routeExperienceTrips / 20),
    fuelEfficiency: candidate.fuelEfficiencyRatio == null ? 0.5 : clamp(candidate.fuelEfficiencyRatio / 1.05),
    onTime: candidate.onTimeRate == null ? 0.5 : clamp(candidate.onTimeRate),
    projectedMargin: clamp(marginRatio),
  }
}

function fallbackAssumptions(candidate: AssignmentCandidate): string[] {
  const assumptions: string[] = []
  if (candidate.deadheadKm == null) assumptions.push('deadhead_distance_unavailable')
  if (candidate.suitability == null) assumptions.push('vehicle_suitability_defaulted')
  if (candidate.maintenanceHealth == null) assumptions.push('maintenance_health_defaulted')
  if (candidate.driverHoursAvailable == null) assumptions.push('driver_hours_unavailable')
  if ((candidate.routeExperienceTrips ?? 0) === 0) assumptions.push('route_experience_global_prior')
  if (candidate.fuelEfficiencyRatio == null) assumptions.push('fuel_efficiency_global_prior')
  if (candidate.onTimeRate == null) assumptions.push('on_time_global_prior')
  if (candidate.projectedMargin == null || candidate.marginReference == null) assumptions.push('margin_reference_defaulted')
  return assumptions
}

function recommendationConfidence(candidate: AssignmentCandidate, fallbacks: string[]): number {
  const quality = clamp(candidate.dataQualityScore)
  const evidence = clamp(0.45 + Math.min(Math.max(candidate.evidenceCount, 0), 20) / 20 * 0.45)
  const fallbackPenalty = Math.max(0.55, 1 - fallbacks.length * 0.06)
  return clamp(Math.min(quality, evidence) * fallbackPenalty)
}

function topReasons(scores: Record<keyof AssignmentWeights, number>): string[] {
  return (Object.entries(scores) as Array<[keyof AssignmentWeights, number]>)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([key]) => key)
}

export function hasTrailerCouplingConflict(
  tractorId: string,
  trailerId: string | null,
  activeCouplings: Array<{ tractorId: string; trailerId: string }>,
): boolean {
  if (!trailerId) return false
  const coupling = activeCouplings.find((item) => item.trailerId === trailerId)
  return Boolean(coupling && coupling.tractorId !== tractorId)
}

export function buildTrailerAssignmentOptions<T>(requiresTrailer: boolean, availableTrailers: T[]): Array<T | null> {
  if (!requiresTrailer) return [null]
  return availableTrailers.length > 0 ? [...availableTrailers] : [null]
}

export function rankAssignmentCandidates(input: AssignmentRecommendationInput): AssignmentRecommendation[] {
  const weights = normalizeWeights(input.weights)

  return input.candidates
    .filter((candidate) => candidate.eligible && candidate.blocking.length === 0)
    .map((candidate) => {
      const normalized = normalizedScores(candidate)
      const scoreComponents = Object.fromEntries(
        (Object.keys(weights) as Array<keyof AssignmentWeights>).map((key) => [key, normalized[key] * weights[key] * 100]),
      ) as Record<keyof AssignmentWeights, number>
      const score = Object.values(scoreComponents).reduce((sum, value) => sum + value, 0)
      const fallbacks = fallbackAssumptions(candidate)

      return {
        candidateId: candidate.candidateId,
        driverId: candidate.driverId,
        tractorId: candidate.tractorId,
        trailerId: candidate.trailerId,
        score,
        confidence: recommendationConfidence(candidate, fallbacks),
        scoreComponents,
        reasons: topReasons(scoreComponents),
        warnings: [...candidate.warnings],
        fallbackAssumptions: fallbacks,
        modelKey: input.modelKey,
        modelVersion: input.modelVersion,
        configVersion: input.configVersion,
      }
    })
    .sort((a, b) => b.score - a.score || b.confidence - a.confidence || a.candidateId.localeCompare(b.candidateId))
}
