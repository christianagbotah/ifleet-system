import { calculateWeightMetrics } from '@/lib/domain/weighing/calculations'
import { evaluateCompliance } from '@/lib/domain/compliance/rule-engine'
import type {
  ComplianceOperator,
  ComplianceRule,
  ComplianceScope,
  ComplianceSeverity,
} from '@/lib/domain/compliance/types'

export interface AxleReadingInput {
  axleNumber: number
  weightKg: number
  group?: string | null
}

export interface WeightClearanceRule {
  id: string
  type: string
  operator: ComplianceOperator
  value: unknown
  unit?: string | null
  severity: ComplianceSeverity
  priority: number
  effectiveFrom: Date
  effectiveTo?: Date | null
  isActive: boolean
  scope: ComplianceScope
  ruleSetId?: string
}

export interface WeightClearanceInput {
  occurredAt: Date
  grossWeightKg: number
  tareWeightKg: number
  axleReadings: AxleReadingInput[]
  requiredAxleCount: number
  tolerancePercent?: number
  country?: string | null
  shipperId?: string | null
  vehicleType?: string | null
  trailerType?: string | null
  commodityId?: string | null
  rules: WeightClearanceRule[]
}

function isWeightRuleType(type: string): boolean {
  return type === 'gross_weight' ||
    type === 'tare_weight' ||
    type === 'net_weight' ||
    type.startsWith('axle:') ||
    type.startsWith('axle_group:')
}

function toleranceAdjustedRule(rule: WeightClearanceRule, tolerancePercent: number): ComplianceRule {
  let adjustedValue = rule.value
  const numeric = typeof rule.value === 'number' ? rule.value : Number(rule.value)

  if (Number.isFinite(numeric) && tolerancePercent > 0) {
    if (rule.operator === 'lte' || rule.operator === 'lt') {
      adjustedValue = numeric * (1 + tolerancePercent / 100)
    } else if (rule.operator === 'gte' || rule.operator === 'gt') {
      adjustedValue = numeric * (1 - tolerancePercent / 100)
    }
  }

  return {
    id: rule.id,
    ruleSetId: rule.ruleSetId ?? 'weight-clearance',
    type: rule.type,
    operator: rule.operator,
    value: adjustedValue,
    unit: rule.unit ?? null,
    severity: rule.severity,
    priority: rule.priority,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo ?? null,
    isActive: rule.isActive,
    scope: rule.scope,
  }
}

export function evaluateWeightClearance(input: WeightClearanceInput) {
  const reasons: string[] = []
  const metrics = calculateWeightMetrics({
    grossWeightKg: input.grossWeightKg,
    tareWeightKg: input.tareWeightKg,
  })

  if (!metrics.valid) reasons.push(...metrics.errors)

  const uniqueAxles = new Set(input.axleReadings.map((reading) => reading.axleNumber))
  if (uniqueAxles.size < input.requiredAxleCount) {
    reasons.push('Required axle readings are incomplete')
  }

  const values: Record<string, unknown> = {
    gross_weight: metrics.grossWeightKg,
    tare_weight: metrics.tareWeightKg,
    net_weight: metrics.netWeightKg,
  }

  const groupTotals = new Map<string, number>()
  for (const reading of input.axleReadings) {
    values[`axle:${reading.axleNumber}`] = reading.weightKg
    const group = reading.group?.trim()
    if (group) {
      groupTotals.set(group, (groupTotals.get(group) ?? 0) + reading.weightKg)
    }
  }
  for (const [group, total] of groupTotals) {
    values[`axle_group:${group}`] = total
  }

  const tolerancePercent = Number.isFinite(input.tolerancePercent)
    ? Math.max(0, input.tolerancePercent ?? 0)
    : 0

  const weightRules = input.rules
    .filter((rule) => isWeightRuleType(rule.type))
    .map((rule) => toleranceAdjustedRule(rule, tolerancePercent))

  const compliance = evaluateCompliance({
    occurredAt: input.occurredAt,
    country: input.country ?? null,
    shipperId: input.shipperId ?? null,
    vehicleType: input.vehicleType ?? null,
    trailerType: input.trailerType ?? null,
    commodityId: input.commodityId ?? null,
    values,
  }, weightRules)

  const passed = metrics.valid && reasons.length === 0 && compliance.passed

  return {
    passed,
    reasons,
    metrics,
    appliedRules: compliance.appliedRules,
    blocking: compliance.blocking,
    warnings: compliance.warnings,
    ambiguities: compliance.ambiguities,
  }
}
