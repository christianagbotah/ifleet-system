import { describe, expect, it } from 'vitest'
import { evaluateCompliance } from '@/lib/domain/compliance/rule-engine'
import type { ComplianceContext, ComplianceRule } from '@/lib/domain/compliance/types'

const at = (iso: string) => new Date(iso)

const baseContext: ComplianceContext = {
  occurredAt: at('2026-06-15T12:00:00Z'),
  country: 'GH',
  shipperId: 'shipper-a',
  vehicleType: 'tractor',
  trailerType: 'flatbed',
  commodityId: 'cement',
  values: {
    grossWeightKg: 49_000,
    driverHours: 7,
  },
}

function rule(overrides: Partial<ComplianceRule> & Pick<ComplianceRule, 'id' | 'type'>): ComplianceRule {
  return {
    id: overrides.id,
    ruleSetId: overrides.ruleSetId ?? 'ruleset-1',
    type: overrides.type,
    scope: overrides.scope ?? {},
    operator: overrides.operator ?? 'lte',
    value: overrides.value ?? 50_000,
    unit: overrides.unit ?? 'kg',
    severity: overrides.severity ?? 'blocking',
    priority: overrides.priority ?? 0,
    effectiveFrom: overrides.effectiveFrom ?? at('2026-01-01T00:00:00Z'),
    effectiveTo: overrides.effectiveTo ?? null,
    isActive: overrides.isActive ?? true,
  }
}

describe('evaluateCompliance', () => {
  it('uses the rule active at the historical event time rather than today', () => {
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'old', type: 'gross_weight', value: 48_000, effectiveFrom: at('2026-01-01T00:00:00Z'), effectiveTo: at('2026-06-30T23:59:59Z') }),
      rule({ id: 'new', type: 'gross_weight', value: 52_000, effectiveFrom: at('2026-07-01T00:00:00Z') }),
    ])

    expect(result.appliedRules.map(item => item.ruleId)).toEqual(['old'])
    expect(result.blocking).toHaveLength(1)
  })

  it('ignores inactive and not-yet-effective rules', () => {
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'disabled', type: 'gross_weight', value: 40_000, isActive: false }),
      rule({ id: 'future', type: 'driver_hours', value: 1, effectiveFrom: at('2027-01-01T00:00:00Z') }),
    ])

    expect(result.appliedRules).toHaveLength(0)
    expect(result.passed).toBe(true)
  })

  it('prefers the most specific matching rule within a rule type', () => {
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'country', type: 'gross_weight', scope: { country: 'GH' }, value: 48_000 }),
      rule({ id: 'shipper', type: 'gross_weight', scope: { country: 'GH', shipperId: 'shipper-a' }, value: 51_000 }),
      rule({ id: 'vehicle', type: 'gross_weight', scope: { country: 'GH', shipperId: 'shipper-a', vehicleType: 'tractor' }, value: 52_000 }),
      rule({ id: 'trailer', type: 'gross_weight', scope: { country: 'GH', shipperId: 'shipper-a', vehicleType: 'tractor', trailerType: 'flatbed' }, value: 53_000 }),
      rule({ id: 'commodity', type: 'gross_weight', scope: { country: 'GH', shipperId: 'shipper-a', vehicleType: 'tractor', trailerType: 'flatbed', commodityId: 'cement' }, value: 54_000 }),
    ])

    expect(result.appliedRules.map(item => item.ruleId)).toEqual(['commodity'])
    expect(result.passed).toBe(true)
  })

  it('ignores scoped rules whose scope does not match the trip context', () => {
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'other-shipper', type: 'gross_weight', scope: { shipperId: 'shipper-b' }, value: 1 }),
      rule({ id: 'matching-country', type: 'gross_weight', scope: { country: 'GH' }, value: 50_000 }),
    ])

    expect(result.appliedRules.map(item => item.ruleId)).toEqual(['matching-country'])
    expect(result.passed).toBe(true)
  })

  it('breaks equal-specificity ties by priority and then latest effectiveFrom', () => {
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'low-priority', type: 'gross_weight', scope: { country: 'GH' }, priority: 1, value: 1 }),
      rule({ id: 'older-high-priority', type: 'gross_weight', scope: { country: 'GH' }, priority: 5, effectiveFrom: at('2026-01-01T00:00:00Z'), value: 48_000 }),
      rule({ id: 'newer-high-priority', type: 'gross_weight', scope: { country: 'GH' }, priority: 5, effectiveFrom: at('2026-03-01T00:00:00Z'), value: 50_000 }),
    ])

    expect(result.appliedRules.map(item => item.ruleId)).toEqual(['newer-high-priority'])
    expect(result.passed).toBe(true)
  })

  it('keeps blocking failures separate from warning failures', () => {
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'block', type: 'gross_weight', value: 48_000, severity: 'blocking' }),
      rule({ id: 'warn', type: 'driver_hours', operator: 'lte', value: 6, unit: 'hours', severity: 'warning' }),
    ])

    expect(result.blocking.map(item => item.ruleId)).toEqual(['block'])
    expect(result.warnings.map(item => item.ruleId)).toEqual(['warn'])
    expect(result.passed).toBe(false)
  })

  it('passes a rule when its measured value satisfies the configured operator', () => {
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'gross-ok', type: 'gross_weight', operator: 'lte', value: 50_000 }),
      rule({ id: 'hours-ok', type: 'driver_hours', operator: 'lt', value: 8, unit: 'hours' }),
    ])

    expect(result.appliedRules.every(item => item.passed)).toBe(true)
    expect(result.passed).toBe(true)
  })

  it('surfaces a deterministic ambiguity when equal rules cannot be distinguished', () => {
    const effectiveFrom = at('2026-01-01T00:00:00Z')
    const result = evaluateCompliance(baseContext, [
      rule({ id: 'a', type: 'gross_weight', scope: { country: 'GH' }, priority: 3, effectiveFrom, value: 50_000 }),
      rule({ id: 'b', type: 'gross_weight', scope: { country: 'GH' }, priority: 3, effectiveFrom, value: 51_000 }),
    ])

    expect(result.ambiguities).toEqual([
      expect.objectContaining({ type: 'gross_weight', ruleIds: ['a', 'b'] }),
    ])
    expect(result.passed).toBe(false)
  })
})
