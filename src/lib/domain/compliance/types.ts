export type ComplianceSeverity = 'blocking' | 'warning'

export type ComplianceOperator =
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'required'

export interface ComplianceScope {
  country?: string | null
  shipperId?: string | null
  vehicleType?: string | null
  trailerType?: string | null
  commodityId?: string | null
}

export interface ComplianceRule {
  id: string
  ruleSetId: string
  type: string
  scope: ComplianceScope
  operator: ComplianceOperator
  value: unknown
  unit?: string | null
  severity: ComplianceSeverity
  priority: number
  effectiveFrom: Date | string
  effectiveTo?: Date | string | null
  isActive: boolean
}

export interface ComplianceContext {
  occurredAt: Date | string
  country?: string | null
  shipperId?: string | null
  vehicleType?: string | null
  trailerType?: string | null
  commodityId?: string | null
  values: Record<string, unknown>
}

export interface ComplianceAppliedRule {
  ruleId: string
  ruleSetId: string
  type: string
  severity: ComplianceSeverity
  operator: ComplianceOperator
  expected: unknown
  actual: unknown
  unit?: string | null
  specificity: number
  passed: boolean
}

export interface ComplianceAmbiguity {
  type: string
  ruleIds: string[]
  specificity: number
  priority: number
  effectiveFrom: Date
}

export interface ComplianceEvaluation {
  passed: boolean
  appliedRules: ComplianceAppliedRule[]
  blocking: ComplianceAppliedRule[]
  warnings: ComplianceAppliedRule[]
  ambiguities: ComplianceAmbiguity[]
}
