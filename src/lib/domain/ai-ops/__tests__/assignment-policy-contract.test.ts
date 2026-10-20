import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

describe('assignment recommendation policy governance contract', () => {
  it('provides an Admin-only publication endpoint for immutable policy versions', () => {
    const path = 'src/app/api/ai/assignment-policy/route.ts'
    expect(existsSync(join(root, path))).toBe(true)
    if (!existsSync(join(root, path))) return

    const source = read(path)
    expect(source).toContain('requireRole')
    expect(source).toContain('ROLES.ADMIN')
    expect(source).toContain('publishAssignmentPolicy')
    expect(source).toContain('createAuditLog')
  })

  it('publishes a new active snapshot while superseding the previous active version transactionally', () => {
    const path = 'src/lib/domain/ai-ops/assignment-policy.ts'
    expect(existsSync(join(root, path))).toBe(true)
    if (!existsSync(join(root, path))) return

    const source = read(path)
    expect(source).toContain("status: 'superseded'")
    expect(source).toContain("status: 'active'")
    expect(source).toContain("isolationLevel: 'Serializable'")
    expect(source).toContain('publishAssignmentPolicy')
  })

  it('bootstraps the existing Ghana haulage policy into persistence only when no policy history exists', () => {
    const policy = 'src/lib/domain/ai-ops/assignment-policy.ts'
    const bootstrap = 'src/lib/domain/ai-ops/assignment-config.ts'
    expect(existsSync(join(root, policy))).toBe(true)
    expect(existsSync(join(root, bootstrap))).toBe(true)
    if (!existsSync(join(root, policy)) || !existsSync(join(root, bootstrap))) return

    expect(read(bootstrap)).toContain('ASSIGNMENT_RECOMMENDATION_BOOTSTRAP_POLICY')
    const source = read(policy)
    expect(source).toContain('bootstrapAssignmentPolicy')
    expect(source).toContain('ghana-haulage-v1')
    expect(source).toContain('No active assignment recommendation policy')
  })

  it('validates all weights and operational caps before publishing', () => {
    const path = 'src/lib/domain/ai-ops/assignment-policy.ts'
    expect(existsSync(join(root, path))).toBe(true)
    if (!existsSync(join(root, path))) return

    const source = read(path)
    expect(source).toContain('validateAssignmentPolicyDraft')
    expect(source).toContain('positive total')
    expect(source).toContain('maxRecommendations')
    expect(source).toContain('configVersion')
  })
})
