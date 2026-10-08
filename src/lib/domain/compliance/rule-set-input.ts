import type {
  ComplianceOperator,
  ComplianceRule,
  ComplianceScope,
  ComplianceSeverity,
} from '@/lib/domain/compliance/types'

export const COMPLIANCE_OPERATORS = new Set<ComplianceOperator>([
  'lt', 'lte', 'gt', 'gte', 'eq', 'neq', 'in', 'not_in', 'required',
])
export const COMPLIANCE_SEVERITIES = new Set<ComplianceSeverity>(['blocking', 'warning'])

export type NormalizedRuleInput = ComplianceRule & {
  metric?: string | null
  description?: string | null
}

export function parseComplianceDate(value: unknown, field: string): Date {
  const date = new Date(String(value ?? ''))
  if (!Number.isFinite(date.getTime())) throw new Error(`${field} must be a valid date`)
  return date
}

export function parseOptionalComplianceDate(value: unknown, field: string): Date | null {
  if (value == null || value === '') return null
  return parseComplianceDate(value, field)
}

export function parseComplianceScope(value: unknown, field: string): ComplianceScope {
  if (value == null) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value as ComplianceScope
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ComplianceScope
    } catch {
      // handled below
    }
  }
  throw new Error(`${field} must be an object`)
}

export function parseStoredComplianceJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function serializeComplianceJson(value: unknown): string {
  return JSON.stringify(value ?? null)
}

export function normalizeComplianceRuleInput(
  input: Record<string, unknown>,
  index: number,
  defaultEffectiveFrom: Date,
  defaultEffectiveTo: Date | null,
): NormalizedRuleInput {
  const type = String(input.type ?? '').trim()
  const operator = String(input.operator ?? '') as ComplianceOperator
  const severity = String(input.severity ?? '') as ComplianceSeverity
  if (!type) throw new Error(`rules[${index}].type is required`)
  if (!COMPLIANCE_OPERATORS.has(operator)) throw new Error(`rules[${index}].operator is invalid`)
  if (!COMPLIANCE_SEVERITIES.has(severity)) throw new Error(`rules[${index}].severity is invalid`)
  if (input.value === undefined && operator !== 'required') throw new Error(`rules[${index}].value is required`)

  const effectiveFrom = input.effectiveFrom
    ? parseComplianceDate(input.effectiveFrom, `rules[${index}].effectiveFrom`)
    : defaultEffectiveFrom
  const effectiveTo = input.effectiveTo !== undefined
    ? parseOptionalComplianceDate(input.effectiveTo, `rules[${index}].effectiveTo`)
    : defaultEffectiveTo
  if (effectiveTo && effectiveTo < effectiveFrom) {
    throw new Error(`rules[${index}].effectiveTo cannot precede effectiveFrom`)
  }

  const priority = Number(input.priority ?? 0)
  if (!Number.isInteger(priority)) throw new Error(`rules[${index}].priority must be an integer`)

  return {
    id: `candidate-${index}`,
    ruleSetId: 'candidate-rule-set',
    type,
    scope: parseComplianceScope(input.scope, `rules[${index}].scope`),
    operator,
    value: input.value ?? true,
    unit: input.unit == null ? null : String(input.unit).trim() || null,
    severity,
    priority,
    effectiveFrom,
    effectiveTo,
    isActive: input.isActive !== false,
    metric: input.metric == null ? null : String(input.metric).trim() || null,
    description: input.description == null ? null : String(input.description).trim() || null,
  }
}

export function storedComplianceRuleToDomain(rule: {
  id: string
  ruleSetId: string
  type: string
  scope: string
  operator: string
  value: string
  unit: string | null
  severity: string
  priority: number
  effectiveFrom: Date
  effectiveTo: Date | null
  isActive: boolean
}): ComplianceRule {
  return {
    id: rule.id,
    ruleSetId: rule.ruleSetId,
    type: rule.type,
    scope: parseComplianceScope(rule.scope, 'stored scope'),
    operator: rule.operator as ComplianceOperator,
    value: parseStoredComplianceJson(rule.value),
    unit: rule.unit,
    severity: rule.severity as ComplianceSeverity,
    priority: rule.priority,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    isActive: rule.isActive,
  }
}

export function toComplianceRuleCreateData(rule: NormalizedRuleInput) {
  return {
    type: rule.type,
    metric: rule.metric ?? null,
    scope: serializeComplianceJson(rule.scope),
    operator: rule.operator,
    value: serializeComplianceJson(rule.value),
    unit: rule.unit ?? null,
    severity: rule.severity,
    priority: rule.priority,
    effectiveFrom: new Date(rule.effectiveFrom),
    effectiveTo: rule.effectiveTo ? new Date(rule.effectiveTo) : null,
    isActive: rule.isActive,
    description: rule.description ?? null,
  }
}

export function normalizeRuleSetCode(value: unknown, fallbackName: string): string {
  const raw = String(value ?? '').trim() || fallbackName
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
