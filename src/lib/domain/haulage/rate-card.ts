import type {
  RateResolutionInput,
  ResolvedTransportRate,
  TransportRateCandidate,
} from '@/lib/domain/haulage/types'

const DIMENSIONS = [
  'shipperProfileId',
  'loadingPointId',
  'destinationZoneId',
  'itemId',
  'unit',
] as const

type Dimension = (typeof DIMENSIONS)[number]

function normalize(dimension: Dimension, value: string | null | undefined): string | null {
  if (value == null || value.trim() === '') return null
  const trimmed = value.trim()
  return dimension === 'unit' ? trimmed.toLowerCase() : trimmed
}

function matchesDimension(
  dimension: Dimension,
  candidate: TransportRateCandidate,
  input: RateResolutionInput
): boolean {
  const expected = normalize(dimension, candidate[dimension])
  if (expected === null) return true
  return expected === normalize(dimension, input[dimension])
}

function specificity(candidate: TransportRateCandidate): number {
  return DIMENSIONS.reduce(
    (score, dimension) => score + (normalize(dimension, candidate[dimension]) === null ? 0 : 1),
    0
  )
}

function isEffective(candidate: TransportRateCandidate, at: Date): boolean {
  if (!candidate.isActive) return false
  if (candidate.effectiveFrom.getTime() > at.getTime()) return false
  if (candidate.effectiveTo && candidate.effectiveTo.getTime() < at.getTime()) return false
  return true
}

export function resolveTransportRate(input: RateResolutionInput): ResolvedTransportRate | null {
  const compatible = input.candidates
    .filter((candidate) => isEffective(candidate, input.at))
    .filter((candidate) => DIMENSIONS.every((dimension) => matchesDimension(dimension, candidate, input)))
    .map((candidate) => ({ candidate, specificity: specificity(candidate) }))
    .sort((left, right) => {
      if (left.specificity !== right.specificity) return right.specificity - left.specificity

      const priorityDelta = (right.candidate.priority ?? 0) - (left.candidate.priority ?? 0)
      if (priorityDelta !== 0) return priorityDelta

      const dateDelta = right.candidate.effectiveFrom.getTime() - left.candidate.effectiveFrom.getTime()
      if (dateDelta !== 0) return dateDelta

      return left.candidate.id.localeCompare(right.candidate.id)
    })

  const selected = compatible[0]
  if (!selected) return null

  return {
    rateCardId: selected.candidate.id,
    contractId: selected.candidate.contractId ?? null,
    transporterId: selected.candidate.transporterId ?? null,
    rateAmount: selected.candidate.rateAmount,
    currency: selected.candidate.currency,
    specificity: selected.specificity,
    effectiveFrom: selected.candidate.effectiveFrom,
    effectiveTo: selected.candidate.effectiveTo ?? null,
  }
}
