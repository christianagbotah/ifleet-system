import { describe, expect, it } from 'vitest'
import { findAmbiguousRuleOverlaps } from '@/lib/domain/compliance/rule-validation'
import type { ComplianceRule } from '@/lib/domain/compliance/types'

const at = (iso: string) => new Date(iso)

function rule(overrides: Partial<ComplianceRule> & Pick<ComplianceRule, 'id'>): ComplianceRule {
  return {
    id: overrides.id,
    ruleSetId: overrides.ruleSetId ?? 'ruleset-1',
    type: overrides.type ?? 'gross_weight',
    scope: overrides.scope ?? { country: 'GH', shipperId: 'shipper-a' },
    operator: overrides.operator ?? 'lte',
    value: overrides.value ?? 50_000,
    unit: overrides.unit ?? 'kg',
    severity: overrides.severity ?? 'blocking',
    priority: overrides.priority ?? 10,
    effectiveFrom: overrides.effectiveFrom ?? at('2026-01-01T00:00:00Z'),
    effectiveTo: overrides.effectiveTo ?? at('2026-12-31T23:59:59Z'),
    isActive: overrides.isActive ?? true,
  }
}

describe('findAmbiguousRuleOverlaps', () => {
  it('rejects same-type same-scope same-priority rules whose effective periods overlap', () => {
    const conflicts = findAmbiguousRuleOverlaps([
      rule({ id: 'a', effectiveFrom: at('2026-01-01T00:00:00Z'), effectiveTo: at('2026-09-30T23:59:59Z') }),
      rule({ id: 'b', effectiveFrom: at('2026-06-01T00:00:00Z'), effectiveTo: at('2026-12-31T23:59:59Z') }),
    ])

    expect(conflicts).toEqual([
      expect.objectContaining({ type: 'gross_weight', ruleIds: ['a', 'b'] }),
    ])
  })

  it('allows the same scope when priority makes precedence deterministic', () => {
    expect(findAmbiguousRuleOverlaps([
      rule({ id: 'a', priority: 10 }),
      rule({ id: 'b', priority: 20 }),
    ])).toEqual([])
  })

  it('allows same-priority rules whose effective periods do not overlap', () => {
    expect(findAmbiguousRuleOverlaps([
      rule({ id: 'a', effectiveFrom: at('2026-01-01T00:00:00Z'), effectiveTo: at('2026-06-30T23:59:59Z') }),
      rule({ id: 'b', effectiveFrom: at('2026-07-01T00:00:00Z'), effectiveTo: null }),
    ])).toEqual([])
  })

  it('normalizes scope text when detecting duplicates', () => {
    const conflicts = findAmbiguousRuleOverlaps([
      rule({ id: 'a', scope: { country: 'gh', shipperId: ' Shipper-A ' } }),
      rule({ id: 'b', scope: { country: 'GH', shipperId: 'shipper-a' } }),
    ])

    expect(conflicts).toHaveLength(1)
  })

  it('ignores inactive rules because they cannot create runtime ambiguity', () => {
    expect(findAmbiguousRuleOverlaps([
      rule({ id: 'a' }),
      rule({ id: 'b', isActive: false }),
    ])).toEqual([])
  })
})
