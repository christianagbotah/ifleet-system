import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('AI fuel review integration', () => {
  it('exposes authenticated review listing and write-guarded analysis without the legacy AI microservice', () => {
    const path = 'src/app/api/ai-ops/fuel/review-cases/route.ts'
    expect(existsSync(join(process.cwd(), path))).toBe(true)
    const source = read(path)

    expect(source).toContain('requireAuth')
    expect(source).toContain('requireWriteAccess')
    expect(source).toContain('analyzeFuelLogForReview')
    expect(source).toContain('createFuelReviewCase')
    expect(source).not.toContain('/api/fuel-anomaly')
    expect(source).not.toContain('AI_SERVICE_URL')
  })

  it('provides an auditable human resolution endpoint', () => {
    const path = 'src/app/api/ai-ops/fuel/review-cases/[id]/route.ts'
    expect(existsSync(join(process.cwd(), path))).toBe(true)
    const source = read(path)

    expect(source).toContain('requireWriteAccess')
    expect(source).toContain('resolveFuelReviewCase')
    expect(source).toContain('createAuditLog')
    expect(source).toContain('confirm_data_error')
    expect(source).toContain('escalate')
  })

  it('adds a focused human review queue to the existing Fuel Anomaly dashboard', () => {
    const dashboard = read('src/components/fuel/FuelAnomalyDashboard.tsx')
    const componentPath = 'src/components/fuel/FuelAiReviewQueue.tsx'
    expect(existsSync(join(process.cwd(), componentPath))).toBe(true)
    const queue = read(componentPath)

    expect(dashboard).toContain('FuelAiReviewQueue')
    expect(dashboard).toContain('AI Review Queue')
    expect(dashboard).toContain('Analyze with AI')
    expect(dashboard).toContain('apiFetch<')
    expect(dashboard).toContain("'/api/ai-ops/fuel/review-cases'")
    expect(dashboard).toContain('grid-cols-4')
    expect(queue).toContain('/api/ai-ops/fuel/review-cases')
    expect(queue).toContain('Confirm data error')
    expect(queue).toContain('Escalate')
  })
})
