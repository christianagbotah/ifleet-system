import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const source = readFileSync(path.join(process.cwd(), 'src/app/api/compliance/rule-sets/[id]/route.ts'), 'utf8')
const deleteSection = source.split('export async function DELETE')[1] ?? ''

describe('compliance rule-set archival', () => {
  it('archives by creating a new inactive version instead of mutating historical content in place', () => {
    expect(deleteSection).toContain('db.$transaction')
    expect(deleteSection).toContain("isolationLevel: 'Serializable'")
    expect(deleteSection).toContain('complianceRuleSet.create')
    expect(deleteSection).toContain('version:')
    expect(deleteSection).toContain('isActive: false')
    expect(deleteSection).toContain('isCurrent: true')
  })
})
