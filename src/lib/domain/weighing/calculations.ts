export type WeighingStage = 'TARE' | 'GROSS' | 'AXLE' | 'DESTINATION' | 'ROAD_CHECK'

export interface WeightMetricInput {
  tareWeightKg?: number | null
  grossWeightKg?: number | null
}

export interface WeightMetricResult {
  tareWeightKg: number | null
  grossWeightKg: number | null
  netWeightKg: number | null
  valid: boolean
  errors: string[]
}

export interface WeighingSnapshot {
  id: string
  stage: WeighingStage
  recordedAt: Date
  tareWeightKg?: number | null
  grossWeightKg?: number | null
  netWeightKg?: number | null
  supersedesEventId?: string | null
}

function normalizeWeight(value: number | null | undefined, field: string, errors: string[]): number | null {
  if (value == null) return null
  if (!Number.isFinite(value)) {
    errors.push(`${field} must be a finite number`)
    return null
  }
  if (value < 0) {
    errors.push(`${field} cannot be negative`)
    return value
  }
  return value
}

export function calculateWeightMetrics(input: WeightMetricInput): WeightMetricResult {
  const errors: string[] = []
  const tareWeightKg = normalizeWeight(input.tareWeightKg, 'Tare weight', errors)
  const grossWeightKg = normalizeWeight(input.grossWeightKg, 'Gross weight', errors)

  let netWeightKg: number | null = null
  if (tareWeightKg != null && grossWeightKg != null) {
    netWeightKg = grossWeightKg - tareWeightKg
    if (netWeightKg < 0) {
      errors.push('Gross weight cannot be lower than tare weight')
    }
  }

  return {
    tareWeightKg,
    grossWeightKg,
    netWeightKg,
    valid: errors.length === 0,
    errors,
  }
}

export function selectEffectiveWeighing(
  events: WeighingSnapshot[],
  stage: WeighingStage,
): WeighingSnapshot | null {
  const supersededIds = new Set(
    events
      .map((event) => event.supersedesEventId)
      .filter((value): value is string => Boolean(value)),
  )

  return events
    .filter((event) => event.stage === stage)
    .filter((event) => !supersededIds.has(event.id))
    .sort((left, right) => {
      const timeDelta = right.recordedAt.getTime() - left.recordedAt.getTime()
      return timeDelta !== 0 ? timeDelta : right.id.localeCompare(left.id)
    })[0] ?? null
}
