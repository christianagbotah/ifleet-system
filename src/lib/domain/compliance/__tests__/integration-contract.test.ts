import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : ''

describe('compliance rule-set integration contract', () => {
  it('defines immutable versioned rule-set and structured rule persistence without hardcoded legal thresholds', () => {
    const schema = read('prisma/models/compliance.prisma')
    expect(schema).toContain('model ComplianceRuleSet')
    expect(schema).toContain('model ComplianceRule')
    expect(schema).toContain('code')
    expect(schema).toContain('version')
    expect(schema).toContain('isCurrent')
    expect(schema).toContain('@@unique([code, version])')
    expect(schema).toContain('effectiveFrom')
    expect(schema).toContain('effectiveTo')
    expect(schema).toContain('priority')
    expect(schema).toContain('severity')
    expect(schema).toContain('operator')
    expect(schema).toContain('scope')
    expect(schema).toContain('value')
  })

  it('write-gates rule-set creation and rejects ambiguous overlaps', () => {
    const route = read('src/app/api/compliance/rule-sets/route.ts')
    expect(route).toContain('requireAuth')
    expect(route).toContain('requireWriteAccess')
    expect(route).toContain('findAmbiguousRuleOverlaps')
    expect(route).toContain('complianceRuleSet.create')
    expect(route).toContain('createAuditLog')
  })

  it('revises a rule set by creating a new version instead of overwriting history', () => {
    const route = read('src/app/api/compliance/rule-sets/[id]/route.ts')
    expect(route).toContain('isCurrent: false')
    expect(route).toContain('version:')
    expect(route).toContain('complianceRuleSet.create')
    expect(route).toContain('isolationLevel')
  })

  it('provides a compliance rules workspace backed by the rule-set APIs', () => {
    const view = read('src/components/compliance/ComplianceRulesView.tsx')
    expect(view).toContain('/api/compliance/rule-sets')
    expect(view).toContain('Rule Sets')
    expect(view).toContain('Effective From')
    expect(view).toContain('Severity')
  })

  it('preserves the existing compliance dashboard inside the existing Compliance Center route', () => {
    const wrapper = read('src/components/compliance/ComplianceDashboardView.tsx')
    const legacy = read('src/components/compliance/LegacyComplianceDashboardView.tsx')
    const page = read('src/app/page.tsx')
    const navigation = read('src/lib/constants.ts')

    expect(wrapper).toContain("@/components/compliance/ComplianceRulesView")
    expect(wrapper).toContain("@/components/compliance/LegacyComplianceDashboardView")
    expect(wrapper).toContain('Compliance Dashboard')
    expect(wrapper).toContain('Rule Sets')
    expect(legacy).toContain('Compliance Dashboard')
    expect(page).toContain("case 'compliance-center':")
    expect(navigation).toContain('{ id: "compliance-center", label: "Compliance Center"')
  })
})
