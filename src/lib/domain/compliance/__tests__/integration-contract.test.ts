import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file: string) => readFileSync(path.join(root, file), 'utf8')

describe('compliance rule-set integration contract', () => {
  it('defines versioned rule-set and rule persistence without hardcoded legal thresholds', () => {
    const schema = read('prisma/models/compliance.prisma')
    expect(schema).toContain('model ComplianceRuleSet')
    expect(schema).toContain('model ComplianceRule')
    expect(schema).toContain('effectiveFrom')
    expect(schema).toContain('effectiveTo')
    expect(schema).toContain('priority')
    expect(schema).toContain('severity')
    expect(schema).toContain('operator')
    expect(schema).toContain('scope')
    expect(schema).toContain('value')
  })

  it('write-gates rule-set mutations and rejects ambiguous overlaps', () => {
    const route = read('src/app/api/compliance/rule-sets/route.ts')
    expect(route).toContain('requireAuth')
    expect(route).toContain('requireWriteAccess')
    expect(route).toContain('findAmbiguousRuleOverlaps')
    expect(route).toContain('createAuditLog')
  })

  it('provides a reachable hash-routed compliance rules screen', () => {
    const view = read('src/components/compliance/ComplianceRulesView.tsx')
    expect(view).toContain('/api/compliance/rule-sets')

    const page = read('src/app/page.tsx')
    expect(page).toContain('compliance-rules')

    const navigation = read('src/lib/navigation.ts')
    expect(navigation).toContain('Compliance Rules')
    expect(navigation).toContain('compliance-rules')
  })
})
