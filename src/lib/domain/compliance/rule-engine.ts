import type {
  ComplianceAmbiguity,
  ComplianceAppliedRule,
  ComplianceContext,
  ComplianceOperator,
  ComplianceRule,
  ComplianceScope,
} from '@/lib/domain/compliance/types'

const SCOPE_KEYS = ['country', 'shipperId', 'vehicleType', 'trailerType', 'commodityId'] as const

type ScopeKey = (typeof SCOPE_KEYS)[number]

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid compliance date')
  return date
}

function normalizeText(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).trim()
  return text ? text.toLowerCase() : null
}

function scopeMatches(scope: ComplianceScope, context: ComplianceContext): boolean {
  return SCOPE_KEYS.every((key) => {
    const expected = normalizeText(scope[key])
    if (expected == null) return true
    return expected === normalizeText(context[key])
  })
}

function specificity(scope: ComplianceScope): number {
  return SCOPE_KEYS.reduce((score, key) => score + (normalizeText(scope[key]) == null ? 0 : 1), 0)
}

function isEffective(rule: ComplianceRule, occurredAt: Date): boolean {
  if (!rule.isActive) return false
  const start = asDate(rule.effectiveFrom)
  if (start.getTime() > occurredAt.getTime()) return false
  if (rule.effectiveTo) {
    const end = asDate(rule.effectiveTo)
    if (end.getTime() < occurredAt.getTime()) return false
  }
  return true
}

function camelize(value: string): string {
  return value.replace(/[_-]+([a-z0-9])/gi, (_, part: string) => part.toUpperCase())
}

function unitSuffix(unit: string | null | undefined): string {
  if (!unit) return ''
  const cleaned = unit.replace(/[^a-z0-9]+/gi, ' ').trim()
  if (!cleaned) return ''
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function resolveActual(context: ComplianceContext, rule: ComplianceRule): unknown {
  const camelType = camelize(rule.type)
  const candidates = [
    rule.type,
    camelType,
    `${camelType}${unitSuffix(rule.unit)}`,
  ]
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(context.values, key)) return context.values[key]
  }
  return undefined
}

function compare(operator: ComplianceOperator, actual: unknown, expected: unknown): boolean {
  if (operator === 'required') {
    if (actual == null) return false
    if (typeof actual === 'string') return actual.trim().length > 0
    if (Array.isArray(actual)) return actual.length > 0
    return true
  }

  if (operator === 'in' || operator === 'not_in') {
    const values = Array.isArray(expected) ? expected : [expected]
    const found = values.some((candidate) => normalizeText(candidate) === normalizeText(actual))
    return operator === 'in' ? found : !found
  }

  if (operator === 'eq' || operator === 'neq') {
    const equal = typeof actual === 'number' && typeof expected === 'number'
      ? actual === expected
      : normalizeText(actual) === normalizeText(expected)
    return operator === 'eq' ? equal : !equal
  }

  const left = typeof actual === 'number' ? actual : Number(actual)
  const right = typeof expected === 'number' ? expected : Number(expected)
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false

  switch (operator) {
    case 'lt': return left < right
    case 'lte': return left <= right
    case 'gt': return left > right
    case 'gte': return left >= right
    default: return false
  }
}

interface RankedRule {
  rule: ComplianceRule
  specificity: number
  effectiveFrom: Date
}

function rankRules(left: RankedRule, right: RankedRule): number {
  if (left.specificity !== right.specificity) return right.specificity - left.specificity
  if (left.rule.priority !== right.rule.priority) return right.rule.priority - left.rule.priority
  const effectiveDelta = right.effectiveFrom.getTime() - left.effectiveFrom.getTime()
  if (effectiveDelta !== 0) return effectiveDelta
  return left.rule.id.localeCompare(right.rule.id)
}

function hasEqualPrecedence(left: RankedRule, right: RankedRule): boolean {
  return left.specificity === right.specificity &&
    left.rule.priority === right.rule.priority &&
    left.effectiveFrom.getTime() === right.effectiveFrom.getTime()
}

export function evaluateCompliance(context: ComplianceContext, rules: ComplianceRule[]) {
  const occurredAt = asDate(context.occurredAt)
  const candidates = rules
    .filter((rule) => isEffective(rule, occurredAt))
    .filter((rule) => scopeMatches(rule.scope, context))
    .map<RankedRule>((rule) => ({
      rule,
      specificity: specificity(rule.scope),
      effectiveFrom: asDate(rule.effectiveFrom),
    }))

  const byType = new Map<string, RankedRule[]>()
  for (const candidate of candidates) {
    const bucket = byType.get(candidate.rule.type) ?? []
    bucket.push(candidate)
    byType.set(candidate.rule.type, bucket)
  }

  const appliedRules: ComplianceAppliedRule[] = []
  const ambiguities: ComplianceAmbiguity[] = []

  for (const type of [...byType.keys()].sort()) {
    const ranked = (byType.get(type) ?? []).sort(rankRules)
    const selected = ranked[0]
    if (!selected) continue

    const tied = ranked.filter((candidate) => hasEqualPrecedence(candidate, selected))
    if (tied.length > 1) {
      ambiguities.push({
        type,
        ruleIds: tied.map((candidate) => candidate.rule.id).sort(),
        specificity: selected.specificity,
        priority: selected.rule.priority,
        effectiveFrom: selected.effectiveFrom,
      })
      continue
    }

    const actual = resolveActual(context, selected.rule)
    const passed = compare(selected.rule.operator, actual, selected.rule.value)
    appliedRules.push({
      ruleId: selected.rule.id,
      ruleSetId: selected.rule.ruleSetId,
      type: selected.rule.type,
      severity: selected.rule.severity,
      operator: selected.rule.operator,
      expected: selected.rule.value,
      actual,
      unit: selected.rule.unit,
      specificity: selected.specificity,
      passed,
    })
  }

  const blocking = appliedRules.filter((rule) => !rule.passed && rule.severity === 'blocking')
  const warnings = appliedRules.filter((rule) => !rule.passed && rule.severity === 'warning')

  return {
    passed: blocking.length === 0 && ambiguities.length === 0,
    appliedRules,
    blocking,
    warnings,
    ambiguities,
  }
}
