import { createHash } from 'node:crypto'

import { db } from '@/lib/db'
import { ASSIGNMENT_RECOMMENDATION_BOOTSTRAP_POLICY } from './assignment-config'
import type { AssignmentWeights } from './assignment'

export const ASSIGNMENT_POLICY_TYPE = 'assignment_policy'

const WEIGHT_KEYS: (keyof AssignmentWeights)[] = [
  'deadhead',
  'suitability',
  'maintenanceHealth',
  'driverHours',
  'routeExperience',
  'fuelEfficiency',
  'onTime',
  'projectedMargin',
]

export interface AssignmentPolicyDraft {
  modelKey: string
  modelVersion: string
  configVersion: string
  weights: AssignmentWeights
  maxDrivers: number
  maxTractors: number
  maxRecommendations: number
}

export interface AssignmentPolicy extends AssignmentPolicyDraft {
  id: string
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
  return value.trim()
}

function positiveInteger(value: unknown, field: string, maximum: number): number {
  if (!Number.isInteger(value) || Number(value) <= 0 || Number(value) > maximum) {
    throw new Error(`${field} must be a positive integer not greater than ${maximum}`)
  }
  return Number(value)
}

export function validateAssignmentPolicyDraft(value: unknown): AssignmentPolicyDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Assignment policy must be an object')
  }
  const input = value as Record<string, unknown>
  const rawWeights = input.weights
  if (!rawWeights || typeof rawWeights !== 'object' || Array.isArray(rawWeights)) {
    throw new Error('weights must be an object')
  }

  const weights = {} as AssignmentWeights
  let total = 0
  for (const key of WEIGHT_KEYS) {
    const weight = (rawWeights as Record<string, unknown>)[key]
    if (typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0) {
      throw new Error(`weights.${key} must be a finite non-negative number`)
    }
    weights[key] = weight
    total += weight
  }
  if (total <= 0) throw new Error('Assignment policy weights must have a positive total')

  return {
    modelKey: requiredText(input.modelKey, 'modelKey'),
    modelVersion: requiredText(input.modelVersion, 'modelVersion'),
    configVersion: requiredText(input.configVersion, 'configVersion'),
    weights,
    maxDrivers: positiveInteger(input.maxDrivers, 'maxDrivers', 100),
    maxTractors: positiveInteger(input.maxTractors, 'maxTractors', 100),
    maxRecommendations: positiveInteger(input.maxRecommendations, 'maxRecommendations', 25),
  }
}

function policySnapshot(policy: AssignmentPolicyDraft): string {
  return JSON.stringify({
    configVersion: policy.configVersion,
    weights: policy.weights,
    maxDrivers: policy.maxDrivers,
    maxTractors: policy.maxTractors,
    maxRecommendations: policy.maxRecommendations,
  })
}

function snapshotRef(policy: AssignmentPolicyDraft): string {
  return `sha256:${createHash('sha256').update(policySnapshot(policy)).digest('hex')}`
}

function toPolicy(record: {
  id: string
  modelKey: string
  modelVersion: string
  payload: string | null
}): AssignmentPolicy {
  if (!record.payload) throw new Error('Assignment policy payload is missing')
  const payload = JSON.parse(record.payload) as Record<string, unknown>
  const validated = validateAssignmentPolicyDraft({
    ...payload,
    modelKey: record.modelKey,
    modelVersion: record.modelVersion,
  })
  return { id: record.id, ...validated }
}

async function createPolicySnapshot(
  client: Pick<typeof db, 'aiRecommendation'>,
  draft: AssignmentPolicyDraft,
  createdBy: string | null,
) {
  return client.aiRecommendation.create({
    data: {
      recommendationType: ASSIGNMENT_POLICY_TYPE,
      subjectType: 'AssignmentPolicy',
      subjectId: draft.configVersion,
      modelKey: draft.modelKey,
      modelVersion: draft.modelVersion,
      confidence: 1,
      dataQualityScore: 1,
      dataQualityGrade: 'trusted',
      inputSnapshotRef: snapshotRef(draft),
      explanation: JSON.stringify({
        summary: 'Versioned assignment recommendation policy snapshot.',
        configVersion: draft.configVersion,
      }),
      payload: policySnapshot(draft),
      status: 'active',
      createdBy,
    },
  })
}

export async function bootstrapAssignmentPolicy(): Promise<AssignmentPolicy> {
  const record = await db.$transaction(async (tx) => {
    const historyCount = await tx.aiRecommendation.count({
      where: { recommendationType: ASSIGNMENT_POLICY_TYPE },
    })
    if (historyCount > 0) {
      const active = await tx.aiRecommendation.findFirst({
        where: { recommendationType: ASSIGNMENT_POLICY_TYPE, status: 'active' },
        orderBy: { createdAt: 'desc' },
      })
      if (!active) throw new Error('No active assignment recommendation policy')
      return active
    }

    // Preserve the original Ghana haulage policy as the first immutable snapshot.
    const bootstrap = validateAssignmentPolicyDraft({
      ...ASSIGNMENT_RECOMMENDATION_BOOTSTRAP_POLICY,
      configVersion: 'ghana-haulage-v1',
    })
    return createPolicySnapshot(tx as unknown as Pick<typeof db, 'aiRecommendation'>, bootstrap, null)
  }, { isolationLevel: 'Serializable' })

  return toPolicy(record)
}

export async function loadCurrentAssignmentPolicy(): Promise<AssignmentPolicy> {
  const active = await db.aiRecommendation.findFirst({
    where: { recommendationType: ASSIGNMENT_POLICY_TYPE, status: 'active' },
    orderBy: { createdAt: 'desc' },
  })
  if (active) return toPolicy(active)

  const historyCount = await db.aiRecommendation.count({
    where: { recommendationType: ASSIGNMENT_POLICY_TYPE },
  })
  if (historyCount === 0) return bootstrapAssignmentPolicy()
  throw new Error('No active assignment recommendation policy')
}

export async function publishAssignmentPolicy(value: unknown, createdBy: string): Promise<AssignmentPolicy> {
  const draft = validateAssignmentPolicyDraft(value)

  const record = await db.$transaction(async (tx) => {
    const duplicate = await tx.aiRecommendation.findFirst({
      where: {
        recommendationType: ASSIGNMENT_POLICY_TYPE,
        subjectId: draft.configVersion,
      },
      select: { id: true },
    })
    if (duplicate) throw new Error(`Assignment policy ${draft.configVersion} already exists`)

    await tx.aiRecommendation.updateMany({
      where: { recommendationType: ASSIGNMENT_POLICY_TYPE, status: 'active' },
      data: { status: 'superseded' },
    })

    return createPolicySnapshot(tx as unknown as Pick<typeof db, 'aiRecommendation'>, draft, createdBy)
  }, { isolationLevel: 'Serializable' })

  return toPolicy(record)
}
