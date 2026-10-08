import type { ComplianceRule, ComplianceScope } from '@/lib/domain/compliance/types'

const SCOPE_KEYS = ['country', 'shipperId', 'vehicleType', 'trailerType', 'commodityId'] as const

export interface AmbiguousRuleOverlap {
  type: string
  ruleIds: [string, string]
  scope: ComplianceScope
  priority: number
}

function normalized(value: string | null | undefined): string | null {
  if (value == null) return null
  const text = value.trim().toLowerCase()
  return text || null
}

function sameScope(left: ComplianceScope, right: ComplianceScope): boolean {
  return SCOPE_KEYS.every((key) => normalized(left[key]) === normalized(right[key]))
}

function asTime(value: Date | string | null | undefined, fallback: number): number {
  if (!value) return fallback
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(time) ? time : fallback
}

function periodsOverlap(left: ComplianceRule, right: ComplianceRule): boolean {
  const leftStart = asTime(left.effectiveFrom, Number.NEGATIVE_INFINITY)
  const leftEnd = asTime(left.effectiveTo, Number.POSITIVE_INFINITY)
  const rightStart = asTime(right.effectiveFrom, Number.NEGATIVE_INFINITY)
  const rightEnd = asTime(right.effectiveTo, Number.POSITIVE_INFINITY)
  return leftStart <= rightEnd && rightStart <= leftEnd
}

export function findAmbiguousRuleOverlaps(rules: ComplianceRule[]): AmbiguousRuleOverlap[] {
  const active = rules.filter((rule) => rule.isActive)
  const conflicts: AmbiguousRuleOverlap[] = []

  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const left = active[leftIndex]
      const right = active[rightIndex]
      if (left.type !== right.type) continue
      if (left.priority !== right.priority) continue
      if (!sameScope(left.scope, right.scope)) continue
      if (!periodsOverlap(left, right)) continue

      const ruleIds = [left.id, right.id].sort() as [string, string]
      conflicts.push({
        type: left.type,
        ruleIds,
        scope: left.scope,
        priority: left.priority,
      })
    }
  }

  return conflicts.sort((left, right) => {
    const typeDelta = left.type.localeCompare(right.type)
    if (typeDelta !== 0) return typeDelta
    return left.ruleIds.join(':').localeCompare(right.ruleIds.join(':'))
  })
}
