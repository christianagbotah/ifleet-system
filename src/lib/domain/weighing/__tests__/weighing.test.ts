import { describe, expect, it } from 'vitest'

import {
  calculateWeightMetrics,
  selectEffectiveWeighing,
  type WeighingSnapshot,
} from '@/lib/domain/weighing/calculations'
import {
  evaluateWeightClearance,
  type WeightClearanceRule,
} from '@/lib/domain/weighing/clearance'

const at = (iso: string) => new Date(iso)

function rule(overrides: Partial<WeightClearanceRule> & Pick<WeightClearanceRule, 'id' | 'type'>): WeightClearanceRule {
  return {
    id: overrides.id,
    type: overrides.type,
    operator: overrides.operator ?? 'lte',
    value: overrides.value ?? 50_000,
    unit: overrides.unit ?? 'kg',
    severity: overrides.severity ?? 'blocking',
    priority: overrides.priority ?? 0,
    effectiveFrom: overrides.effectiveFrom ?? at('2026-01-01T00:00:00Z'),
    effectiveTo: overrides.effectiveTo ?? null,
    isActive: overrides.isActive ?? true,
    scope: overrides.scope ?? {},
  }
}

describe('weighing calculations', () => {
  it('calculates tare, gross and net weight deterministically', () => {
    const result = calculateWeightMetrics({ tareWeightKg: 16_250, grossWeightKg: 47_900 })

    expect(result).toEqual(expect.objectContaining({
      tareWeightKg: 16_250,
      grossWeightKg: 47_900,
      netWeightKg: 31_650,
      valid: true,
    }))
  })

  it('rejects impossible negative net weight', () => {
    const result = calculateWeightMetrics({ tareWeightKg: 20_000, grossWeightKg: 19_500 })

    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Gross weight cannot be lower than tare weight')
  })

  it('uses a corrected weighing as authoritative without erasing the original history', () => {
    const original: WeighingSnapshot = {
      id: 'gross-1',
      stage: 'GROSS',
      recordedAt: at('2026-06-15T10:00:00Z'),
      grossWeightKg: 51_200,
      tareWeightKg: 16_000,
      netWeightKg: 35_200,
      supersedesEventId: null,
    }
    const correction: WeighingSnapshot = {
      id: 'gross-2',
      stage: 'GROSS',
      recordedAt: at('2026-06-15T10:08:00Z'),
      grossWeightKg: 49_800,
      tareWeightKg: 16_000,
      netWeightKg: 33_800,
      supersedesEventId: 'gross-1',
    }

    expect(selectEffectiveWeighing([original, correction], 'GROSS')?.id).toBe('gross-2')
    expect([original, correction]).toHaveLength(2)
  })
})

describe('weight clearance', () => {
  it('blocks when any axle or axle group exceeds its configured limit', () => {
    const result = evaluateWeightClearance({
      occurredAt: at('2026-06-15T10:08:00Z'),
      grossWeightKg: 49_800,
      tareWeightKg: 16_000,
      axleReadings: [
        { axleNumber: 1, weightKg: 8_200, group: 'STEER' },
        { axleNumber: 2, weightKg: 20_100, group: 'DRIVE' },
        { axleNumber: 3, weightKg: 21_500, group: 'TRAILER' },
      ],
      requiredAxleCount: 3,
      rules: [
        rule({ id: 'gross', type: 'gross_weight', value: 52_000 }),
        rule({ id: 'steer', type: 'axle_group:STEER', value: 8_000 }),
        rule({ id: 'drive', type: 'axle_group:DRIVE', value: 21_000 }),
        rule({ id: 'trailer', type: 'axle_group:TRAILER', value: 22_000 }),
      ],
    })

    expect(result.passed).toBe(false)
    expect(result.blocking.map((item) => item.ruleId)).toContain('steer')
  })

  it('blocks clearance when required axle readings are missing', () => {
    const result = evaluateWeightClearance({
      occurredAt: at('2026-06-15T10:08:00Z'),
      grossWeightKg: 47_000,
      tareWeightKg: 16_000,
      axleReadings: [
        { axleNumber: 1, weightKg: 8_000, group: 'STEER' },
        { axleNumber: 2, weightKg: 19_000, group: 'DRIVE' },
      ],
      requiredAxleCount: 3,
      rules: [rule({ id: 'gross', type: 'gross_weight', value: 52_000 })],
    })

    expect(result.passed).toBe(false)
    expect(result.reasons).toContain('Required axle readings are incomplete')
  })

  it('applies configured tolerance before declaring an overweight failure', () => {
    const withinTolerance = evaluateWeightClearance({
      occurredAt: at('2026-06-15T10:08:00Z'),
      grossWeightKg: 50_400,
      tareWeightKg: 16_000,
      axleReadings: [],
      requiredAxleCount: 0,
      tolerancePercent: 1,
      rules: [rule({ id: 'gross', type: 'gross_weight', value: 50_000 })],
    })
    const outsideTolerance = evaluateWeightClearance({
      occurredAt: at('2026-06-15T10:08:00Z'),
      grossWeightKg: 50_600,
      tareWeightKg: 16_000,
      axleReadings: [],
      requiredAxleCount: 0,
      tolerancePercent: 1,
      rules: [rule({ id: 'gross', type: 'gross_weight', value: 50_000 })],
    })

    expect(withinTolerance.passed).toBe(true)
    expect(outsideTolerance.passed).toBe(false)
  })

  it('evaluates the rule version effective at weighing time rather than the current rule', () => {
    const result = evaluateWeightClearance({
      occurredAt: at('2026-06-15T10:08:00Z'),
      grossWeightKg: 49_000,
      tareWeightKg: 16_000,
      axleReadings: [],
      requiredAxleCount: 0,
      rules: [
        rule({ id: 'old-limit', type: 'gross_weight', value: 48_000, effectiveFrom: at('2026-01-01T00:00:00Z'), effectiveTo: at('2026-06-30T23:59:59Z') }),
        rule({ id: 'new-limit', type: 'gross_weight', value: 52_000, effectiveFrom: at('2026-07-01T00:00:00Z') }),
      ],
    })

    expect(result.appliedRules.map((item) => item.ruleId)).toEqual(['old-limit'])
    expect(result.passed).toBe(false)
  })

  it('ignores unrelated compliance rules that weighing cannot evaluate', () => {
    const result = evaluateWeightClearance({
      occurredAt: at('2026-06-15T10:08:00Z'),
      grossWeightKg: 49_000,
      tareWeightKg: 16_000,
      axleReadings: [],
      requiredAxleCount: 0,
      rules: [
        rule({ id: 'gross-ok', type: 'gross_weight', value: 50_000 }),
        rule({ id: 'driver-hours', type: 'driver_hours', value: 8, unit: 'hours' }),
      ],
    })

    expect(result.appliedRules.map((item) => item.ruleId)).toEqual(['gross-ok'])
    expect(result.passed).toBe(true)
  })
})
