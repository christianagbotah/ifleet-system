import { describe, expect, it } from 'vitest'

import { validateCoupling } from '@/lib/domain/fleet-assets/coupling'

const activeTrailer = { id: 'trailer-1', status: 'active' as const }

describe('validateCoupling', () => {
  it('allows a rigid truck to operate without a trailer', () => {
    const result = validateCoupling(
      { tractorId: 'truck-1', trailer: null, requiresTrailer: false },
      []
    )

    expect(result).toEqual({ valid: true, blocking: [] })
  })

  it('requires a trailer for an articulated assignment', () => {
    const result = validateCoupling(
      { tractorId: 'truck-1', trailer: null, requiresTrailer: true },
      []
    )

    expect(result.valid).toBe(false)
    expect(result.blocking).toContain('trailer_required')
  })

  it('blocks an inactive trailer', () => {
    const result = validateCoupling(
      {
        tractorId: 'truck-1',
        trailer: { id: 'trailer-1', status: 'maintenance' },
        requiresTrailer: true,
      },
      []
    )

    expect(result.valid).toBe(false)
    expect(result.blocking).toContain('trailer_unavailable')
  })

  it('blocks a trailer that is actively coupled to another tractor', () => {
    const result = validateCoupling(
      { tractorId: 'truck-2', trailer: activeTrailer, requiresTrailer: true },
      [
        {
          id: 'coupling-1',
          tractorId: 'truck-1',
          trailerId: 'trailer-1',
          coupledAt: new Date('2026-10-08T01:00:00Z'),
          decoupledAt: null,
        },
      ]
    )

    expect(result.valid).toBe(false)
    expect(result.blocking).toContain('trailer_already_coupled')
  })

  it('blocks a tractor that already has another active trailer', () => {
    const result = validateCoupling(
      { tractorId: 'truck-1', trailer: activeTrailer, requiresTrailer: true },
      [
        {
          id: 'coupling-1',
          tractorId: 'truck-1',
          trailerId: 'trailer-2',
          coupledAt: new Date('2026-10-08T01:00:00Z'),
          decoupledAt: null,
        },
      ]
    )

    expect(result.valid).toBe(false)
    expect(result.blocking).toContain('tractor_already_coupled')
  })

  it('ignores decoupled historical combinations', () => {
    const result = validateCoupling(
      { tractorId: 'truck-2', trailer: activeTrailer, requiresTrailer: true },
      [
        {
          id: 'coupling-old',
          tractorId: 'truck-1',
          trailerId: 'trailer-1',
          coupledAt: new Date('2026-10-07T10:00:00Z'),
          decoupledAt: new Date('2026-10-07T18:00:00Z'),
        },
      ]
    )

    expect(result).toEqual({ valid: true, blocking: [] })
  })
})
