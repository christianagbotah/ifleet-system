import type { AiModelStatus } from './model-registry'

export interface ModelEvaluationEvidence {
  passed: boolean
  metrics: Record<string, number>
  baselineMetrics: Record<string, number>
}

export interface ModelDriftEvidence {
  status: string
  score: number
  measuredAt: Date
}

export interface ModelHealthHook {
  modelKey: string
  version: string
  family: string
  status: AiModelStatus
  minimumDataQuality: number
  deterministicBaseline: string
  evaluation?: ModelEvaluationEvidence | null
  drift?: ModelDriftEvidence | null
}

export interface ModelPredictionHealthSample {
  modelKey: string
  modelVersion: string
  dataQualityScore: number
  createdAt: Date
}

export interface ModelHealthSnapshot extends ModelHealthHook {
  sampleCount: number
  latestPredictionAt: Date | null
  freshnessMinutes: number | null
  averageDataQuality: number | null
  evaluation: ModelEvaluationEvidence | null
  drift: ModelDriftEvidence | null
}

export function buildModelHealthSnapshot(input: {
  asOf: Date
  hooks: ModelHealthHook[]
  predictions: ModelPredictionHealthSample[]
}): ModelHealthSnapshot[] {
  return input.hooks.map((hook) => {
    const samples = input.predictions.filter((sample) => (
      sample.modelKey === hook.modelKey
      && sample.modelVersion === hook.version
      && sample.createdAt.getTime() <= input.asOf.getTime()
    ))
    const latestPredictionAt = samples.length === 0
      ? null
      : new Date(Math.max(...samples.map((sample) => sample.createdAt.getTime())))
    const validQuality = samples
      .map((sample) => sample.dataQualityScore)
      .filter((score) => Number.isFinite(score))

    return {
      ...hook,
      sampleCount: samples.length,
      latestPredictionAt,
      freshnessMinutes: latestPredictionAt
        ? Math.max(0, Math.round((input.asOf.getTime() - latestPredictionAt.getTime()) / 60_000))
        : null,
      averageDataQuality: validQuality.length > 0
        ? validQuality.reduce((sum, value) => sum + value, 0) / validQuality.length
        : null,
      evaluation: hook.evaluation ?? null,
      drift: hook.drift ?? null,
    }
  })
}

export const DEFAULT_MODEL_HEALTH_HOOKS: ModelHealthHook[] = [
  {
    modelKey: 'maintenance-risk-learned',
    version: '0.1.0',
    family: 'predictive_maintenance',
    status: 'shadow',
    minimumDataQuality: 0.8,
    deterministicBaseline: 'maintenance-rule-v1',
  },
  {
    modelKey: 'factory-queue-learned',
    version: '0.1.0',
    family: 'factory_queue',
    status: 'shadow',
    minimumDataQuality: 0.75,
    deterministicBaseline: 'queue-dwell-deterministic-v1',
  },
  {
    modelKey: 'late-delivery-learned',
    version: '0.1.0',
    family: 'late_delivery',
    status: 'shadow',
    minimumDataQuality: 0.75,
    deterministicBaseline: 'eta-late-deterministic-v1',
  },
]
