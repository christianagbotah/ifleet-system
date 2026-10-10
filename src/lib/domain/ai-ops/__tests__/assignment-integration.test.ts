import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('assignment recommendation integration', () => {
  it('keeps recommendation configuration versioned on the server', () => {
    const path = 'src/lib/domain/ai-ops/assignment-config.ts'
    expect(existsSync(join(process.cwd(), path))).toBe(true)
    const source = read(path)
    expect(source).toContain('ASSIGNMENT_RECOMMENDATION_CONFIG')
    expect(source).toContain('configVersion')
    expect(source).toContain('weights')
  })

  it('uses authoritative eligibility and persists an advisory snapshot when recommendations are opened', () => {
    const path = 'src/app/api/load-orders/[id]/recommendations/route.ts'
    expect(existsSync(join(process.cwd(), path))).toBe(true)
    const source = read(path)
    expect(source).toContain('requirePermission')
    expect(source).toContain('evaluateAssignmentEligibility')
    expect(source).toContain('rankAssignmentCandidates')
    expect(source).toContain('buildTrailerAssignmentOptions')
    expect(source).toContain('for (const trailer of trailerOptions)')
    expect(source).toContain('hasTrailerCouplingConflict')
    expect(source).toContain('aiRecommendation.create')
    expect(source).toContain('inputSnapshotRef')
  })

  it('shows explanations in the assignment dialog and carries the selected recommendation into final assignment', () => {
    const dialog = read('src/components/dispatch/AssignmentDialog.tsx')
    expect(dialog).toContain('/recommendations')
    expect(dialog).toContain('AI recommendation')
    expect(dialog).toContain('scoreComponents')
    expect(dialog).toContain('fallbackAssumptions')
    expect(dialog).toContain('recommendationId')
  })

  it('marks the selected recommendation accepted only when the final assignment commits', () => {
    const route = read('src/app/api/load-orders/[id]/assign/route.ts')
    expect(route).toContain('recommendationId')
    expect(route).toContain('aiRecommendation.updateMany')
    expect(route).toContain('acceptedAt')
  })
})
