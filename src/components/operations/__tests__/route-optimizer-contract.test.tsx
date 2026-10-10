import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/components/operations/RouteOptimizerView.tsx'),
  'utf8',
)

describe('Route Optimizer Phase 7 UI contract', () => {
  it('surfaces advisory provenance, quality and telematics freshness', () => {
    expect(source).toContain('route.source')
    expect(source).toContain('dataQualityGrade')
    expect(source).toContain('locationFreshness')
    expect(source).toContain('locationSource')
    expect(source).toContain('recommendationsAvailable')
  })

  it('labels fuel assumptions instead of claiming a live/current market price', () => {
    expect(source).toContain('priceSource')
    expect(source).toContain('fuelEstimate.source')
    expect(source).not.toContain('recommendedPricePerLiter')
    expect(source).not.toContain('32 L/100km')
    expect(source).not.toContain('2L extra per tonne')
  })

  it('remains advisory and does not dispatch or assign resources', () => {
    expect(source).toContain('/api/routes/optimize')
    expect(source).not.toMatch(/apiFetch[^\n]+\/assign/)
    expect(source).not.toMatch(/apiFetch[^\n]+\/trips[^\n]+method:\s*['"]POST/)
  })
})
