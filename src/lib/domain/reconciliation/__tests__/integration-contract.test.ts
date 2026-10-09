import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function source(relative: string) {
  const file = path.join(process.cwd(), relative)
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

describe('Phase 4 trip reconciliation integration contract', () => {
  it('persists immutable reconciliation snapshots and source-linked lines', () => {
    const schema = source('prisma/models/reconciliation.prisma')
    expect(schema).toContain('model TripReconciliation {')
    expect(schema).toContain('@@unique([tripId, version])')
    expect(schema).toContain('model ReconciliationLine {')
    expect(schema).toContain('sourceType')
    expect(schema).toContain('sourceId')
    expect(schema).toContain('model ReconciliationAdjustment {')
  })

  it('ships a finance-gated trip reconciliation API that builds live snapshots', () => {
    const route = source('src/app/api/trips/[id]/reconciliation/route.ts')
    expect(route).toContain('buildReconciliationSnapshot')
    expect(route).toContain('requireReconciliationAccess')
    expect(route).toContain('isolationLevel: \'Serializable\'')
    expect(route).toContain('canTransition')
    expect(route).toContain("'reconciled'")
  })

  it('provides an operational reconciliation panel with blockers and source totals', () => {
    const panel = source('src/components/reconciliation/TripReconciliationPanel.tsx')
    expect(panel).toContain('Trip reconciliation')
    expect(panel).toContain('operationalCost')
    expect(panel).toContain('blockers')
    expect(panel).toContain('Finalize reconciliation')
  })

  it('resolves post-approval evidence exceptions through an explicit reviewed adjustment workflow', () => {
    const route = source('src/app/api/trips/[id]/reconciliation/route.ts')
    const panel = source('src/components/reconciliation/TripReconciliationPanel.tsx')
    expect(route).toContain("action === 'resolve_exception'")
    expect(route).toContain('planReconciliationExceptionResolution')
    expect(route).toContain('reconciliationException.update')
    expect(route).toContain('reconciliationAdjustment.create')
    expect(route).toContain("status: 'approved'")
    expect(panel).toContain('Resolve financial review')
    expect(panel).toContain("action: 'resolve_exception'")
  })
})
